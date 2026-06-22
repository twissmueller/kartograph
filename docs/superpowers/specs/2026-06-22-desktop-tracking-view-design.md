# Desktop "Tracking" view — merge Board + Features — Design

**Date:** 2026-06-22
**Status:** Approved (design); implementation plan pending
**Scope:** Kartograph Desktop (Electron) app only. No change to the Map view, the browser viewer, `serve.js`, the schema, the tag model, or the IPC surface.

## Summary

Replace the desktop app's two separate **Board** and **Features** tabs with one master-detail
**Tracking** tab. Tabs become **Map | Tracking**. The Tracking view is the existing Features
view (left context→capability tree, right Gherkin detail, with scenario search, tag filter, and
raw-source toggle) enhanced with: acceptance **status dots + counts** in the tree, and an inline
per-scenario **Open/WIP/Developed/Accepted** segmented control in the detail. This fixes the
wasted horizontal space of the current Board (where each row stretched its name and control
edge-to-edge) and removes the conceptual overlap between Board and Features.

## Motivation

The current Board (a single full-width tree) pushes each scenario's segmented control to the
far right of a very wide pane, leaving a large dead zone in the middle. It also duplicates the
Features view's context→capability→scenario navigation. Merging the two into a master-detail
layout uses space efficiently (narrow tree + content-width detail + reference sidebar) and gives
one place to both read scenarios (Gherkin) and act on them (acceptance state).

## Layout

`app.js` already wraps every view in `.project-main` (the view) + `.project-side` (the
reference sidebar). The Tracking view fills `.project-main` with its own two-pane split:

```
Map | Tracking
┌─ tree ───────┐┌─ detail (selected capability) ─────────┐┌ sidebar ┐
│▾ RECEPTION   ││ ┌ search ┐ [ ] Raw  @happy @edge …       ││ Maturity│
│  ● Audio In  ││ capture-audio.feature            2/3     ││ Glossary│
│  ○ DSP Dec   ││  @happy @done                            ││ ADR     │
│▸ TRAINING    ││  Capture a Morse signal via the mic      ││ Questions│
│▸ COMMUNITY   ││    Given … When … Then …                 ││         │
│              ││    [ Open | WIP | Developed |[Accepted] ]││         │
│              ││  @edge                                   ││         │
│              ││  Switch source while capturing           ││         │
│              ││    [ Open |[WIP]| Developed | Accepted ] ││         │
```

## Left tree (navigation + acceptance status)

- Collapsible `CONTEXT → capability` tree built from `buildAcceptanceTree(tab.data.board.scenarios,
  { contexts: tab.data.board.contexts, capabilities: tab.data.board.capabilities })` — the pure
  helper already added in `viewer/lib/board.js`.
- Each **context header** is collapsible (chevron) and shows an aggregate status dot + `x/y done`.
- Each **capability row** shows a status dot + `n/m` and is the click target that loads the
  detail. Dots: grey `untouched` / blue `progress` / green `done` (all scenarios Accepted).
- Collapse state is per-tab, in memory (`tab.trackingCollapsed`, a Set keyed `ctx:<context>`),
  surviving re-render, resetting on app restart — same pattern as the map/board state.

## Right detail (read + act)

- On selecting a capability, load `window.karto.readFeatures(root, context, capability)` →
  `{ files: [{ file, feature, description, background, scenarios: [{ name, tags, class, steps }] }] }`
  (unchanged IPC; the same call the Features view makes today).
