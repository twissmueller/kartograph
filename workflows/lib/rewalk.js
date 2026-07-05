// Re-walk candidates after a build. Building a capability C can silently break
// behaviour in the capabilities that DEPEND ON C, so those dependents' already
// Accepted scenarios should be re-walked to confirm they still hold.
//
// Dependency edges are { from, to } = "from depends on to" (see the map schema),
// so the direct dependents of a just-built capability C are the `from` of every
// edge whose `to === C`. A candidate is any ACCEPTED scenario belonging to one of
// those dependents — an Accepted scenario is the only kind whose confirmation C's
// change could invalidate. Pure — never mutates its inputs.
//
// v1 is DIRECT dependents only: transitive dependency chains are intentionally NOT
// followed (a dependent of a dependent is out of scope).

import { capabilityOfScenarioId } from './ids.js';

// Given the map and the slug of a capability that was just (re)built, return the
// scenarios that may now need re-walking as a deterministic, deduplicated list of
// { capability, scenarioId }, sorted by capability then scenarioId.
export function rewalkCandidates(map, builtCapability) {
  if (!map || !builtCapability) return [];
  const deps = Array.isArray(map.dependencies) ? map.dependencies : [];
  const dependents = new Set();
  for (const e of deps) {
    if (e && e.to === builtCapability && e.from) dependents.add(e.from);
  }
  if (!dependents.size) return [];
  const tracking = (map && map.tracking) || {};
  const out = [];
  for (const [id, state] of Object.entries(tracking)) {
    if (state !== 'accepted') continue;
    const capability = capabilityOfScenarioId(id);
    if (dependents.has(capability)) out.push({ capability, scenarioId: id });
  }
  out.sort(
    (a, b) =>
      a.capability.localeCompare(b.capability) || a.scenarioId.localeCompare(b.scenarioId),
  );
  return out;
}
