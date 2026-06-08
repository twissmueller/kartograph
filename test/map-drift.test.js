import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapDrift } from '../workflows/lib/map-drift.js';

// A map with one charted capability (has scenarios) and one dependency.
const map = {
  capabilities: {
    'plant-catalog': { name: 'Plant catalog', context: 'plants', definition: 'd', derived: { maturity: 'building', featureCount: 1, scenarioCount: 3 } },
    'legacy-sync': { name: 'Legacy sync', context: 'plants', definition: 'd', derived: { maturity: 'vision', featureCount: 0, scenarioCount: 0 } },
  },
  dependencies: [{ from: 'legacy-sync', to: 'plant-catalog' }],
};

// Findings from analyzing the code: a NEW capability, a NEW dependency, and
// plant-catalog still present; legacy-sync is NOT surfaced (gone from code).
const findings = {
  affectedCapabilities: ['plant-catalog'],
  capabilityCandidates: [{ slug: 'billing-export', name: 'Billing export', context: 'billing', definition: 'd' }],
  dependencies: [{ from: 'billing-export', to: 'plant-catalog' }],
};

test('reports new capabilities found in code but absent from the map', () => {
  assert.deepEqual(mapDrift(map, findings).newCapabilities, ['billing-export']);
});

test('reports new dependencies found in code but absent from the map', () => {
  assert.deepEqual(mapDrift(map, findings).newDependencies, [{ from: 'billing-export', to: 'plant-catalog' }]);
});

test('flags capabilities in the map but not surfaced by the analysis', () => {
  assert.deepEqual(mapDrift(map, findings).missingCapabilities, ['legacy-sync']);
});

test('flags dependencies in the map but not surfaced by the analysis', () => {
  assert.deepEqual(mapDrift(map, findings).missingDependencies, [{ from: 'legacy-sync', to: 'plant-catalog' }]);
});

test('suggests exploring coded capabilities with no charted scenarios (incl. brand-new)', () => {
  const r = mapDrift(map, findings);
  // billing-export is brand new (no scenarios); plant-catalog has scenarios so is NOT suggested
  assert.ok(r.suggestExplore.includes('billing-export'));
  assert.ok(!r.suggestExplore.includes('plant-catalog'));
});

test('a map that matches the analysis exactly produces no drift', () => {
  const m = {
    capabilities: { a: { name: 'A', context: 'c', definition: 'd', derived: { maturity: 'building', featureCount: 1, scenarioCount: 2 } } },
    dependencies: [],
  };
  const f = { affectedCapabilities: ['a'], capabilityCandidates: [], dependencies: [] };
  assert.deepEqual(mapDrift(m, f), {
    newCapabilities: [], newDependencies: [], missingCapabilities: [], missingDependencies: [], suggestExplore: [],
  });
});
