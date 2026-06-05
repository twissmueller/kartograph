# Viewer: non-overlapping layout, zoom/pan, right sidebar — design

Date: 2026-06-05
Status: approved

Three viewer (`viewer/`) enhancements, building on the just-added context drag.

## Architecture note

Today only a **capability** is a positioned unit; the context box is derived as the
bounding box of its capabilities (`drawContainers` → `boundsForGroups`). Non-overlap and
live collision require treating the **box as a unit**. Resolution that keeps free
capability dragging:

- Initial placement lays capabilities of each context in a **grid** (not the small circle),
  fixing intra-box overlap and defining the box size.
- Boxes are then **packed collision-free** (row/shelf packing).
- Saved/dragged positions still win (`existingLayout[slug]` short-circuit), so a fresh map
  gets a clean grid and manual drags persist.

## Feature 1 — no overlap + live collision

- Each context has an AABB (world coords) derived from its members.
- **Context drag:** after translating the dragged context's members, run a **separation
  pass** that pushes *other* overlapping boxes apart along the axis of least overlap
  (translating their members too); iterate a few times for chained pushes; the dragged box
  stays fixed.
- The same separation pass runs on the initial auto-layout.
- **Individual capability drag stays free** (no collision) — box collision is the deliberate
  "move the region" gesture and the auto-layout, not the per-node gesture.

## Feature 2 — zoom & pan

- A transform layer: nodes + edge SVG + regions live in a `#world` container with
  `transform: translate(panX, panY) scale(z)`.
- **Wheel = zoom toward cursor**; **drag on empty background = pan**. Box drag = context,
  node drag = capability — no conflict with pan (pan only starts on empty canvas).
- Drag deltas are divided by `z` so nodes track the cursor under zoom.
- `panX/panY/z` are module state, re-applied after each `render()` so live-reload doesn't
  reset the view.

## Feature 3 — panel right, collapsible, accordion

- Page becomes a flex row: canvas left (flex), **sidebar right** (fixed width, full height).
- A **toggle chevron** collapses the sidebar to a thin bar (more canvas width).
- Maturity / Glossary / ADR become **accordion sections** (click header to expand/collapse);
  sidebar scrolls internally.

## Order & verification

Panel (low risk) → zoom/pan (medium) → collision layout (high). Each step verified in the
browser (Playwright screenshot + position assertions). Layout-lib changes covered by
`test/layout.test.js`; existing 99 tests must stay green.
