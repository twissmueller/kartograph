# Desktop Design System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the approved "Kartograph Design System v2 Technical" inside the Electron desktop renderer — a token-driven light/dark theme applied to the whole app shell, the Tracking view, the Map view, and the sidebar.

**Architecture:** Vanilla-JS renderer, single `desktop/renderer/styles.css` holding CSS custom-property tokens (light on `:root`, dark on `[data-theme="dark"]`). Shared DOM-builder helpers (`components.js`) emit the reusable pieces (maturity pips, segmented control, status dot, roll-up count, path tag); a small `theme.js` toggles/persists the theme; views are rewired to use tokens + helpers. No framework, no build step, no new runtime dependencies.

**Tech Stack:** Electron, vanilla ESM JavaScript, plain CSS custom properties, bundled `.woff2` fonts. Existing IPC via `desktop/preload.cjs` → `window.karto`.

## Global Constraints

- **No framework, no build step, no new runtime deps.** Vanilla ESM + plain CSS only. (`desktop/package.json` keeps `electron` as its only devDependency.)
- **Single stylesheet:** all CSS lives in `desktop/renderer/styles.css`. `index.html` links exactly one stylesheet.
- **Do not change** anything under `desktop/main/`, `desktop/preload.cjs`, `viewer/lib/*`, `workflows/lib/*`, `schemas/*`, or any IPC method signature / data shape.
- **Token names are fixed** — use exactly the names in §"Token values" below. Values are the v2 Technical values, copied verbatim from `design-system/Kartograph Design System v2 Technical.dc.html` lines 18–58.
- **Default theme is light.** Theme attribute lives on `document.documentElement` (`<html data-theme="light|dark">`); persisted in `localStorage` key `karto.theme`.
- **Every status/path cue pairs colour with shape, glyph, or label** (filled-vs-hollow pips, segment glyphs `○ ◐ ✓`, written counts, node text labels). Visible focus (`--focus`) on every interactive control.
- **Fonts bundled locally** under `desktop/renderer/fonts/`. If the font files cannot be obtained, fall back to the CSS stacks and say so in the task's commit/notes — do not silently ship system fonts as the design.
- **No version bump.** Precedent: the prior desktop commit (`d098558 feat(design-system)`) did not bump the plugin manifests; desktop-renderer-only work does not touch `.claude-plugin/plugin.json` or root `package.json`.
- **No automated tests for renderer DOM/CSS.** Repo convention (`CLAUDE.md`): "Tests gate the pure layer only." Adding jsdom would violate the no-deps rule. Each task is verified by launching the app and visually checking against the prototype; `npm test` is run once at the end as a regression guard for the untouched pure layer.

### How to launch for verification
```bash
bash scripts/start-desktop.sh        # installs desktop deps on first run, then `electron .`
```
Then **File → Open** a Kartograph project folder that contains `.kartograph/kartograph.json` **and** `features/<context>/<capability>/*.feature` files (the Tracking detail pane reads real `.feature` files). If you have no such project handy, the shell, theme toggle, Map, and sidebar can still be verified against any project with a map; the Tracking cards need a project with feature files. DevTools: `View → Toggle Developer Tools` (or `Cmd+Opt+I`) to inspect computed `var()` values.

### Token values (source of truth: prototype lines 18–58)
Light (`:root`) / Dark (`[data-theme="dark"]`):
```
--bg            #eef1f6 / #0d1117
--surface       #ffffff / #161b22
--surface-2     #eef1f5 / #1c232d
--surface-3     #e4e9f0 / #232c38
--border        #dde3ec / #2a313c
--border-strong #c4ccd8 / #3a434f
--text          #0f1729 / #e6edf3
--text-muted    #4a5568 / #9aa7b5
--text-soft     #8895a7 / #6b7888
--blue-50..900  (same both themes except 500/600 in dark): 50 #eff4ff,100 #dde8ff,200 #c2d4ff,300 #97b4ff,400 #6790ff,500 #2f63e6,600 #214fc7,700 #1c40a0,800 #1b3a87,900 #1a3372 ; dark overrides: --blue-500 #6f9bff, --blue-600 #5b8bff
--primary          #2257e0 / #5a8dff
--primary-600      #1a47c0 / #4d80ff
--primary-soft     #e4ecfd / #1a2944
--primary-contrast #ffffff / #07101f
--happy-fg/-bg/-bd #0a8466 #d6efe9 #9bdbcb / #4fd0a8 #0e2c24 #1d5443
--edge-fg/-bg/-bd  #8f6a16 #f4ead2 #e3cb93 / #dcb158 #2c2410 #514220
--error-fg/-bg/-bd #c2403f #f9e1e1 #eeb4b4 / #ef8f88 #311c1b #52302e
--success/-bg      #0f9469 #d6efe6 / #4fc78c #0e2c24
--open-dot/-fg     #a4afbe #788596 / #5a6470 #8b97a6
--dev-dot/-fg      #2f63e6 #2f63e6 / #6f9bff #8db0ff
--acc-dot/-fg      #2f9e6f #23895f / #56c78f #62cf99
--radius-sm 4px ; --radius 6px ; --radius-lg 9px ; --radius-xl 12px
--shadow-1 light: 0 1px 2px rgba(15,23,42,.06), 0 1px 1px rgba(15,23,42,.04)   dark: 0 1px 2px rgba(0,0,0,.4)
--shadow-2 light: 0 1px 3px rgba(15,23,42,.07), 0 6px 18px rgba(15,23,42,.06)  dark: 0 1px 3px rgba(0,0,0,.45), 0 6px 18px rgba(0,0,0,.35)
--shadow-3 light: 0 10px 34px rgba(15,23,42,.14)                                dark: 0 10px 34px rgba(0,0,0,.55)
--focus    light: 0 0 0 3px rgba(34,87,224,.32)                                 dark: 0 0 0 3px rgba(111,155,255,.42)
--ease     cubic-bezier(.2,.7,.3,1)
```

---

## File Structure

- **Create** `desktop/renderer/fonts/` — bundled `.woff2` (Hanken Grotesk 400/500/600/700/800, JetBrains Mono 400/500/600).
- **Create** `desktop/renderer/theme.js` — theme init/toggle/persist. One responsibility: theme state.
- **Create** `desktop/renderer/components.js` — pure DOM-builder helpers reused across views.
- **Rewrite** `desktop/renderer/styles.css` — tokens + `@font-face` + every component/view class (one file, sectioned).
- **Modify** `desktop/renderer/app.js` — `initTheme()` on boot + tabstrip theme toggle button. No session-logic change.
- **Modify** `desktop/renderer/idchip.js` — class-based styling (keep API + behavior).
- **Rewrite** `desktop/renderer/views/tracking.js` — assembled Tracking layout via helpers + new classes.
- **Modify** `desktop/renderer/views/map.js` — token-ize node/region/edge styling + maturity ramp; remove hardcoded hex.
- **Modify** `desktop/renderer/views/sidebar.js` — token-ize panels.

Class-name namespace for the rebuilt Tracking view: `trk-*`. Shared component classes: `.mat-pips/.pip`, `.seg/.seg-btn`, `.sdot`, `.rcount`, `.ptag`, `.idchip`.

---

## Task 1: Token foundation, bundled fonts, full token-ized stylesheet

This task makes the **entire existing app** render in the new token system (light default) while keeping all current class names working, so the app looks redesigned and functions before any view is rebuilt. It also pre-defines the new `trk-*` and component classes the later tasks will emit.

**Files:**
- Create: `desktop/renderer/fonts/*.woff2`
- Rewrite: `desktop/renderer/styles.css`

**Interfaces:**
- Produces: CSS custom-property tokens on `:root` / `[data-theme="dark"]`; component classes `.mat-pips .pip(.on,.compact,.pip-happy|edge|error)`, `.seg .seg-btn(.active, data-state)`, `.sdot(.done|.progress|.untouched,.halo)`, `.rcount`, `.ptag(.happy|edge|error)`, `.idchip(.copied)`, `.theme-toggle`; Tracking classes under `.trk` (listed in the CSS below); restyled shell (`#tabstrip`, `.tab`, `.viewbar`, `.panel`, `.map-*`).

