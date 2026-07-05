---
description: Open the Kartograph desktop app on the current project's map, with live reload.
---

Launch the Kartograph desktop app for the current project.

1. Confirm a `.kartograph/kartograph.json` exists in the project. If it does not, copy the
   seed map so there is something to show:
   `mkdir -p .kartograph && cp "${CLAUDE_PLUGIN_ROOT}/examples/kartograph.seed.json" .kartograph/kartograph.json`
2. Launch the desktop app on the current project, in the background:

   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/start-desktop.sh" "$(pwd)"
   ```

   Run it with `run_in_background: true` so the session stays responsive. The current
   project directory is passed as an argument, so the app opens it as the active tab (on
   top of any previously restored session).
3. Tell the user:
   - The desktop app is launching in a native window; the **first run installs Electron**,
     which may take a minute.
   - The app **live-reloads** on changes to `.kartograph/kartograph.json`,
     `.kartograph/kartograph.layout.json`, and `features/**` — no manual refresh needed.
   - They can open more projects from within the app (File → Open, or the `+` tab).
