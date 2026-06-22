# Tracking — Feature Level + Card Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Tracking view a three-level tree (context → capability → feature, capabilities collapsible, click a feature to focus it) and render each feature in the detail as a bordered card so feature boundaries are obvious.

**Architecture:** Refine `desktop/renderer/views/tracking.js` only. The tree gains capability collapse + a feature level, both fed by the existing `buildAcceptanceTree` (its capability nodes already carry `features:[{ feature, featureName, status, accepted, total }]`). Selection state adds `feature`; the detail filters to the selected feature and wraps each feature in a card. Reuses `scenarioProgress` and all existing IPC. No new pure logic, no tests.

**Tech Stack:** Vanilla ESM JavaScript (no framework, no build step), Node built-ins, `node:test` (unchanged pure layer).

## Global Constraints

- **No build step, no framework.** Vanilla ESM JavaScript, Node built-ins + existing deps only. (CLAUDE.md)
- **ESM everywhere** (`"type": "module"`); renderer loads as `type="module"`.
- **No tag-model change.** Progress values stay `open`/`wip`/`test`/`done`; labels Open/WIP/Developed/Accepted. State→progress map EXACT: Open=`open`, WIP=`wip`, Developed=`test`, Accepted=`done`.
- **Reuse, don't reinvent.** Tree dots/feature rows from `buildAcceptanceTree` capability/feature nodes; scenario state from `scenarioProgress(tags)`. No new pure helpers beyond a tiny local feature-status derivation in the renderer.
- **No new IPC.** Reuse `readBoard`, `readFeatures`, `readRaw`, `setBoardProgress`.
- **Writes non-optimistic:** `setBoardProgress` → re-fetch `readBoard` + `readFeatures` → redraw in place; on error show a message and leave state unchanged. Selection (incl. feature), collapse, search, tag filter, and raw toggle survive a write.
- **Collapse state per-tab, in memory:** contexts default open (`tab.trackingCollapsed` = collapsed context keys `ctx:<context>`); capabilities default closed (`tab.trackingCapsOpen` = expanded capability keys `cap:<context>/<capability>`).
- **All interpolated user strings esc()'d** (escapes `& < > " '`).
- **Tests gate the pure layer only.** No renderer unit test. `npm test` must still pass (no regression).
- **Scope:** only `desktop/renderer/views/tracking.js` and `desktop/renderer/styles.css`. Do NOT touch the main process, preload, `app.js`, `viewer/lib`, `workflows/lib`, the schema, `serve.js`, or the browser viewer.

---

## File Structure

- **Modify (full rewrite)** `desktop/renderer/views/tracking.js` — three-level tree + card detail.
- **Modify (append)** `desktop/renderer/styles.css` — capability row, feature tree row, feature card.

---

## Task 1: Feature level in the tree + card-per-feature detail

**Files:**
- Modify: `desktop/renderer/views/tracking.js` (replace the whole file)
- Modify: `desktop/renderer/styles.css` (append a block)

**Interfaces:**
- Consumes: `buildAcceptanceTree(scenarios, { contexts, capabilities })` from `../../../viewer/lib/board.js` (capability nodes carry `features:[{ feature, featureName, status, accepted, total, scenarios }]`); `scenarioProgress(tags)` from `../../../workflows/lib/gherkin.js` (→ `open|wip|test|done`); `tab.data` = `{ root, map, layout, board, tree }`; `window.karto.readFeatures/readRaw/readBoard/setBoardProgress`.
- Produces: `renderTracking(container, tab)` (the export `app.js` imports — unchanged signature).

This is renderer UI — no unit test (repo convention). Verified by `node --check`, the full suite (no regression), and a manual reload.

- [ ] **Step 1: Replace `desktop/renderer/views/tracking.js` with:**

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
  if (!tab.trackingCollapsed) tab.trackingCollapsed = new Set(); // collapsed CONTEXT keys (default open)
  if (!tab.trackingCapsOpen) tab.trackingCapsOpen = new Set();   // expanded CAPABILITY keys (default closed)
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
        <div class="fb-content"><p class="muted">Pick a capability or feature on the left.</p></div>
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

  // feature is a .feature filename (focus one feature) or null (whole capability).
  const state = { context: null, capability: null, feature: null };
  let loaded = null; // readFeatures result for the selected capability

  searchEl.oninput = render;
  rawEl.onchange = load;
  tagsEl.onchange = render;

  drawTree();

  // Left navigation: context (collapsible) -> capability (collapsible) -> feature, with
  // acceptance status dots/counts from the board data.
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
      cg.className = 'fb-ctx';
      const head = document.createElement('div');
      head.className = 'fb-ctx-head';
      head.innerHTML = `<span class="bt-chevron">${ctxOpen ? '▾' : '▸'}</span>` +
        `<span class="fb-ctx-name">${esc(ctx.name)}</span>` +
        `<span class="bt-meta">${dot(ctx.status)}<span class="bt-count">${ctx.doneCount}/${ctx.total}</span></span>`;
      head.onclick = () => { toggle(collapsed, ctxKey); drawTree(); };
      cg.appendChild(head);
      if (!ctxOpen) { treeEl.appendChild(cg); continue; }

      for (const cap of ctx.capabilities) {
        const capKey = `cap:${ctx.context}/${cap.capability}`;
        const capOpen = capsOpen.has(capKey);
        const capActive = state.context === ctx.context && state.capability === cap.capability && !state.feature;
        const row = document.createElement('div');
        row.className = 'fb-cap-row' + (capActive ? ' active' : '');
        const chev = document.createElement('span');
        chev.className = 'bt-chevron';
        chev.textContent = capOpen ? '▾' : '▸';
        chev.onclick = () => { toggle(capsOpen, capKey); drawTree(); };
        const lbl = document.createElement('button');
        lbl.className = 'fb-cap';
        lbl.innerHTML = `${dot(cap.status)}<span class="fb-cap-name">${esc(cap.name)}</span>` +
          `<span class="bt-count">${cap.doneCount}/${cap.total}</span>`;
        lbl.onclick = () => {
          state.context = ctx.context; state.capability = cap.capability; state.feature = null;
          capsOpen.add(capKey); // selecting a capability also expands its feature list
          drawTree(); load();
        };
        row.appendChild(chev); row.appendChild(lbl);
        cg.appendChild(row);

        if (capOpen) {
          for (const f of cap.features) {
            const fActive = state.context === ctx.context && state.capability === cap.capability && state.feature === f.feature;
            const fb = document.createElement('button');
            fb.className = 'fb-feat' + (fActive ? ' active' : '');
            fb.innerHTML = `${dot(f.status)}<span class="fb-feat-name">${esc(f.featureName || f.feature)}</span>` +
              `<span class="bt-count">${f.accepted}/${f.total}</span>`;
            fb.onclick = () => {
              state.context = ctx.context; state.capability = cap.capability; state.feature = f.feature;
              drawTree(); load();
            };
            cg.appendChild(fb);
          }
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

  // Detail: each feature as a bordered card (header: status dot + name + accepted/total),
  // scenarios inside with a per-scenario state control. When a feature is selected, only
  // that card shows. Search + tag filter narrow scenarios within the cards.
  function render() {
    if (rawEl.checked) return;
    if (!loaded) { contentEl.innerHTML = '<p class="muted">Pick a capability or feature on the left.</p>'; return; }
    const q = searchEl.value.trim().toLowerCase();
    const tags = activeTags();
    const files = state.feature ? loaded.files.filter((f) => f.file === state.feature) : loaded.files;
    contentEl.innerHTML = '';
    for (const f of files) {
      const scenarios = f.scenarios.filter((s) => {
        const tagOk = tags.every((t) => (s.tags || []).includes(t));
        const text = (s.name + ' ' + (s.steps || []).join(' ')).toLowerCase();
        return tagOk && (!q || text.includes(q));
      });
      if (!scenarios.length) continue;
      const accepted = f.scenarios.filter((s) => scenarioProgress(s.tags) === 'done').length;
      const card = document.createElement('article');
      card.className = 'fb-card';
      const fhead = document.createElement('div');
      fhead.className = 'fb-feat-head';
      fhead.innerHTML = `${dot(featStatus(f.scenarios))}<span class="bt-name">${esc(f.feature || f.file)}</span>` +
        `<span class="bt-meta"><span class="bt-count">${accepted}/${f.scenarios.length}</span></span>`;
      card.appendChild(fhead);
      const body = document.createElement('div');
      body.className = 'fb-card-body';
      if (f.description) { const d = document.createElement('p'); d.className = 'fb-desc'; d.textContent = f.description; body.appendChild(d); }
      if (f.background) { const bg = document.createElement('pre'); bg.className = 'fb-bg'; bg.textContent = 'Background:\n' + f.background.join('\n'); body.appendChild(bg); }
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
        body.appendChild(se);
      }
      card.appendChild(body);
      contentEl.appendChild(card);
    }
    if (!contentEl.children.length) contentEl.innerHTML = '<p class="muted">No scenarios match.</p>';
  }

  // Raw .feature source: the selected feature's file, or all of the capability's files
  // (from tab.data.tree, which lists every .feature file) when no single feature is selected.
  async function renderRaw() {
    contentEl.innerHTML = '<p class="muted">Loading…</p>';
    let files;
    if (state.feature) {
      files = [state.feature];
    } else {
      const tree2 = (tab.data.tree?.contexts || []).find((c) => c.context === state.context);
      const cap = tree2?.capabilities.find((c) => c.capability === state.capability);
      files = cap?.files || [];
    }
    const parts = [];
    for (const file of files) {
      const rel = `features/${state.context}/${state.capability}/${file}`;
      const { text } = await window.karto.readRaw(root, rel);
      parts.push(`<h4>${esc(file)}</h4><pre class="fb-rawpre">${esc(text)}</pre>`);
    }
    contentEl.innerHTML = parts.join('') || '<p class="muted">No files.</p>';
  }

  // Write the scenario's tag, then re-fetch board (tree dots) + features (detail) and redraw
  // in place — selection (incl. feature), collapse, search, tag filter, and raw toggle persist.
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

// Derive a feature's status from its scenarios' progress, mirroring buildAcceptanceTree's rule:
// done = >=1 scenario and all done; untouched = no scenarios or all open; else progress.
function featStatus(scenarios) {
  if (!scenarios.length) return 'untouched';
  const prog = scenarios.map((s) => scenarioProgress(s.tags));
  if (prog.every((p) => p === 'done')) return 'done';
  return prog.some((p) => p !== 'open') ? 'progress' : 'untouched';
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
```

