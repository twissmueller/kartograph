import { buildGraph } from '/lib/graph.js';
import { aggregateMaturity, nodeBrightness, WEIGHTS, maturityLabel } from '/lib/maturity.js';
import { autoPlaceGrouped, boundsForGroups } from '/lib/layout.js';

const canvas = document.getElementById('canvas');
const edgesSvg = document.getElementById('edges');
const panels = document.getElementById('panels');
const detail = document.getElementById('detail');
let layout = {};
let current = null;   // { k, g, contextColor, contextName, pos }
let selected = null;  // slug of the capability shown in the detail panel

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

// Collect the rendered node rectangles in canvas coordinates (centre + size).
function nodeRects() {
  const c = canvas.getBoundingClientRect();
  return [...canvas.querySelectorAll('.node')].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      context: el.dataset.context,
      x: r.left - c.left + r.width / 2,
      y: r.top - c.top + r.height / 2,
      w: r.width, h: r.height,
    };
  });
}

function drawContainers() {
  for (const el of canvas.querySelectorAll('.context-region, .context-label')) el.remove();
  if (!current) return;
  const { contextColor, contextName, g } = current;
  const counts = {};
  for (const n of g.nodes) counts[n.context] = (counts[n.context] ?? 0) + 1;
  const boxes = boundsForGroups(nodeRects(), 28);
  const firstNode = canvas.querySelector('.node');
  for (const [ctx, b] of Object.entries(boxes)) {
    const color = contextColor[ctx] ?? '#666666';
    const region = document.createElement('div');
    region.className = 'context-region';
    region.style.left = b.x + 'px';
    region.style.top = b.y + 'px';
    region.style.width = b.w + 'px';
    region.style.height = b.h + 'px';
    region.style.borderColor = tint(color, 0.55);
    region.style.background = tint(color, 0.1);
    const label = document.createElement('div');
    label.className = 'context-label';
    label.style.left = b.x + 12 + 'px';
    label.style.top = b.y + 8 + 'px';
    label.textContent = `${contextName[ctx] ?? ctx} · ${counts[ctx] ?? 0} cap`;
    canvas.insertBefore(region, firstNode);
    canvas.insertBefore(label, firstNode);
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
    <div class="rel"><h3>required by</h3>${chips(rev)}</div>`;
  document.getElementById('detailBack').addEventListener('click', closeDetail);
  detail.hidden = false;
  panels.hidden = true;
}

function closeDetail() {
  selected = null;
  detail.hidden = true;
  panels.hidden = false;
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
    canvas.appendChild(el);
  }

  current = { k, g, contextColor, contextName, pos };
  drawContainers();
  drawEdges(pos);

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
    const dx = ev.clientX - startX, dy = ev.clientY - startY;
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

async function reload() {
  const k = await loadJSON('/kartograph.json', { meta: { name: 'Kartograph' }, contexts: {}, capabilities: {} });
  render(k);
}

document.getElementById('reset').addEventListener('click', async () => {
  layout = {};
  await saveLayout();
  reload();
});

async function boot() {
  layout = await loadJSON('/kartograph.layout.json', {});
  await reload();
  const es = new EventSource('/events');
  es.onmessage = () => reload();
}
boot();
