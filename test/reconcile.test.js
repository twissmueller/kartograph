import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reconcileMap, readFeaturesByCapability } from '../scripts/reconcile.js';

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

test('readFeaturesByCapability globs features/<context>/<slug>/*.feature and feeds reconcile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'karto-recon-'));
  const dir = join(root, 'features', 'care', 'watering-schedule');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'water.feature'),
    '@watering\nFeature: Watering\n\n  @happy\n  Scenario: due today\n    Then remind\n\n  @edge\n  Scenario: already watered\n    Then stay silent\n\n  @error\n  Scenario: sensor offline\n    Then warn\n');
  const featuresByCapability = await readFeaturesByCapability(root, map);
  assert.equal(featuresByCapability['watering-schedule'].length, 1);
  const out = reconcileMap(map, featuresByCapability);
  // full coverage (@happy + @edge + @error) -> stable
  assert.equal(out.capabilities['watering-schedule'].derived.maturity, 'stable');
  assert.equal(out.capabilities['watering-schedule'].derived.scenarioCount, 3);
});
