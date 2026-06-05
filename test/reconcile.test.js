import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileMap } from '../scripts/reconcile.js';

const map = {
  version: '1', meta: { name: 'X' },
  contexts: { care: { name: 'Care', definition: 'd' } },
  capabilities: {
    'watering-schedule': { name: 'W', context: 'care', definition: 'd', declaredStage: null, derived: { maturity: 'vision', featureCount: 0, scenarioCount: 0 } },
    'task-reminders': { name: 'T', context: 'care', definition: 'd', declaredStage: 'vision', derived: { maturity: 'vision', featureCount: 0, scenarioCount: 0 } },
  },
};

test('reconcileMap recomputes derived blocks from features', () => {
  const featuresByCapability = {
    'watering-schedule': [
      { scenarios: [{ tags: ['@happy'] }, { tags: ['@edge'] }] },
    ],
  };
  const out = reconcileMap(map, featuresByCapability);
  assert.deepEqual(out.capabilities['watering-schedule'].derived, { maturity: 'usable', featureCount: 1, scenarioCount: 2 });
  // capability with no features stays vision
  assert.equal(out.capabilities['task-reminders'].derived.maturity, 'vision');
});

test('reconcileMap does not mutate its input', () => {
  const before = JSON.stringify(map);
  reconcileMap(map, {});
  assert.equal(JSON.stringify(map), before);
});