- Render each feature: title, optional description, optional background, then each scenario with
  its tag line, name, Given/When/Then steps (identical to today's Features detail), **plus** an
  inline segmented control `[ Open | WIP | Developed | Accepted ]`. The active segment is the
  scenario's current state, derived from its tags via the existing pure
  `scenarioProgress(tags)` (`workflows/lib/gherkin.js`) → `open|wip|test|done`, mapped to the
  labels Open/WIP/Developed/Accepted.
- A small per-feature roll-up (`accepted/total`) is shown in the feature header.
- **Search** (free text over scenario name + steps) and the **tag filter** (`@happy/@edge/@error`
  + `@wip/@test/@done`) narrow the visible scenarios, exactly as in today's Features view. The
  **Raw** toggle shows the `.feature` source via `readRaw`.

## Writes

Clicking a segment maps the label to its progress value (Open=`open`, WIP=`wip`,
Developed=`test`, Accepted=`done`) and calls the existing
`window.karto.setBoardProgress({ root, context, capability, feature, scenario, progress })`
(writes the `.feature` tag). On success it re-fetches **both**:
- `tab.data.board = await readBoard(root)` → rebuild the left tree's dots/counts, and
- the selected capability's `readFeatures(...)` → refresh the detail,

then re-renders the tree and the detail **in place**, preserving the current selection, collapse
state, search text, checked tag filters, and raw toggle (these live in the view's closure /
persistent control DOM, not rebuilt by a state change). No optimistic mutation before the await;
on error, an in-app message and state left unchanged.

## Architecture & files

- **New** `desktop/renderer/views/tracking.js` — the combined master-detail view. Structure
  (functions in one closure so selection/search/filter/raw persist across in-place updates):
  `renderTracking(container, tab)` builds the shell + controls; `drawTree()` builds the left tree
  from `buildAcceptanceTree`; `load()` fetches the selected capability's features (or raw);
  `render()` draws the detail with per-scenario controls; `setState(ref, progress)` does the
  write→refetch→redraw.
- **Remove** `desktop/renderer/views/board.js` and `desktop/renderer/views/features.js` — fully
  superseded by `tracking.js`.
- **Modify** `desktop/renderer/app.js`:
  - imports: drop `renderBoard`/`renderFeatures`, add `renderTracking`;
  - `VIEWS = { map: renderMap, tracking: renderTracking }`;
  - view switcher list `['map', 'tracking']`;
  - default `tab.view` stays `'map'`.
  - `loadProjectData` is unchanged (already returns `{ root, map, layout, board, tree }`; Tracking
    uses `board` for the tree and `readFeatures` for the detail).
- **Reuse (already pure + unit-tested):** `buildAcceptanceTree` (`viewer/lib/board.js`,
  imported from `../../../viewer/lib/board.js`) and `scenarioProgress`
  (`workflows/lib/gherkin.js`, imported from `../../../workflows/lib/gherkin.js`).
- **CSS** (`desktop/renderer/styles.css`): reuse the existing `.fb-*` (tree/detail), `.seg`
  (segmented control), and `.dot`/`.dot-*` rules; add a handful for the collapsible context
  header (chevron) and the capability row's dot. The now-unused Kanban (`.board`, `.board-col`,
  `.card*`) and board-tree (`.bt-*`) rules are left in place (pruning them is out of scope).

## Data flow

1. Tracking renders → `drawTree()` from `buildAcceptanceTree(tab.data.board…)`; detail shows
   "Pick a capability."
2. Click a capability → `load()` → `readFeatures` → `render()` detail with per-scenario controls
   (active state via `scenarioProgress`), filtered by search + tags.
3. Click a segment → `setState` → `setBoardProgress` write → re-fetch `readBoard` + `readFeatures`
   → `drawTree()` + `render()` (selection/search/filter/raw/collapse preserved).
4. Live reload (file changed on disk) → `app.js` `refreshTab` re-fetches `tab.data` and calls the
   view; Tracking re-renders from fresh data.

## Error handling

- A failed `setBoardProgress` (or either re-fetch) surfaces an in-app message and leaves the view
  unchanged (no optimistic mutation).
- The view runs inside `app.js`'s per-view `try/catch`, so a render error shows an inline message
  instead of blanking the workspace.
- A capability with no features shows "No scenarios"; an empty map shows the empty-state message.

## Testing

- No new pure logic — the view reuses `buildAcceptanceTree` and `scenarioProgress`, both already
  covered by `node:test`. The renderer is verified by running the app (repo convention "tests
  gate the pure layer only").
- `npm test` must still pass (no regression) after removing `board.js`/`features.js` and rewiring
  `app.js` (those are renderer files, untested; the suite confirms nothing else broke).

## Scope

**In:**
- New `tracking.js`; remove `board.js` + `features.js`; rewire `app.js` to `Map | Tracking`.
- Tracking CSS additions in `styles.css`.

**Out (YAGNI / unchanged):**
- The Map view, the tag model, the schema, `serve.js`, the browser viewer, and the IPC surface
  (reuses `readBoard`/`readFeatures`/`readRaw`/`setBoardProgress`).
- Persisting collapse/selection across app restarts.
- Pruning the now-dead Kanban/board-tree CSS.
- Any new pure helper or unit test (everything reused is already tested).
