import { renderMap } from './views/map.js';
import { renderTracking } from './views/tracking.js';
import { renderSidebar } from './views/sidebar.js';

const tabs = [];           // { root, name, data, view, dirty, el, paneEl }
let activeRoot = null;

const stripEl = document.getElementById('tabstrip');
const workspaceEl = document.getElementById('workspace');

const VIEWS = { map: renderMap, tracking: renderTracking };

async function loadProjectData(root) {
  const { map, layout } = await window.karto.readMap(root);
  const [board, tree] = await Promise.all([window.karto.readBoard(root), window.karto.listFeatures(root)]);
  return { root, map, layout, board, tree };
}

async function openProjectByRoot(root, name) {
  if (tabs.find((t) => t.root === root)) { setActive(root); return; }
  const tab = { root, name: name || root, data: null, view: 'map', dirty: false, error: null };
  tabs.push(tab);
  await window.karto.watchStart(root);
  await window.karto.addRecent(root);
  setActive(root);
  await refreshTab(tab);
  renderStrip();
  persistSession();
}

async function refreshTab(tab) {
  try { tab.data = await loadProjectData(tab.root); tab.error = null; }
  catch (e) { tab.error = String(e.message || e); }
  if (tab.root === activeRoot) renderWorkspace();
}

function setActive(root) { activeRoot = root; renderStrip(); renderWorkspace(); }

function closeTab(root) {
  const i = tabs.findIndex((t) => t.root === root);
  if (i === -1) return;
  const tab = tabs[i];
  if (tab.dirty && !confirm(`"${tab.name}" has unsaved layout changes. Close anyway?`)) return;
  window.karto.watchStop(root);
  tabs.splice(i, 1);
  if (activeRoot === root) activeRoot = tabs.length ? tabs[Math.max(0, i - 1)].root : null;
  renderStrip(); renderWorkspace(); persistSession();
}

function renderStrip() {
  stripEl.innerHTML = '';
  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.root === activeRoot ? ' active' : '') + (tab.dirty ? ' dirty' : '');
    el.textContent = tab.name;
    el.title = tab.root;
    el.onclick = () => setActive(tab.root);
    const x = document.createElement('button');
    x.className = 'tab-close'; x.textContent = '×';
    x.onclick = (ev) => { ev.stopPropagation(); closeTab(tab.root); };
    el.appendChild(x);
    stripEl.appendChild(el);
  }
  const add = document.createElement('button');
  add.className = 'tab-add'; add.textContent = '+'; add.title = 'Open project';
  add.onclick = doOpen;
  stripEl.appendChild(add);
}

function renderWorkspace() {
  workspaceEl.innerHTML = '';
  const tab = tabs.find((t) => t.root === activeRoot);
  if (!tab) { workspaceEl.innerHTML = '<p class="empty">Open a kartograph.json to begin (File → Open).</p>'; return; }
  if (tab.error) {
    workspaceEl.innerHTML = `<div class="error"><p>Could not load this project.</p><pre></pre>
      <button id="retry">Retry</button></div>`;
    workspaceEl.querySelector('pre').textContent = tab.error;
    workspaceEl.querySelector('#retry').onclick = () => refreshTab(tab);
    return;
  }
  // Not loaded yet: a tab is shown immediately on open, before refreshTab() fills
  // tab.data. Render a placeholder rather than handing null data to a view.
  if (!tab.data) { workspaceEl.innerHTML = '<p class="empty">Loading…</p>'; return; }
  // View switcher
  const bar = document.createElement('div');
  bar.className = 'viewbar';
  for (const key of ['map', 'tracking']) {
    const b = document.createElement('button');
    b.textContent = key[0].toUpperCase() + key.slice(1);
    b.className = tab.view === key ? 'active' : '';
    b.onclick = () => { tab.view = key; renderWorkspace(); };
    bar.appendChild(b);
  }
  workspaceEl.appendChild(bar);

  const layout = document.createElement('div');
  layout.className = 'project-layout';
  const main = document.createElement('div'); main.className = 'project-main';
  const side = document.createElement('aside'); side.className = 'project-side';
  layout.append(main, side);
  workspaceEl.appendChild(layout);

  // Render the view and sidebar independently: a throw in one must not blank the
  // other (and must surface, not fail silently).
  try { VIEWS[tab.view](main, tab); }
  catch (e) { main.innerHTML = '<div class="error"><p>Failed to render this view.</p><pre></pre></div>'; main.querySelector('pre').textContent = String(e && e.stack || e); }
  try { renderSidebar(side, tab); }
  catch (e) { side.innerHTML = '<p class="muted">Sidebar failed to render.</p>'; console.error(e); }
}

async function doOpen() {
  const picked = await window.karto.openProject();
  if (picked) await openProjectByRoot(picked.root, picked.name);
}

function persistSession() {
  window.karto.saveSession({ openRoots: tabs.map((t) => t.root) });
}

// Live reload: refresh the matching tab.
window.karto.onFileChange((root) => {
  const tab = tabs.find((t) => t.root === root);
  if (tab) refreshTab(tab);
});

window.karto.onMenuOpenProject(() => doOpen());

// Restore previous session on launch.
(async () => {
  const { openRoots } = await window.karto.loadSession();
  for (const root of openRoots) {
    try { await openProjectByRoot(root, root.split(/[\\/]/).pop()); } catch { /* skip dead roots */ }
  }
  renderStrip(); renderWorkspace();
})();

// Exposed for view modules to mark a tab dirty (e.g. unsaved drag) and trigger a strip repaint.
export function markDirty(tab, dirty) { tab.dirty = dirty; renderStrip(); }
