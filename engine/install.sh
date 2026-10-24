#!/bin/bash
# Reel Studio installer (macOS). Safe to run again: every step is skipped once it is done.
#
#   bash install.sh            full install + smoke test render
#   bash install.sh --no-smoke install only
#   bash install.sh doctor     check everything, change nothing
#
# The steps themselves live in setup.mjs, which is the same installer on macOS and Windows
# (on Windows: double-click setup-windows.cmd, or run  node engine\setup.mjs). This script only
# makes sure Node is there to run it.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$HERE/engine/setup.mjs" ]; then ENGINE="$HERE/engine"; else ENGINE="$HERE"; fi

if ! command -v node >/dev/null 2>&1; then
  cat <<'MSG'

✗ Node.js is not installed. Get the macOS installer (LTS) from https://nodejs.org and run it,
  then open a new Terminal window and run this script again.
MSG
  exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "✗ Node $(node -v) is too old. Install Node 20 or newer from https://nodejs.org and run this again." >&2
  exit 1
fi
exec node "$ENGINE/setup.mjs" "$@"
