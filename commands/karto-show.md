---
description: Open the Kartograph viewer in the browser on the current project's map, with live reload.
---

Launch the Kartograph viewer for the current project.

1. Confirm a `kartograph.json` exists in the project root. If it does not, copy the seed
   map so there is something to show:
   `cp "${CLAUDE_PLUGIN_ROOT}/examples/kartograph.seed.json" kartograph.json`
2. Start the ephemeral dev server in the background, serving the project root and the
   plugin's viewer, on port 4123 (try 4124+ if busy):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/server/serve.js" 4123
   ```

   Run it with `run_in_background: true` so the session stays responsive. This
   server binds a TCP port, which the Claude Code sandbox blocks with
   `listen EPERM`. Start the Bash call **outside the sandbox** from the first
   attempt (set `dangerouslyDisableSandbox: true`) — it only serves localhost
   from the project root, so there is no failed sandboxed try to retry.
3. Open the browser at `http://127.0.0.1:4123` (`open` on macOS, `xdg-open` on Linux).
4. Tell the user the viewer is live, that edits to `kartograph.json`,
   `kartograph/decisions/`, and `features/**` auto-refresh the page, and that dragging
   nodes saves `kartograph.layout.json`. Remind them to stop the background server when
   done.
