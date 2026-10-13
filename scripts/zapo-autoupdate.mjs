#!/usr/bin/env node
/**
 * ZAPO auto-updater
 * -----------------
 * Once a day (via OS scheduler) checks the latest GitHub release of
 * vinikjkkj/zapo. If it is newer than the local vendored copy in ZAPO/,
 * downloads it, replaces the ZAPO/ tree (keeping node_modules/), recompiles,
 * reinstalls the backend, and commits the change.
 *
 * Fully automatic, no rollback. A failed build is NOT committed.
 * Cross-platform: relies only on Node built-ins + system `git` and `tar`.
 *
 * Usage:   node scripts/zapo-autoupdate.mjs
 * Env:     GITHUB_TOKEN  (optional) raises the GitHub API rate limit.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'vinikjkkj/zapo';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ZAPO_DIR = path.join(ROOT, 'ZAPO');
const BACKEND_DIR = path.join(ROOT, 'backend');
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'zapo-autoupdate.log');

// Files/dirs inside ZAPO/ preserved across a replace (kept for fast reinstall).
const KEEP = new Set(['node_modules']);

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
fs.mkdirSync(LOG_DIR, { recursive: true });
const runStamp = new Date().toISOString();

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  // eslint-disable-next-line no-console
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function fail(msg, err) {
  log(`ERROR: ${msg}`);
  if (err) {
    const detail = err.stderr || err.stack || err.message || String(err);
    log(String(detail).trim());
  }
  log(`=== run ${runStamp} FAILED ===`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a command, streaming a captured result. Throws on non-zero exit. */
function run(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(' ')}  (cwd: ${opts.cwd || process.cwd()})`);
  let res;
  if (process.platform === 'win32') {
    // On Windows npm is a .cmd shim, so a shell is required. spawnSync with
    // shell:true does NOT quote array args, which splits values containing
    // spaces (e.g. commit messages). Build a properly quoted command string.
    // Quote only the args: quoting the command name breaks .cmd shims (cmd.exe
    // resolves `"npm"` against the cwd, so npm.cmd's %~dp0 points at the wrong dir).
    const quoted = [cmd, ...args.map((a) => `"${String(a).replace(/"/g, '""')}"`)].join(' ');
    res = spawnSync(quoted, {
      stdio: 'pipe',
      encoding: 'utf8',
      shell: true,
      ...opts,
    });
  } else {
    // POSIX: pass args as an array with no shell — no quoting pitfalls.
    res = spawnSync(cmd, args, {
      stdio: 'pipe',
      encoding: 'utf8',
      shell: false,
      ...opts,
    });
  }
  if (res.stdout) fs.appendFileSync(LOG_FILE, res.stdout);
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const e = new Error(`${cmd} exited with code ${res.status}`);
    e.stderr = res.stderr;
    throw e;
  }
  return res;
}

/** Extract a semver (x.y.z[-pre]) from a release tag like "v1.4.0" or "zapo-js@1.4.0". */
function normalizeVersion(tag) {
  const m = String(tag).match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/);
  return m ? m[1] : null;
}

