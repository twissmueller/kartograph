import { getScenarioState } from './tracking.js';
import { scenarioId } from './ids.js';

// A scenario is "open" (still to build) until its tracked state in the map is 'accepted'.
// `features` = [{ feature: <filename>, scenarios: [{ name, ... }] }], `map` carries the
// `tracking` block, and `capability` is the slug those features belong to (needed to build
// each scenario's canonical ID for the tracking lookup).
export function openScenarios(features, map, capability) {
  const open = [];
  for (const f of features || []) for (const s of f.scenarios || []) {
    if (getScenarioState(map, scenarioId(capability, f.feature, s.name)) !== 'accepted') {
      open.push({ feature: f.feature, ...s });
    }
  }
  return open;
}
