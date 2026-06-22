# Visible, copyable IDs for contexts/capabilities/features/scenarios — Design

**Date:** 2026-06-22
**Status:** Approved (design); implementation plan pending
**Scope:** Kartograph Desktop (Electron) app + one new pure helper in `viewer/lib`. No change to the tag model, schema, `serve.js`, or the browser viewer's behavior.

## Summary

Give every context, capability, feature, and scenario a visible, click-to-copy **ID** in the Map
and Tracking views, so the user can quote an exact item to an AI ("change scenario XYZ to …").
The ID is a **derived path locator** built from identifiers that already exist — no data is
persisted or migrated. Capability slugs are globally unique, so IDs are capability-rooted.

## ID format (canonical, pure)

A new pure module `viewer/lib/ids.js` is the single source of truth for the format:

| Item | ID | Example |
|------|----|---------|
| context | `<contextSlug>` | `identity-access` |
| capability | `<capabilitySlug>` | `authentication` |
| feature | `<capabilitySlug>/<featureFile>` | `authentication/sign-in.feature` |
| scenario | `<capabilitySlug>/<featureFile>#"<scenarioName>"` | `authentication/sign-in.feature#"user signs in"` |

Exported functions (pure, no DOM/IO):
- `contextId(contextSlug) -> string`
- `capabilityId(capabilitySlug) -> string`
- `featureId(capabilitySlug, featureFile) -> string`
- `scenarioId(capabilitySlug, featureFile, scenarioName) -> string`

An AI resolves a scenario ID to its file by looking up `capabilities[<cap>].context` in
`kartograph.json` → `features/<context>/<cap>/<file>`, then the named `Scenario:`. The format is
stable as long as the slug, filename, and scenario name don't change (renames change the ID, which
is acceptable — you reference the current identity).

## Display + click-to-copy

- A shared renderer helper `desktop/renderer/idchip.js` exports `idChip(idText) -> HTMLElement`:
  a subtle monospace `<span class="idchip">` whose text is `idText`. On click it calls
  `window.karto.copy(idText)` and briefly adds a `copied` class (a "copied" flash, ~1s). Its
  pointer/click handlers call `stopPropagation()` so clicking the chip never starts a Map drag or
  toggles/selects a Tracking row.
- **Clipboard IPC:** `desktop/preload.cjs` exposes `copy: (text) => ipcRenderer.invoke('clipboard:write', text)`.
  `desktop/main/ipc.js` adds `ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text ?? '')); return { ok: true }; })`
  using Electron's `clipboard` module (reliable under `file://`, unlike `navigator.clipboard`).

## Where IDs appear

- **Map** (`views/map.js`):
  - **context** — its slug as an `idChip` appended to the context region label.
  - **capability** — its slug as an `idChip` inside the capability node (below the name line).
  - (The Map shows no features/scenarios, so those IDs are Tracking-only.)
- **Tracking** (`views/tracking.js`):
  - **tree** — an `idChip` on each context header (context slug), capability row (capability slug),
    and feature row (feature ID).
  - **detail** — the feature ID as an `idChip` in each feature card header, and the scenario ID as
    an `idChip` on each scenario row.

## Architecture & files

- **New** `viewer/lib/ids.js` — the four pure ID functions.
- **New** `test/ids.test.js` — `node:test` coverage of the four formats (incl. a scenario name with
  a quote/special character, to lock the quoting).
- **New** `desktop/renderer/idchip.js` — `idChip(idText)` (imports nothing; calls
  `window.karto.copy`).
- **Modify** `desktop/main/ipc.js` — add the `clipboard:write` handler (+ import `clipboard`).
- **Modify** `desktop/preload.cjs` — add `copy`.
- **Modify** `desktop/renderer/views/map.js` — import `capabilityId`/`contextId` + `idChip`; place
  chips on the capability node and context label.
- **Modify** `desktop/renderer/views/tracking.js` — import the four id fns + `idChip`; place chips
  on tree rows, card headers, and scenario rows.
- **Modify** `desktop/renderer/styles.css` — `.idchip` styling (monospace, muted, hover, `copied`
  state) and any spacing.

## Data flow

1. Each view computes an item's ID via `viewer/lib/ids.js` from data it already has
   (context slug, capability slug, feature filename, scenario name).
2. It renders an `idChip(id)` next to/within the item.
3. Clicking the chip → `window.karto.copy(id)` → `clipboard:write` → `clipboard.writeText`.

## Error handling

- The clipboard handler coerces to string and never throws to the renderer; a copy failure is
  swallowed in the chip's click handler (best-effort; the chip simply doesn't flash).
- `idChip` and the ID functions tolerate missing inputs (an empty/falsy slug yields the best
  available string); chips never block the surrounding view's rendering.

## Testing

- `viewer/lib/ids.js` gets `node:test` coverage (the four formats + the quoting edge case) —
  consistent with "tests gate the pure layer only."
- The renderer chips, placements, and the clipboard IPC are verified by running the app.
- `npm test` must still pass.

## Scope

**In:** the pure `ids.js` + test; the clipboard IPC + preload method; the `idChip` helper; chip
placements in Map and Tracking; `.idchip` CSS.

**Out (unchanged / YAGNI):** persisted/short/positional IDs; any schema, tag-model, `.feature`,
`serve.js`, or browser-viewer change; showing scenario/feature IDs on the Map; the previously
deferred polish items.
