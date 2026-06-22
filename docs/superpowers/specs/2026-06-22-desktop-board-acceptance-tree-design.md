# Desktop Board — grouped acceptance tree — Design

**Date:** 2026-06-22
**Status:** Approved (design); implementation plan pending
**Scope:** Kartograph Desktop (Electron) app only — the `desktop/` Board view. No change to the browser viewer or `server/serve.js`.

## Summary

Redesign the desktop **Board** view from a four-column Kanban into a collapsible,
Features-view-style tree (`CONTEXT → capability → feature → scenario`) where each
scenario's progress is set with a one-click segmented control, and features/capabilities/
contexts show derived acceptance roll-ups. The per-scenario lifecycle is
**Open → WIP → Developed → Accepted**, and a feature is **Done** (derived) when all of its
scenarios are Accepted.

## Motivation

The current board (a flat Kanban across all capabilities) loses the context/capability/feature
structure that the Features view makes clear. The user's workflow is acceptance-testing: a
feature is developed (all scenarios set to a "developed" state), then each scenario is
individually accepted, and when every scenario is accepted the feature is complete. The board
should make that structure and that per-scenario acceptance action first-class.

## State model (no tag-model change)

The scenario lifecycle maps onto the existing progress tags exactly — **no new tag, no schema
change, no change to `gherkin.js`/`board-data.js`/`serve.js`/the browser viewer:**

| Board label | Stored progress | Gherkin tag |
|-------------|-----------------|-------------|
| Open        | `open`          | *(none)*    |
| WIP         | `wip`           | `@wip`      |
| Developed   | `test`          | `@test`     |
| Accepted    | `done`          | `@done`     |

