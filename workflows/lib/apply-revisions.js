import { scenarioId, capabilityOfScenarioId } from './ids.js';

// Pure map-side effects of a survey's `revisions` array (the retire/rename flow —
// see commands/karto-revise.md). Returns a NEW map; never mutates the input.
// Idempotent: retiring/renaming an already-applied target is a no-op. The .feature
// file edit for a retire-scenario, and the `git rm` for a retire-capability, are
// done separately by the chart command (they are IO, not map state).
//
// v1 scope: retire-scenario, retire-capability, rename-capability, rename-context.
// Non-goals (by design): slug renames, moving a capability between contexts,
// merging/splitting capabilities.
export function applyRevisions(map, revisions) {
  const next = structuredClone(map || {});
  for (const rev of revisions || []) {
    switch (rev.type) {
      case 'retire-scenario': retireScenario(next, rev); break;
      case 'retire-capability': retireCapability(next, rev); break;
      case 'rename-capability': renameCapability(next, rev); break;
      case 'rename-context': renameContext(next, rev); break;
      default: throw new Error(`unknown revision type: ${rev && rev.type}`);
    }
  }
  return next;
}

// Drop every tracking + scenarioNotes entry whose key matches `predicate`,
// removing the (now empty) blocks entirely — mirrors tracking.js / notes.js.
function dropEntries(map, predicate) {
  for (const block of ['tracking', 'scenarioNotes']) {
    if (!map[block]) continue;
    for (const id of Object.keys(map[block])) if (predicate(id)) delete map[block][id];
    if (!Object.keys(map[block]).length) delete map[block];
  }
}

function retireScenario(map, { capability, feature, scenario }) {
  const id = scenarioId(capability, feature, scenario);
  dropEntries(map, (key) => key === id);
}

function retireCapability(map, { capability }) {
  if (map.capabilities) delete map.capabilities[capability];
  if (Array.isArray(map.dependencies)) {
    map.dependencies = map.dependencies.filter((d) => d.from !== capability && d.to !== capability);
  }
  dropEntries(map, (key) => capabilityOfScenarioId(key) === capability);
}

function renameCapability(map, { capability, newName }) {
  if (map.capabilities && map.capabilities[capability]) map.capabilities[capability].name = newName;
}

function renameContext(map, { context, newName }) {
  if (map.contexts && map.contexts[context]) map.contexts[context].name = newName;
}
