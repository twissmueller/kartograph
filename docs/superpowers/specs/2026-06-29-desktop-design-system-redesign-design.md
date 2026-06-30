# Desktop Design System Redesign — Design

**Date:** 2026-06-29
**Status:** Approved (design) — pending spec review
**Scope:** `desktop/` renderer only. No changes to `main/`, `preload.cjs`, IPC, schemas, or `workflows/lib`.

## 1. Goal

Recreate the approved **Kartograph Design System v2 Technical** (`design-system/Kartograph
Design System v2 Technical.dc.html`, described in `design-system/README.md`) inside the real
Electron desktop app, using the repo's existing **vanilla-JS renderer + single `styles.css`**
approach (no framework, no build step). Two complete themes (light default + dark) drive from one
set of CSS custom properties. The redesign reaches the **whole app shell, the Tracking view, the
Map view, and the sidebar** — not just the Tracking view — so nothing is left in the old
dark-only style.

The Tracking view must keep two dimensions independently readable for every
context/capability/feature/scenario:
1. **Maturity** — which path classes (`@happy`/`@edge`/`@error`) are specified.
2. **Progress** — Open → Developed → Accepted.
These are orthogonal and are shown with deliberately different shapes (pips vs dot + segmented
control) so they never merge into one bar.

## 2. Decisions (resolved during brainstorming)

- **Scope:** Whole shell + Tracking + **full Map redesign** + sidebar. Map has no handoff spec, so
  its visual treatment is designed here (§6).
- **Theme toggle:** A button at the right end of `#tabstrip` (always visible). **Default light.**
  Choice persisted to `localStorage`.
- **Fonts:** **Bundled locally** as `.woff2` under `desktop/renderer/fonts/` via `@font-face`
  (offline desktop). If the font files cannot be obtained during implementation, fall back to the
  CSS stacks (`ui-sans-serif` / `ui-monospace`) and flag it explicitly — do not silently ship
  system fonts as if they were the design.
- **Implementation approach:** Single `styles.css` refactored into token-driven component classes,
  plus small shared DOM-builder helpers. No framework, no build step, no new runtime deps.

## 3. Non-goals

- No changes to the data layer: `viewer/lib/ids.js`, `viewer/lib/board.js`,
  `workflows/lib/tracking.js`, schemas, and the `window.karto` IPC surface are unchanged.
- No new behavior in the Tracking view beyond what exists today (same selection, filters, raw
  toggle, persistence, progress writes). This is a visual/structural redesign, not a feature.
- No unrelated refactoring of `main/` process code.

## 4. Token & font foundation

### 4.1 Tokens (`styles.css`)
Add the full token block at the top of `styles.css`. Light values on `:root`; dark overrides on
`[data-theme="dark"]`. Token **names** are exactly those in `design-system/README.md`; **values**
are the v2 Technical values from that file's tables and the prototype's `<style>` block:

- Neutrals: `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--border`, `--border-strong`.
- Ink: `--text`, `--text-muted`, `--text-soft`.
- Blue ramp: `--blue-50 … --blue-900`.
- Primary: `--primary`, `--primary-600`, `--primary-soft`, `--primary-contrast`.
- Path classes (maturity, dim 1): `--happy-fg/-bg/-bd`, `--edge-fg/-bg/-bd`, `--error-fg/-bg/-bd`.
- Progress (dim 2): `--open-dot`, `--open-fg`, `--dev-dot`, `--dev-fg`, `--acc-dot`, `--acc-fg`,
  `--success`, `--success-bg`.
- Radius: `--radius-sm:4px`, `--radius:6px`, `--radius-lg:9px`, `--radius-xl:12px` (pills `999px`).
- Elevation: `--shadow-1/2/3` (light + dark variants).
- Motion: `--ease: cubic-bezier(.2,.7,.3,1)`; `--focus` ring (light + dark).
- Fonts: `--font-sans`, `--font-mono`.

Exact values are copied verbatim from the v2 Technical prototype (`design-system/Kartograph Design
System v2 Technical.dc.html`, lines 18–58) — that file is the source of truth for values.

