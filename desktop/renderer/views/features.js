const PATH_TAGS = ['@happy', '@edge', '@error'];
const PROGRESS_TAGS = ['@wip', '@test', '@done'];

export function renderFeatures(container, tab) {
  const { tree, root } = tab.data;
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
    lbl.innerHTML = `<input type="checkbox" value="${t}" /> ${t}`;
    tagsEl.appendChild(lbl);
  }

  const state = { context: null, capability: null };

  for (const ctx of (tree.contexts || [])) {
    const cg = document.createElement('div');
    cg.className = 'fb-ctx';
    cg.innerHTML = `<div class="fb-ctx-name">${esc(ctx.name)}</div>`;
    for (const cap of ctx.capabilities) {
      const cb = document.createElement('button');
      cb.className = 'fb-cap';
      cb.textContent = `${cap.name} (${cap.files.length})`;
      cb.onclick = () => { state.context = ctx.context; state.capability = cap.capability; load(); };
      cg.appendChild(cb);
    }
    treeEl.appendChild(cg);
  }

  searchEl.oninput = render;
  rawEl.onchange = load;
  tagsEl.onchange = render;

  let loaded = null; // { files } for the selected capability

  async function load() {
    if (!state.capability) return;
    if (rawEl.checked) { await renderRaw(); return; }
    loaded = await window.karto.readFeatures(root, state.context, state.capability);
    render();
  }

  function activeTags() {
    return [...tagsEl.querySelectorAll('input:checked')].map((i) => i.value);
  }

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
      const fe = document.createElement('article');
      fe.className = 'fb-feature';
      fe.innerHTML = `<h3>${esc(f.feature || f.file)}</h3>` +
        (f.description ? `<p class="fb-desc">${esc(f.description)}</p>` : '') +
        (f.background ? `<pre class="fb-bg">Background:\n${esc(f.background.join('\n'))}</pre>` : '');
      for (const s of scenarios) {
        const se = document.createElement('div');
        se.className = `fb-scenario class-${s.class || 'none'}`;
        se.innerHTML = `<div class="fb-tags-line">${(s.tags || []).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
          <div class="fb-scn-name">${esc(s.name)}</div>
          <pre>${esc((s.steps || []).join('\n'))}</pre>`;
        fe.appendChild(se);
      }
      contentEl.appendChild(fe);
    }
    if (!contentEl.children.length) contentEl.innerHTML = '<p class="muted">No scenarios match.</p>';
  }

  async function renderRaw() {
    contentEl.innerHTML = '<p class="muted">Loading…</p>';
    const tree2 = tab.data.tree.contexts.find((c) => c.context === state.context);
    const cap = tree2?.capabilities.find((c) => c.capability === state.capability);
    const parts = [];
    for (const file of (cap?.files || [])) {
      const rel = `features/${state.context}/${state.capability}/${file}`;
      const { text } = await window.karto.readRaw(root, rel);
      parts.push(`<h4>${esc(file)}</h4><pre class="fb-rawpre">${esc(text)}</pre>`);
    }
    contentEl.innerHTML = parts.join('') || '<p class="muted">No files.</p>';
  }
}

function esc(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
