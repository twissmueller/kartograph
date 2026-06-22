# Desktop "Tracking" View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop app's separate Board and Features tabs with one master-detail **Tracking** tab (tabs become **Map | Tracking**): a left context→capability tree with acceptance status dots, and a right Gherkin detail with an inline per-scenario Open/WIP/Developed/Accepted control, keeping search/tag-filter/raw-source and the reference sidebar.

**Architecture:** A new renderer view `desktop/renderer/views/tracking.js` combines the existing Features view (tree + Gherkin detail + search/filter/raw) with the board's acceptance affordances, reusing two already-tested pure helpers: `buildAcceptanceTree` (`viewer/lib/board.js`) for the tree's status dots/roll-ups and `scenarioProgress` (`workflows/lib/gherkin.js`) to derive each scenario's current state from its tags. `app.js` is rewired to show `Map | Tracking`; `board.js` and `features.js` are deleted. No new IPC, no tag-model/schema/serve.js/viewer change.

**Tech Stack:** Vanilla ESM JavaScript (no framework, no build step), Node built-ins, `node:test` (for the unchanged pure layer). Reuses existing `window.karto.readBoard` / `readFeatures` / `readRaw` / `setBoardProgress` IPC.

## Global Constraints

- **No build step, no framework.** Vanilla ESM JavaScript, Node built-ins + existing deps only. (CLAUDE.md)
- **ESM everywhere** (`"type": "module"`); renderer modules load as `type="module"`.
- **No tag-model change.** Progress values stay `open`/`wip`/`test`/`done`; the labels Open/WIP/Developed/Accepted are presentational. Do NOT change `gherkin.js`, `board-data.js`, `serve.js`, the schema, or the browser viewer.
- **State→progress mapping (exact):** Open=`open`, WIP=`wip`, Developed=`test`, Accepted=`done`.
- **Reuse, don't reinvent:** tree dots/roll-ups from `buildAcceptanceTree`; current scenario state from `scenarioProgress(tags)`. Both are already unit-tested — do NOT duplicate their logic.
- **No new IPC.** Reuse `readBoard`, `readFeatures`, `readRaw`, `setBoardProgress`.
- **Writes are non-optimistic:** call `setBoardProgress`, then re-fetch and re-render; on error show a message and leave state unchanged.
- **Tests gate the pure layer only.** No new unit test (the renderer is verified by running; reused helpers are already covered). `npm test` (alias `node --test`) must still pass.

---

## File Structure

- **Create** `desktop/renderer/views/tracking.js` — the combined master-detail Tracking view (one closure so selection/search/filter/raw persist across in-place updates).
- **Delete** `desktop/renderer/views/board.js` and `desktop/renderer/views/features.js` — superseded.
- **Modify** `desktop/renderer/app.js` — imports, `VIEWS`, and the view-switcher list.
- **Modify** `desktop/renderer/styles.css` — append Tracking-view rules (reusing existing `.fb-*`, `.seg`, `.dot`).

---

## Task 1: Build the Tracking view and rewire the app

**Files:**
- Create: `desktop/renderer/views/tracking.js`
- Delete: `desktop/renderer/views/board.js`, `desktop/renderer/views/features.js`
- Modify: `desktop/renderer/app.js` (imports near lines 1-4; `VIEWS` line 12; switcher list line 88)
- Modify: `desktop/renderer/styles.css` (append a Tracking block)

**Interfaces:**
- Consumes: `buildAcceptanceTree(scenarios, { contexts, capabilities })` from `../../../viewer/lib/board.js` (returns `{ contexts: [{ context, name, color, status, doneCount, total, capabilities: [{ capability, name, status, doneCount, total, features: [{ feature, featureName, status, accepted, total, scenarios }] }] }] }`, `status ∈ untouched|progress|done`); `scenarioProgress(tags)` from `../../../workflows/lib/gherkin.js` (returns `open|wip|test|done`); `tab.data` = `{ root, map, layout, board, tree }` where `board` = `{ scenarios, capabilities, contexts }` (from `readBoard`) and `tree` = `{ contexts: [{ context, name, capabilities: [{ capability, name, files: string[] }] }] }` (from `listFeatures`); `window.karto.readFeatures/readRaw/readBoard/setBoardProgress`.
- Produces: `renderTracking(container, tab)` — the export `app.js` imports.

