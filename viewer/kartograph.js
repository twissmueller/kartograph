import { buildGraph, nodeSize } from '/lib/graph.js';
import { aggregateMaturity, nodeBrightness, WEIGHTS } from '/lib/maturity.js';
import { autoPlace } from '/lib/layout.js';

const canvas = document.getElementById('canvas');
const edgesSvg = document.getElementById('edges');
let layout = {};

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

async function saveLayout() {
  await fetch('/layout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(layout) });
}

function render(k) {
  const g = buildGraph(k);
  const contextColor = Object.fromEntries(g.contexts.map((c) => [c.slug, c.color]));
  document.getElementById('title').textContent = k.meta?.name ?? 'Kartograph';
  document.getElementById('stats').textContent =
    `${g.nodes.length} capabilities · ${g.contexts.length} contexts`;

  const pct = Math.round(aggregateMaturity(k.capabilities) * 100);
  document.getElementById('maturity').textContent = `maturity ${pct}%`;
  document.getElementById('maturityBar').style.width = pct + '%';
  const counts = {};
  for (const n of g.nodes) counts[n.maturity] = (counts[n.maturity] ?? 0) + 1;
  document.getElementById('maturityBreakdown').textContent =
    Object.keys(WEIGHTS).map((m) => `${m} ${counts[m] ?? 0}`).join(' · ');

  layout = autoPlace(g.nodes.map((n) => n.slug), layout, { width: canvas.clientWidth, height: canvas.clientHeight });

  for (const el of canvas.querySelectorAll('.node')) el.remove();
  const pos = {};
  for (const n of g.nodes) {
    const p = layout[n.slug];
    pos[n.slug] = p;
    const el = document.createElement('div');
    el.className = 'node';
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.style.background = shade(contextColor[n.context] ?? '#666666', nodeBrightness(n.maturity));
    el.style.fontSize = Math.max(12, Math.min(18, 11 + n.featureCount / 3)) + 'px';
    el.innerHTML = `${n.name}<small>${n.maturity}${n.featureCount ? ` · ${n.featureCount} features` : ''}</small>`;
    makeDraggable(el, n.slug, pos);
    canvas.appendChild(el);
  }

  edgesSvg.innerHTML = '';
  for (const e of g.edges) {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
    edgesSvg.appendChild(line);
  }

  const gTable = document.getElementById('glossary');
  gTable.innerHTML = Object.values(k.glossary ?? {})
    .map((t) => `<tr><td><b>${t.term}</b></td><td>${t.definition}</td></tr>`).join('') || '<tr><td>—</td></tr>';
  const aTable = document.getElementById('adrs');
  aTable.innerHTML = Object.values(k.adrs ?? {})
    .map((a) => `<tr><td>${a.id}</td><td>${a.title}</td><td>${a.status}</td></tr>`).join('') || '<tr><td>—</td></tr>';
}

function makeDraggable(el, slug, pos) {
  let startX, startY, origX, origY;
  el.addEventListener('pointerdown', (ev) => {
    el.setPointerCapture(ev.pointerId); el.style.cursor = 'grabbing';
    startX = ev.clientX; startY = ev.clientY; origX = layout[slug].x; origY = layout[slug].y;
  });
  el.addEventListener('pointermove', (ev) => {
    if (startX === undefined) return;
    const x = origX + (ev.clientX - startX), y = origY + (ev.clientY - startY);
    layout[slug] = { x, y }; pos[slug] = { x, y };
    el.style.left = x + 'px'; el.style.top = y + 'px';
  });
  el.addEventListener('pointerup', async () => {
    startX = undefined; el.style.cursor = 'grab';
    await saveLayout(); reload();
  });
}

async function reload() {
  const k = await loadJSON('/kartograph.json', { meta: { name: 'Kartograph' }, contexts: {}, capabilities: {} });
  render(k);
}

async function boot() {
  layout = await loadJSON('/kartograph.layout.json', {});
  await reload();
  const es = new EventSource('/events');
  es.onmessage = () => reload();
}
boot();