A **feature is Done** when every one of its scenarios is `Accepted` (`@done`). "Done" is a
**derived, computed roll-up — it is never stored** (there is no feature-level tag, consistent
with the project's "maturity is derived, never declared" philosophy). Path tags
(`@happy`/`@edge`/`@error`) and maturity are untouched — progress remains tracking-only.

## Layout & interaction

Replace the Kanban (`desktop/renderer/views/board.js`) with a vertical, collapsible tree:

```
▾ PROJECT WORKSPACE                         ● 3/8 done
  ▾ Project Management              ● Done   2/2
    sign-in.feature                ● 2/2
      ◆ user signs in     [ Open | WIP | Developed |[Accepted]]
      ◆ bad password      [ Open | WIP | Developed |[Accepted]]
    profile.feature                ◑ 1/2
      ◆ view profile      [ Open | WIP |[Developed]| Accepted ]
      ◆ edit profile      [ Open |[WIP]| Developed | Accepted ]
  ▸ Stakeholders                   ○ 0/1
▸ COLLABORATION                              ◑ 1/5 done
```

- **Grouping & order:** group scenarios by `context → capability → feature`. Context order,
  names, and colors come from the `contexts` list `readBoard()` returns; capability names from
  its `capabilities` list; features and scenarios from the `scenarios` list.
- **Scenario row:** a small path-tag marker (happy/edge/error, colored as today), the scenario
  name, and a **4-segment control** (Open | WIP | Developed | Accepted). The current state's
  segment is highlighted; clicking a segment sets that state.
- **Collapsible:** context and capability headers collapse/expand on click. Collapse state is
  kept **per tab, in memory** (a Set of collapsed keys on the tab object), resets on app
  restart — same pattern as the map view's `tab.mapView`.
- **Empty capability:** a capability with no `.feature` scenarios shows under its context with a
  `0/0` / untouched roll-up and no scenario rows.

## Roll-ups (derived)

Computed by a **pure helper** (see Architecture); displayed as a status dot + count:

- **Feature:** `n/m accepted` where `m` = scenario count, `n` = accepted count. Dot:
  - **grey / untouched** — no scenario past Open (every scenario is `open`),
  - **green / Done** — all scenarios Accepted (`n === m && m > 0`),
  - **blue / in progress** — otherwise.
- **Capability:** aggregate over its features' scenarios, same grey/blue/green rule; shows
  "x/y done" where y = feature count, x = features that are Done.
- **Context:** aggregate over its capabilities, same rule and "x/y done" (y = capability count,
  x = capabilities that are Done).

A capability/context is **Done** only when all of its scenarios are Accepted (equivalently, all
its features are Done). Untouched = every descendant scenario is Open.

## Architecture

- **Pure roll-up helper — new, unit-tested.** Add to `viewer/lib/board.js` (already the home of
  `groupByContext`, `capabilityStatuses`, `BOARD_COLUMNS`): a function that takes the flat
  `scenarios` array (each `{context, capability, feature, name, class, progress}`) and returns a
  grouped structure with counts and a derived status per feature/capability/context, e.g.:

  ```js
  // buildAcceptanceTree(scenarios, { contexts, capabilities }) -> {
  //   contexts: [{ context, name, color, status, doneCount, total,
  //     capabilities: [{ capability, name, status, doneCount, total,
  //       features: [{ feature, featureName, status, accepted, total,
  //         scenarios: [{ name, class, progress }] }] }] }]
  // }
  // status ∈ 'untouched' | 'progress' | 'done'
  ```

  The exact name/shape is finalized in the plan; the point is the grouping + counts + status
  derivation are pure and tested with `node:test` in `test/`, while the rendering stays in the
  renderer (untested, per repo convention "tests gate the pure layer only").

- **Renderer — `desktop/renderer/views/board.js` (rewritten).** Calls the pure helper on
  `tab.data.board` and renders the tree, the segmented controls, the dots/counts, and the
  collapse toggles. A label map (`Open/WIP/Developed/Accepted` ↔ `open/wip/test/done`) lives
  here (presentational, desktop-only).

- **Writes — existing `setBoardProgress` IPC, unchanged.** Clicking a segment calls
  `window.karto.setBoardProgress({ root, context, capability, feature, scenario, progress })`
  with the mapped progress value; on success, re-fetch `tab.data.board = await
  window.karto.readBoard(root)` and re-render, preserving the per-tab collapse set. No new IPC,
  no main-process change.

- **CSS — `desktop/renderer/styles.css`.** Tree rows, segmented control (with the active
  segment highlighted), status dots (grey/blue/green), path-tag markers, collapse chevrons.

## Data flow

1. Board tab renders → `buildAcceptanceTree(tab.data.board.scenarios, { contexts, capabilities })`.
2. Render contexts → capabilities → features → scenario rows with segmented controls + roll-up
   dots; honor the tab's collapsed-keys set.
3. User clicks a segment → map label→progress → `setBoardProgress(...)` writes the `.feature`.
4. On success → `readBoard(root)` → recompute tree → re-render (collapse state preserved).
5. Live reload (file changed on disk) already calls `refreshTab`, which re-fetches and
   re-renders the board — the new render path benefits automatically.

## Error handling

- A failed `setBoardProgress` surfaces an in-app message (toast/alert) and leaves the board
  unchanged (no optimistic mutation before the await succeeds) — same discipline as today's board.
- The board render runs inside `app.js`'s per-view `try/catch` (added earlier), so a render
  error shows an inline message instead of blanking the workspace.
- A map with zero capabilities/scenarios renders an empty-state message.

## Testing

- The pure roll-up helper gets `node:test` coverage in `test/` (grouping order, counts, and the
  three status states at feature/capability/context level, including untouched/all-accepted/
  partial and the empty-capability case).
- The renderer/segmented-control behavior is verified by running the app (repo convention).

## Scope

**In:**
- Rewrite `desktop/renderer/views/board.js` to the grouped collapsible tree with segmented
  controls and derived roll-ups.
- New pure `buildAcceptanceTree` helper in `viewer/lib/board.js` + its `node:test`.
- Board CSS in `desktop/renderer/styles.css`.

**Out (YAGNI for now):**
- Search/filter on the board and a "hide completed" toggle.
- Persisting collapse state across app restarts.
- Any manual feature-level "Done" override (Done is always derived).
- Any change to the browser viewer's board, `serve.js`, the schema, or the tag model.
- A new IPC channel (the existing `readBoard`/`setBoardProgress` suffice).