`:root { color-scheme: light dark }`. `body` uses `--bg` / `--text` / `--font-sans`, 16px / 1.55,
`-webkit-font-smoothing: antialiased`, and a `background`/`color` transition of ~250ms `--ease`.

### 4.2 Fonts (`desktop/renderer/fonts/`)
- Add `desktop/renderer/fonts/` with `HankenGrotesk-*.woff2` (weights 400/500/600/700/800) and
  `JetBrainsMono-*.woff2` (400/500/600).
- `@font-face` rules in `styles.css` (or an `@import`ed block) with `font-display: swap`.
- `--font-sans: 'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif;`
  `--font-mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace;`
- Fallback rule: if the woff2 files cannot be fetched, ship only the CSS stacks and note it in the
  implementation summary.

## 5. Shared component helpers (`desktop/renderer/components.js`)

New module of small, focused DOM builders. Each returns a DOM node (or fragment), has one purpose,
and is reused across views so markup is not duplicated. They take plain data + callbacks, with no
knowledge of view state.

- `maturityPips(scenarios, { compact = false })` → row of three pips in fixed order
  **happy · edge · error**. A pip is *filled* (solid `--*-fg`) when ≥1 scenario of that class
  exists, else *hollow* (transparent, `1.5px dashed --border-strong`). Sizes: ~16×7px (compact
  12×5px), `border-radius: 3px`, gap 3px. Sets a `title`/aria like
  `happy: specified ✓ · edge: not yet — · error: not yet —`. Filled-vs-hollow shape is the
  non-color cue.
- `segmentedControl(current, onSet)` → pill track (`--surface-2`, `1px solid --border`,
  `border-radius:999px`, padding 3px) with three segments Open/Developed/Accepted. Each segment:
  padding 6px 13px, `999px`, font 12.5px/600, leading glyph (`○` / `◐` / `✓`) + label. Selected
  fill: Open → `--text-soft`, Developed → `--primary`, Accepted → `--acc-dot`; text
  `--primary-contrast`; `box-shadow: --shadow-1`. Unselected: transparent, `--text-soft`; hover →
  `--text`; focus → `--focus`. Clicking a segment calls `onSet(state)`.
- `statusDot(status, { halo = false })` → 9–11px circle colored by roll-up status: `done` →
  `--acc-dot`, `progress` → `--dev-dot`, `untouched`/`open` → `--open-dot`. Optional 3px halo in
  the matching soft bg (`--success-bg` / `--primary-soft` / `--surface-2`).
- `rollupCount(accepted, total)` → mono `accepted / total` text (~12.5px), optionally in a
  `--surface-2` pill.
- `pathTag(cls)` → mono path chip colored with `--*-fg` / `--*-bg` / `--*-bd`.

Roll-up status rule (unchanged from `buildAcceptanceTree` / the prototype): **done** = ≥1 scenario
AND all `accepted`; **untouched** = no scenarios or all `open`; otherwise **progress**.

### 5.1 Copy-ID chip (`desktop/renderer/idchip.js`)
Keep the existing API `idChip(idText)` and its behavior (click copies via `window.karto.copy`,
`stopPropagation` on pointerdown/click, flashes for ~1s). Move its **styling** to token-driven CSS
classes: default `--surface-2` bg / `--text-muted` / `1px solid --border`; hover lifts to
`--surface` + `--border-strong`; copied state `--success-bg` / `--acc-fg` / `1px solid --happy-bd`;
focus `--focus`. Mono 11.5px/600, pill, leading copy SVG icon.

## 6. Theme controller (`desktop/renderer/theme.js`)

Small module:
- `initTheme()` reads `localStorage('karto.theme')` (default `'light'`) and sets
  `document.documentElement.dataset.theme`.
- `toggleTheme()` flips light ⇄ dark, writes `document.documentElement.dataset.theme`, persists to
  `localStorage`, and updates the toggle button label/glyph.
- `currentTheme()` accessor.

