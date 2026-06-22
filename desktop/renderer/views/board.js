import { buildAcceptanceTree } from '../../../viewer/lib/board.js';

// Desktop labels (presentational) over the stored progress values.
const STATES = [
  { progress: 'open', label: 'Open' },
  { progress: 'wip', label: 'WIP' },
  { progress: 'test', label: 'Developed' },
  { progress: 'done', label: 'Accepted' },
];

export function renderBoard(container, tab) {
  if (!tab.boardCollapsed) tab.boardCollapsed = new Set();
  const { scenarios, contexts, capabilities } = tab.data.board;
  const tree = buildAcceptanceTree(scenarios, { contexts, capabilities });

  container.innerHTML = '<div class="board-tree"></div>';
  const rootEl = container.querySelector('.board-tree');
  if (!tree.contexts.length) { rootEl.innerHTML = '<p class="muted">No capabilities yet.</p>'; return; }

  const collapsed = tab.boardCollapsed;
  const rerender = () => renderBoard(container, tab);

  async function setState(ref, progress) {
    try {
      await window.karto.setBoardProgress({ root: tab.data.root, ...ref, progress });
      tab.data.board = await window.karto.readBoard(tab.data.root);
      rerender(); // collapse state lives on tab, so it survives the re-render
    } catch (err) {
      alert('Could not update scenario: ' + (err && err.message || err));
    }
  }

  for (const ctx of tree.contexts) {
    const ctxKey = `ctx:${ctx.context}`;
    const ctxOpen = !collapsed.has(ctxKey);
    const ctxEl = document.createElement('section');
    ctxEl.className = 'bt-ctx';
    ctxEl.appendChild(header('bt-ctx-head', ctxOpen, ctx.name, ctx.status, `${ctx.doneCount}/${ctx.total} done`, () => {
      toggle(collapsed, ctxKey); rerender();
    }));
    if (ctxOpen) {
      for (const cap of ctx.capabilities) {
        const capKey = `cap:${ctx.context}/${cap.capability}`;
        const capOpen = !collapsed.has(capKey);
        const capEl = document.createElement('div');
        capEl.className = 'bt-cap';
        capEl.appendChild(header('bt-cap-head', capOpen, cap.name, cap.status, `${cap.doneCount}/${cap.total} done`, () => {
          toggle(collapsed, capKey); rerender();
        }));
        if (capOpen) {
          for (const feat of cap.features) capEl.appendChild(renderFeature(ctx, cap, feat, setState));
          if (!cap.features.length) {
            const none = document.createElement('div');
            none.className = 'bt-empty muted'; none.textContent = 'No scenarios';
            capEl.appendChild(none);
          }
        }
        ctxEl.appendChild(capEl);
      }
    }
    rootEl.appendChild(ctxEl);
  }
}

function renderFeature(ctx, cap, feat, setState) {
  const el = document.createElement('div');
  el.className = 'bt-feature';
  const head = document.createElement('div');
  head.className = 'bt-feat-head';
  head.innerHTML = `<span class="bt-name">${esc(feat.featureName)}</span>` +
    `<span class="bt-meta">${dot(feat.status)}<span class="bt-count">${feat.accepted}/${feat.total}</span></span>`;
  el.appendChild(head);
  for (const s of feat.scenarios) {
    const row = document.createElement('div');
    row.className = 'bt-scenario';
    row.innerHTML = `<span class="bt-tag class-${s.class || 'none'}" title="${esc(s.class || 'untagged')}"></span>` +
      `<span class="bt-name">${esc(s.name)}</span>`;
    const seg = document.createElement('span');
    seg.className = 'seg';
    for (const st of STATES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = st.label;
      if ((s.progress || 'open') === st.progress) b.className = 'active';
      b.onclick = () => setState({ context: ctx.context, capability: cap.capability, feature: feat.feature, scenario: s.name }, st.progress);
      seg.appendChild(b);
    }
    row.appendChild(seg);
    el.appendChild(row);
  }
  return el;
}

function header(cls, open, name, status, count, onToggle) {
  const h = document.createElement('div');
  h.className = cls;
  h.innerHTML = `<span class="bt-chevron">${open ? '▾' : '▸'}</span>` +
    `<span class="bt-name">${esc(name)}</span>` +
    `<span class="bt-meta">${dot(status)}<span class="bt-count">${esc(count)}</span></span>`;
  h.onclick = onToggle;
  return h;
}

function dot(status) { return `<span class="dot dot-${status}"></span>`; }
function toggle(set, key) { if (set.has(key)) set.delete(key); else set.add(key); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
