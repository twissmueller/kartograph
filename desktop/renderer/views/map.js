import { markDirty } from '../app.js';
import { autoPlaceGrouped } from '../../../viewer/lib/layout.js';

const NODE_W = 160, NODE_H = 64;

export function renderMap(container, tab) {
  const { map, layout, root } = tab.data;
  const caps = Object.entries(map.capabilities || {})
    .map(([slug, c]) => ({ slug, name: c.name || slug, context: c.context, maturity: (c.derived && c.derived.maturity) || 'vision' }));
  const positions = autoPlaceGrouped(caps.map((c) => ({ slug: c.slug, context: c.context })), layout, {});

  container.innerHTML = '<div class="map-canvas"><div class="map-world"></div></div>';
  const world = container.querySelector('.map-world');

  for (const cap of caps) {
    const pos = positions[cap.slug] || { x: 40, y: 40 };
    const node = document.createElement('div');
    node.className = `map-node maturity-${cap.maturity}`;
    node.style.left = pos.x + 'px';
    node.style.top = pos.y + 'px';
    node.innerHTML = `<strong>${esc(cap.name)}</strong><span>${esc(cap.context || '')} · ${esc(cap.maturity)}</span>`;
    makeDraggable(node, cap.slug, positions, tab, world);
    world.appendChild(node);
  }
}

function makeDraggable(node, slug, positions, tab, world) {
  node.onpointerdown = (e) => {
    e.preventDefault();
    node.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    const orig = { ...(positions[slug] || { x: 0, y: 0 }) };
    const move = (ev) => {
      positions[slug] = { x: orig.x + (ev.clientX - start.x), y: orig.y + (ev.clientY - start.y) };
      node.style.left = positions[slug].x + 'px';
      node.style.top = positions[slug].y + 'px';
      markDirty(tab, true);
    };
    const up = async () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      tab.data.layout = positions;
      await window.karto.saveLayout(tab.data.root, positions);
      markDirty(tab, false);
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
  };
}

function esc(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
