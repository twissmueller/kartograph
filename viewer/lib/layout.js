// Deterministic circular auto-placement for nodes without a saved position.
// No Math.random — same input always yields the same output.
export function autoPlace(slugs, existingLayout = {}, opts = {}) {
  const { width = 1200, height = 800, radius = 300 } = opts;
  const cx = opts.cx ?? width / 2;
  const cy = opts.cy ?? height / 2;
  const missing = slugs.filter((s) => !existingLayout[s]);
  const placed = {};
  missing.forEach((slug, i) => {
    const angle = (2 * Math.PI * i) / Math.max(missing.length, 1);
    placed[slug] = {
      x: Math.round(cx + radius * Math.cos(angle)),
      y: Math.round(cy + radius * Math.sin(angle)),
    };
  });
  // existingLayout first so computed positions win for entries that were
  // filtered in as "missing" (e.g. a null/invalid saved entry).
  return { ...existingLayout, ...placed };
}

// Cluster nodes by context: capabilities are laid out in a GRID inside each
// context, the context's box size follows from that grid, and the boxes are
// shelf-packed left-to-right so they never overlap on a fresh map. Same
// determinism rules as autoPlace (no Math.random) and existing positions always
// win, so dragging is never overridden. nodes = [{ slug, context }].
//
// Cell/padding sizes are nominal (the lib has no DOM): generous enough that real
// rendered cards stay inside their cells. Live collision while dragging
// (separateBoxes) handles the interactive case.
const CELL_W = 240, CELL_H = 76;          // nominal capability cell (incl. spacing)
const BOX_PADX = 28, BOX_PADTOP = 44, BOX_PADBOT = 28; // inside-box padding (label on top)
const BOX_GAP = 40;                        // gap between packed boxes

export function autoPlaceGrouped(nodes, existingLayout = {}, opts = {}) {
  const { width = 1200, pad = 60 } = opts;
  const order = [];
  const byCtx = new Map();
  for (const n of nodes) {
    if (!byCtx.has(n.context)) { byCtx.set(n.context, []); order.push(n.context); }
    byCtx.get(n.context).push(n.slug);
  }
  // Box geometry per context, from a near-square grid of its capabilities.
  const geom = new Map();
  for (const ctx of order) {
    const slugs = byCtx.get(ctx);
    const cols = Math.max(1, Math.ceil(Math.sqrt(slugs.length)));
    const rows = Math.max(1, Math.ceil(slugs.length / cols));
    geom.set(ctx, {
      slugs, cols,
      boxW: cols * CELL_W + 2 * BOX_PADX,
      boxH: rows * CELL_H + BOX_PADTOP + BOX_PADBOT,
    });
  }
  // Shelf-pack the boxes: fill a row left-to-right, wrap when the next box would
  // exceed the available width (but always keep at least one box per row).
  const availW = Math.max(width - 2 * pad, CELL_W);
  let cx = pad, cy = pad, rowH = 0;
  const origin = new Map();
  for (const ctx of order) {
    const { boxW, boxH } = geom.get(ctx);
    if (cx > pad && cx + boxW > pad + availW) { cx = pad; cy += rowH + BOX_GAP; rowH = 0; }
    origin.set(ctx, { x: cx, y: cy });
    cx += boxW + BOX_GAP;
    rowH = Math.max(rowH, boxH);
  }
  // Place each capability in its grid cell relative to its box origin.
  const placed = {};
  for (const ctx of order) {
    const { slugs, cols } = geom.get(ctx);
    const o = origin.get(ctx);
    slugs.forEach((slug, i) => {
      if (existingLayout[slug]) return; // keep saved/dragged positions
      const col = i % cols, row = Math.floor(i / cols);
      placed[slug] = {
        x: Math.round(o.x + BOX_PADX + col * CELL_W + CELL_W / 2),
        y: Math.round(o.y + BOX_PADTOP + row * CELL_H + CELL_H / 2),
      };
    });
  }
  return { ...existingLayout, ...placed };
}

// Resolve overlaps between context boxes by pushing them apart along the axis of
// least penetration. Pure: takes { [ctx]: {x,y,w,h} }, returns { [ctx]: {dx,dy} }
// translations to apply. `fixed` (a ctx key) is pinned in place — used while
// dragging so only the OTHER boxes move out of the way. Iterates so chained
// pile-ups separate too. Deterministic (no randomness).
export function separateBoxes(boxes, opts = {}) {
  const { fixed = null, gap = 0, iterations = 8 } = opts;
  const keys = Object.keys(boxes);
  const b = {};
  for (const k of keys) b[k] = { ...boxes[k] };
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const A = b[keys[i]], B = b[keys[j]];
        const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x) + gap;
        const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y) + gap;
        if (ox <= 0 || oy <= 0) continue; // not overlapping (incl. gap)
        const aFix = keys[i] === fixed, bFix = keys[j] === fixed;
        if (aFix && bFix) continue;
        moved = true;
        let px = 0, py = 0;
        if (ox < oy) px = ox * ((A.x + A.w / 2) <= (B.x + B.w / 2) ? 1 : -1);
        else py = oy * ((A.y + A.h / 2) <= (B.y + B.h / 2) ? 1 : -1);
        if (aFix) { B.x += px; B.y += py; }
        else if (bFix) { A.x -= px; A.y -= py; }
        else { A.x -= px / 2; A.y -= py / 2; B.x += px / 2; B.y += py / 2; }
      }
    }
    if (!moved) break;
  }
  const delta = {};
  for (const k of keys) delta[k] = { dx: b[k].x - boxes[k].x, dy: b[k].y - boxes[k].y };
  return delta;
}

// Derive a padded bounding box per context from rendered node rects.
// Each item is { context, x, y, w, h } where x,y is the node CENTRE (the viewer
// positions nodes with translate(-50%, -50%)). Returns { [context]: {x,y,w,h} }.
export function boundsForGroups(items, pad = 24) {
  const acc = new Map();
  for (const it of items) {
    const b = acc.get(it.context) ?? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    b.minX = Math.min(b.minX, it.x - it.w / 2);
    b.minY = Math.min(b.minY, it.y - it.h / 2);
    b.maxX = Math.max(b.maxX, it.x + it.w / 2);
    b.maxY = Math.max(b.maxY, it.y + it.h / 2);
    acc.set(it.context, b);
  }
  const out = {};
  for (const [ctx, b] of acc) {
    out[ctx] = { x: b.minX - pad, y: b.minY - pad, w: (b.maxX - b.minX) + 2 * pad, h: (b.maxY - b.minY) + 2 * pad };
  }
  return out;
}
