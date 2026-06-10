// Pure helpers for the scenario board. No DOM access — unit-tested in test/board.test.js;
// the DOM wiring lives in viewer/lib/board-view.js.

// The four progress columns, in display order.
export const BOARD_COLUMNS = ['open', 'wip', 'test', 'done'];

// Group scenarios into ordered columns keyed by their `progress` field (provided by the
// server's GET /board). An unknown or missing progress falls into 'open'.
export function boardColumns(scenarios) {
  const cols = Object.fromEntries(BOARD_COLUMNS.map((c) => [c, []]));
  for (const s of scenarios || []) {
    (cols[s.progress] || cols.open).push(s);
  }
  return cols;
}

// Per-capability completion status from scenarios, as a slug -> status map:
//   'green'  — every scenario is done
//   'yellow' — some scenarios are done, but not all
//   'red'    — no scenario is done (including capabilities with no scenarios at all)
// `allCapabilities` is the full list of capability slugs so that ones with zero scenarios
// are reported (as red).
export function capabilityStatuses(scenarios, allCapabilities) {
  const tally = {};
  for (const slug of allCapabilities || []) tally[slug] = { total: 0, done: 0 };
  for (const s of scenarios || []) {
    const t = (tally[s.capability] ||= { total: 0, done: 0 });
    t.total += 1;
    if (s.progress === 'done') t.done += 1;
  }
  const out = {};
  for (const [slug, { total, done }] of Object.entries(tally)) {
    out[slug] = total > 0 && done === total ? 'green' : done > 0 ? 'yellow' : 'red';
  }
  return out;
}

// Group capabilities by their context for the board's filter bar. Contexts are ordered by the
// given `contexts` list ([{ context, name, color }]); capabilities keep their order within a
// context. A capability whose context is not in the list is grouped last under its own slug.
// Returns [{ context, name, color, capabilities: [...] }].
export function groupByContext(capabilities, contexts) {
  const meta = Object.fromEntries((contexts || []).map((c) => [c.context, c]));
  const byCtx = new Map();
  for (const cap of capabilities || []) {
    const key = cap.context ?? '';
    if (!byCtx.has(key)) byCtx.set(key, []);
    byCtx.get(key).push(cap);
  }
  const order = [...new Set([...(contexts || []).map((c) => c.context), ...byCtx.keys()])];
  return order.filter((key) => byCtx.has(key)).map((key) => ({
    context: key,
    name: meta[key]?.name || key || 'Other',
    color: meta[key]?.color,
    capabilities: byCtx.get(key),
  }));
}
