import { markDirty, persistSession, persistSessionSoon } from '../app.js';
import { autoPlaceGrouped, boundsForGroups } from '../../../viewer/lib/layout.js';
import { contextId, capabilityId } from '../../../viewer/lib/ids.js';
import { idChip } from '../idchip.js';

const ZOOM_MIN = 0.2, ZOOM_MAX = 3;
const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderMap(container, tab) {
  const { map, layout } = tab.data;
  if (!tab.mapView) tab.mapView = { x: 0, y: 0, z: 1 };
  if (tab.mapShowEdges === undefined) tab.mapShowEdges = true;
  if (tab.mapSelected === undefined) tab.mapSelected = null;

  const contextColor = {}, contextName = {};
  for (const [slug, c] of Object.entries(map.contexts || {})) {
    contextColor[slug] = c.color || '#666666';
    contextName[slug] = c.name || slug;
  }
  const caps = Object.entries(map.capabilities || {})
    .map(([slug, c]) => ({ slug, name: c.name || slug, context: c.context, maturity: (c.derived && c.derived.maturity) || 'vision' }));
  const capSet = new Set(caps.map((c) => c.slug));
  if (tab.mapSelected && !capSet.has(tab.mapSelected)) tab.mapSelected = null; // drop a stale restored selection
  const edges = (Array.isArray(map.dependencies) ? map.dependencies : Object.values(map.dependencies || {}))
    .filter((d) => d && capSet.has(d.from) && capSet.has(d.to));
  const positions = autoPlaceGrouped(caps.map((c) => ({ slug: c.slug, context: c.context })), layout, {});

  container.innerHTML = `<div class="map-canvas">
    <button type="button" class="map-edges-toggle"></button>
    <div class="map-world">
      <svg class="map-edges"><defs>
        <marker id="km-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9"
                markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--border-strong)"/></marker>
        <marker id="km-arrow-focus" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9"
                markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--primary)"/></marker>
      </defs></svg>
    </div>
  </div>`;
  const canvas = container.querySelector('.map-canvas');
  const world = container.querySelector('.map-world');
  const svg = container.querySelector('.map-edges');
  const toggleBtn = container.querySelector('.map-edges-toggle');

  // The capability nodes (centre-positioned via the CSS translate(-50%,-50%)).
  for (const cap of caps) {
    const pos = positions[cap.slug] || { x: 40, y: 40 };
    const node = document.createElement('div');
    node.className = `map-node maturity-${cap.maturity}`;
    node.dataset.slug = cap.slug;
    node.dataset.context = cap.context || '';
    node.style.left = pos.x + 'px';
    node.style.top = pos.y + 'px';
    node.innerHTML = `<strong>${esc(cap.name)}</strong><span>${esc(cap.context || '')} · ${esc(cap.maturity)}</span>`;
    node.appendChild(idChip(capabilityId(cap.slug)));
    makeNodeDraggable(node, cap.slug, positions, tab, drawContainers, drawEdges, setSelected);
    world.appendChild(node);
  }
  drawContainers();
  drawEdges();
  highlightSelected();
  updateToggle();

  // A→B dependency lines from A's centre to B's border (room for the arrowhead).
  // With a capability selected, draw only its edges and style them as focused.
  function drawEdges() {
    for (const l of svg.querySelectorAll('line')) l.remove();
    if (!tab.mapShowEdges) return;
    const sel = tab.mapSelected;
    const size = {};
    for (const el of world.querySelectorAll('.map-node')) size[el.dataset.slug] = { w: el.offsetWidth, h: el.offsetHeight };
    for (const e of edges) {
      if (sel && e.from !== sel && e.to !== sel) continue;
      const a = positions[e.from], b = positions[e.to];
      if (!a || !b) continue;
      let ex = b.x, ey = b.y;
      const tb = size[e.to];
      if (tb) {
        const dx = a.x - b.x, dy = a.y - b.y;
        const adx = Math.abs(dx), ady = Math.abs(dy);
        if (adx || ady) {
          const s = Math.min(adx ? (tb.w / 2 + 6) / adx : Infinity, ady ? (tb.h / 2 + 6) / ady : Infinity);
          ex = b.x + dx * s; ey = b.y + dy * s;
        }
      }
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', ex); line.setAttribute('y2', ey);
      if (sel) line.setAttribute('class', 'focus');
      line.setAttribute('marker-end', sel ? 'url(#km-arrow-focus)' : 'url(#km-arrow)');
      svg.appendChild(line);
    }
  }

  // Context regions are derived from the rendered node rects, so they are drawn
  // after the nodes exist and redrawn whenever a node moves.
  function drawContainers() {
    for (const el of world.querySelectorAll('.context-region, .context-label')) el.remove();
    const rects = [...world.querySelectorAll('.map-node')].map((el) => ({
      context: el.dataset.context,
      x: parseFloat(el.style.left), y: parseFloat(el.style.top),
      w: el.offsetWidth, h: el.offsetHeight,
    }));
    const boxes = boundsForGroups(rects, 28);
    const firstNode = world.querySelector('.map-node');
    for (const [ctx, b] of Object.entries(boxes)) {
      if (!ctx) continue;
      const color = contextColor[ctx] || '#666666';
      const region = document.createElement('div');
      region.className = 'context-region';
      region.dataset.context = ctx;
      region.style.left = b.x + 'px';
      region.style.top = b.y + 'px';
      region.style.width = b.w + 'px';
      region.style.height = b.h + 'px';
      region.style.borderColor = tint(color, 0.5);
      region.style.background = tint(color, 0.1);
      const label = document.createElement('div');
      label.className = 'context-label';
      label.dataset.context = ctx;
      label.style.left = (b.x + 12) + 'px';
      label.style.top = (b.y + 8) + 'px';
      label.style.color = tint(color, 0.9);
      label.textContent = contextName[ctx] || ctx;
      label.appendChild(idChip(contextId(ctx)));
      // Behind the nodes so the cards stay on top, but interactive (draggable).
      world.insertBefore(region, firstNode);
      world.insertBefore(label, firstNode);
      makeContextDraggable(region, label, ctx, positions, tab, drawContainers, drawEdges);
    }
  }

  function setSelected(slug) {
    tab.mapSelected = (tab.mapSelected === slug) ? null : slug;
    highlightSelected();
    drawEdges();
    persistSession();
  }
  function highlightSelected() {
    for (const el of world.querySelectorAll('.map-node')) el.classList.toggle('selected', el.dataset.slug === tab.mapSelected);
  }
  function updateToggle() { toggleBtn.textContent = tab.mapShowEdges ? 'Hide edges' : 'Show edges'; }

  toggleBtn.onclick = () => { tab.mapShowEdges = !tab.mapShowEdges; updateToggle(); drawEdges(); persistSession(); };

  wireZoomPan(canvas, world, tab, () => { // click on empty canvas clears the selection
    if (tab.mapSelected !== null) { tab.mapSelected = null; highlightSelected(); drawEdges(); persistSession(); }
  });
}

