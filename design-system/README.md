# Handoff: Kartograph — Design System & Tracking View

## Overview
This package defines a reusable **design system** for the Kartograph desktop app and applies it to
the app's main screen, the **Tracking view**. Kartograph keeps a *living map of what a software
product does*: behaviour is written as plain-language, user-walkable **scenarios**, and the Tracking
view is where someone watches the product come to life scenario by scenario.

The screen must make **two independent dimensions** readable at once for every capability/feature/scenario:
1. **Maturity** — how thoroughly the behaviour is specified (which path classes exist).
2. **Progress** — how far a scenario has actually been built (Open → Developed → Accepted).
These are **orthogonal** and must never be merged into one bar.

The audience is a mix of technical and **non-technical** people. Tone: clear, calm, human — simple, never clinical.

## About the Design Files
The `.dc.html` files in this bundle are **design references authored in HTML** — interactive prototypes
that show the intended look, behavior, and interaction model. **They are not production code to copy
directly.** They use a small in-house templating runtime (`support.js`); you should **recreate these
designs in the Kartograph desktop app's real environment**, not ship the HTML.

The current app is an **Electron** desktop app with a **vanilla-JS renderer** (no framework): the
renderer builds the DOM imperatively in `desktop/renderer/views/*.js` and styles it with a single
`desktop/renderer/styles.css`. Recreate this design using that same vanilla-JS + single-stylesheet
approach (move the inline-styled prototype into real CSS classes + `styles.css` custom properties),
preserving the existing IPC contracts and data shapes documented below. If you choose to introduce a
framework, keep the same tokens, component contracts, and IPC surface.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, radii, shadows, and interactions are specified
below with exact values. Recreate the UI pixel-faithfully using these tokens. Two complete themes
(light + dark) are driven from the same token names.

There are two palette variants of the same system:
- **`Kartograph Design System v2 Technical.dc.html`** — **the approved direction.** Cool slate
  neutrals, crisp surfaces, tight radii, flat cool shadows, GitHub-dark dark theme. **Build this one.**
- `Kartograph Design System.dc.html` — the earlier "warm" variant (warm off-white neutrals, larger
  radii, soft shadows). Kept for reference only.

All token *names* are identical between the two; only the *values* differ. The tables below give the
**v2 Technical** values.

---

## Design Tokens (v2 Technical)

Define these as CSS custom properties. Light values live on `:root`; dark values override on a
`[data-theme="dark"]` wrapper (see **Theming** note under Interactions).

### Typography
- **UI / body font:** `Hanken Grotesk` (humanist sans). Fallback: `ui-sans-serif, system-ui, sans-serif`.
- **Mono font** (Gherkin steps + slugs): `JetBrains Mono`. Fallback: `ui-monospace, SFMono-Regular, monospace`.
- **Base body:** 16px / line-height 1.55. Never go below 14px for UI text; 16px+ for primary content.
- Type scale (size / weight / letter-spacing):
  - Display — 44px (30px in cramped headers) / 800 / -0.025em
  - Heading — 26px / 700 / -0.02em
  - Title — 17–18px / 700 / normal
  - Body — 16px / 400 / normal
  - Small — 14px / 500 / normal (use `--text-muted`)
  - Mono — 13–14px / 400/500/600 (`--font-mono`)

### Color — Blue ramp (brand anchor; same in both variants)
| step | hex |
|---|---|
| 50  | `#eff4ff` |
| 100 | `#dde8ff` |
| 200 | `#c2d4ff` |
| 300 | `#97b4ff` |
| 400 | `#6790ff` |
| 500 | `#2f63e6` |
| 600 | `#214fc7` |
| 700 | `#1c40a0` |
| 800 | `#1b3a87` |
| 900 | `#1a3372` |

