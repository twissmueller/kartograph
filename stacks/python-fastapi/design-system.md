# Design system (Python services with FastAPI and a static browser UI)

The design system for every browser page a FastAPI service serves. There is no build
step and no UI framework by design: one shared stylesheet carries every colour, size and
component rule, one shared script carries the helpers, the colour ramps and the canvas
renderers, and each page is a single HTML file with an inline script that composes them.
Feature code reads the shared file's classes and helpers; it never writes a colour, a
font size or a chart of its own. Change the values in the shared files; the structure is
fixed.

## 1. Structure

- **Two entry points, both static files** under the FastAPI service's `static/` directory
  (`services/<service>/<package>/static/`), mounted at `/static`:
  - `common.css`: the palette, the typography, and every component class. Nothing else
    in the project defines a colour or a size; a page's own `<style>` block is allowed
    only for a layout rule specific to that page (a grid column count, a canvas height)
    and never for a colour.
  - `common.js`: the `window.<Namespace>` module (`AIDA` in the source project), an IIFE
    returning the helpers, the colour ramps and the renderers. A page destructures what
    it needs: `const { $, fetchJSON, esc, fmt, poll } = <Namespace>;`.
- **Modes:** dark only. `:root { color-scheme: light dark; }` is set so form controls
  follow the OS, but the palette is one fixed dark set; there is no theme switch and no
  light palette. *Stack default:* a project that needs a light mode adds a second block of
  custom properties in `common.css` and switches on `prefers-color-scheme`; the class
  names do not change.
- **The browser is the substrate.** Native `<select>`, `<button>`, `<input>`, `<table>`
  and `<canvas>` are used directly and styled once in `common.css`. No component library,
  no CSS framework, no bundler, no TypeScript. A third-party browser library (a map, a
  chart engine) is allowed only when the feature cannot be drawn on a canvas by the shared
  renderers, and then as one pinned file vendored under `static/vendor/<lib>-<version>/`
  and loaded with `<script src="/static/vendor/…">`, never from a CDN at runtime, so the
  page still loads where the internet does not reach (*stack default*).
- **Pages are served per request** by a page route that reads the file
  (`HTMLResponse((_STATIC / name).read_text())`); the file is baked into the image, so
  seeing a change means rebuilding the service image
  (`docker compose up --build -d <service>`).

```css
/* common.css — the token surface, as the source project wrote it */
body   { margin: 0; font: 14px/1.5 system-ui, sans-serif; background: #0f1115; color: #e6e6e6; }
header { padding: 16px 20px; border-bottom: 1px solid #2a2e37; display: flex; align-items: baseline; gap: 12px; }
.wrap  { padding: 20px; max-width: 1200px; }     .wide { max-width: 1400px; }
.panel { background: #12151c; border: 1px solid #2a2e37; border-radius: 8px; padding: 10px 12px; }
select, button { background: #1a1e26; color: #e6e6e6; border: 1px solid #2a2e37; border-radius: 6px; padding: 6px 10px; font: inherit; }
.meta  { color: #8a93a2; font-size: 13px; }       .error { color: #f76d6d; font-size: 13px; }
.empty { color: #8a93a2; padding: 40px 0; }
```

## 2. Colour

Hex literals live in `common.css` (surfaces and text) and in `common.js` (series and
state ramps); a page never writes one.

| role | value | used for |
|---|---|---|
| page ground | `#0f1115` | `body` |
| panel ground | `#12151c` | `.panel`, `.kpi` |
| control ground | `#1a1e26` | `select`, `button`, `.cursor-time`, `code`, `.bar` track |
| hairline | `#2a2e37` | borders, `header`, table header rule |
| row hairline | `#1a1e26` | `table.runs td` |
| text | `#e6e6e6` | body text, values |
| muted text | `#8a93a2` | `.meta`, `.tag`, table headers, `.kpi .k`, nav links |
| dim text | `#6b7280` | `.panel .sub`, `.key`, idle cursor |
| accent | `#3b6fd6` | `.switch` on, `.bar > i` fill |
| accent text | `#5b9dff` | first series colour, running pill |
| series ramp | `COLORS[]` in `common.js`: `#5b9dff #28c8a0 #ff9f45 #c07cff #ff6b8a #e6c84f #4fd0e6 #a0d468 #f76d6d #b48bff #e0e0e0` | one colour per plotted channel, in order |
| state ramp | `STATE_COLORS` in `common.js`: normal `#28c8a0`, degrading_light `#a0d468`, degrading `#e6c84f`, fault `#ff9f45`, failure `#f76d6d`, blind `#3a4150` | ground-truth and detected bands, state swatches |
| status pills | `.pill.running #5b9dff`, `.completed #28c8a0`, `.failed #f76d6d`, `.stalled #ff9f45`, `.unknown #8a93a2`, each with its own border and ground | run status |

