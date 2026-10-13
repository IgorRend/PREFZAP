#!/usr/bin/env bash
#
# Install a daily cron job (04:00) that runs the ZAPO auto-updater.
# Run once on the Linux server:  bash scripts/zapo-autoupdate-cron.sh
# Re-running is safe: it replaces any previous entry for this script.
#
set -euo pipefail

# Repo root = parent of this script's dir (resolve symlinks).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
UPDATER="$ROOT/scripts/zapo-autoupdate.mjs"
LOG="$ROOT/logs/zapo-autoupdate.cron.log"

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node not found in PATH." >&2
  exit 1
fi

# Marker lets us find/replace our own line idempotently.
MARKER="# zapo-autoupdate"
CRON_LINE="0 4 * * * cd \"$ROOT\" && \"$NODE_BIN\" \"$UPDATER\" >> \"$LOG\" 2>&1 $MARKER"

# Preserve all other crontab lines; drop any previous zapo-autoupdate line.
EXISTING="$(crontab -l 2>/dev/null | grep -v "$MARKER" || true)"
printf '%s\n%s\n' "$EXISTING" "$CRON_LINE" | grep -v '^$' | crontab -

echo "Installed daily cron (04:00):"
echo "  $CRON_LINE"
echo "Log: $LOG"
echo "View current crontab with: crontab -l"