A plain attribute toggle on `<html>` re-resolves all `var()`s (the prototype's React node-caching
quirk does not apply to a plain DOM/CSS implementation, per the handoff). `app.js` calls
`initTheme()` on boot and renders a toggle button at the right end of `#tabstrip` (sun/moon glyph
`☀`/`☾` + `Light`/`Dark` label, styled as a token pill with `--border-strong` + `--surface`).

## 7. Tracking view (`desktop/renderer/views/tracking.js`)

Rebuilt to the assembled layout in `design-system/README.md` §"The Tracking View" and the
prototype's markup. **All existing state and IPC are preserved**: `tab.trackingSel`,
`tab.trackingUI` (`{search, tags, raw}`), `tab.trackingCollapsed` (collapsed context keys, default
open), `tab.trackingCapsOpen` (expanded capability keys, default closed), tree-width localStorage
(`karto.trackingTreeWidth`, 160–600), `persistSession()`, and IPC `readFeatures` / `readBoard` /
`setBoardProgress` / `readRaw` / `copy`. The drift from today is markup/classes + use of the
shared helpers, not data flow.

### 7.1 Left tree (resizable, ~286px default; clamp 160–600 persisted)
- **Context head:** chevron (`▶`, rotates 90° when open via CSS transform), `statusDot(rollup)`,
  bold name (13.5px/700), mono roll-up count, copy-chip (`contextId`). Click toggles collapse.
- **Capability row:** own chevron (click = expand/collapse); a select button with `statusDot`,
  name (13px/600), **compact `maturityPips`**, count, copy-chip (`capabilityId`). Selected →
  row tint `--primary-soft`. Selecting a capability also expands its feature list.
- **Feature row:** indented under the capability with a left `1px solid --border` rail; `statusDot`,
  name (12.5px), count, copy-chip (`featureId`). Selected → `--primary-soft`.
- Keyboard operable; visible focus.

### 7.2 Controls bar (sticky top of right pane)
- Search input: pill (`--surface-2`, `1px solid --border`), leading magnifier SVG, 14px text.
  Filters scenarios by name + steps text, case-insensitive, live.
- Three path-tag toggle pills `@happy` `@edge` `@error` (mono 12.5px). Active = filled with that
  path's `--*-fg` + white text; inactive `--surface-2`. Multiple active = **AND**.
- **Raw** toggle pill (right). Active = `--primary` filled; switches detail pane to raw `.feature`
  source.
- Search text, active tags, and raw all persist across re-render with the selection.

### 7.3 Detail pane
- When a capability/feature is selected, render its feature(s) as **cards** (`--surface`,
  `1px solid --border`, `--radius-lg`, `--shadow-1`). Selecting a feature shows only that card.
- **Card header** (`1px solid --border` bottom): `statusDot` + halo · feature name (16px/700) ·
  copy-chip · (push right) `maturityPips` · `accepted / total` pill.
- **Card body:** optional description (`--text-muted` 13.5px); optional Background `<pre>`; then
  scenario rows.
- **Scenario row:** `1px solid --border` with a **3px left accent** = the scenario's path `--*-fg`,
  `--radius`. Contains: `pathTag` chip(s) · scenario name (14.5px/700) · copy-chip (`scenarioId`);
  then a Gherkin `<pre>` (mono 13px/1.75, `--surface-2`, `--radius-sm`); then
  `segmentedControl(progress, onSet)`.
- Empty state: "No scenarios match your filters."
- Raw mode: each feature's `.feature` source in a mono `<pre>` block (`--surface`, `--border`).