- [ ] **Step 1: Download and bundle the fonts**

Run (network required; macOS curl). This uses the google-webfonts-helper API to fetch woff2 per weight:
```bash
cd desktop/renderer && mkdir -p fonts && cd fonts
base="https://gwfh.mranftl.com/api/fonts"
# Hanken Grotesk
for v in regular 500 600 700 800; do
  curl -fsSL "$base/hanken-grotesk?download=file&subsets=latin&formats=woff2&variants=$v" -o "hk-$v.woff2" || echo "FAILED hk-$v"
done
# JetBrains Mono
for v in regular 500 600; do
  curl -fsSL "$base/jetbrains-mono?download=file&subsets=latin&formats=woff2&variants=$v" -o "jb-$v.woff2" || echo "FAILED jb-$v"
done
# Canonical names referenced by @font-face:
mv hk-regular.woff2 HankenGrotesk-Regular.woff2 2>/dev/null
mv hk-500.woff2 HankenGrotesk-Medium.woff2 2>/dev/null
mv hk-600.woff2 HankenGrotesk-SemiBold.woff2 2>/dev/null
mv hk-700.woff2 HankenGrotesk-Bold.woff2 2>/dev/null
mv hk-800.woff2 HankenGrotesk-ExtraBold.woff2 2>/dev/null
mv jb-regular.woff2 JetBrainsMono-Regular.woff2 2>/dev/null
mv jb-500.woff2 JetBrainsMono-Medium.woff2 2>/dev/null
mv jb-600.woff2 JetBrainsMono-SemiBold.woff2 2>/dev/null
ls -la
```
Expected: eight `.woff2` files present, each > 5 KB. **If any download fails** (no network / API down), skip the `@font-face` block in Step 2 (leave it commented) and rely on the CSS fallback stacks; note "fonts not bundled — using system fallback" in the task commit message.

- [ ] **Step 2: Write the new `desktop/renderer/styles.css`**