Rules: a new state or status gets its colour in the ramp in `common.js` and its pill
rule in `common.css`, in the same commit, never inline. The ramps are ordered arrays
(`STATE_ORDER`, `DISPLAY_STATUS_ORDER`) that mirror an order the server defines; keeping
the two in step is what makes bands comparable, so a new value is appended to both.
Colour never carries meaning alone: a band has a legend, a pill has its text, a swatch
sits beside its label. The contrast of `#e6e6e6` on `#0f1115` and of `#8a93a2` on
`#12151c` is what the source project ships; nothing lighter than `#6b7280` is used for
text a person must read.

## 3. Typography

System fonts only, set once on `body`: `14px/1.5 system-ui, sans-serif`. Sizes are the
few the source project uses, each tied to a class, never chosen per element.

| use | rule |
|---|---|
| page title | `header h1`: 16px, weight 600 |
| page tag beside the title | `header .tag`: 12px, muted |
| panel title | `.panel h3`: 13px, weight 600, with an optional `.key` in `ui-monospace`, 10px, dim |
| panel subline | `.panel .sub`: 11px, dim, `font-variant-numeric: tabular-nums` |
| KPI value and caption | `.kpi .v`: 22px, weight 600, tabular; `.kpi .k`: 11px, uppercase, letter-spacing .04em, muted |
| table | `table.runs`: 13px; headers 11px uppercase muted; cells tabular |
| identifiers | `.mono`, `.key`, `code`: `ui-monospace, monospace`, 11px, muted |
| body and controls | inherit the 14px base |

Numbers are tabular wherever they change under a person's eyes (cursor readouts, KPIs,
table cells). Text shown to the person is English literal in the HTML or in the page
script; there is no localisation layer (*stack default*: the source project is English
only).

## 4. Spacing, shape, elevation, motion

- **Spacing:** the page inset is 20px (`.wrap`); panels sit 14px apart in `.grid` and
  12px apart in `.kpis`; a `.row` of controls has a 12px gap and an 18px bottom margin;
  inside a panel 10px vertical by 12px horizontal. These are the only insets a page uses.
- **Shape:** panels, KPIs and banners 8px radius; controls 6px; pills, bars and the
  switch track 999px; badges 4px.
- **Elevation:** none. Depth is a hairline border on a slightly lighter ground; no shadows.
- **Motion:** the switch track and knob transition in .15s; nothing else animates. Live
  data redraws in place on each poll; a canvas is cleared and repainted, never faded.
- **Cursor:** `canvas.spark` shows `crosshair`; clickable rows show `pointer`
  (`tr.clickable`); nothing else changes the cursor.

## 5. Components and layout

A small, closed set of classes in `common.css` and renderers in `common.js`; the
browser's controls for everything else.

