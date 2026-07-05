// Pure helper for the desktop acceptance tree. No DOM access — unit-tested in
// test/board.test.js; the DOM wiring lives in the desktop renderer
// (desktop/renderer/views/tracking.js, the sole consumer).

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
    const accepted = scen.filter((s) => s.progress === 'accepted').length;
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
          accepted: f.scenarios.filter((s) => s.progress === 'accepted').length,
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