Replace the entire file with:
```css
/* ============================================================
   Kartograph Desktop — Design System v2 Technical
   Tokens (light default + dark), bundled fonts, component &
   view classes. Single stylesheet (no build step).
   ============================================================ */

/* ---- Fonts (bundled, offline). If not bundled, delete this
   block; the fallback stacks in --font-* still apply. ---- */
@font-face { font-family:'Hanken Grotesk'; font-weight:400; font-display:swap; src:url('fonts/HankenGrotesk-Regular.woff2') format('woff2'); }
@font-face { font-family:'Hanken Grotesk'; font-weight:500; font-display:swap; src:url('fonts/HankenGrotesk-Medium.woff2') format('woff2'); }
@font-face { font-family:'Hanken Grotesk'; font-weight:600; font-display:swap; src:url('fonts/HankenGrotesk-SemiBold.woff2') format('woff2'); }
@font-face { font-family:'Hanken Grotesk'; font-weight:700; font-display:swap; src:url('fonts/HankenGrotesk-Bold.woff2') format('woff2'); }
@font-face { font-family:'Hanken Grotesk'; font-weight:800; font-display:swap; src:url('fonts/HankenGrotesk-ExtraBold.woff2') format('woff2'); }
@font-face { font-family:'JetBrains Mono'; font-weight:400; font-display:swap; src:url('fonts/JetBrainsMono-Regular.woff2') format('woff2'); }
@font-face { font-family:'JetBrains Mono'; font-weight:500; font-display:swap; src:url('fonts/JetBrainsMono-Medium.woff2') format('woff2'); }
@font-face { font-family:'JetBrains Mono'; font-weight:600; font-display:swap; src:url('fonts/JetBrainsMono-SemiBold.woff2') format('woff2'); }

:root {
  color-scheme: light dark;
  --font-sans:'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif;
  --font-mono:'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace;
  --bg:#eef1f6; --surface:#ffffff; --surface-2:#eef1f5; --surface-3:#e4e9f0;
  --border:#dde3ec; --border-strong:#c4ccd8;
  --text:#0f1729; --text-muted:#4a5568; --text-soft:#8895a7;
  --blue-50:#eff4ff; --blue-100:#dde8ff; --blue-200:#c2d4ff; --blue-300:#97b4ff; --blue-400:#6790ff;
  --blue-500:#2f63e6; --blue-600:#214fc7; --blue-700:#1c40a0; --blue-800:#1b3a87; --blue-900:#1a3372;
  --primary:#2257e0; --primary-600:#1a47c0; --primary-soft:#e4ecfd; --primary-contrast:#ffffff;
  --happy-fg:#0a8466; --happy-bg:#d6efe9; --happy-bd:#9bdbcb;
  --edge-fg:#8f6a16; --edge-bg:#f4ead2; --edge-bd:#e3cb93;
  --error-fg:#c2403f; --error-bg:#f9e1e1; --error-bd:#eeb4b4;
  --success:#0f9469; --success-bg:#d6efe6;
  --open-dot:#a4afbe; --open-fg:#788596;
  --dev-dot:#2f63e6; --dev-fg:#2f63e6;
  --acc-dot:#2f9e6f; --acc-fg:#23895f;
  --radius-sm:4px; --radius:6px; --radius-lg:9px; --radius-xl:12px;
  --shadow-1:0 1px 2px rgba(15,23,42,.06), 0 1px 1px rgba(15,23,42,.04);
  --shadow-2:0 1px 3px rgba(15,23,42,.07), 0 6px 18px rgba(15,23,42,.06);
  --shadow-3:0 10px 34px rgba(15,23,42,.14);
  --focus:0 0 0 3px rgba(34,87,224,.32);
  --ease:cubic-bezier(.2,.7,.3,1);
}
[data-theme="dark"] {
  --bg:#0d1117; --surface:#161b22; --surface-2:#1c232d; --surface-3:#232c38;
  --border:#2a313c; --border-strong:#3a434f;
  --text:#e6edf3; --text-muted:#9aa7b5; --text-soft:#6b7888;
  --blue-500:#6f9bff; --blue-600:#5b8bff;
  --primary:#5a8dff; --primary-600:#4d80ff; --primary-soft:#1a2944; --primary-contrast:#07101f;
  --happy-fg:#4fd0a8; --happy-bg:#0e2c24; --happy-bd:#1d5443;
  --edge-fg:#dcb158; --edge-bg:#2c2410; --edge-bd:#514220;
  --error-fg:#ef8f88; --error-bg:#311c1b; --error-bd:#52302e;
  --success:#4fc78c; --success-bg:#0e2c24;
  --open-dot:#5a6470; --open-fg:#8b97a6;
  --dev-dot:#6f9bff; --dev-fg:#8db0ff;
  --acc-dot:#56c78f; --acc-fg:#62cf99;
  --shadow-1:0 1px 2px rgba(0,0,0,.4);
  --shadow-2:0 1px 3px rgba(0,0,0,.45), 0 6px 18px rgba(0,0,0,.35);
  --shadow-3:0 10px 34px rgba(0,0,0,.55);
  --focus:0 0 0 3px rgba(111,155,255,.42);
}

* { box-sizing:border-box; }
body { margin:0; font:16px/1.55 var(--font-sans); background:var(--bg); color:var(--text);
  -webkit-font-smoothing:antialiased; transition:background .25s var(--ease), color .25s var(--ease); }
:focus-visible { outline:none; box-shadow:var(--focus); border-radius:var(--radius-sm); }

/* ---- App shell ---- */
#tabstrip { display:flex; align-items:center; gap:4px; background:var(--surface-2);
  border-bottom:1px solid var(--border); padding:7px 8px 0; min-height:40px; }
#workspace { height:calc(100vh - 40px); overflow:hidden; position:relative; }
.empty { color:var(--text-muted); padding:24px; font-size:15px; }
.empty code { font-family:var(--font-mono); font-size:13px; background:var(--surface-2);
  padding:1px 6px; border-radius:var(--radius-sm); }
.tab { display:flex; align-items:center; gap:7px; padding:7px 12px; background:transparent;
  border-radius:var(--radius) var(--radius) 0 0; cursor:pointer; color:var(--text-muted);
  max-width:220px; font-size:13.5px; font-weight:500; }
.tab:hover { background:var(--surface-3); color:var(--text); }
.tab.active { background:var(--surface); color:var(--text); box-shadow:var(--shadow-1); }
.tab.dirty::before { content:'●'; color:var(--edge-fg); font-size:10px; }
.tab-close { background:none; border:none; color:inherit; cursor:pointer; font-size:14px; line-height:1; opacity:.6; }
.tab-close:hover { opacity:1; }
.tab-add { background:none; border:none; color:var(--text-soft); font-size:18px; cursor:pointer; padding:0 8px; }
.tab-add:hover { color:var(--text); }
.theme-toggle { margin-left:auto; margin-bottom:6px; display:inline-flex; align-items:center; gap:7px;
  border:1px solid var(--border-strong); background:var(--surface); color:var(--text);
  font:600 13px/1 var(--font-sans); padding:7px 12px; border-radius:999px; cursor:pointer; box-shadow:var(--shadow-1); }
.theme-toggle:hover { border-color:var(--text-soft); }

.viewbar { display:flex; gap:6px; padding:10px 12px; background:var(--surface); border-bottom:1px solid var(--border); }
.viewbar button { background:var(--surface-2); color:var(--text-muted); border:1px solid var(--border);
  padding:6px 14px; border-radius:999px; cursor:pointer; font:600 13px/1 var(--font-sans); transition:all .16s var(--ease); }
.viewbar button:hover { color:var(--text); }
.viewbar button.active { background:var(--primary); color:var(--primary-contrast); border-color:var(--primary); }

.project-layout { display:flex; height:calc(100% - 45px); }
.project-main { flex:1; overflow:auto; position:relative; }
.project-side { width:320px; border-left:1px solid var(--border); overflow:auto; padding:16px; background:var(--surface); }
.error { padding:24px; color:var(--error-fg); }
.error pre { white-space:pre-wrap; background:var(--surface-2); padding:12px; border-radius:var(--radius);
  color:var(--text); font:13px/1.5 var(--font-mono); }
.error button { background:var(--primary); color:var(--primary-contrast); border:none; padding:7px 14px;
  border-radius:var(--radius); cursor:pointer; font:600 13px var(--font-sans); margin-top:10px; }
.muted { color:var(--text-muted); }

/* ---- Sidebar panels ---- */
.panel { margin-bottom:16px; background:var(--surface); border:1px solid var(--border);
  border-radius:var(--radius-lg); box-shadow:var(--shadow-1); padding:14px 16px; }
.panel h2 { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); margin:0 0 10px; }
.panel table { width:100%; border-collapse:collapse; font-size:13px; }
.panel td { padding:4px 4px; vertical-align:top; border-bottom:1px solid var(--border); color:var(--text); }
.panel td:first-child { color:var(--text-muted); }
.panel ul { margin:0; padding-left:18px; font-size:13px; color:var(--text); }
.panel .muted { font-size:13px; }
.mat-row { display:flex; align-items:center; justify-content:space-between; font-size:13px; padding:3px 0; }
.mat-row .mat-swatch { width:10px; height:10px; border-radius:3px; display:inline-block; margin-right:7px; vertical-align:-1px; }
.mat-row span { color:var(--text-muted); }
.mat-row b { color:var(--text); }

/* ---- Shared components ---- */
/* copy-ID chip */
.idchip { display:inline-flex; align-items:center; gap:5px; font:600 11.5px/1.4 var(--font-mono);
  color:var(--text-muted); background:var(--surface-2); border:1px solid var(--border); border-radius:999px;
  padding:3px 9px; cursor:pointer; white-space:nowrap; user-select:none; transition:all .14s var(--ease); }
.idchip:hover { background:var(--surface); border-color:var(--border-strong); color:var(--text); }
.idchip.copied { background:var(--success-bg); color:var(--acc-fg); border-color:var(--happy-bd); }
.idchip svg { flex:none; }

/* maturity pips */
.mat-pips { display:inline-flex; gap:3px; align-items:center; }
.pip { width:16px; height:7px; border-radius:3px; display:inline-block; background:transparent;
  border:1.5px dashed var(--border-strong); }
.pip.compact { width:12px; height:5px; }
.pip.on { border:none; }
.pip.pip-happy.on { background:var(--happy-fg); }
.pip.pip-edge.on  { background:var(--edge-fg); }
.pip.pip-error.on { background:var(--error-fg); }

/* roll-up count */
.rcount { font:500 12.5px/1 var(--font-mono); color:var(--text-soft); }
.rcount.pill { background:var(--surface-2); color:var(--text-muted); padding:3px 9px; border-radius:999px; }

/* status dot */
.sdot { width:10px; height:10px; border-radius:50%; flex:none; display:inline-block; background:var(--open-dot); }
.sdot.done { background:var(--acc-dot); }
.sdot.progress { background:var(--dev-dot); }
.sdot.untouched { background:var(--open-dot); }
.sdot.halo.done { box-shadow:0 0 0 3px var(--success-bg); }
.sdot.halo.progress { box-shadow:0 0 0 3px var(--primary-soft); }
.sdot.halo.untouched { box-shadow:0 0 0 3px var(--surface-2); }

/* path tag chip */
.ptag { font:600 11px/1.3 var(--font-mono); padding:2px 8px; border-radius:var(--radius); }
.ptag.happy { color:var(--happy-fg); background:var(--happy-bg); border:1px solid var(--happy-bd); }
.ptag.edge  { color:var(--edge-fg); background:var(--edge-bg); border:1px solid var(--edge-bd); }
.ptag.error { color:var(--error-fg); background:var(--error-bg); border:1px solid var(--error-bd); }

/* segmented control */
.seg { display:inline-flex; background:var(--surface-2); border:1px solid var(--border); border-radius:999px; padding:3px; }
.seg-btn { display:inline-flex; align-items:center; gap:5px; background:transparent; border:none;
  color:var(--text-soft); font:600 12.5px/1 var(--font-sans); padding:6px 13px; border-radius:999px;
  cursor:pointer; transition:all .16s var(--ease); }
.seg-btn:hover { color:var(--text); }
.seg-btn.active { color:var(--primary-contrast); box-shadow:var(--shadow-1); }
.seg-btn.active[data-state="open"] { background:var(--text-soft); }
.seg-btn.active[data-state="developed"] { background:var(--primary); }
.seg-btn.active[data-state="accepted"] { background:var(--acc-dot); }

/* ---- Tracking view ---- */
.trk { display:flex; height:100%; }
.trk-tree { width:286px; flex:none; border-right:1px solid var(--border); overflow:auto;
  padding:12px 10px; background:var(--surface); }
.trk-resizer { flex:none; width:5px; cursor:col-resize; background:transparent; }
.trk-resizer:hover { background:var(--border-strong); }
.trk-main { flex:1; min-width:0; display:flex; flex-direction:column; overflow:hidden; background:var(--bg); }
.trk-controls { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:14px 20px;
  border-bottom:1px solid var(--border); background:var(--surface); }
.trk-content { flex:1; overflow:auto; padding:20px; }

/* tree rows */
.trk-ctx { margin-bottom:3px; }
.trk-ctx-head { width:100%; display:flex; align-items:center; gap:7px; background:none; border:none;
  cursor:pointer; font-family:inherit; color:var(--text); padding:7px 8px; border-radius:var(--radius-lg); text-align:left; }
.trk-ctx-head:hover { background:var(--surface-2); }
.trk-chevron { font-size:10px; color:var(--text-soft); width:10px; flex:none; transition:transform .18s var(--ease); }
.trk-chevron.open { transform:rotate(90deg); }
.trk-ctx-name { font-weight:700; font-size:13.5px; flex:1; min-width:0; letter-spacing:.01em;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.trk-caps { margin:2px 0 6px; }
.trk-cap-row { display:flex; align-items:center; border-radius:var(--radius-lg); }
.trk-cap-row.active { background:var(--primary-soft); }
.trk-cap-chev { font-size:10px; color:var(--text-soft); width:14px; height:22px; display:inline-flex;
  align-items:center; justify-content:center; cursor:pointer; flex:none; transition:transform .18s var(--ease); }
.trk-cap-chev.open { transform:rotate(90deg); }
.trk-cap-btn { flex:1; min-width:0; display:flex; align-items:center; gap:7px; background:none; border:none;
  cursor:pointer; font-family:inherit; color:inherit; padding:6px 4px; text-align:left; }
.trk-cap-name { font-size:13px; font-weight:600; flex:1; min-width:0; overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap; }
.trk-feats { margin-left:18px; border-left:1px solid var(--border); padding-left:4px; }
.trk-feat { width:100%; display:flex; align-items:center; gap:7px; border:none; cursor:pointer;
  font-family:inherit; color:var(--text-muted); padding:6px 8px; border-radius:var(--radius); text-align:left; background:transparent; }
.trk-feat:hover { background:var(--surface-2); }
.trk-feat.active { background:var(--primary-soft); color:var(--text); }
.trk-feat-name { font-size:12.5px; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* controls */
.trk-search-wrap { position:relative; flex:1; min-width:180px; }
.trk-search-wrap svg { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-soft); }
.trk-search { width:100%; font:14px var(--font-sans); color:var(--text); background:var(--surface-2);
  border:1px solid var(--border); border-radius:999px; padding:9px 14px 9px 34px; outline:none; }
.trk-tagfilters { display:flex; gap:6px; }
.trk-tag-pill { font:600 12.5px/1 var(--font-mono); cursor:pointer; padding:7px 12px; border-radius:999px;
  color:var(--text-muted); background:var(--surface-2); border:1px solid var(--border); }
.trk-tag-pill.active { color:#fff; }
.trk-tag-pill.active[data-path="happy"] { background:var(--happy-fg); border-color:var(--happy-fg); }
.trk-tag-pill.active[data-path="edge"]  { background:var(--edge-fg); border-color:var(--edge-fg); }
.trk-tag-pill.active[data-path="error"] { background:var(--error-fg); border-color:var(--error-fg); }
.trk-raw { font:600 13px/1 var(--font-sans); cursor:pointer; padding:9px 16px; border-radius:999px;
  border:1px solid var(--border); background:var(--surface-2); color:var(--text-muted); }
.trk-raw.active { background:var(--primary); border-color:var(--primary); color:var(--primary-contrast); }

/* cards */
.trk-cards { display:flex; flex-direction:column; gap:18px; }
.trk-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg);
  box-shadow:var(--shadow-1); overflow:hidden; }
.trk-card-head { display:flex; align-items:center; gap:11px; padding:15px 18px; border-bottom:1px solid var(--border); flex-wrap:wrap; }
.trk-feat-title { font-weight:700; font-size:16px; letter-spacing:-.01em; }
.trk-card-head .trk-head-right { margin-left:auto; display:flex; align-items:center; gap:12px; }
.trk-card-body { padding:6px 18px 16px; }
.trk-desc { font-size:13.5px; color:var(--text-muted); margin:12px 0 6px; }
.trk-bg { margin:8px 0 0; font:13px/1.7 var(--font-mono); color:var(--text); background:var(--surface-2);
  border-radius:var(--radius-sm); padding:12px 14px; white-space:pre-wrap; overflow:auto; }
.trk-scn { position:relative; border:1px solid var(--border); border-left:3px solid var(--border-strong);
  border-radius:var(--radius); padding:14px 16px; margin-top:12px; background:var(--surface); }
.trk-scn[data-class="happy"] { border-left-color:var(--happy-fg); }
.trk-scn[data-class="edge"]  { border-left-color:var(--edge-fg); }
.trk-scn[data-class="error"] { border-left-color:var(--error-fg); }
.trk-scn-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.trk-scn-name { font-weight:700; font-size:14.5px; color:var(--text); }
.trk-gherkin { margin:11px 0 0; font:13px/1.75 var(--font-mono); color:var(--text); background:var(--surface-2);
  border-radius:var(--radius-sm); padding:12px 14px; white-space:pre-wrap; overflow:auto; }
.trk-scn .seg { margin-top:12px; }
.trk-empty { color:var(--text-muted); font-size:14px; text-align:center; padding:40px; }
.trk-rawpre { margin:0 0 18px; font:12.5px/1.7 var(--font-mono); color:var(--text); background:var(--surface);
  border:1px solid var(--border); border-radius:var(--radius); padding:16px; overflow:auto; white-space:pre-wrap; }
.trk-rawfile { font:600 12.5px/1 var(--font-mono); color:var(--text-muted); margin:0 0 6px; }

/* ---- Map view ---- */
.map-canvas { position:absolute; inset:0; overflow:hidden; cursor:grab; background:var(--bg); }
.map-canvas.panning { cursor:grabbing; }
.map-world { position:relative; width:1px; height:1px; transform-origin:0 0; }
.context-region { position:absolute; border:1px solid var(--border-strong); border-radius:var(--radius-xl); cursor:grab; }
.context-region:hover { filter:brightness(1.05); }
.context-label { position:absolute; font-size:12px; font-weight:700; white-space:nowrap; cursor:grab;
  display:flex; align-items:center; gap:6px; }
.map-edges { position:absolute; inset:0; width:1px; height:1px; overflow:visible; pointer-events:none; }
.map-edges line { stroke:var(--border-strong); stroke-width:1; }
.map-edges line.focus { stroke:var(--primary); stroke-width:1.5; }
.map-edges-toggle { position:absolute; top:12px; right:14px; z-index:5; background:var(--surface);
  color:var(--text); border:1px solid var(--border-strong); border-radius:999px; padding:7px 14px;
  cursor:pointer; font:600 13px var(--font-sans); box-shadow:var(--shadow-1); }
.map-edges-toggle:hover { border-color:var(--text-soft); }
.map-node { position:absolute; width:170px; min-height:64px; padding:11px 13px; border-radius:var(--radius-lg);
  background:var(--surface); border:1px solid var(--border); box-shadow:var(--shadow-1); cursor:grab;
  display:flex; flex-direction:column; gap:5px; user-select:none; transform:translate(-50%,-50%);
  border-left:4px solid var(--border-strong); }
.map-node:active { cursor:grabbing; }
.map-node strong { font-size:13.5px; color:var(--text); }
.map-node span { color:var(--text-soft); font-size:11px; }
.map-node.selected { outline:2px solid var(--primary); outline-offset:2px; box-shadow:var(--focus); }
.map-node.maturity-vision   { border-left-color:var(--border-strong); }
.map-node.maturity-sketched { border-left-color:var(--blue-300); }
.map-node.maturity-building { border-left-color:var(--blue-500); }
.map-node.maturity-usable   { border-left-color:var(--happy-fg); }
.map-node.maturity-stable   { border-left-color:var(--acc-dot); }
```