### Color — Semantic roles
| token | light | dark | role |
|---|---|---|---|
| `--bg` | `#eef1f6` | `#0d1117` | app background |
| `--surface` | `#ffffff` | `#161b22` | cards & panels |
| `--surface-2` | `#eef1f5` | `#1c232d` | inset/alt fills, chips, mono blocks |
| `--surface-3` | `#e4e9f0` | `#232c38` | deeper inset |
| `--border` | `#dde3ec` | `#2a313c` | hairlines & dividers |
| `--border-strong` | `#c4ccd8` | `#3a434f` | emphasised borders |
| `--text` | `#0f1729` | `#e6edf3` | primary ink |
| `--text-muted` | `#4a5568` | `#9aa7b5` | secondary text |
| `--text-soft` | `#8895a7` | `#6b7888` | tertiary / meta |
| `--primary` | `#2257e0` | `#5a8dff` | actions, selection, focus |
| `--primary-600` | `#1a47c0` | `#4d80ff` | primary hover/pressed |
| `--primary-soft` | `#e4ecfd` | `#1a2944` | selected-row tint |
| `--primary-contrast` | `#ffffff` | `#07101f` | text on primary |

### Color — Path classes (Dimension 1: Maturity)
Pair each with shape/label — **never color alone**.
| path | token group | light fg / bg / border | dark fg / bg / border |
|---|---|---|---|
| `@happy` | happy | `#0a8466` / `#d6efe9` / `#9bdbcb` | `#4fd0a8` / `#0e2c24` / `#1d5443` |
| `@edge`  | edge  | `#8f6a16` / `#f4ead2` / `#e3cb93` | `#dcb158` / `#2c2410` / `#514220` |
| `@error` | error | `#c2403f` / `#f9e1e1` / `#eeb4b4` | `#ef8f88` / `#311c1b` / `#52302e` |

Tokens: `--happy-fg/-bg/-bd`, `--edge-fg/-bg/-bd`, `--error-fg/-bg/-bd`.

### Color — Progress states (Dimension 2)
| state | dot token | light dot | dark dot | meaning |
|---|---|---|---|---|
| Open | `--open-dot` | `#a4afbe` | `#5a6470` | not built yet |
| Developed | `--dev-dot` | `#2f63e6` | `#6f9bff` | built, ready to walk |
| Accepted | `--acc-dot` | `#2f9e6f` | `#56c78f` | user confirmed it works |

Supporting: `--open-fg` (`#788596`/`#8b97a6`), `--dev-fg` (`#2f63e6`/`#8db0ff`),
`--acc-fg` (`#23895f`/`#62cf99`), `--success` (`#0f9469`/`#4fc78c`),
`--success-bg` (`#d6efe6`/`#0e2c24`).

### Spacing — 4px base
`4, 8, 12, 16, 24, 32, 48` px. Generous whitespace; sidebar rows ~6–8px vertical padding, cards 14–18px.

### Radius (v2 Technical — tight)
`--radius-sm: 4px` · `--radius: 6px` · `--radius-lg: 9px` · `--radius-xl: 12px` · pills `999px`.
(Warm variant uses 7 / 11 / 16 / 22px.)

### Elevation (v2 Technical — flat, cool)
- `--shadow-1` (e1): `0 1px 2px rgba(15,23,42,.06), 0 1px 1px rgba(15,23,42,.04)`
- `--shadow-2` (e2): `0 1px 3px rgba(15,23,42,.07), 0 6px 18px rgba(15,23,42,.06)`
- `--shadow-3` (e3): `0 10px 34px rgba(15,23,42,.14)`
- Dark: e1 `0 1px 2px rgba(0,0,0,.4)`, e2 `0 1px 3px rgba(0,0,0,.45), 0 6px 18px rgba(0,0,0,.35)`, e3 `0 10px 34px rgba(0,0,0,.55)`

### Motion
- Easing `--ease`: `cubic-bezier(.2,.7,.3,1)`
- Durations: fast 120ms · base 180ms · slow 240ms
- Focus ring `--focus`: light `0 0 0 3px rgba(34,87,224,.32)`, dark `0 0 0 3px rgba(111,155,255,.42)`