### 7.4 Progress write
Clicking a segment calls `window.karto.setBoardProgress({ root, ...ref, progress })`, then re-reads
board + features and redraws tree dots/counts and the card in place — selection, collapse, search,
tags, and raw all persist (today's behavior, unchanged).

## 8. Map view (`desktop/renderer/views/map.js`) — designed here (no handoff spec)

Harmonize the existing zoom/pan capability graph to the tokens; keep all interaction logic
(drag nodes, drag context regions, zoom/pan, edge focus, edge toggle, layout persistence).
- Canvas bg `--bg`. Nodes: `--surface` + `1px solid --border` + `--shadow-1` + `--radius-lg`; name
  `--text`; meta line `--text-soft`. Selected node: `--primary` outline + `--focus` ring.
- **Maturity** keeps its 5-step meaning and its existing text label on the node (so the cue is never
  color-alone). The left-border accent ramps `vision → stable` onto the brand family:
  `vision` → `--border-strong`, `sketched` → `--blue-300`, `building` → `--blue-500`,
  `usable` → `--happy-fg`, `stable` → `--acc-dot`.
- **Context regions:** keep each context's authored `color` (it is map data), drawn with calmer
  alpha tints (border ~0.5, fill ~0.10) that read on both themes; label uses the same color. Tint
  helper stays.
- **Edges:** default `--border-strong`; focused = `--primary`. Arrowhead markers recolored to match
  (via `currentColor` or token-valued fills for default vs focus).
- **Edge-toggle button:** restyled as a token pill (`--surface`, `--border-strong`, `--text`).

## 9. Sidebar (`desktop/renderer/views/sidebar.js`)

Panels become `--surface` cards with `1px solid --border` and `--radius-lg`; headings
`--text-muted`, uppercase, small. The Maturity panel rows get a small swatch matching the Map
maturity ramp (§8). Tables/lists use `--text` / `--text-muted`. No logic change.

## 10. App shell (`desktop/renderer/app.js`, `index.html`)

- `index.html`: keep single `<link rel="stylesheet" href="styles.css">`; optionally add font
  `<link rel="preload">`. No structural change.
- `app.js`: call `initTheme()` on boot; add the tabstrip theme-toggle button (wired to
  `toggleTheme()`). Tabstrip, tabs, viewbar, view-switcher buttons, error/empty states, and the
  `.project-side` chrome restyled with tokens (active tab `--surface` + `--text`; active viewbar
  button `--primary` + `--primary-contrast`; etc.). No change to tab/session logic or
  `persistSession()` shape.

## 11. Motion & accessibility

- Transitions: background/color ~250ms `--ease`; chevron rotate 180ms; segment fills 160ms. Subtle.
- WCAG-AA contrast on every surface in both themes; visible focus (`--focus`) on all interactive
  controls; keyboard-operable tree, segmented control, and filters.
- Every status/path cue pairs color with shape, glyph, or label (filled/hollow pips, segment
  glyphs, written counts, node text labels).

## 12. Testing & verification

- The `node:test` suite gates the **pure layer** only. This change is renderer CSS/DOM and touches
  no data contracts, schemas, or `workflows/lib` logic, so **no unit-test changes are expected**.
- Run `npm test` at the end to confirm the pure suite is still green (regression guard).
- Manual verification: launch the desktop app against `examples/demo.kartograph.json` (TerraGarden)
  and walk:
  - Both themes (toggle in tabstrip; persists across relaunch; no clashing surfaces).
  - Tree: context/capability/feature collapse-expand, selection tint, dots, counts, compact pips,
    copy-chips, resizable column persisted.
  - Cards: header pips + count, scenario accent + path tags, Gherkin block, segmented control
    writing progress and re-deriving dots/counts in place.
  - Controls: live search, AND tag filtering, raw toggle, empty state — all persisting with
    selection.
  - Map: node/region/edge styling, maturity ramp + labels, selection, edge focus/toggle, drag +
    layout persist.
  - Sidebar panels render in both themes.

## 13. Files

**New:** `desktop/renderer/components.js`, `desktop/renderer/theme.js`,
`desktop/renderer/fonts/` (woff2 assets).
**Modified:** `desktop/renderer/styles.css` (token foundation + component classes, full rewrite of
color usage), `desktop/renderer/index.html` (optional font preload), `desktop/renderer/app.js`
(theme init + tabstrip toggle + shell tokens), `desktop/renderer/idchip.js` (class-based styling),
`desktop/renderer/views/tracking.js` (rebuild to spec), `desktop/renderer/views/map.js`
(token-ize + maturity ramp), `desktop/renderer/views/sidebar.js` (token-ize).
**Unchanged:** everything under `desktop/main/`, `desktop/preload.cjs`, `viewer/lib/*`,
`workflows/lib/*`, `schemas/*`, all IPC and data contracts.
