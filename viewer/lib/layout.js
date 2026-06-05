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
  return { ...placed, ...existingLayout };
}