---

## Components (specs + states)

### 1. Copy-ID chip
A tasteful monospace slug beside any node name. Click copies the full ID; show a brief "copied!" / ✓.
- Layout: `inline-flex`, gap 5px, padding 3px 9px, `border-radius: 999px`, font `--font-mono` 11.5px / 600.
- Leading 11px "copy" SVG icon (two overlapping rounded rects).
- **default:** `background: --surface-2`, `color: --text-muted`, `1px solid --border`.
- **hover:** lift to `--surface`, border `--border-strong` (subtle).
- **copied:** `background: --success-bg`, `color: --acc-fg`, `border: 1px solid --happy-bd`, append "copied!" (or ✓ in compact placements); revert after ~1100ms.
- **focus:** `box-shadow: --focus`.
- Click must `stopPropagation` so it never triggers the row's select/toggle.
- Slug formats (see Data Contracts): context = `<contextSlug>`, capability = `<capabilitySlug>`,
  feature = `<capabilitySlug>/<featureFile>`, scenario = `<capabilitySlug>/<featureFile>#"<scenarioName>"`.

### 2. Maturity indicator (Dimension 1)
Three path **pips** in fixed order **happy · edge · error**, filled when ≥1 scenario of that class exists.
- Each pip: ~16×7px (compact 12×5px), `border-radius: 3px`, gap 3px.
- **filled:** solid background = that path's `--*-fg`.
- **empty:** transparent with `1.5px dashed --border-strong` (the filled-vs-hollow **shape** is the
  non-color cue).
- Provide a `title`/aria like `happy: specified ✓ · edge: not yet — · error: not yet —`.
- Maturity reads cumulatively: happy only = *in progress*; happy+edge = *more mature*; all three = *fully hardened*.

### 3. Three-state segmented control (Dimension 2)
Open / Developed / Accepted on each scenario row; clicking sets the state.
- Pill track: `inline-flex`, `background: --surface-2`, `1px solid --border`, `border-radius: 999px`, padding 3px.
- Each segment: padding 6px 13px, `border-radius: 999px`, font 12.5px / 600, leading glyph + label.
  - Glyphs (shape cue beyond color): Open `○`, Developed `◐`, Accepted `✓`.
- **selected:** filled — Open → `--text-soft` fill, Developed → `--primary` fill, Accepted → `--acc-dot` fill; text `--primary-contrast`; `box-shadow: --shadow-1`. Forward motion Open→Developed→Accepted.
- **unselected:** transparent background, `color: --text-soft`.
- **hover (unselected):** text → `--text`. **focus:** `--focus`.

### 4. Status dot + roll-up count
A collapsed node still communicates progress.
- Dot: 9–11px circle. Color by roll-up status — done → `--acc-dot`, in-progress → `--dev-dot`, untouched → `--open-dot`. Optional 3px halo using the matching soft bg (`--success-bg` / `--primary-soft` / `--surface-2`).
- Count: `--font-mono` ~12.5px, `accepted / total` (e.g. `7 / 12`), often in a `--surface-2` pill.
- Roll-up status rule: **done** = at least one scenario AND all `accepted`; **untouched** = no scenarios or all `open`; otherwise **progress**.

### 5. Collapsible tree row (left browser)
Three levels: **Context → Capability → Feature** (→ scenarios in detail pane).
- Context head: chevron (▶ rotates 90° when open), status dot, bold name (13.5px/700), roll-up count, copy-chip.
- Capability row: chevron (own click = expand/collapse), select button with dot + name (13px/600) + compact maturity pips + count + copy-chip. **Selected** state tints row `--primary-soft`.
- Feature row: indented under capability with a left `1px solid --border` rail; dot + name (12.5px) + count + copy-chip; selected tint `--primary-soft`.
- Selecting a capability also expands its feature list. Keyboard operable; visible focus.
- Column is resizable (drag handle), width clamped 160–600px, persisted (localStorage `karto.trackingTreeWidth`).

