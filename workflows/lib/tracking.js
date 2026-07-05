// Scenario tracking state, stored in kartograph.json under a top-level `tracking`
// object keyed by the canonical scenario ID (see workflows/lib/ids.js scenarioId:
// `<capability>/<feature.feature>#"<scenarioName>"`). An absent key means the
// default 'open'. These are PURE helpers — callers build the ID and persist the map.
//
// Tracking state is deliberately separate from a scenario's path tag
// (@happy/@edge/@error, which lives in the .feature file and drives maturity):
// progress is human bookkeeping, not coverage, so it lives in the map, not the tags.

export const STATES = ['open', 'developed', 'accepted'];
export const DEFAULT_STATE = 'open';
export const STATE_LABELS = { open: 'Open', developed: 'Developed', accepted: 'Accepted' };

export function isState(s) { return STATES.includes(s); }

// State of a scenario by its full ID; missing/garbled tracking -> 'open'.
export function getScenarioState(map, id) {
  const t = (map && map.tracking) || {};
  return t[id] || DEFAULT_STATE;
}

// Return a NEW map with the scenario's state set. Setting the default ('open')
// REMOVES the key (and drops `tracking` entirely once empty) so the map stays tidy.
// Pure — never mutates `map`.
export function setScenarioState(map, id, state) {
  if (!isState(state)) throw new Error(`invalid state: ${state}`);
  const next = structuredClone(map || {});
  const tracking = { ...(next.tracking || {}) };
  if (state === DEFAULT_STATE) delete tracking[id];
  else tracking[id] = state;
  if (Object.keys(tracking).length) next.tracking = tracking;
  else delete next.tracking;
  return next;
}