- [ ] **Step 2: Append the tree/card CSS to `desktop/renderer/styles.css`**

```css
/* Tracking: capability rows, feature rows, and feature cards */
.fb-cap-row { display: flex; align-items: center; gap: 2px; border-radius: 4px; }
.fb-cap-row.active { background: #2b313b; }
.fb-cap-row .bt-chevron { cursor: pointer; padding: 0 2px; }
.fb-cap-row .fb-cap { width: auto; flex: 1; }
.fb-feat { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; background: none; border: none; color: #b6bcc6; padding: 3px 8px 3px 30px; border-radius: 4px; cursor: pointer; font-size: 12px; }
.fb-feat:hover { background: #262b33; }
.fb-feat.active { background: #2b313b; color: #e6e8ec; }
.fb-feat-name { flex: 1; }
.fb-card { border: 1px solid #2a2f37; border-radius: 8px; margin-bottom: 14px; overflow: hidden; background: #16181d; }
.fb-feat-head { display: flex; align-items: center; gap: 8px; margin: 0; padding: 8px 12px; background: #1b1e24; border-bottom: 1px solid #2a2f37; font-weight: 600; }
.fb-card-body { padding: 10px 12px; }
```

(These rules come after the earlier `.fb-feat-head` rule, so the card-header styling wins. The earlier `.fb-feature` rule becomes unused; leave it — pruning dead CSS is out of scope.)

