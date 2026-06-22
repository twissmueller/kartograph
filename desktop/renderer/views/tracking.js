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