This is renderer UI — no unit test (repo convention). Verified by `node --check`, the full suite (no regression), and a manual reload.

- [ ] **Step 1: Create `desktop/renderer/views/tracking.js`**

```javascript
import { buildAcceptanceTree } from '../../../viewer/lib/board.js';
import { scenarioProgress } from '../../../workflows/lib/gherkin.js';

const PATH_TAGS = ['@happy', '@edge', '@error'];
const PROGRESS_TAGS = ['@wip', '@test', '@done'];
const STATES = [
  { progress: 'open', label: 'Open' },
  { progress: 'wip', label: 'WIP' },
  { progress: 'test', label: 'Developed' },
  { progress: 'done', label: 'Accepted' },
];

export function renderTracking(container, tab) {
  if (!tab.trackingCollapsed) tab.trackingCollapsed = new Set();
  const root = tab.data.root;

  container.innerHTML = `
    <div class="fb">
      <div class="fb-tree"></div>
      <div class="fb-main">
        <div class="fb-controls">
          <input class="fb-search" type="search" placeholder="Search scenarios…" />
          <label><input type="checkbox" class="fb-raw" /> Raw</label>
          <span class="fb-tags"></span>
        </div>
        <div class="fb-content"><p class="muted">Pick a capability on the left.</p></div>
      </div>
    </div>`;

  const treeEl = container.querySelector('.fb-tree');
  const contentEl = container.querySelector('.fb-content');
  const searchEl = container.querySelector('.fb-search');
  const rawEl = container.querySelector('.fb-raw');
  const tagsEl = container.querySelector('.fb-tags');

  for (const t of [...PATH_TAGS, ...PROGRESS_TAGS]) {
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="checkbox" value="${esc(t)}" /> ${esc(t)}`;
    tagsEl.appendChild(lbl);
  }

  const state = { context: null, capability: null };
  let loaded = null; // { files } for the selected capability

  searchEl.oninput = render;
  rawEl.onchange = load;
  tagsEl.onchange = render;

  drawTree();

  // Left navigation: collapsible context groups + capability rows, with acceptance
  // status dots/counts from the board data. Selecting a capability loads its detail.
  function drawTree() {
    const board = tab.data.board || { scenarios: [], contexts: [], capabilities: [] };
    const tree = buildAcceptanceTree(board.scenarios, { contexts: board.contexts, capabilities: board.capabilities });
    const collapsed = tab.trackingCollapsed;
    treeEl.innerHTML = '';
    for (const ctx of tree.contexts) {
      const ctxKey = `ctx:${ctx.context}`;
      const open = !collapsed.has(ctxKey);
      const cg = document.createElement('div');
      cg.className = 'fb-ctx';
      const head = document.createElement('div');
      head.className = 'fb-ctx-head';
      head.innerHTML = `<span class="bt-chevron">${open ? '▾' : '▸'}</span>` +
        `<span class="fb-ctx-name">${esc(ctx.name)}</span>` +
        `<span class="bt-meta">${dot(ctx.status)}<span class="bt-count">${ctx.doneCount}/${ctx.total}</span></span>`;
      head.onclick = () => { toggle(collapsed, ctxKey); drawTree(); };
      cg.appendChild(head);
      if (open) {
        for (const cap of ctx.capabilities) {
          const active = state.context === ctx.context && state.capability === cap.capability;
          const cb = document.createElement('button');
          cb.className = 'fb-cap' + (active ? ' active' : '');
          cb.innerHTML = `${dot(cap.status)}<span class="fb-cap-name">${esc(cap.name)}</span>` +
            `<span class="bt-count">${cap.doneCount}/${cap.total}</span>`;
          cb.onclick = () => { state.context = ctx.context; state.capability = cap.capability; drawTree(); load(); };
          cg.appendChild(cb);
        }
      }
      treeEl.appendChild(cg);
    }
  }

  async function load() {
    if (!state.capability) return;
    if (rawEl.checked) { await renderRaw(); return; }
    loaded = await window.karto.readFeatures(root, state.context, state.capability);
    render();
  }

  function activeTags() {
    return [...tagsEl.querySelectorAll('input:checked')].map((i) => i.value);
  }

  // Detail: the selected capability's features with full Gherkin and a per-scenario
  // state control. Search + tag filter narrow the visible scenarios.
  function render() {
    if (rawEl.checked) return;
    if (!loaded) { contentEl.innerHTML = '<p class="muted">Pick a capability on the left.</p>'; return; }
    const q = searchEl.value.trim().toLowerCase();
    const tags = activeTags();
    contentEl.innerHTML = '';
    for (const f of loaded.files) {
      const scenarios = f.scenarios.filter((s) => {
        const tagOk = tags.every((t) => (s.tags || []).includes(t));
        const text = (s.name + ' ' + (s.steps || []).join(' ')).toLowerCase();
        return tagOk && (!q || text.includes(q));
      });
      if (!scenarios.length) continue;
      const accepted = f.scenarios.filter((s) => scenarioProgress(s.tags) === 'done').length;
      const fe = document.createElement('article');
      fe.className = 'fb-feature';
      const fhead = document.createElement('div');
      fhead.className = 'fb-feat-head';
      fhead.innerHTML = `<span class="bt-name">${esc(f.feature || f.file)}</span>` +
        `<span class="bt-meta"><span class="bt-count">${accepted}/${f.scenarios.length}</span></span>`;
      fe.appendChild(fhead);
      if (f.description) { const d = document.createElement('p'); d.className = 'fb-desc'; d.textContent = f.description; fe.appendChild(d); }
      if (f.background) { const bg = document.createElement('pre'); bg.className = 'fb-bg'; bg.textContent = 'Background:\n' + f.background.join('\n'); fe.appendChild(bg); }
      for (const s of scenarios) {
        const se = document.createElement('div');
        se.className = `fb-scenario class-${s.class || 'none'}`;
        se.innerHTML = `<div class="fb-tags-line">${(s.tags || []).map((t) => `<span>${esc(t)}</span>`).join('')}</div>` +
          `<div class="fb-scn-name">${esc(s.name)}</div>` +
          `<pre>${esc((s.steps || []).join('\n'))}</pre>`;
        const cur = scenarioProgress(s.tags);
        const seg = document.createElement('span');
        seg.className = 'seg';
        for (const st of STATES) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = st.label;
          if (cur === st.progress) b.className = 'active';
          b.onclick = () => setState({ context: state.context, capability: state.capability, feature: f.file, scenario: s.name }, st.progress);
          seg.appendChild(b);
        }
        se.appendChild(seg);
        fe.appendChild(se);
      }
      contentEl.appendChild(fe);
    }
    if (!contentEl.children.length) contentEl.innerHTML = '<p class="muted">No scenarios match.</p>';
  }

  // Raw .feature source for the selected capability. File list comes from tab.data.tree
  // (listFeatures), which includes every .feature file (even scenario-less ones).
  async function renderRaw() {
    contentEl.innerHTML = '<p class="muted">Loading…</p>';
    const tree2 = (tab.data.tree?.contexts || []).find((c) => c.context === state.context);
    const cap = tree2?.capabilities.find((c) => c.capability === state.capability);
    const parts = [];
    for (const file of (cap?.files || [])) {
      const rel = `features/${state.context}/${state.capability}/${file}`;
      const { text } = await window.karto.readRaw(root, rel);
      parts.push(`<h4>${esc(file)}</h4><pre class="fb-rawpre">${esc(text)}</pre>`);
    }
    contentEl.innerHTML = parts.join('') || '<p class="muted">No files.</p>';
  }

  // Write the scenario's tag, then re-fetch board (tree dots) + features (detail) and
  // redraw in place — selection, collapse, search, tag filter, and raw toggle persist.
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

