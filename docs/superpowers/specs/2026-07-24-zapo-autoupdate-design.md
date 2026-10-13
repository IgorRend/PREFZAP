# ZAPO Auto-Updater — Design

**Date:** 2026-07-24
**Author:** Igor (with Claude)
**Status:** Approved for implementation

## Goal

Keep the vendored `ZAPO/` library (a copy of the open-source `zapo-js`,
`vinikjkkj/zapo`) automatically in sync with upstream. Once a day, check the
latest GitHub release; if it is newer than the local copy, download it, replace
`ZAPO/`, recompile, reinstall the backend, and commit the change.

## Context

- `ZAPO/` is a clean, un-customized vendored copy of `zapo-js` (currently
  `v1.3.0`). All project customization lives in `backend/` and `frontend/`, so
  replacing the whole `ZAPO/` tree is safe.
- The backend consumes it via `file:` dependencies:
  - `"zapo-js": "file:../ZAPO"`
  - `"@zapo-js/store-sqlite": "file:../ZAPO/packages/store-sqlite"`
- The compiled `ZAPO/dist/` (and `packages/*/dist`) is what the backend loads.
  `dist` is gitignored, so it must be rebuilt after every source replacement.
- Build pipeline: `npm install` → `npm run build` (main lib) →
  `npm run build:packages` (turbo, builds `packages/store-sqlite`).

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Update mode | Fully automatic, no rollback |
| Commit on failed build | **No** — log error, leave files in place, do not commit |
| Scheduling | Cross-platform (Windows now, Linux server later) |
| Git commit on success | Yes, auto-commit |
| Backend reinstall | Yes — `npm install` in `backend/` after a successful ZAPO build |

## Approach

A single **Node.js** script, `scripts/zapo-autoupdate.mjs`, run daily by the
OS scheduler. Node is chosen because the repo is Node end-to-end and one script
then runs unchanged on Windows and Linux. It relies only on Node built-ins plus
the system `git` and `tar` (both confirmed present: GNU tar 1.35, git 2.55,
Node v22).

### Run sequence

1. **Check** — `GET https://api.github.com/repos/vinikjkkj/zapo/releases/latest`
   with a `User-Agent` header (GitHub requires it) and, if `GITHUB_TOKEN` is
   set, an `Authorization` header. Read `tag_name` and `tarball_url`.
2. **Compare** — normalize the tag (strip leading `v`) and compare to
   `ZAPO/package.json` `version`. If equal → log "already up to date", exit 0.
3. **Download & extract** — fetch `tarball_url` to a temp file, extract into a
   temp dir with `tar -xzf <file> -C <dir> --strip-components=1` (drops the
   GitHub `owner-repo-<sha>/` top-level folder).
4. **Replace** — delete everything in `ZAPO/` **except `node_modules/`** (kept so
   the reinstall is a fast delta), then copy the extracted tree in.
5. **Compile** — in `ZAPO/`, in order:
   - `npm install`
   - `npm run build`
   - `npm run build:packages`
6. **Backend reinstall** — `npm install` in `backend/`.
7. **Commit (success only)** — if steps 5–6 all succeeded:
   `git add ZAPO backend/package-lock.json` then
   `git commit -m "chore(zapo): atualiza zapo-js para <tag>"`.
   (`ZAPO/dist` and `node_modules` are gitignored, so only source + lockfiles
   are committed.)
8. **Log** — every run appends one structured block to
   `logs/zapo-autoupdate.log`: timestamp, old version, new version, each
   step's outcome, and any error output.

### Failure handling

- Any thrown error / non-zero step aborts the run, is written to the log with
  its stderr, and the process exits non-zero.
- No rollback: on a failed build the new files are left in place for manual
  inspection. The failed state is **not committed**.

### Scheduling helpers

- **Linux:** `scripts/zapo-autoupdate-cron.sh` — installs a `crontab` entry
  running the script daily at 04:00, logging to `logs/`.
- **Windows:** `scripts/zapo-autoupdate-task.ps1` — registers a daily Scheduled
  Task via `schtasks` calling `node scripts/zapo-autoupdate.mjs`.
- Both are run once per machine and are idempotent (re-running replaces the
  existing schedule).

## Files

| Path | Purpose |
|---|---|
| `scripts/zapo-autoupdate.mjs` | The updater (check → download → replace → build → commit → log) |
| `scripts/zapo-autoupdate-cron.sh` | Linux scheduler installer |
| `scripts/zapo-autoupdate-task.ps1` | Windows scheduler installer |
| `logs/zapo-autoupdate.log` | Append-only run log (gitignored) |

## Out of scope

- Version pinning / channel selection (always tracks `releases/latest`).
- Notifications (email/Slack). The log is the record of record.
- Rollback / backup of the previous ZAPO version.
