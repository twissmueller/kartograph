# Tracking view — feature level in tree + card-per-feature detail — Design

**Date:** 2026-06-22
**Status:** Approved (design); implementation plan pending
**Scope:** Kartograph Desktop (Electron) app only — the Tracking view (`desktop/renderer/views/tracking.js`) + its CSS. No change to the Map view, the tag model, the IPC surface, `serve.js`, the schema, or the browser viewer.

## Summary

Refine the Tracking view so features are first-class in both panes. The left tree gains a third
level — **context → capability → feature** — with capabilities now collapsible; expanding a
capability lists its features (each with a status dot + `accepted/total`). Clicking a feature
shows only that feature in the detail; clicking a capability shows all its features. In the
detail, each feature renders as a **bordered card** with a header bar (name · `accepted/total` ·
status dot) and its scenarios contained inside, so each feature's start and end are unmistakable.

## Motivation

The current Tracking detail renders a capability's features as a flat run of scenarios; with many
scenarios it is hard to see where one feature ends and the next begins, and there is no way to
jump straight to a single feature. Adding a feature level to the tree and visually boxing each
feature in the detail fixes both.

## Left tree (context → capability → feature)

Built from `buildAcceptanceTree(tab.data.board.scenarios, { contexts, capabilities })` (already in
`viewer/lib/board.js`), whose capability nodes already contain `features: [{ feature, featureName,
status, accepted, total, scenarios }]`.

- **Context header** — collapsible (chevron), aggregate status dot + `doneCount/total`. Key
  `ctx:<context>`.
- **Capability row** — now also collapsible (chevron). Shows status dot + `doneCount/total`.
  Clicking the capability's **label** selects it (detail shows all its features); clicking its
  **chevron** expands/collapses its feature list. Key `cap:<context>/<capability>`.
- **Feature row** (shown when its capability is expanded) — indented under the capability, with a
  status dot + `accepted/total` and the feature's display name. Clicking it selects that feature
  (detail shows only it).
- The selected node (capability or feature) is highlighted. Collapse state is per-tab, in memory
  (`tab.trackingCollapsed`, a Set of the keys above), surviving re-render, resetting on app
  restart.

> A capability with no features expands to nothing (its row still selects it; the detail shows the
> empty-state message).

## Detail (card per feature)

- Selection state is `{ context, capability, feature }` where `feature` is a `.feature` filename or
  `null` (whole capability).
- Load the capability's features via `window.karto.readFeatures(root, context, capability)` (the
  same call today, returning steps + tags). If `feature` is set, render only that file's card;
  otherwise render every file's card.
- **Each feature is a card:** a bordered container with a header bar showing the feature name,
  `accepted/total` (accepted = scenarios whose `scenarioProgress(tags) === 'done'`, over all the
  feature's scenarios), and a status dot; optional description and background; then each scenario
  (tag line, name, Given/When/Then steps) with its inline Open/WIP/Developed/Accepted segmented
  control. Cards are visually separated by spacing.
- **Search** (scenario name + steps) and the **tag filter** (`@happy/@edge/@error` +
  `@wip/@test/@done`) still narrow the scenarios shown inside the cards; a card with no matching
  scenarios is omitted. When nothing matches, the empty-state message shows.
- **Raw toggle:** shows raw `.feature` source — only the selected feature's file when a feature is
  selected, otherwise all of the capability's files (file list from `tab.data.tree`).

## Writes

Unchanged mechanism: clicking a segment maps the label to its progress value (Open=`open`,
WIP=`wip`, Developed=`test`, Accepted=`done`) → `window.karto.setBoardProgress({ root, context,
capability, feature, scenario, progress })`, then re-fetch `readBoard` (tree dots) + `readFeatures`
(detail) and redraw **in place**, preserving the current selection (including the selected
feature), collapse state, search text, tag filters, and raw toggle. No optimistic mutation; on
error an in-app message, state unchanged.

## Architecture & files

- **Modify** `desktop/renderer/views/tracking.js`:
  - tree gains capability-collapse + a feature level (status dots/counts from the existing
    `buildAcceptanceTree` feature nodes); chevron toggles collapse, label selects;
  - selection state adds `feature`; `drawTree()` renders three levels and marks the active
    capability/feature;
  - `render()` renders the relevant feature(s) as cards (filtered to `state.feature` when set);
  - `renderRaw()` scopes to the selected feature when one is set;
  - `setState`/refresh preserves `state.feature`.
- **Modify** `desktop/renderer/styles.css`: a feature **card** (border, header bar, spacing),
  a feature tree row (indent + dot), and capability chevron. Reuse `.dot`/`.dot-*`, `.seg`,
  `.bt-chevron`, `.bt-count`.
- **Reuse, no change:** `buildAcceptanceTree` (capability nodes already carry feature nodes) and
  `scenarioProgress`; all existing IPC (`readBoard`/`readFeatures`/`readRaw`/`setBoardProgress`).

## Data flow

1. Tracking renders → `drawTree()` from `buildAcceptanceTree(tab.data.board…)` showing
   context → capability → (when expanded) feature, with dots/counts.
2. Click a capability label → `state.feature = null`, load + render all its feature cards.
   Click a feature row → `state.feature = <file>`, load + render only that card. Chevron on a
   capability toggles its expansion.
3. Click a scenario's segment → `setState` write → re-fetch board + features → `drawTree()` +
   `render()` (selection incl. feature, collapse, search, filters, raw preserved).
4. Live reload → `app.js` `refreshTab` re-fetches `tab.data` and re-renders.

## Error handling

- A failed `setBoardProgress` (or re-fetch) surfaces an in-app message and leaves the view
  unchanged.
- The view runs inside `app.js`'s per-view `try/catch`.
- A capability with no features, or a filter that matches nothing, shows the empty-state message.

## Testing

- No new pure logic — reuses `buildAcceptanceTree` (its feature nodes) and `scenarioProgress`,
  both already `node:test`-covered. The renderer is verified by running the app (repo convention).
- `npm test` must still pass (no regression).

## Scope

**In:** the three-level tree (capability collapse + feature rows) and card-per-feature detail in
`tracking.js`, plus the supporting CSS.

**Out (unchanged / YAGNI):** the Map view; the tag model, schema, `serve.js`, browser viewer, and
IPC surface; persisting collapse/selection across restarts; any new pure helper or unit test;
the previously-deferred polish (filter-aware feature count semantics, replacing `alert()`).
