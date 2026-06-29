#!/usr/bin/env bash
# Start the Kartograph desktop app (Electron).
# Installs the desktop dependencies on first run, then launches the app.
set -euo pipefail

# Resolve the repo root from this script's location (scripts/ -> repo root),
# so it works regardless of the current working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DESKTOP_DIR="$REPO_ROOT/desktop"

if [ ! -d "$DESKTOP_DIR" ]; then
  echo "error: desktop/ not found at $DESKTOP_DIR" >&2
  exit 1
fi

cd "$DESKTOP_DIR"

# First-run (or post-clone) dependency install.
if [ ! -x "node_modules/.bin/electron" ]; then
  echo "Installing desktop dependencies…"
  npm install
fi

echo "Starting Kartograph desktop…"
exec npm start