- [ ] **Step 3: Launch and verify the shell is token-themed (light)**

Run: `bash scripts/start-desktop.sh`
Open any Kartograph project. Expected: light theme everywhere — pale `--bg`, white surfaces, blue active viewbar button, Hanken Grotesk text (inspect a heading in DevTools → Computed → `font-family` shows "Hanken Grotesk"; if it shows only the fallback, the fonts step failed — acceptable per Step 1). The Map nodes are white cards with a coloured left maturity border. Nothing should look like the old dark `#14161a`.

- [ ] **Step 4: Verify dark theme resolves**

In DevTools console: `document.documentElement.setAttribute('data-theme','dark')`. Expected: the whole app flips to the GitHub-dark palette (`--bg #0d1117`), all surfaces/text/borders update, no element keeps a light hardcoded colour. Then set it back to `light`.

- [ ] **Step 5: Commit**
```bash
git add desktop/renderer/styles.css desktop/renderer/fonts
git commit -m "feat(desktop): token foundation, bundled fonts, token-ized stylesheet"
```

---

## Task 2: Theme controller + tabstrip toggle

**Files:**
- Create: `desktop/renderer/theme.js`
- Modify: `desktop/renderer/app.js` (import + `initTheme()` on boot; render `.theme-toggle` in `renderStrip()`)

