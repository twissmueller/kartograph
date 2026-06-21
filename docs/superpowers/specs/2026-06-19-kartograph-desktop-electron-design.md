# Kartograph Desktop (Electron) — Design

**Date:** 2026-06-19
**Status:** Approved (design); implementation plan pending

## Summary

A dedicated Electron desktop app for viewing Kartograph maps. You open a project's
`kartograph.json` directly; opening one creates a new tab, and several projects can be open
at once. It replaces the *need* to run the built-in `server/serve.js` + browser viewer for
day-to-day viewing, but does **not** remove them — `serve.js` and `/karto-show` keep working
unchanged (coexist).

The renderer UI is **rebuilt fresh** (vanilla JS, no build step — matching the repo's ethos),
not a port of `viewer/`. The deterministic data logic is **shared** with the existing server
by extracting it into pure libs under `workflows/lib/`.

## Goals

- Open a `kartograph.json` directly from a native file dialog.
- Multiple projects open simultaneously, one tab per project, in a single window.
- Full parity with today's viewer: Map view, Board view, sidebar panels, live reload, and
  write-back (layout drag-save + Board progress edits).
- A richer **feature browser** beyond today's scenario detail.
- Restore open tabs on launch; a Recent-projects menu; confirm before closing with unsaved
  in-memory changes.

## Non-goals (v1)

- Packaging / distribution (electron-builder, signed installers, auto-update) — **follow-up**.
  v1 ships a `npm start` dev-run only.
- One OS window per project (we use a single window with in-app tabs).
- Editing the map structure itself (capabilities/contexts/glossary/ADRs). Writes are limited
  to layout positions and scenario progress tags, exactly like today's viewer.
- Replacing or retiring `server/serve.js` / `/karto-show`.

## Placement

A new `desktop/` subfolder in the kartograph repo with its **own `package.json`** declaring
`electron` as a dev dependency. The repo root `package.json` and plugin manifest are not
touched by v1 (the desktop app is not part of the plugin release; it is a sibling tool). The
repo stays ESM (`"type": "module"`); Electron main uses ESM (Electron ≥ 28).

```
desktop/
  package.json            # electron devDep; "start": "electron ."
  main/
    main.js               # app lifecycle, window, menu, tab/session orchestration
    ipc.js                # registers ipcMain.handle handlers → calls shared libs + fs
    watcher.js            # per-project recursive fs watcher, debounced
    session.js            # persist/restore open tabs + recent list (userData JSON)
  preload.js              # contextBridge: exposes the named renderer API
  renderer/
    index.html
    app.js                # tab strip + per-project view orchestration
    views/                # map, board, feature-browser, sidebar (fresh vanilla JS)
    styles.css
```

## Architecture (three layers, Electron security model)

1. **Main process** (`desktop/main/`, Node ESM) — owns the filesystem, file watchers, native
   dialogs, the application menu, and session/recent persistence. Imports the repo's existing
   pure libs directly (relative import from `../workflows/lib/...`). No business logic is
   duplicated.
2. **Preload** (`desktop/preload.js`) — a `contextBridge` API exposing only the named,
   safe operations below. `BrowserWindow` is created with `contextIsolation: true`,
   `nodeIntegration: false`, `sandbox: true`. The renderer never touches `fs` or `ipcRenderer`
   directly.
3. **Renderer** (`desktop/renderer/`, fresh vanilla JS, no bundler) — the new UI.

## Shared-logic refactor (targeted, part of this work)

The board-building and feature-parsing logic currently lives **inline** in `server/serve.js`
(the `GET /board` and `GET /features/...` handlers). Extract them into pure, unit-tested
functions in `workflows/lib/`, then have **both** `serve.js` and the Electron main call them:

- `workflows/lib/board.js` → `buildBoard(projectRoot, { readFile, readdir })` returning
  `{ scenarios, capabilities, contexts }` (same shape `GET /board` returns today).
- `workflows/lib/feature-read.js` → `readCapabilityFeatures(projectRoot, context, slug, fs)`
  returning `{ files: [...] }` (same shape `GET /features/...` returns today), plus
  `listFeatureTree(projectRoot, fs)` returning the context→capability→file tree for the
  browser, and a shared slug/feature-name validator.

`serve.js` is refactored to call these (behavior-preserving). Existing `gherkin.js`
(`parseFeature`, `scenarioClass`, `scenarioProgress`, `setScenarioProgress`) and
`maturity-derive.js` are reused as-is.

> Rationale: matches the repo's "pure function + thin caller" rule and the architectural rule
> that all validation/transform correctness lives in the deterministic Node layer with tests.

## The IPC data layer (replaces the 5 HTTP endpoints)

Each renderer call goes preload → `ipcRenderer.invoke` → `ipcMain.handle`. Project root is
passed explicitly (the renderer holds it per tab).

| Renderer API (preload) | Replaces (serve.js) | Main-process behavior |
|---|---|---|
| `openProject()` | — | native open dialog (filter `kartograph.json`); returns `{ root, name }`, root = file's folder |
| `readMap(root)` | `GET /kartograph.json` + layout read | read & parse `kartograph.json` (incl. `glossary`, `adrs`, `openQuestions`) and `kartograph.layout.json` (default `{}`) |
| `readBoard(root)` | `GET /board` | `buildBoard()` |
| `listFeatures(root)` | *(new)* | `listFeatureTree()` — full context→capability→file tree |
| `readFeatures(root, ctx, slug)` | `GET /features/...` | `readCapabilityFeatures()` |
| `readRaw(root, relPath)` | *(new)* | validated raw text of a `.feature`/`.json`/`.md` file for the raw view |
| `setBoardProgress({root, context, capability, feature, scenario, progress})` | `POST /board` | validate slugs/feature/progress, `setScenarioProgress()`, write `.feature` |
| `saveLayout(root, layout)` | `POST /layout` | write `kartograph.layout.json` |
| `onFileChange(cb)` | `GET /events` (SSE) | subscribe to debounced change events for the active projects; callback receives the affected `root` |

All path inputs are validated with the shared slug/feature validators before any filesystem
access (path-traversal guard, same rules as `serve.js` today).

## Project / tab model

- A **project = folder** containing `kartograph.json`. Open dialog targets the JSON file;
  `projectRoot = dirname(file)`. Each open project is one tab.
- **Single window**, custom in-app tab strip. Switching tabs swaps the rendered project view.
- Each tab has independent state and its own watcher in main, keyed by a project id.
- **Session restore** (`session.js`): the list of open project roots + a recent-projects list
  persist to a JSON file in `app.getPath('userData')`. On launch, previously open tabs reopen.
- **Recent projects** appear under the File menu (and reopen as new tabs).
- **Close confirmation**: the renderer tracks a per-tab in-memory dirty flag (e.g. an unsaved
  layout drag). Closing a dirty tab, or quitting with any dirty tab, prompts via a native
  dialog before discarding.

## Views (v1)

- **Map** — capability graph grouped by context; draggable nodes; layout persisted via
  `saveLayout` (writes `kartograph.layout.json`). The map's auto-placement/layout math may
  reuse the existing pure helpers in `viewer/lib/layout.js` (pure, no DOM) by importing or
  copying them into the renderer; rendering itself is rebuilt fresh.
- **Board** — cross-capability scenario Kanban; dragging a card rewrites its progress tag via
  `setBoardProgress` (writes the `.feature` file). Progress tags only — path tags
  (`@happy`/`@edge`/`@error`) and maturity are never altered.
- **Sidebar** — maturity bar, glossary, ADRs, open questions (all read from `kartograph.json`).
- **Feature browser** —
  - **Browse all `.feature` files**: a navigable context → capability → file tree, independent
    of the map graph (`listFeatures`).
  - **Full Gherkin rendering**: description, background, every scenario with its tags and full
    Given/When/Then steps, lightly highlighted.
  - **Filter & search**: filter by path tag (`@happy`/`@edge`/`@error`) and progress tag
    (`@wip`/`@test`/`@done`); free-text search across scenario names and steps.
  - **Raw view**: toggle to the raw `.feature` source text (`readRaw`), and the raw
    `kartograph.json`.

## Live reload

Per-project recursive `fs.watch` in main (with the same fallback as `serve.js` when recursive
watch is unsupported), debounced (~100 ms). Change events are filtered to
`kartograph|\.feature$|decisions|\.json$` and **exclude** `kartograph.layout.json` (the app's
own writes), mirroring `serve.js`. Events are routed to the owning tab via the
`onFileChange` channel; that tab re-fetches and re-renders. A tab in error state retries on
the next relevant change.

## Error handling

- Bad/missing `kartograph.json`, or a parse error, puts **that tab** into an error state with a
  retry affordance — it never crashes the app or affects other tabs.
- IPC write failures reject; the renderer surfaces them as an in-app toast.
- Invalid slugs/paths are rejected by the shared validators before any fs access.
- Recursive-watch unsupported → fall back to watching `kartograph.json` only (as `serve.js`).

## Testing

- New pure libs (`buildBoard`, `readCapabilityFeatures`, `listFeatureTree`, validators) get
  `node:test` coverage in `test/`, consistent with the repo ("tests gate the pure layer only").
- The behavior-preserving `serve.js` refactor is covered by the same lib tests (serve.js
  becomes a thin caller).
- Main IPC handlers are thin wrappers over the tested pure functions + fs; renderer UI is
  verified by running the app, not unit-tested (matches the repo convention).

## Run

```bash
cd desktop
npm install
npm start          # electron .
```

## Open follow-ups (not v1)

- Packaging & distribution (electron-builder, code signing, auto-update).
- Eventually rewiring `/karto-show` to launch the desktop app, and retiring `serve.js`.
- Possible npm workspace wiring if `desktop/` should share the root `node_modules`.
