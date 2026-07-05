import { buildAcceptanceTree } from '../../../workflows/lib/board.js';
import { contextId, capabilityId, featureId, scenarioId } from '../../../workflows/lib/ids.js';
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
