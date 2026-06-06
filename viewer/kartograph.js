import { buildGraph } from '/lib/graph.js';
import { aggregateMaturity, nodeBrightness, WEIGHTS, maturityLabel } from '/lib/maturity.js';
import { autoPlaceGrouped, boundsForGroups, separateBoxes } from '/lib/layout.js';
import { coverage, sortByScenarioCount, filterScenarios } from '/lib/features.js';

const canvas = document.getElementById('canvas');
const world = document.getElementById('world');
const edgesSvg = document.getElementById('edges');
const panels = document.getElementById('panels');
const detail = document.getElementById('detail');
let layout = {};
let current = null;   // { k, g, contextColor, contextName, pos }
let selected = null;  // slug of the capability shown in the detail panel
let featureFiles = [];                                          // parsed files for the open capability
const featureFilters = { happy: true, edge: true, error: true, sortByCount: true };

// View transform (pan/zoom). World coords (layout, edges, regions) are unchanged;
// this only maps world -> screen. Kept as module state so a live-reload re-render
// does not reset the view.
let view = { x: 0, y: 0, z: 1 };
const ZOOM_MIN = 0.2, ZOOM_MAX = 3;
function applyTransform() {
  world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
}

async function loadJSON(path, fallback) {
  try { const r = await fetch(path, { cache: 'no-store' }); return r.ok ? await r.json() : fallback; }
  catch { return fallback; }
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '#666666');
  const n = parseInt(m ? m[1] : '666666', 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function shade(hex, brightness) {
  const { r, g, b } = hexToRgb(hex);
  const f = 0.4 + 0.6 * brightness; // never fully black
  return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
}
function tint(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

async function saveLayout() {
  await fetch('/layout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(layout) });
}

// Collect the rendered node rectangles in WORLD coordinates (centre + size).
// Uses style.left/top (the stored world centre) and offsetWidth/Height (layout
// size, unaffected by the CSS transform) so the boxes are correct at any zoom.
function nodeRects() {
  return [...canvas.querySelectorAll('.node')].map((el) => ({
    context: el.dataset.context,
    x: parseFloat(el.style.left),
    y: parseFloat(el.style.top),
    w: el.offsetWidth, h: el.offsetHeight,
  }));
}

function drawContainers() {
  for (const el of canvas.querySelectorAll('.context-region, .context-label')) el.remove();
  if (!current) return;
  const { contextColor, contextName, g } = current;
  const counts = {};
  for (const n of g.nodes) counts[n.context] = (counts[n.context] ?? 0) + 1;
  const boxes = boundsForGroups(nodeRects(), 28);
  const firstNode = world.querySelector('.node');
  for (const [ctx, b] of Object.entries(boxes)) {
    const color = contextColor[ctx] ?? '#666666';
    const region = document.createElement('div');
    region.className = 'context-region';
    region.dataset.context = ctx;
    region.style.left = b.x + 'px';
    region.style.top = b.y + 'px';
    region.style.width = b.w + 'px';
    region.style.height = b.h + 'px';
    region.style.borderColor = tint(color, 0.55);
    region.style.background = tint(color, 0.1);
    const label = document.createElement('div');
    label.className = 'context-label';
    label.dataset.context = ctx;
    label.style.left = b.x + 12 + 'px';
    label.style.top = b.y + 8 + 'px';
    label.textContent = `${contextName[ctx] ?? ctx} · ${counts[ctx] ?? 0} cap`;
    world.insertBefore(region, firstNode);
    world.insertBefore(label, firstNode);
    makeContextDraggable(region, label, ctx);
  }
}

function drawEdges(pos) {
  edgesSvg.innerHTML = '';
  if (!current) return;
  for (const e of current.g.edges) {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
    edgesSvg.appendChild(line);
  }
}

function openDetail(slug) {
  if (!current) return;
  const { k, g, contextName } = current;
  const c = k.capabilities?.[slug];
  if (!c) return closeDetail();
  selected = slug;
  const maturity = g.nodes.find((n) => n.slug === slug)?.maturity ?? 'vision';
  const fc = c.derived?.featureCount ?? 0;
  const sc = c.derived?.scenarioCount ?? 0;
  const deps = (k.dependencies || []).filter((d) => d.from === slug).map((d) => k.capabilities?.[d.to]?.name ?? d.to);
  const rev = (k.dependencies || []).filter((d) => d.to === slug).map((d) => k.capabilities?.[d.from]?.name ?? d.from);
  const chips = (arr) => (arr.length ? arr.map((x) => `<span class="chip">${x}</span>`).join('') : '—');
  detail.innerHTML = `
    <span class="back" id="detailBack">‹ Overview</span>
    <h2 class="detail-title">${c.name}
      <span class="badge mat-${maturity}">${maturityLabel(maturity)}</span>
      <span class="badge ctx">${contextName[c.context] ?? c.context}</span></h2>
    <p class="detail-def">${c.definition ?? ''}</p>
    <div class="metrics">
      <div><span class="num">${fc}</span><span class="lbl">features</span></div>
      <div><span class="num">${sc}</span><span class="lbl">scenarios</span></div>
      <div><span class="num">${deps.length}</span><span class="lbl">depends on</span></div>
    </div>
    <div class="rel"><h3>depends on</h3>${chips(deps)}</div>
    <div class="rel"><h3>required by</h3>${chips(rev)}</div>
    <div class="features" id="featuresSection"></div>`;
  document.getElementById('detailBack').addEventListener('click', closeDetail);
  detail.hidden = false;
  panels.hidden = true;
  document.getElementById('featuresSection').innerHTML =
    '<h3 class="feat-h">Features</h3><p class="feat-empty">Loading…</p>';
  featureFiles = []; // drop the previous capability's data so it can't render during the load
  loadFeatures(slug, c.context);
}

function closeDetail() {
  selected = null;
  detail.hidden = true;
  panels.hidden = false;
}

async function loadFeatures(slug, context) {
  const data = await loadJSON(`/features/${encodeURIComponent(context)}/${encodeURIComponent(slug)}`, { files: [] });
  if (selected !== slug) return; // a live reload switched capability mid-fetch
  featureFiles = data.files || [];
  renderFeatures();
}

function renderFeatures() {
  const root = document.getElementById('featuresSection');
  if (!root) return;
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
  if (!featureFiles.length) {
    root.innerHTML = '<h3 class="feat-h">Features</h3><p class="feat-empty">No features yet</p>';
    return;
  }
  // Snapshot which scenarios are currently expanded so a full innerHTML rebuild
  // (triggered by a filter/sort toggle) does not collapse them. dataset.scn is the
  // browser-unescaped raw id, so we compare it against the raw scnId below.
  const open = new Set([...root.querySelectorAll('.scn.open')].map((el) => el.dataset.scn));
  const f = featureFilters;
  const classToggle = (c) =>
    `<button type="button" class="cls-toggle cls-${c}${f[c] ? '' : ' off'}" data-cls="${c}">${c}</button>`;
  const covBadge = (cov, c) =>
    `<span class="cov-badge cls-${c} ${cov[c] ? 'on' : 'off'}">${cov[c] ? '✓' : '✗'}${c}</span>`;
  const ordered = f.sortByCount ? sortByScenarioCount(featureFiles) : featureFiles;

  const blocks = ordered.map((file) => {
    const cov = coverage(file.scenarios);
    const shown = filterScenarios(file.scenarios, f);
    const scns = shown.map((s) => {
      const cls = s.class || 'none';
      const tag = s.class ? `<span class="scn-tag cls-${s.class}">${s.class}</span>` : '';
      const steps = (s.steps || []).map((st) => esc(st)).join('\n');
      const scnId = file.file + '::' + s.name;
      return `<div class="scn cls-${cls}${open.has(scnId) ? ' open' : ''}" data-scn="${esc(scnId)}">
        <div class="scn-head"><span class="scn-name">${esc(s.name)}</span>${tag}</div>
        <pre class="scn-steps">${steps}</pre>
      </div>`;
    }).join('') || '<p class="feat-empty">No scenarios match the filter</p>';
    const desc = file.description ? `<p class="feat-desc">${esc(file.description)}</p>` : '';
    return `<div class="feat">
      <div class="feat-title">${esc(file.feature || file.file)}</div>
      <div class="cov">${covBadge(cov, 'happy')}${covBadge(cov, 'edge')}${covBadge(cov, 'error')}</div>
      ${desc}${scns}
    </div>`;
  }).join('');

  root.innerHTML = `
    <h3 class="feat-h">Features</h3>
    <div class="feat-bar">
      ${classToggle('happy')}${classToggle('edge')}${classToggle('error')}
      <button type="button" class="sort-toggle${f.sortByCount ? ' on' : ''}">sort: ${f.sortByCount ? 'scenarios' : 'name'}</button>
    </div>
    ${blocks}`;

  root.onclick = (ev) => {
    const t = ev.target.closest('[data-cls], .sort-toggle, .scn-head');
    if (!t) return;
    if (t.dataset.cls) { featureFilters[t.dataset.cls] = !featureFilters[t.dataset.cls]; renderFeatures(); }
    else if (t.classList.contains('sort-toggle')) { featureFilters.sortByCount = !featureFilters.sortByCount; renderFeatures(); }
    else if (t.classList.contains('scn-head')) { t.closest('.scn').classList.toggle('open'); }
  };
}

function render(k) {
  const g = buildGraph(k);
  const contextColor = Object.fromEntries(g.contexts.map((c) => [c.slug, c.color]));
  const contextName = Object.fromEntries(g.contexts.map((c) => [c.slug, c.name]));
  document.getElementById('title').textContent = k.meta?.name ?? 'Kartograph';
  document.getElementById('stats').textContent =
    `${g.nodes.length} capabilities · ${g.contexts.length} contexts`;

  const pct = Math.round(aggregateMaturity(k.capabilities) * 100);
  document.getElementById('maturity').textContent = `maturity ${pct}%`;
  document.getElementById('maturityBar').style.width = pct + '%';
  const counts = {};
  for (const n of g.nodes) counts[n.maturity] = (counts[n.maturity] ?? 0) + 1;
  document.getElementById('maturityBreakdown').textContent =
    Object.keys(WEIGHTS).map((m) => `${maturityLabel(m)} ${counts[m] ?? 0}`).join(' · ');

  layout = autoPlaceGrouped(g.nodes, layout, { width: canvas.clientWidth, height: canvas.clientHeight });

  for (const el of canvas.querySelectorAll('.node, .context-region, .context-label')) el.remove();
  const pos = {};
  for (const n of g.nodes) {
    const p = layout[n.slug];
    pos[n.slug] = p;
    const el = document.createElement('div');
    el.className = 'node';
    el.dataset.slug = n.slug;
    el.dataset.context = n.context;
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.style.background = shade(contextColor[n.context] ?? '#666666', nodeBrightness(n.maturity));
    el.style.fontSize = Math.max(12, Math.min(18, 11 + n.featureCount / 3)) + 'px';
    el.innerHTML = `${n.name}<small>${maturityLabel(n.maturity)}${n.featureCount ? ` · ${n.featureCount} features` : ''}</small>`;
    makeDraggable(el, n.slug, pos);
    world.appendChild(el);
  }

  current = { k, g, contextColor, contextName, pos };
  drawContainers();
  drawEdges(pos);
  applyTransform();

  const gTable = document.getElementById('glossary');
  gTable.innerHTML = Object.values(k.glossary ?? {})
    .map((t) => `<tr><td><b>${t.term}</b></td><td>${t.definition}</td></tr>`).join('') || '<tr><td>—</td></tr>';
  const aTable = document.getElementById('adrs');
  aTable.innerHTML = Object.values(k.adrs ?? {})
    .map((a) => `<tr><td>${a.id}</td><td>${a.title}</td><td>${a.status}</td></tr>`).join('') || '<tr><td>—</td></tr>';

  // Keep an open detail panel in sync after a live reload; close it if its
  // capability disappeared from the map.
  if (selected && k.capabilities?.[selected]) openDetail(selected);
  else closeDetail();
}

function makeDraggable(el, slug, pos) {
  let startX, startY, origX, origY, moved;
  el.addEventListener('pointerdown', (ev) => {
    el.setPointerCapture(ev.pointerId); el.style.cursor = 'grabbing';
    startX = ev.clientX; startY = ev.clientY; origX = layout[slug].x; origY = layout[slug].y; moved = false;
  });
  el.addEventListener('pointermove', (ev) => {
    if (startX === undefined) return;
    const dx = (ev.clientX - startX) / view.z, dy = (ev.clientY - startY) / view.z;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    const x = origX + dx, y = origY + dy;
    layout[slug] = { x, y }; pos[slug] = { x, y };
    el.style.left = x + 'px'; el.style.top = y + 'px';
    drawEdges(pos); drawContainers();
  });
  el.addEventListener('pointerup', async () => {
    if (startX === undefined) return;
    startX = undefined; el.style.cursor = 'grab';
    if (moved) { await saveLayout(); reload(); }
    else { openDetail(slug); } // a click (no drag) opens the capability detail
  });
}

// Translate a whole context — its member capabilities and its region+label — by
// (dx, dy) in world coords, updating layout, pos and the DOM. Used by live
// collision so a pushed-away context moves as one rigid box.
function translateContext(ctx, dx, dy) {
  if (!dx && !dy) return;
  for (const n of current.g.nodes) {
    if (n.context !== ctx) continue;
    const p = current.pos[n.slug]; if (!p) continue;
    const x = p.x + dx, y = p.y + dy;
    layout[n.slug] = { x, y }; current.pos[n.slug] = { x, y };
    const node = canvas.querySelector(`.node[data-slug="${n.slug}"]`);
    if (node) { node.style.left = x + 'px'; node.style.top = y + 'px'; }
  }
  for (const el of canvas.querySelectorAll(
    `.context-region[data-context="${ctx}"], .context-label[data-context="${ctx}"]`)) {
    el.style.left = parseFloat(el.style.left) + dx + 'px';
    el.style.top = parseFloat(el.style.top) + dy + 'px';
  }
}

// While `fixedCtx` is being dragged, push every other context box out of its way
// so boxes never overlap (live collision). Chained pile-ups separate too.
function resolveCollisions(fixedCtx) {
  const deltas = separateBoxes(boundsForGroups(nodeRects(), 28), { fixed: fixedCtx, gap: 16 });
  for (const ctx in deltas) {
    if (ctx !== fixedCtx) translateContext(ctx, deltas[ctx].dx, deltas[ctx].dy);
  }
}

// A context has no position of its own: its container box is derived from the
// rects of the capabilities inside it. Dragging the box therefore translates
// every member capability by the same delta, and the box follows. We move the
// region + label and the member nodes directly during the drag (never via
// drawContainers, which would recreate — and so drop — the element we are
// dragging), then persist and reload on release.
function makeContextDraggable(region, label, ctx) {
  let startX, startY, moved, members, regOrig, labOrig;
  const onDown = (ev) => {
    if (!current) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    region.style.cursor = label.style.cursor = 'grabbing';
    startX = ev.clientX; startY = ev.clientY; moved = false;
    members = current.g.nodes
      .filter((n) => n.context === ctx && layout[n.slug])
      .map((n) => ({ slug: n.slug, x: layout[n.slug].x, y: layout[n.slug].y }));
    regOrig = { x: parseFloat(region.style.left), y: parseFloat(region.style.top) };
    labOrig = { x: parseFloat(label.style.left), y: parseFloat(label.style.top) };
  };
  const onMove = (ev) => {
    if (startX === undefined) return;
    const dx = (ev.clientX - startX) / view.z, dy = (ev.clientY - startY) / view.z;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    for (const m of members) {
      const x = m.x + dx, y = m.y + dy;
      layout[m.slug] = { x, y }; current.pos[m.slug] = { x, y };
      const node = canvas.querySelector(`.node[data-slug="${m.slug}"]`);
      if (node) { node.style.left = x + 'px'; node.style.top = y + 'px'; }
    }
    region.style.left = regOrig.x + dx + 'px'; region.style.top = regOrig.y + dy + 'px';
    label.style.left = labOrig.x + dx + 'px'; label.style.top = labOrig.y + dy + 'px';
    resolveCollisions(ctx);
    drawEdges(current.pos);
  };
  const onUp = async () => {
    if (startX === undefined) return;
    startX = undefined; region.style.cursor = label.style.cursor = 'grab';
    if (moved) { await saveLayout(); reload(); }
  };
  for (const handle of [region, label]) {
    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  }
}

async function reload() {
  const k = await loadJSON('/kartograph.json', { meta: { name: 'Kartograph' }, contexts: {}, capabilities: {} });
  render(k);
}

document.getElementById('reset').addEventListener('click', async () => {
  layout = {};
  await saveLayout();
  reload();
});

// Wheel zooms toward the cursor; dragging empty canvas pans. Dragging a node or a
// context box is handled by their own pointer handlers, so panning only starts when
// the gesture begins on the bare canvas/world (not on a node, region or label).
function wireZoomPan() {
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const r = canvas.getBoundingClientRect();
    const cx = ev.clientX - r.left, cy = ev.clientY - r.top;
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.z * Math.exp(-ev.deltaY * 0.0015)));
    const wx = (cx - view.x) / view.z, wy = (cy - view.y) / view.z; // world point under cursor
    view.x = cx - wx * z; view.y = cy - wy * z; view.z = z;          // keep it fixed
    applyTransform();
  }, { passive: false });

  let px;
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.target !== canvas && ev.target !== world && ev.target !== edgesSvg) return;
    canvas.setPointerCapture(ev.pointerId);
    canvas.classList.add('panning');
    px = { x: ev.clientX, y: ev.clientY };
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!px) return;
    view.x += ev.clientX - px.x; view.y += ev.clientY - px.y;
    px = { x: ev.clientX, y: ev.clientY };
    applyTransform();
  });
  const endPan = () => { px = null; canvas.classList.remove('panning'); };
  canvas.addEventListener('pointerup', endPan);
  canvas.addEventListener('pointercancel', endPan);
}

// Accordion sections (click a header to fold/unfold) and the sidebar collapse toggle.
function wireSidebar() {
  for (const head of document.querySelectorAll('.acc-head')) {
    head.addEventListener('click', () => head.closest('.acc').classList.toggle('open'));
  }
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebarToggle');
  toggle?.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('collapsed');
    toggle.textContent = collapsed ? '‹' : '›';
    toggle.title = collapsed ? 'Expand panel' : 'Collapse panel';
  });
}

async function boot() {
  wireSidebar();
  wireZoomPan();
  layout = await loadJSON('/kartograph.layout.json', {});
  await reload();
  const es = new EventSource('/events');
  es.onmessage = () => reload();
}
boot();
