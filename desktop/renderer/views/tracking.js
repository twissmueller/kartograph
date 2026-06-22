import { buildAcceptanceTree } from '../../../viewer/lib/board.js';
import { scenarioProgress } from '../../../workflows/lib/gherkin.js';
import { contextId, capabilityId, featureId, scenarioId } from '../../../viewer/lib/ids.js';
import { idChip } from '../idchip.js';

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
      head.appendChild(idChip(contextId(ctx.context)));
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
        lbl.appendChild(idChip(capabilityId(cap.capability)));
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
            fb.appendChild(idChip(featureId(cap.capability, f.feature)));
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
      fhead.appendChild(idChip(featureId(state.capability, f.file)));
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
        se.querySelector('.fb-scn-name').appendChild(idChip(scenarioId(state.capability, f.file, s.name)));
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