**Interfaces:**
- Consumes: `.theme-toggle` CSS class (Task 1).
- Produces: `theme.js` exports `initTheme()`, `toggleTheme()`, `currentTheme()`.

- [ ] **Step 1: Write `desktop/renderer/theme.js`**
```js
// Light/dark theme: attribute on <html>, persisted in localStorage. A plain
// attribute toggle re-resolves every CSS var() (no remount needed in vanilla DOM).
const KEY = 'karto.theme';

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function initTheme() {
  let saved = 'light';
  try { const v = localStorage.getItem(KEY); if (v === 'dark' || v === 'light') saved = v; } catch { /* ignore */ }
  document.documentElement.setAttribute('data-theme', saved);
  return saved;
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  return next;
}
```

- [ ] **Step 2: Wire it into `desktop/renderer/app.js`**

Add to the imports at the top (after the existing `import { renderSidebar } ...` line):
```js
import { initTheme, toggleTheme, currentTheme } from './theme.js';
```

In `renderStrip()`, after the `stripEl.appendChild(add);` line (the `+` button) and before the function's closing `}`, append the theme toggle:
```js
  const themeBtn = document.createElement('button');
  themeBtn.className = 'theme-toggle';
  const paint = () => { themeBtn.innerHTML = `<span>${currentTheme() === 'dark' ? '☀' : '☾'}</span>${currentTheme() === 'dark' ? 'Light' : 'Dark'}`; };
  paint();
  themeBtn.onclick = () => { toggleTheme(); paint(); };
  stripEl.appendChild(themeBtn);
```

At the very top of the file's startup — add `initTheme();` as the first executable line after the imports (before `const tabs = [];`):
```js
initTheme();
```

- [ ] **Step 3: Launch and verify the toggle**

Run: `bash scripts/start-desktop.sh`
Expected: a `☾ Dark` pill sits at the right end of the tabstrip. Clicking it flips the whole app to dark and the label becomes `☀ Light`. Quit and relaunch — the app reopens in the last-chosen theme (persisted). Default on a fresh `localStorage` is light.

- [ ] **Step 4: Commit**
```bash
git add desktop/renderer/theme.js desktop/renderer/app.js
git commit -m "feat(desktop): tabstrip theme toggle, default light, persisted"
```

---

## Task 3: Shared component helpers + copy-chip restyle

**Files:**
- Create: `desktop/renderer/components.js`
- Modify: `desktop/renderer/idchip.js` (add the copy SVG icon; styling already class-based via Task 1)

**Interfaces:**
- Consumes: component CSS classes (Task 1).
- Produces: `components.js` exports:
  - `maturityPips(scenarios, { compact=false }) -> HTMLSpanElement` — reads `s.class` (`'happy'|'edge'|'error'`).
  - `segmentedControl(current, onSet) -> HTMLSpanElement` — `current` is `'open'|'developed'|'accepted'`; `onSet(state)` called on click.
  - `statusDot(status, { halo=false }) -> HTMLSpanElement` — `status` is `'done'|'progress'|'untouched'`.
  - `rollupCount(accepted, total, { pill=false }) -> HTMLSpanElement`.
  - `pathTag(cls) -> HTMLSpanElement` — `cls` is `'happy'|'edge'|'error'`.

- [ ] **Step 1: Write `desktop/renderer/components.js`**
```js
// Shared DOM builders for the design system. Pure: take data + callbacks, return
// DOM nodes; no view-state knowledge. Reused by tracking/map/sidebar.
import { STATES, STATE_LABELS } from '../../workflows/lib/tracking.js';

const PATHS = ['happy', 'edge', 'error'];
const GLYPH = { open: '○', developed: '◐', accepted: '✓' };

// Dimension 1 — three path pips (happy·edge·error), filled when >=1 scenario of
// that class exists; hollow (dashed) otherwise. Shape is the non-colour cue.
export function maturityPips(scenarios, { compact = false } = {}) {
  const has = (c) => (scenarios || []).some((s) => (s.class || s.cls) === c);
  const wrap = document.createElement('span');
  wrap.className = 'mat-pips';
  wrap.title = PATHS.map((p) => `${p}: ${has(p) ? 'specified ✓' : 'not yet —'}`).join(' · ');
  wrap.setAttribute('aria-label', wrap.title);
  for (const p of PATHS) {
    const pip = document.createElement('span');
    pip.className = `pip pip-${p}` + (has(p) ? ' on' : '') + (compact ? ' compact' : '');
    wrap.appendChild(pip);
  }
  return wrap;
}

// Dimension 2 — Open/Developed/Accepted segmented control. onSet(state) on click.
export function segmentedControl(current, onSet) {
  const seg = document.createElement('span');
  seg.className = 'seg';
  for (const state of STATES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn' + (current === state ? ' active' : '');
    b.dataset.state = state;
    b.textContent = `${GLYPH[state]} ${STATE_LABELS[state]}`;
    b.onclick = () => onSet(state);
    seg.appendChild(b);
  }
  return seg;
}

export function statusDot(status, { halo = false } = {}) {
  const el = document.createElement('span');
  el.className = `sdot ${status || 'untouched'}` + (halo ? ' halo' : '');
  return el;
}

export function rollupCount(accepted, total, { pill = false } = {}) {
  const el = document.createElement('span');
  el.className = 'rcount' + (pill ? ' pill' : '');
  el.textContent = `${accepted}/${total}`;
  return el;
}

export function pathTag(cls) {
  const el = document.createElement('span');
  el.className = `ptag ${cls}`;
  el.textContent = '@' + cls;
  return el;
}
```

Note: `STATES` = `['open','developed','accepted']` and `STATE_LABELS` are exported from `workflows/lib/tracking.js` (already imported by the current `tracking.js`). The glyph order maps `open→○`, `developed→◐`, `accepted→✓`.

- [ ] **Step 2: Update `desktop/renderer/idchip.js` to include the copy icon**

Replace the body of `idChip` so the chip shows the copy SVG + text, and on copy appends a ✓ (styling comes from the `.idchip` / `.idchip.copied` classes in Task 1). Full new file:
```js
// A subtle, monospace chip showing an item's locator ID. Clicking copies the full
// ID to the clipboard (via window.karto.copy) and briefly flips to a copied state.
// Pointer/click handlers stopPropagation so it never starts a map drag or toggles a row.
const COPY_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="12" height="12" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="2"/></svg>';

export function idChip(idText) {
  const el = document.createElement('span');
  el.className = 'idchip';
  el.title = 'Click to copy ID';
  const label = document.createElement('span');
  label.textContent = idText;
  el.innerHTML = COPY_SVG;
  el.appendChild(label);
  el.onpointerdown = (e) => e.stopPropagation();
  el.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await window.karto.copy(idText);
      el.classList.add('copied');
      setTimeout(() => el.classList.remove('copied'), 1000);
    } catch { /* best-effort copy */ }
  };
  return el;
}
```

- [ ] **Step 3: Verify (helpers exercised by current views)**