- [ ] **Step 3: Syntax check**

Run: `node --check desktop/renderer/views/tracking.js`
Expected: no output (parses).

- [ ] **Step 4: Run the full suite (no regression)**

Run: `npm test`
Expected: PASS (202 tests; only a renderer file + CSS changed).

- [ ] **Step 5: Manual verification (human, on a display — cannot be done headless)**

`cd desktop && npm start`, open a project, click **Tracking**. Expected:
- Left tree shows context → capability; each capability has a chevron. Expanding a capability lists its **features**, each with a status dot + `accepted/total`.
- Clicking a **capability** label shows all its features (as cards) on the right and expands it; clicking a **feature** shows only that feature's card; the selected node is highlighted.
- Each feature in the detail is a **bordered card** with a header (status dot · name · `accepted/total`) and its scenarios inside — clearly separated from the next feature.
- Each scenario still has the Open|WIP|Developed|Accepted control; clicking it writes the `.feature` tag (verify on disk) and updates the control, the feature card header, and the tree dots/counts — while the current selection (incl. focused feature), expanded/collapsed nodes, search text, tag filters, and Raw toggle all persist.
- Search and the tag filter narrow scenarios within the cards; Raw shows the focused feature's source (or all of the capability's files when a capability — not a single feature — is selected).

- [ ] **Step 6: Commit**

```bash
git add desktop/renderer/views/tracking.js desktop/renderer/styles.css
git commit -m "feat(desktop): feature level in tracking tree + card-per-feature detail"
```

---

## Self-Review Notes

- **Spec coverage:** three-level tree with collapsible capabilities + feature rows from `buildAcceptanceTree` feature nodes (Step 1 `drawTree`); click capability → all features, click feature → one feature, highlight (Step 1 selection + `state.feature`); per-tab collapse with contexts default-open / capabilities default-closed (Step 1 two Sets); card-per-feature detail with header (status dot + name + accepted/total) and contained scenarios (Step 1 `render` + Step 2 `.fb-card`/`.fb-feat-head`/`.fb-card-body`); search/tag-filter narrow within cards, Raw scoped to selected feature (Step 1 `render`/`renderRaw`); writes via existing `setBoardProgress` then re-fetch + in-place redraw preserving selection incl. feature/collapse/search/filter/raw (Step 1 `setState`); no IPC/tag-model/viewer change, no new pure logic beyond local `featStatus`, no new test (Global Constraints, Step 4).
- **Out of scope (per spec):** Map view, persisting collapse/selection across restarts, the previously-deferred polish (filter-aware count, `alert()` replacement), pruning dead CSS.
- **Type consistency:** `buildAcceptanceTree` feature nodes use `feature` (filename), `featureName`, `status`, `accepted`, `total` — consumed exactly in `drawTree`. `setBoardProgress` payload `{ root, context, capability, feature, scenario, progress }` matches the IPC handler (`feature` = `f.file`). `scenarioProgress` returns `open|wip|test|done`, matching `STATES` and `featStatus`. Status values `untouched|progress|done` map to `.dot-*`.
