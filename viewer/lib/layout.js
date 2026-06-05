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

// Cluster nodes by context: each context gets its own region on a grid, and its
// nodes are placed in a small circle inside that region. Same determinism rules
// as autoPlace (no Math.random) and existing positions always win, so dragging
// is never overridden. nodes = [{ slug, context }].
export function autoPlaceGrouped(nodes, existingLayout = {}, opts = {}) {
  const { width = 1200, height = 800, pad = 80 } = opts;
  const groups = [];
  const byCtx = new Map();
  for (const n of nodes) {
    if (!byCtx.has(n.context)) { byCtx.set(n.context, []); groups.push(n.context); }
    byCtx.get(n.context).push(n.slug);
  }
  const cols = Math.max(1, Math.ceil(Math.sqrt(groups.length)));
  const rows = Math.max(1, Math.ceil(groups.length / cols));
  const cellW = (width - 2 * pad) / cols;
  const cellH = (height - 2 * pad) / rows;
  const placed = {};
  groups.forEach((ctx, ci) => {
    const cx = pad + (ci % cols) * cellW + cellW / 2;
    const cy = pad + Math.floor(ci / cols) * cellH + cellH / 2;
    const slugs = byCtx.get(ctx);
    const r = Math.max(0, Math.min(cellW, cellH) / 2 - pad / 2);
    slugs.forEach((slug, i) => {
      if (existingLayout[slug]) return; // keep saved/dragged positions
      const angle = (2 * Math.PI * i) / Math.max(slugs.length, 1);
      const single = slugs.length === 1;
      placed[slug] = {
        x: Math.round(single ? cx : cx + r * Math.cos(angle)),
        y: Math.round(single ? cy : cy + r * Math.sin(angle)),
      };
    });
  });
  return { ...existingLayout, ...placed };
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