### 6. Scenario card (right detail pane)
When a capability/feature is selected, render its features as cards.
- Card: `background: --surface`, `1px solid --border`, `border-radius: --radius-lg`, `box-shadow: --shadow-1`.
- **Header** (`1px solid --border` bottom): status dot+halo · feature name (16px/700) · copy-chip · (push right) maturity pips · `accepted / total` pill.
- **Body:** optional description (`--text-muted` 13.5px); optional Background block; then scenario rows.
- **Scenario row:** `1px solid --border` with a **3px left accent** = that scenario's path `--*-fg`,
  `border-radius: --radius`. Contains: path tag chip(s) (mono, path-colored bg/fg/border) · scenario name (14.5px/700) · copy-chip; then a **Gherkin block** (`<pre>`, `--font-mono` 13px/1.75, `--surface-2` bg, `--radius-sm`, keyword-aligned `Given/When/Then`); then the segmented control.

### 7. Search + tag-filter bar (above cards)
- Search input: pill, `--surface-2` bg, `1px solid --border`, leading magnifier SVG, 14px text. Filters scenarios by name + steps text (case-insensitive, live).
- Path-tag filters: three toggle pills `@happy` `@edge` `@error` (mono 12.5px). Active = filled with that path's `--*-fg` + white text; inactive = `--surface-2`. Multiple active = AND (scenario must carry all selected tags).
- **Raw** toggle pill (right): active = `--primary` filled. Switches the detail pane to raw `.feature` source.
- All control state (search text, active tags, raw) **persists** across re-render with the selection.

---

## The Tracking View — assembled layout
Full-height two-pane app screen (optionally inside window chrome).
- **Left pane (tree):** fixed ~286px (resizable), `border-right: 1px solid --border`, `--surface` bg, scrollable. Renders the Context→Capability→Feature tree (component 5).
- **Right pane (main):** flex column on `--bg`.
  - **Controls bar** (component 7): sticky-ish top strip, `--surface` bg, `1px solid --border` bottom, 14px 20px padding — search (flex-grow) + tag filters + Raw toggle.
  - **Content area:** scrollable, 20px padding. Either a vertical stack of scenario cards (component 6) filtered by search/tags, an empty state ("No scenarios match your filters."), or — when Raw is on — each feature's raw `.feature` text in mono `<pre>` blocks.
- Selecting a Context/Capability/Feature filters the detail pane to that node. Selecting a feature shows only that feature's card.

---

## Interactions & Behavior
- **Tree toggle/select:** chevrons collapse/expand; clicking a capability/feature selects it (tint `--primary-soft`) and loads the detail pane. Selecting a capability expands its features.
- **Copy chip:** writes the slug to the clipboard, flips to "copied!"/✓ for ~1.1s, then reverts. Never bubbles to the row.
- **Set progress:** clicking a segment writes the scenario's new state, then re-derives tree dots/counts and the card in place — selection, collapse, search, tags, and Raw all persist.
- **Search / tag filters / Raw:** live filtering; AND semantics for tags; empty state when nothing matches.
- **Theme toggle:** switches light ⇄ dark from the same tokens; persist the choice.
- **Transitions:** background/color ~250ms `--ease`; chevron rotate 180ms; segment fills 160ms. Keep motion subtle.
- **Accessibility:** WCAG-AA contrast on every surface; visible focus (`--focus`); keyboard-operable tree + segmented control + filters; every status/path cue pairs color with shape, glyph, or label.

### Theming note (important re-implementation detail)
In a vanilla/CSS-variable setup, put the light token values on `:root` and dark overrides on a
`[data-theme="dark"]` wrapper, then toggle the wrapper's attribute. (In the React-based prototype we
hit a quirk where streamed nodes cached their `var()` resolution and didn't re-resolve on attribute
change — solved by remounting the subtree on theme change. A plain DOM/CSS implementation does not
have this problem; a normal attribute toggle re-resolves all variables.)