// Pinch (trackpad → wheel+ctrlKey) zooms toward the cursor; two-finger scroll and
// dragging the empty canvas pan. Only world→screen transform changes; world coords
// (nodes, edges, regions) are untouched. View state lives on the tab.
function wireZoomPan(canvas, world, tab, onBareClick) {
  const v = tab.mapView;
  const apply = () => { world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`; };
  apply();

  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const r = canvas.getBoundingClientRect();
    const cx = ev.clientX - r.left, cy = ev.clientY - r.top;
    if (ev.ctrlKey) {
      const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.z * Math.exp(-ev.deltaY * 0.01)));
      const wx = (cx - v.x) / v.z, wy = (cy - v.y) / v.z; // world point under the cursor
      v.x = cx - wx * z; v.y = cy - wy * z; v.z = z;       // keep that point fixed
    } else {
      v.x -= ev.deltaX; v.y -= ev.deltaY;
    }
    apply();
    persistSessionSoon(); // wheel has no end event — debounce the save
  }, { passive: false });

  let px = null, panMoved = false;
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.target !== canvas && ev.target !== world) return; // nodes/regions handle their own
    canvas.setPointerCapture(ev.pointerId);
    canvas.classList.add('panning');
    px = { x: ev.clientX, y: ev.clientY }; panMoved = false;
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!px) return;
    if (Math.abs(ev.clientX - px.x) + Math.abs(ev.clientY - px.y) > 3) panMoved = true;
    v.x += ev.clientX - px.x; v.y += ev.clientY - px.y;
    px = { x: ev.clientX, y: ev.clientY };
    apply();
  });
  const end = () => {
    if (px && !panMoved) onBareClick();
    else if (px && panMoved) persistSession(); // save the final pan position
    px = null; canvas.classList.remove('panning');
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

function makeNodeDraggable(node, slug, positions, tab, redrawBoxes, redrawEdges, onClick) {
  node.onpointerdown = (e) => {
    e.preventDefault();
    e.stopPropagation(); // don't let the canvas start a pan
    node.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    const orig = { ...(positions[slug] || { x: 0, y: 0 }) };
    let moved = false;
    const move = (ev) => {
      const z = (tab.mapView && tab.mapView.z) || 1; // screen delta → world delta
      const dx = (ev.clientX - start.x) / z, dy = (ev.clientY - start.y) / z;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      positions[slug] = { x: orig.x + dx, y: orig.y + dy };
      node.style.left = positions[slug].x + 'px';
      node.style.top = positions[slug].y + 'px';
      redrawBoxes();
      redrawEdges();
      markDirty(tab, true);
    };
    const up = async () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      if (moved) {
        tab.data.layout = positions;
        await window.karto.saveLayout(tab.data.root, positions);
        markDirty(tab, false);
      } else {
        onClick(slug); // a click (no drag) focuses this capability's edges
      }
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
  };
}

// A context box has no position of its own — it is derived from its members' rects.
// Dragging it translates every member capability by the same delta (region+label
// move directly so the dragged element isn't recreated mid-gesture); on release we
// persist and rebuild the boxes from the final positions.
function makeContextDraggable(region, label, ctx, positions, tab, redrawBoxes, redrawEdges) {
  const onDown = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    region.style.cursor = label.style.cursor = 'grabbing';
    const start = { x: ev.clientX, y: ev.clientY };
    const members = [...region.parentElement.querySelectorAll('.map-node')]
      .filter((n) => n.dataset.context === ctx)
      .map((n) => ({ slug: n.dataset.slug, el: n, x: positions[n.dataset.slug].x, y: positions[n.dataset.slug].y }));
    const regOrig = { x: parseFloat(region.style.left), y: parseFloat(region.style.top) };
    const labOrig = { x: parseFloat(label.style.left), y: parseFloat(label.style.top) };
    let moved = false;
    const onMove = (e) => {
      const z = (tab.mapView && tab.mapView.z) || 1;
      const dx = (e.clientX - start.x) / z, dy = (e.clientY - start.y) / z;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      for (const m of members) {
        positions[m.slug] = { x: m.x + dx, y: m.y + dy };
        m.el.style.left = positions[m.slug].x + 'px';
        m.el.style.top = positions[m.slug].y + 'px';
      }
      region.style.left = (regOrig.x + dx) + 'px'; region.style.top = (regOrig.y + dy) + 'px';
      label.style.left = (labOrig.x + dx) + 'px'; label.style.top = (labOrig.y + dy) + 'px';
      redrawEdges();
      markDirty(tab, true);
    };
    const onUp = async () => {
      region.removeEventListener('pointermove', onMove);
      region.removeEventListener('pointerup', onUp);
      region.style.cursor = label.style.cursor = '';
      if (moved) {
        tab.data.layout = positions;
        await window.karto.saveLayout(tab.data.root, positions);
        markDirty(tab, false);
        redrawBoxes(); // rebuild region/label from the members' final positions
      }
    };
    region.addEventListener('pointermove', onMove);
    region.addEventListener('pointerup', onUp);
  };
  region.addEventListener('pointerdown', onDown);
  label.addEventListener('pointerdown', onDown);
}

function esc(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '#666666');
  const n = parseInt(m ? m[1] : '666666', 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function tint(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