| component | what it is |
|---|---|
| `header` + `nav.pages` | the page skeleton's top: `h1`, `.tag`, and the nav the page fills with `<Namespace>.navHTML("/<route>")`, which marks the active page |
| `.wrap` (`.wide`) | the page body: 20px inset, 1200px (1400px) cap |
| `.row` | one line of labelled controls: `<label for>`, `<select>`, `<button>`, `.switch`, `.meta` |
| `.panel` | a grouped block: `h3` with an optional `.key`, `.sub`, then content |
| `.grid` | auto-fill panels at a 320px minimum |
| `.kpis` / `.kpi` | a row of tiles, each `.v` over `.k` |
| `.pill.<status>` | a run status, coloured per status |
| `table.runs` | the sortable table: `th[data-sort]`, `tr.clickable[data-<key>]`, `.mono` cells |
| `.bar > i` | a progress bar, the inner width in percent |
| `.switch` | a two-state toggle: a hidden checkbox, `.track`, and two `.lbl` texts of which the active one carries `.on` |
| `.banner` (`.blind`) | an explanatory block in warm tones; `.blind` for a warning |
| `.legend` | swatch-and-label pairs under a chart, `.sw` for the swatch |
| `ul.events` | a time-stamped list, `.t` for the time |
| `.cursor-time` (`.idle`) | the shared cursor readout |
| `#error.error`, `#empty.empty` | the page's error line and empty state |
| `sparkline(p, cursorIdx)` | a panel-shaped line chart over a `{canvas, ctx, xs, vals, vMin, vMax, flat, color}` object |
| `bandTimeline(canvas, bands, opts)` | a horizontal state-band strip on a shared time axis |
| `stackedBar(canvas, counts, opts)` | one stacked horizontal bar of counts per state |
| `gauge(canvas, value, opts)` | a half-circle 0..1 gauge |
| `poll(fn, intervalFn)` | polling that pauses on a hidden tab; returns a stop function |
| `fetchJSON(url)` | a fetch that turns a non-2xx into an `Error` carrying the server's `detail` |
| `esc(v)` | HTML escaping for every server-supplied string that lands in `innerHTML` |

- **Screen:** every page is `header` then `.wrap`, holding `.row`s of controls, `.kpis`,
  and `.panel`s in that order. The page's title in `h1` names the product and the page;
  the `.tag` says which phase or view it is.
- **Lists:** `table.runs` for anything a person sorts or clicks through; `ul.events` for a
  time-ordered log; `.grid` of `.panel`s for one chart per item.
- **Forms:** native controls in a `.row`, each with a visible `<label for>`; a `.switch`
  for a two-state choice; the submit is a `button` in the same row. Values are read on
  `change` or `click`, never on every keystroke.
- **Buttons:** one style, `button`; the label is a verb; a destructive action names what it
  destroys and is confirmed with `confirm()`.
- **States:** loading is the literal `Loading…` in a `.sub` or `.meta`; empty is the
  `#empty` block with one sentence and, where useful, the command that would fill it in
  `<code>`; error is one sentence in `#error` beginning with what could not be done
  (`Could not load the fleet: …`), cleared on the next success. A run that stopped
  reporting is shown, never hidden (`stalled`).
- **Charts:** always through the shared renderers on a `<canvas>` whose `width` is fitted
  to `clientWidth` on resize; a chart has a legend built from the same ramp it paints
  with; a cursor is one shared vertical line across every chart on the page.
- **Responsive:** `.grid` and `.kpis` reflow by `auto-fill`/`auto-fit`; `.row` wraps; the
  page is one column under 1200px. No breakpoints beyond that.
- **Navigation:** `navHTML` lists every page as `[href, label]` pairs; a new page adds a
  pair there and a page route on the server. Deep links are query parameters
  (`/ops?run=<id>`) read with `URLSearchParams`; a row click sets `location.href`.
- **Test hooks:** every control a scenario touches and every outcome a scenario checks
  carries a stable `id` (camelCase, as the source project: `runMeta`, `fScenario`,
  `laneDetected`) or, on a repeated row, a `data-<key>` attribute; a scenario's own words
  appear as the control's label or the outcome's text so a person and a browser
  automation tool find it. Ids are never renamed once a scenario test names them.
- **Accessibility:** labels are visible `<label for>`; icon-only controls do not exist;
  a status is text inside its pill, not colour alone; a chart has a text legend and a
  readout.

## 6. What feature code may and may not do

May: compose the classes in the table; call the shared helpers and renderers; destructure
from the namespace; add a page-specific layout rule in the page's `<style>`; add an `id`
and a `data-*` attribute; add a new class to `common.css` and a new helper to `common.js`
when two pages need it.

May not: write a colour, a font size, a radius or an inset in a page; paint a canvas
without the shared renderers unless the renderer is added to `common.js` first; put a
server string into `innerHTML` without `esc`; load a script or a stylesheet from a CDN;
introduce a framework, a bundler or a build step; poll without `poll`; hide an error or
an empty state; rename an `id` a scenario names.