## State Management
Per-tab UI state the screen must hold and persist (the existing renderer keeps these on the tab object
and calls `persistSession()`):
- `trackingSel`: `{ context, capability, feature|null }` — current selection.
- `trackingUI`: `{ search: string, tags: string[], raw: boolean }`.
- `trackingCollapsed`: Set of collapsed **context** keys (contexts default **open**).
- `trackingCapsOpen`: Set of expanded **capability** keys (capabilities default **closed**).
- Tree column width: localStorage `karto.trackingTreeWidth` (160–600).
- Theme: persist user choice (light/dark).
- Scenario progress is **not** local UI — it is written to the map (see Data Contracts) and re-read.

## Data Contracts (preserve these — they already exist in the repo)
- **Canonical IDs** (`viewer/lib/ids.js`): context = `<contextSlug>`; capability = `<capabilitySlug>`;
  feature = `<capabilitySlug>/<featureFile>`; scenario = `<capabilitySlug>/<featureFile>#"<scenarioName>"`.
  Capability slugs are globally unique, so IDs are capability-rooted.
- **Tracking state** (`workflows/lib/tracking.js`): states are exactly `['open','developed','accepted']`,
  default `open`. Stored in `kartograph.json` under a top-level `tracking` object keyed by scenario ID.
  Setting `open` **removes** the key (and drops `tracking` when empty). Labels: Open / Developed / Accepted.
- **Path class** comes from the scenario's Gherkin tag (`@happy`/`@edge`/`@error`) in the `.feature`
  file → `cls` of `happy`/`edge`/`error`. It is independent from progress.
- **Acceptance tree** (`viewer/lib/board.js` → `buildAcceptanceTree(scenarios, { contexts, capabilities })`)
  produces the Context→Capability→Feature roll-up with `status` + `doneCount`/`total`/`accepted`.
- **Renderer IPC** used by the current Tracking view (`desktop/preload.cjs` → `window.karto`):
  - `readFeatures(root, context, capability)` → `{ files: [{ file, feature, description, background, scenarios: [{ name, tags, steps, class, progress }] }] }`
  - `readBoard(root)` → board `{ scenarios, contexts, capabilities }`
  - `setBoardProgress({ root, context, capability, feature, scenario, progress })`
  - `readRaw(root, relPath)` → `{ text }` (for the Raw view; path `features/<context>/<capability>/<file>`)
  - `copy(text)` (clipboard)
- A `.kartograph.json` map (`examples/demo.kartograph.json`) holds contexts/capabilities/etc. Use
  `examples/demo.kartograph.json` (the "TerraGarden" demo) as realistic sample data.

## Assets
- **Fonts:** Hanken Grotesk + JetBrains Mono (Google Fonts in the prototype; bundle locally or via the
  app's font pipeline for offline desktop use).
- **Icons:** all inline SVG (logo map glyph, copy-chip icon, search magnifier, chevrons via `▶`, segment
  glyphs `○ ◐ ✓`). No external icon set or image assets — recreate as inline SVG/CSS.
- No raster images.

## Files in this bundle
- `Kartograph Design System v2 Technical.dc.html` — **approved** design reference (build this).
- `Kartograph Design System.dc.html` — earlier warm variant, reference only.
- `support.js` — the prototype runtime (needed only to open the `.dc.html` files in a browser; **not**
  part of the app).

## Existing source to reference in the repo
- `desktop/renderer/views/tracking.js` — current Tracking view (DOM build, selection/filter/persist logic, IPC calls).
- `desktop/renderer/idchip.js` — current copy-ID chip behavior.
- `desktop/renderer/styles.css` — where the new tokens/classes should live.
- `desktop/renderer/app.js` — tab/session model and `persistSession()`.
- `viewer/lib/board.js`, `viewer/lib/ids.js`, `workflows/lib/tracking.js` — data contracts above.
