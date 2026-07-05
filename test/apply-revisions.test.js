import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRevisions } from '../workflows/lib/apply-revisions.js';

function baseMap() {
  return {
    version: '1', meta: { name: 'X' },
    contexts: { care: { name: 'Care', definition: 'd' }, ops: { name: 'Ops', definition: 'd' } },
    capabilities: {
      watering: { name: 'Watering', context: 'care', definition: 'd', derived: { maturity: 'vision', featureCount: 0, scenarioCount: 0 } },
      reporting: { name: 'Reporting', context: 'ops', definition: 'd', derived: { maturity: 'vision', featureCount: 0, scenarioCount: 0 } },
    },
    dependencies: [{ from: 'reporting', to: 'watering' }, { from: 'watering', to: 'reporting' }],
    tracking: { 'watering/water.feature#"A"': 'developed', 'reporting/r.feature#"B"': 'accepted' },
    scenarioNotes: { 'watering/water.feature#"A"': { reason: 'x', date: '2026-07-05', source: 'walk' } },
  };
}

test('retire-scenario drops only that scenario\'s tracking and note', () => {
  const map = baseMap();
  const next = applyRevisions(map, [
    { type: 'retire-scenario', capability: 'watering', feature: 'water.feature', scenario: 'A', reason: 'obsolete' },
  ]);
  assert.equal('watering/water.feature#"A"' in next.tracking, false);
  assert.equal(next.tracking['reporting/r.feature#"B"'], 'accepted');
  assert.equal('scenarioNotes' in next, false, 'the only note is removed, so the block is dropped');
  assert.ok(next.capabilities.watering, 'capability itself is untouched');
});

test('retire-capability deletes the cap, its edges (both directions), and its tracking/notes', () => {
  const map = baseMap();
  const next = applyRevisions(map, [{ type: 'retire-capability', capability: 'watering', reason: 'merged away' }]);
  assert.equal('watering' in next.capabilities, false);
  assert.deepEqual(next.dependencies, [], 'every edge touching watering is dropped');
  assert.equal('watering/water.feature#"A"' in next.tracking, false);
  assert.equal(next.tracking['reporting/r.feature#"B"'], 'accepted', 'unrelated tracking survives');
  assert.equal('scenarioNotes' in next, false);
  assert.ok(next.contexts.care, 'the (now empty) context is left in place');
});

test('rename-capability changes only the display name', () => {
  const map = baseMap();
  const next = applyRevisions(map, [{ type: 'rename-capability', capability: 'watering', newName: 'Irrigation', reason: 'clearer term' }]);
  assert.equal(next.capabilities.watering.name, 'Irrigation');
  assert.equal(next.capabilities.watering.context, 'care', 'context unchanged');
});

test('rename-context changes only the context display name', () => {
  const map = baseMap();
  const next = applyRevisions(map, [{ type: 'rename-context', context: 'care', newName: 'Plant Care', reason: 'clearer term' }]);
  assert.equal(next.contexts.care.name, 'Plant Care');
});

test('applyRevisions is pure (input untouched) and idempotent', () => {
  const map = baseMap();
  const snapshot = structuredClone(map);
  const revs = [{ type: 'retire-capability', capability: 'watering', reason: 'r' }];
  const once = applyRevisions(map, revs);
  const twice = applyRevisions(once, revs);
  assert.deepEqual(map, snapshot, 'input map not mutated');
  assert.deepEqual(twice, once, 'applying again changes nothing');
});

test('unknown revision type throws', () => {
  assert.throws(() => applyRevisions(baseMap(), [{ type: 'split-capability' }]), /unknown revision type/);
});

test('retiring an absent target is a harmless no-op', () => {
  const map = baseMap();
  const next = applyRevisions(map, [
    { type: 'retire-scenario', capability: 'ghost', feature: 'g.feature', scenario: 'Z', reason: 'r' },
    { type: 'retire-capability', capability: 'ghost', reason: 'r' },
    { type: 'rename-capability', capability: 'ghost', newName: 'G', reason: 'r' },
    { type: 'rename-context', context: 'ghost', newName: 'G', reason: 'r' },
  ]);
  assert.deepEqual(next.capabilities, map.capabilities);
  assert.deepEqual(next.dependencies, map.dependencies);
});
