// Pure drift report between the existing map and a discovery-style `findings` object
// produced by analyzing the code (workflows/internal/sync.js). Additions are reported
// for the "+ " summary — the actual add is done by applyDiscovery; entries missing from
// the analysis are reported for the "flag" summary (never deleted). No fs, no mutation.
export function mapDrift(map, findings) {
  const caps = (map && map.capabilities) || {};
  const deps = (map && map.dependencies) || [];
  const f = findings || {};
  const candidates = f.capabilityCandidates || [];
  const fDeps = f.dependencies || [];

  // Capabilities the analysis surfaced at all: existing-and-still-present + new candidates.
  const seen = new Set([...(f.affectedCapabilities || []), ...candidates.map((c) => c.slug)]);
  const depKey = (d) => `${d.from} -> ${d.to}`;
  const haveDep = new Set(deps.map(depKey));
  const seenDep = new Set(fDeps.map(depKey));

  const newCapabilities = candidates.map((c) => c.slug).filter((s) => !caps[s]);
  const newDependencies = fDeps.filter((d) => !haveDep.has(depKey(d))).map((d) => ({ from: d.from, to: d.to }));
  const missingCapabilities = Object.keys(caps).filter((s) => !seen.has(s));
  const missingDependencies = deps.filter((d) => !seenDep.has(depKey(d))).map((d) => ({ from: d.from, to: d.to }));

  // Coded capabilities (surfaced by the analysis) that have no charted scenarios yet —
  // brand-new ones (not on the map) and existing ones whose scenarioCount is 0.
  const suggestExplore = [...seen].filter((s) => !caps[s] || (caps[s].derived?.scenarioCount ?? 0) === 0);

  return { newCapabilities, newDependencies, missingCapabilities, missingDependencies, suggestExplore };
}
