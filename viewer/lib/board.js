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

// Group the flat board `scenarios` into an ordered acceptance tree for the desktop board:
// context -> capability -> feature -> scenarios, with per-node counts and a derived status.
//   status: 'done'      — >=1 scenario and every scenario is 'done' (Accepted)
//           'untouched' — no scenarios, or every scenario is 'open'
//           'progress'  — otherwise
// `contexts` = [{ context, name, color }] and `capabilities` = [{ capability, capabilityName,
// context }] come straight from the board payload; iterating `capabilities` means empty
// capabilities (no scenarios) still appear. Pure — no DOM.
export function buildAcceptanceTree(scenarios, { contexts = [], capabilities = [] } = {}) {
  const statusOf = (scen) => {
    if (!scen.length) return 'untouched';
    const accepted = scen.filter((s) => s.progress === 'done').length;
    if (accepted === scen.length) return 'done';
    return scen.some((s) => s.progress && s.progress !== 'open') ? 'progress' : 'untouched';
  };

  // capability -> feature(filename) -> { feature, featureName, scenarios } (order preserved)
  const byCap = new Map();
  for (const s of scenarios || []) {
    if (!byCap.has(s.capability)) byCap.set(s.capability, new Map());
    const feats = byCap.get(s.capability);
    if (!feats.has(s.feature)) feats.set(s.feature, { feature: s.feature, featureName: s.featureName || s.feature, scenarios: [] });
    feats.get(s.feature).scenarios.push({ name: s.name, class: s.class, progress: s.progress || 'open' });
  }

  const ctxMeta = Object.fromEntries((contexts || []).map((c) => [c.context, c]));

  // capabilities grouped by context, preserving the capabilities-list order
  const capsByCtx = new Map();
  for (const cap of capabilities || []) {
    const key = cap.context ?? '';
    if (!capsByCtx.has(key)) capsByCtx.set(key, []);
    capsByCtx.get(key).push(cap);
  }
  const ctxOrder = [...new Set([...(contexts || []).map((c) => c.context), ...capsByCtx.keys()])]
    .filter((k) => capsByCtx.has(k));

  const outContexts = ctxOrder.map((ctxKey) => {
    const caps = capsByCtx.get(ctxKey).map((cap) => {
      const featMap = byCap.get(cap.capability) || new Map();
      const features = [...featMap.values()]
        .sort((a, b) => a.feature.localeCompare(b.feature))
        .map((f) => ({
          feature: f.feature,
          featureName: f.featureName,
          scenarios: f.scenarios,
          total: f.scenarios.length,
          accepted: f.scenarios.filter((s) => s.progress === 'done').length,
          status: statusOf(f.scenarios),
        }));
      const capScen = features.flatMap((f) => f.scenarios);
      return {
        capability: cap.capability,
        name: cap.capabilityName || cap.capability,
        features,
        total: features.length,
        doneCount: features.filter((f) => f.status === 'done').length,
        status: statusOf(capScen),
      };
    });
    const ctxScen = caps.flatMap((c) => c.features.flatMap((f) => f.scenarios));
    return {
      context: ctxKey,
      name: ctxMeta[ctxKey]?.name || ctxKey || 'Other',
      color: ctxMeta[ctxKey]?.color,
      capabilities: caps,
      total: caps.length,
      doneCount: caps.filter((c) => c.status === 'done').length,
      status: statusOf(ctxScen),
    };
  });

  return { contexts: outContexts };
}