The current `tracking.js`/`map.js` already call `idChip`. Run `bash scripts/start-desktop.sh`, open a project. Expected: every ID chip now shows a small copy icon before the slug; clicking it turns it green (`--success-bg`/`--acc-fg`) for ~1s and copies. `components.js` is not yet consumed (verified in Task 4) — just confirm it parses (no console error on load; it's imported in Task 4).

- [ ] **Step 4: Commit**
```bash
git add desktop/renderer/components.js desktop/renderer/idchip.js
git commit -m "feat(desktop): shared component helpers + copy-icon chip"
```

---

## Task 4: Rebuild the Tracking view

**Files:**
- Rewrite: `desktop/renderer/views/tracking.js`

**Interfaces:**
- Consumes: `maturityPips`, `segmentedControl`, `statusDot`, `rollupCount`, `pathTag` (Task 3); `idChip` (Task 3); `.trk-*` CSS (Task 1); `buildAcceptanceTree` (`viewer/lib/board.js`); `contextId/capabilityId/featureId/scenarioId` (`viewer/lib/ids.js`); `persistSession` (`app.js`); IPC `readFeatures/readBoard/setBoardProgress/readRaw` + `copy`.
- Produces: `renderTracking(container, tab)` (unchanged signature; consumed by `app.js` `VIEWS`).

Behaviour preserved exactly: selection (`tab.trackingSel`), UI state (`tab.trackingUI {search,tags,raw}`), collapse sets (`tab.trackingCollapsed` contexts default-open, `tab.trackingCapsOpen` caps default-closed), tree width localStorage `karto.trackingTreeWidth` (160–600), `persistSession()` calls, and the count semantics already in use (context & capability show `doneCount/total`; feature shows `accepted/total`).

- [ ] **Step 1: Write the new `desktop/renderer/views/tracking.js`**

Replace the entire file with:
```js
import { buildAcceptanceTree } from '../../../viewer/lib/board.js';
import { contextId, capabilityId, featureId, scenarioId } from '../../../viewer/lib/ids.js';
import { idChip } from '../idchip.js';
import { persistSession } from '../app.js';
import { maturityPips, segmentedControl, statusDot, rollupCount, pathTag } from '../components.js';

const PATHS = ['happy', 'edge', 'error'];
const SEARCH_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

export function renderTracking(container, tab) {
  if (!tab.trackingCollapsed) tab.trackingCollapsed = new Set(); // collapsed CONTEXT keys (default open)
  if (!tab.trackingCapsOpen) tab.trackingCapsOpen = new Set();   // expanded CAPABILITY keys (default closed)
  const root = tab.data.root;

  container.innerHTML = `
    <div class="trk">
      <div class="trk-tree"></div>
      <div class="trk-resizer" title="Drag to resize"></div>
      <div class="trk-main">
        <div class="trk-controls">
          <div class="trk-search-wrap">${SEARCH_SVG}<input class="trk-search" type="search" placeholder="Search scenarios…" /></div>
          <div class="trk-tagfilters"></div>
          <button type="button" class="trk-raw">Raw</button>
        </div>
        <div class="trk-content"><p class="trk-empty">Pick a capability or feature on the left.</p></div>
      </div>
    </div>`;

  const treeEl = container.querySelector('.trk-tree');
  const contentEl = container.querySelector('.trk-content');
  const searchEl = container.querySelector('.trk-search');
  const rawEl = container.querySelector('.trk-raw');
  const tagsEl = container.querySelector('.trk-tagfilters');
  const resizerEl = container.querySelector('.trk-resizer');

  applyTreeWidth(treeEl);
  wireResizer(resizerEl, treeEl);

  // Persisted selection + control state, so a re-render (including the live-reload our own
  // setBoardProgress write triggers) keeps the user's place, filters, and search text.
  if (!tab.trackingSel) tab.trackingSel = { context: null, capability: null, feature: null };
  if (!tab.trackingUI) tab.trackingUI = { search: '', tags: [], raw: false };
  const state = tab.trackingSel;
  const ui = tab.trackingUI;
  let loaded = null; // readFeatures result for the selected capability

  // Path-tag filter pills.
  for (const p of PATHS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'trk-tag-pill' + (ui.tags.includes('@' + p) ? ' active' : '');
    b.dataset.path = p;
    b.textContent = '@' + p;
    b.onclick = () => {
      const tag = '@' + p;
      ui.tags = ui.tags.includes(tag) ? ui.tags.filter((t) => t !== tag) : [...ui.tags, tag];
      b.classList.toggle('active', ui.tags.includes(tag));
      render(); persistSession();
    };
    tagsEl.appendChild(b);
  }

  // Restore controls from persisted UI state.
  searchEl.value = ui.search;
  rawEl.classList.toggle('active', ui.raw);

  searchEl.oninput = () => { ui.search = searchEl.value; render(); persistSession(); };
  rawEl.onclick = () => { ui.raw = !ui.raw; rawEl.classList.toggle('active', ui.raw); load(); persistSession(); };

  drawTree();
  if (state.capability) load(); // restore the detail pane for the persisted selection

  // Left navigation: context (collapsible) -> capability (collapsible) -> feature.
  function drawTree() {
    const board = tab.data.board || { scenarios: [], contexts: [], capabilities: [] };
    const tree = buildAcceptanceTree(board.scenarios, { contexts: board.contexts, capabilities: board.capabilities });
    const collapsed = tab.trackingCollapsed;
    const capsOpen = tab.trackingCapsOpen;
    treeEl.innerHTML = '';
    for (const ctx of tree.contexts) {
      const ctxKey = `ctx:${ctx.context}`;
      const ctxOpen = !collapsed.has(ctxKey);
      const cg = document.createElement('div');
      cg.className = 'trk-ctx';

      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'trk-ctx-head';
      const chev = document.createElement('span');
      chev.className = 'trk-chevron' + (ctxOpen ? ' open' : '');
      chev.textContent = '▶';
      head.appendChild(chev);
      head.appendChild(statusDot(ctx.status));
      const cname = document.createElement('span');
      cname.className = 'trk-ctx-name';
      cname.textContent = ctx.name;
      head.appendChild(cname);
      head.appendChild(rollupCount(ctx.doneCount, ctx.total));
      head.appendChild(idChip(contextId(ctx.context)));
      head.onclick = () => { toggle(collapsed, ctxKey); drawTree(); persistSession(); };
      cg.appendChild(head);
      if (!ctxOpen) { treeEl.appendChild(cg); continue; }

      const caps = document.createElement('div');
      caps.className = 'trk-caps';
      for (const cap of ctx.capabilities) {
        const capKey = `cap:${ctx.context}/${cap.capability}`;
        const capOpen = capsOpen.has(capKey);
        const capActive = state.context === ctx.context && state.capability === cap.capability && !state.feature;
        const capScen = cap.features.flatMap((f) => f.scenarios);

        const row = document.createElement('div');
        row.className = 'trk-cap-row' + (capActive ? ' active' : '');
        const capChev = document.createElement('span');
        capChev.className = 'trk-cap-chev' + (capOpen ? ' open' : '');
        capChev.textContent = '▶';
        capChev.onclick = () => { toggle(capsOpen, capKey); drawTree(); persistSession(); };
        const capBtn = document.createElement('button');
        capBtn.type = 'button';
        capBtn.className = 'trk-cap-btn';
        capBtn.appendChild(statusDot(cap.status));
        const capName = document.createElement('span');
        capName.className = 'trk-cap-name';
        capName.textContent = cap.name;
        capBtn.appendChild(capName);
        capBtn.appendChild(maturityPips(capScen, { compact: true }));
        capBtn.appendChild(rollupCount(cap.doneCount, cap.total));
        capBtn.appendChild(idChip(capabilityId(cap.capability)));
        capBtn.onclick = () => {
          state.context = ctx.context; state.capability = cap.capability; state.feature = null;
          capsOpen.add(capKey); // selecting a capability expands its features
          drawTree(); load(); persistSession();
        };
        row.appendChild(capChev); row.appendChild(capBtn);
        caps.appendChild(row);

        if (capOpen) {
          const feats = document.createElement('div');
          feats.className = 'trk-feats';
          for (const f of cap.features) {
            const fActive = state.context === ctx.context && state.capability === cap.capability && state.feature === f.feature;
            const fb = document.createElement('button');
            fb.type = 'button';
            fb.className = 'trk-feat' + (fActive ? ' active' : '');
            fb.appendChild(statusDot(f.status));
            const fn = document.createElement('span');
            fn.className = 'trk-feat-name';
            fn.textContent = f.featureName || f.feature;
            fb.appendChild(fn);
            fb.appendChild(rollupCount(f.accepted, f.total));
            fb.appendChild(idChip(featureId(cap.capability, f.feature)));
            fb.onclick = () => {
              state.context = ctx.context; state.capability = cap.capability; state.feature = f.feature;
              drawTree(); load(); persistSession();
            };
            feats.appendChild(fb);
          }
          caps.appendChild(feats);
        }
      }
      cg.appendChild(caps);
      treeEl.appendChild(cg);
    }
  }

  async function load() {
    if (!state.capability) return;
    if (ui.raw) { await renderRaw(); return; }
    loaded = await window.karto.readFeatures(root, state.context, state.capability);
    render();
  }

  // Detail: each feature as a card (header: status dot + name + copy-chip + maturity pips +
  // accepted/total). When a feature is selected, only that card shows. Search + tag filter
  // narrow scenarios within the cards.
  function render() {
    if (ui.raw) return;
    if (!loaded) { contentEl.innerHTML = '<p class="trk-empty">Pick a capability or feature on the left.</p>'; return; }
    const q = searchEl.value.trim().toLowerCase();
    const tags = ui.tags;
    const files = state.feature ? loaded.files.filter((f) => f.file === state.feature) : loaded.files;
    const wrap = document.createElement('div');
    wrap.className = 'trk-cards';
    for (const f of files) {
      const scenarios = f.scenarios.filter((s) => {
        const tagOk = tags.every((t) => (s.tags || []).includes(t));
        const text = (s.name + ' ' + (s.steps || []).join(' ')).toLowerCase();
        return tagOk && (!q || text.includes(q));
      });
      if (!scenarios.length) continue;
      const accepted = f.scenarios.filter((s) => s.progress === 'accepted').length;
      const status = featStatus(f.scenarios);

      const card = document.createElement('article');
      card.className = 'trk-card';
      const head = document.createElement('div');
      head.className = 'trk-card-head';
      head.appendChild(statusDot(status, { halo: true }));
      const title = document.createElement('span');
      title.className = 'trk-feat-title';
      title.textContent = f.feature || f.file;
      head.appendChild(title);
      head.appendChild(idChip(featureId(state.capability, f.file)));
      const right = document.createElement('span');
      right.className = 'trk-head-right';
      right.appendChild(maturityPips(f.scenarios));
      right.appendChild(rollupCount(accepted, f.scenarios.length, { pill: true }));
      head.appendChild(right);
      card.appendChild(head);

      const body = document.createElement('div');
      body.className = 'trk-card-body';
      if (f.description) { const d = document.createElement('p'); d.className = 'trk-desc'; d.textContent = f.description; body.appendChild(d); }
      if (f.background) { const bg = document.createElement('pre'); bg.className = 'trk-bg'; bg.textContent = 'Background:\n' + f.background.join('\n'); body.appendChild(bg); }

      for (const s of scenarios) {
        const se = document.createElement('div');
        se.className = 'trk-scn';
        se.dataset.class = s.class || 'none';
        const sh = document.createElement('div');
        sh.className = 'trk-scn-head';
        for (const t of (s.tags || [])) {
          const cls = t.replace(/^@/, '');
          if (PATHS.includes(cls)) sh.appendChild(pathTag(cls));
        }
        const sn = document.createElement('span');
        sn.className = 'trk-scn-name';
        sn.textContent = s.name;
        sh.appendChild(sn);
        sh.appendChild(idChip(scenarioId(state.capability, f.file, s.name)));
        se.appendChild(sh);
        const pre = document.createElement('pre');
        pre.className = 'trk-gherkin';
        pre.textContent = (s.steps || []).join('\n');
        se.appendChild(pre);
        const cur = s.progress || 'open';
        se.appendChild(segmentedControl(cur, (next) =>
          setState({ context: state.context, capability: state.capability, feature: f.file, scenario: s.name }, next)));
        body.appendChild(se);
      }
      card.appendChild(body);
      wrap.appendChild(card);
    }
    contentEl.innerHTML = '';
    if (!wrap.children.length) { contentEl.innerHTML = '<p class="trk-empty">No scenarios match your filters.</p>'; return; }
    contentEl.appendChild(wrap);
  }

  // Raw .feature source: the selected feature, or all of the capability's files.
  async function renderRaw() {
    contentEl.innerHTML = '<p class="trk-empty">Loading…</p>';
    let files;
    if (state.feature) {
      files = [state.feature];
    } else {
      const tree2 = (tab.data.tree?.contexts || []).find((c) => c.context === state.context);
      const cap = tree2?.capabilities.find((c) => c.capability === state.capability);
      files = cap?.files || [];
    }
    const frag = document.createElement('div');
    for (const file of files) {
      const rel = `features/${state.context}/${state.capability}/${file}`;
      const { text } = await window.karto.readRaw(root, rel);
      const h = document.createElement('div');
      h.className = 'trk-rawfile';
      h.textContent = file;
      const pre = document.createElement('pre');
      pre.className = 'trk-rawpre';
      pre.textContent = text;
      frag.appendChild(h);
      frag.appendChild(pre);
    }
    contentEl.innerHTML = '';
    contentEl.appendChild(frag.children.length ? frag : Object.assign(document.createElement('p'), { className: 'trk-empty', textContent: 'No files.' }));
  }

  // Write the scenario's state, then re-fetch board (tree dots) + features (detail) and redraw
  // in place — selection, collapse, search, tag filter, and raw toggle persist.
  async function setState(ref, progress) {
    try {
      await window.karto.setBoardProgress({ root, ...ref, progress });
      tab.data.board = await window.karto.readBoard(root);
      loaded = await window.karto.readFeatures(root, state.context, state.capability);
      drawTree();
      render();
    } catch (err) {
      alert('Could not update scenario: ' + (err && err.message || err));
    }
  }
}

const TREE_W_KEY = 'karto.trackingTreeWidth';
const TREE_W_MIN = 160, TREE_W_MAX = 600;

function applyTreeWidth(treeEl) {
  const saved = Number(localStorage.getItem(TREE_W_KEY));
  if (saved >= TREE_W_MIN && saved <= TREE_W_MAX) treeEl.style.width = saved + 'px';
}

function wireResizer(resizerEl, treeEl) {
  resizerEl.onpointerdown = (e) => {
    e.preventDefault();
    resizerEl.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = treeEl.getBoundingClientRect().width;
    const move = (ev) => {
      const w = Math.max(TREE_W_MIN, Math.min(TREE_W_MAX, startW + (ev.clientX - startX)));
      treeEl.style.width = w + 'px';
    };
    const up = () => {
      resizerEl.removeEventListener('pointermove', move);
      resizerEl.removeEventListener('pointerup', up);
      try { localStorage.setItem(TREE_W_KEY, String(Math.round(treeEl.getBoundingClientRect().width))); } catch { /* ignore */ }
    };
    resizerEl.addEventListener('pointermove', move);
    resizerEl.addEventListener('pointerup', up);
  };
}

function toggle(set, key) { if (set.has(key)) set.delete(key); else set.add(key); }

// Derive a feature's status from its scenarios' progress (mirrors buildAcceptanceTree).
function featStatus(scenarios) {
  if (!scenarios.length) return 'untouched';
  const prog = scenarios.map((s) => s.progress || 'open');
  if (prog.every((p) => p === 'accepted')) return 'done';
  return prog.some((p) => p !== 'open') ? 'progress' : 'untouched';
}
```

- [ ] **Step 2: Launch and verify the Tracking view (light)**

Run: `bash scripts/start-desktop.sh`. Open a project **with feature files**; switch to the **Tracking** view. Verify against the prototype:
- Tree: contexts default-open with rotating chevrons, status dots, bold names, `n/m` counts, copy-chips. Capability rows show compact maturity pips + count; selecting one tints it `--primary-soft` and expands its features (indented, left rail).
- Controls: pill search with magnifier; `@happy/@edge/@error` filter pills (active = path-coloured); `Raw` pill.
- Cards: header dot+halo, feature name, copy-chip, right-aligned maturity pips + `accepted/total` pill. Scenario rows have a 3px path-coloured left accent, path tag chips, name, copy-chip, mono Gherkin block, and the Open/Developed/Accepted segmented control with glyphs.

- [ ] **Step 3: Verify interactions + persistence**

- Click a segment → progress writes; the tree dot/count and card update in place; selection/search/tags/raw stay put.
- Type in search → live filter by name + steps. Toggle two tag pills → AND filter. Empty result shows "No scenarios match your filters."
- Toggle `Raw` → mono `.feature` source; toggle back.
- Resize the tree (drag the divider), switch tabs/views and return, then relaunch → selection, filters, collapse, and tree width all restored.
- Flip to dark theme → cards, pips, tags, segments, Gherkin all read correctly with AA contrast.

- [ ] **Step 4: Commit**
```bash
git add desktop/renderer/views/tracking.js
git commit -m "feat(desktop): rebuild Tracking view to design system"
```

---

## Task 5: Restyle the Map view

**Files:**
- Modify: `desktop/renderer/views/map.js`

The maturity ramp + node/region/edge styling already live in CSS (Task 1). This task removes the **hardcoded hex** still set in JS (the SVG arrowhead marker fills and the meta-line separator) and softens the region tint alphas so they read on both themes.

**Interfaces:**
- Consumes: `.map-*` CSS (Task 1).
- Produces: no signature change to `renderMap(container, tab)`.

- [ ] **Step 1: Recolour the SVG arrowhead markers to use theme tokens**

In `desktop/renderer/views/map.js`, find the `container.innerHTML` template containing the two `<marker>` defs (the `#km-arrow` and `#km-arrow-focus` paths with `fill="#ffffff66"` and `fill="#6ea8ffcc"`). Replace the two marker `<path>` fills so the default arrow uses the border colour and the focus arrow uses the primary colour:
```html
        <marker id="km-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9"
                markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--border-strong)"/></marker>
        <marker id="km-arrow-focus" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9"
                markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--primary)"/></marker>
```
(SVG `fill` accepts CSS `var()` here because the markers are inline in the document. If a marker renders black in either theme during verification, fall back to fixed hexes `#c4ccd8` and `#2257e0` and note it.)

- [ ] **Step 2: Soften the context-region tint alphas**

In `drawContainers()`, the region currently uses `tint(color, 0.55)` (border) / `tint(color, 0.1)` (background) and the label uses `tint(color, 0.95)`. Change the border/background to calmer values and let the label use the context's own colour at full strength:
```js
      region.style.borderColor = tint(color, 0.5);
      region.style.background = tint(color, 0.10);
```
and the label colour line:
```js
      label.style.color = tint(color, 0.9);
```
(These keep each context's authored colour but read cleanly on both `--bg` values.)

- [ ] **Step 3: Launch and verify the Map (both themes)**

Run: `bash scripts/start-desktop.sh`. Open a project, **Map** view. Verify:
- Nodes are surface cards with `--shadow-1`, a maturity-coloured left border (vision→stable ramps grey→blue→green), name in `--text`, meta in `--text-soft`. The maturity word is still printed on the node (colour is never the only cue).
- Edges are subtle `--border-strong`; clicking a node focuses its edges to `--primary` with matching arrowheads. The edge-toggle is a token pill.
- Context regions are tinted from their own colour, legible in both light and dark. Dragging nodes/regions and zoom/pan still work; layout persists.

- [ ] **Step 4: Commit**
```bash
git add desktop/renderer/views/map.js
git commit -m "feat(desktop): token-ize Map view styling and maturity ramp"
```

---

## Task 6: Restyle the sidebar + final regression

**Files:**
- Modify: `desktop/renderer/views/sidebar.js`

The `.panel` chrome is already token-styled (Task 1). This task adds the small maturity swatch to the Maturity panel rows so the sidebar matches the Map ramp; everything else is already inheriting tokens.

**Interfaces:**
- Consumes: `.panel`, `.mat-row`, `.mat-swatch` CSS (Task 1). Map maturity ramp tokens.
- Produces: no signature change.

- [ ] **Step 1: Add maturity swatches in `maturityPanel()`**

In `desktop/renderer/views/sidebar.js`, replace the `maturityPanel` function with a version that prepends a colour swatch matching the Map ramp:
```js
function maturityPanel(map) {
  const order = ['vision', 'sketched', 'building', 'usable', 'stable'];
  const swatch = {
    vision: 'var(--border-strong)', sketched: 'var(--blue-300)', building: 'var(--blue-500)',
    usable: 'var(--happy-fg)', stable: 'var(--acc-dot)',
  };
  const counts = Object.fromEntries(order.map((k) => [k, 0]));
  for (const c of Object.values(map.capabilities || {})) {
    const m = (c.derived && c.derived.maturity) || 'vision';
    if (m in counts) counts[m]++;
  }
  const rows = order.map((k) =>
    `<div class="mat-row"><span><span class="mat-swatch" style="background:${swatch[k]}"></span>${k}</span><b>${counts[k]}</b></div>`
  ).join('');
  return panel('Maturity', rows);
}
```

- [ ] **Step 2: Launch and verify the sidebar (both themes)**

Run: `bash scripts/start-desktop.sh`. Open a project (Map or Tracking view — the sidebar shows on the right). Verify: panels are surface cards with hairline borders and uppercase muted headings; Maturity rows show a coloured swatch matching the Map ramp + a count; Glossary/ADR tables and Open Questions list read in `--text`/`--text-muted`; all legible in light and dark.

- [ ] **Step 3: Run the pure-layer test suite (regression guard)**

Run: `npm test`
Expected: PASS (all existing `node:test` files green). This change touched only the renderer; no pure-layer logic changed, so nothing should fail. If anything fails, it is unrelated to this task — investigate before committing.

- [ ] **Step 4: Final full-app walkthrough**

Run: `bash scripts/start-desktop.sh`. One pass through everything in light, then dark, then relaunch to confirm the theme persisted: tabstrip + toggle, viewbar, Map (nodes/edges/regions/drag/zoom), Tracking (tree/cards/segments/search/tags/raw/resize/persist), sidebar panels. Confirm no element retains an old hardcoded dark colour and there are no console errors.

- [ ] **Step 5: Commit**
```bash
git add desktop/renderer/views/sidebar.js
git commit -m "feat(desktop): token-ize sidebar panels with maturity swatches"
```

---

## Self-Review

**1. Spec coverage** (spec §→task):
- §4.1 tokens → Task 1. §4.2 fonts → Task 1. §5 component helpers → Task 3. §5.1 copy chip → Task 3. §6 theme controller + tabstrip toggle → Task 2. §7 Tracking view (tree/controls/cards/raw/write) → Task 4. §8 Map redesign + maturity ramp → Tasks 1 (CSS ramp) + 5 (JS hex removal/tint). §9 sidebar → Tasks 1 (panel CSS) + 6 (swatches). §10 app shell (tabstrip/viewbar/chrome) → Task 1 (CSS) + Task 2 (toggle). §11 motion/a11y → Task 1 (transitions, `:focus-visible`, shape+colour cues). §12 testing/verification → per-task verify steps + Task 6 `npm test`. §13 files → File Structure + tasks. No gaps.
- "No version bump" and "no IPC/data changes" constraints are stated in Global Constraints and respected (no task edits `main/`, `preload.cjs`, schemas, or manifests).

**2. Placeholder scan:** No "TBD/TODO/handle appropriately". Every code step shows complete file content or an exact, located edit with full replacement text. The only conditionals are explicit, justified fallbacks (fonts download failure → CSS stacks; SVG `var()` marker → fixed hex) with concrete values given.

**3. Type/name consistency:** Helper names match across tasks — `maturityPips`, `segmentedControl`, `statusDot`, `rollupCount`, `pathTag` (defined Task 3, consumed Task 4). `maturityPips` reads `s.class` (board.js:81 emits `class`; readFeatures emits `class`). `segmentedControl(current,onSet)` uses `STATES`/`STATE_LABELS` from `workflows/lib/tracking.js`. CSS classes emitted by `tracking.js` (`.trk-*`, `.seg-btn[data-state]`, `.pip-*`, `.ptag.<cls>`, `.sdot.<status>`) all exist in Task 1's stylesheet. `idChip` keeps its signature. `renderTracking`/`renderMap`/`renderSidebar` signatures unchanged, matching `app.js` `VIEWS`. Count semantics preserved (ctx/cap `doneCount/total`, feature `accepted/total`). Tree scenario class for compact pips comes from `cap.features.flatMap(f => f.scenarios)` which carry `class`.