function readLocalVersion() {
  const pkgPath = path.join(ZAPO_DIR, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return pkg.version;
}

async function fetchLatestRelease() {
  const headers = {
    'User-Agent': 'zapo-autoupdate',
    Accept: 'application/vnd.github+json',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const url = `https://api.github.com/repos/${REPO}/releases/latest`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} ${res.statusText} for ${url}`);
  }
  return res.json();
}

async function downloadTarball(tarballUrl, destFile) {
  const headers = { 'User-Agent': 'zapo-autoupdate' };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(tarballUrl, { headers, redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destFile, buf);
  return buf.length;
}

/** Remove everything in ZAPO/ except entries in KEEP, then copy new tree in. */
function replaceZapoTree(sourceDir) {
  for (const entry of fs.readdirSync(ZAPO_DIR)) {
    if (KEEP.has(entry)) continue;
    fs.rmSync(path.join(ZAPO_DIR, entry), { recursive: true, force: true });
  }
  for (const entry of fs.readdirSync(sourceDir)) {
    fs.cpSync(path.join(sourceDir, entry), path.join(ZAPO_DIR, entry), {
      recursive: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  log(`=== run ${runStamp} START ===`);

  if (!fs.existsSync(ZAPO_DIR)) fail(`ZAPO directory not found at ${ZAPO_DIR}`);

  const localVersion = readLocalVersion();
  log(`Local ZAPO version: ${localVersion}`);

  let release;
  try {
    release = await fetchLatestRelease();
  } catch (err) {
    fail('Could not fetch latest release', err);
  }

  const tag = release.tag_name;
  const remoteVersion = normalizeVersion(tag);
  log(`Latest release tag: ${tag} (version ${remoteVersion || 'unknown'})`);

  if (!remoteVersion) fail(`Could not parse a version from tag "${tag}"`);

  if (remoteVersion === localVersion) {
    log(`Already up to date (${localVersion}). Nothing to do.`);
    log(`=== run ${runStamp} OK (no-op) ===`);
    return;
  }

  log(`Update available: ${localVersion} -> ${remoteVersion}`);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zapo-update-'));
  const tarFile = path.join(tmpRoot, 'source.tar.gz');
  const extractDir = path.join(tmpRoot, 'src');
  fs.mkdirSync(extractDir, { recursive: true });

  try {
    log('Downloading source tarball...');
    const bytes = await downloadTarball(release.tarball_url, tarFile);
    log(`Downloaded ${bytes} bytes.`);

    log('Extracting...');
    // Relative paths from tmpRoot: GNU tar reads "C:\..." as host:path, and
    // Windows bsdtar (what the scheduler gets) rejects --force-local.
    run('tar', ['-xzf', 'source.tar.gz', '-C', 'src', '--strip-components=1'], { cwd: tmpRoot });

    log('Replacing ZAPO/ tree (keeping node_modules)...');
    replaceZapoTree(extractDir);

    log('Building ZAPO (npm install)...');
    run('npm', ['install'], { cwd: ZAPO_DIR });
    log('Building ZAPO (npm run build)...');
    run('npm', ['run', 'build'], { cwd: ZAPO_DIR });
    log('Building ZAPO packages (npm run build:packages)...');
    run('npm', ['run', 'build:packages'], { cwd: ZAPO_DIR });

    log('Reinstalling backend (npm install)...');
    run('npm', ['install'], { cwd: BACKEND_DIR });

    // The real breakage check: upstream API changes only show up when the
    // backend is compiled against the new types.
    log('Type-checking backend against the new zapo-js...');
    run('npx', ['tsc', '--noEmit'], { cwd: BACKEND_DIR });
  } catch (err) {
    fail(`Update/build failed at ${remoteVersion}. Files left in place, NOT committed.`, err);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  // Commit only on full success.
  try {
    log('Committing update...');
    run('git', ['add', 'ZAPO', 'backend/package-lock.json'], { cwd: ROOT });

    // Nothing staged? (e.g. only gitignored dist changed) -> skip commit.
    const diff = spawnSync('git', ['diff', '--cached', '--quiet'], {
      cwd: ROOT,
      shell: process.platform === 'win32',
    });
    if (diff.status === 0) {
      log('No tracked changes to commit (source identical). Build refreshed only.');
    } else {
      run('git', ['commit', '-m', `chore(zapo): atualiza zapo-js para ${tag}`], {
        cwd: ROOT,
      });
      log('Committed.');
    }
  } catch (err) {
    fail('Build succeeded but git commit failed.', err);
  }

  log(`=== run ${runStamp} OK (updated to ${remoteVersion}) ===`);
}

main().catch((err) => fail('Unexpected error', err));