function dot(status) { return `<span class="dot dot-${status}"></span>`; }
function toggle(set, key) { if (set.has(key)) set.delete(key); else set.add(key); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
```

- [ ] **Step 2: Rewire `desktop/renderer/app.js`**

Replace the imports on lines 1-4:

```javascript
import { renderMap } from './views/map.js';
import { renderTracking } from './views/tracking.js';
import { renderSidebar } from './views/sidebar.js';
```

Replace the `VIEWS` constant (line 12):

```javascript
const VIEWS = { map: renderMap, tracking: renderTracking };
```

Replace the view-switcher list (line 88, `for (const key of ['map', 'board', 'features']) {`):

```javascript
  for (const key of ['map', 'tracking']) {
```

(Leave everything else — `loadProjectData`, the default `view: 'map'` on line 22, the per-view `try/catch` — unchanged.)

- [ ] **Step 3: Delete the superseded views**

```bash
git rm desktop/renderer/views/board.js desktop/renderer/views/features.js
```

- [ ] **Step 4: Append Tracking CSS to `desktop/renderer/styles.css`**

```css
/* Tracking view (Map | Tracking) — collapsible tree rows + per-scenario state */
.fb-ctx-head { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; margin: 10px 4px 4px; }
.fb-ctx-head .fb-ctx-name { margin: 0; }
.fb-cap { display: flex; align-items: center; gap: 6px; }
.fb-cap.active { background: #262b33; }
.fb-cap-name { flex: 1; }
.fb-feat-head { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-weight: 600; border-bottom: 1px solid #23272f; padding-bottom: 4px; }
.fb-scenario .seg { margin-top: 6px; }
```

- [ ] **Step 5: Syntax check and reference check**

Run: `node --check desktop/renderer/views/tracking.js && node --check desktop/renderer/app.js`
Expected: no output (both parse).

Run: `grep -rn "renderBoard\|renderFeatures\|views/board.js\|views/features.js" desktop/`
Expected: no matches (nothing references the deleted views anymore).

- [ ] **Step 6: Run the full suite (no regression)**

Run: `npm test`
Expected: PASS (202 tests; `viewer/lib/board.js` and `gherkin.js` tests still pass — only renderer files changed/removed).

- [ ] **Step 7: Manual verification (human, on a display — cannot be done headless)**

`cd desktop && npm start`, open a project. Expected:
- Two view buttons: **Map** and **Tracking** (no Board/Features).
- Tracking shows a left context→capability tree with status dots + counts; context headers collapse/expand (state persists across tab/view switches, resets on restart).
- Selecting a capability shows its features with full Gherkin (description/background/tags/steps) and an Open|WIP|Developed|Accepted control per scenario, with the current state highlighted.
- Clicking a control writes the `.feature` tag (verify on disk) and updates both the detail control and the left-tree dots/counts; selection, search text, checked tag filters, and the Raw toggle survive the update.
- Search and the tag filter narrow visible scenarios; the Raw toggle shows the `.feature` source.

- [ ] **Step 8: Commit**

```bash
git add desktop/renderer/views/tracking.js desktop/renderer/app.js desktop/renderer/styles.css
git commit -m "feat(desktop): merge Board + Features into one Tracking view"
```

(The `git rm` from Step 3 is already staged and will be included in this commit.)

---

## Self-Review Notes

- **Spec coverage:** Map | Tracking tabs, Board/Features removed (Step 2/3); master-detail layout reusing `.fb-*` + sidebar via app.js (Step 1/4); left tree with acceptance dots/counts + collapsible contexts from `buildAcceptanceTree` (Step 1 `drawTree`); detail with full Gherkin + inline Open/WIP/Developed/Accepted control, active state via `scenarioProgress`, feature roll-up count (Step 1 `render`); search + tag filter + raw toggle kept (Step 1); writes via existing `setBoardProgress` then re-fetch `readBoard` + `readFeatures`, non-optimistic, in-place redraw preserving selection/search/filter/raw/collapse (Step 1 `setState`); per-tab in-memory collapse `tab.trackingCollapsed` (Step 1); no new IPC / no tag-model/schema/serve.js/viewer change / no new pure logic or test (Global Constraints, Step 6).
- **Out of scope (per spec), intentionally absent:** Map-view changes, persisting collapse across restarts, pruning the dead Kanban/board-tree CSS, any new pure helper or unit test.
- **Type consistency:** `setBoardProgress` payload `{ root, context, capability, feature, scenario, progress }` matches the existing IPC handler (`feature` is the `.feature` filename → `f.file`). Status values `untouched|progress|done` from `buildAcceptanceTree` map to the `.dot-*` CSS classes. `scenarioProgress` returns `open|wip|test|done`, matching the `STATES` `progress` keys for the active-segment check.
