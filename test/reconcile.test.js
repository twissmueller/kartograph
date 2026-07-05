import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reconcileMap, readFeaturesByCapability, reconcileDiff } from '../scripts/reconcile.js';

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

test('reconcileDiff is empty when stored derived blocks already match the features', () => {
  // watering-schedule stored as usable (1 feature, 2 scenarios @happy+@edge); feed the same.
  const consistent = {
    ...map,
    capabilities: {
      'watering-schedule': { name: 'W', context: 'care', definition: 'd', declaredStage: null, derived: { maturity: 'usable', featureCount: 1, scenarioCount: 2 } },
      'task-reminders': { name: 'T', context: 'care', definition: 'd', declaredStage: 'vision', derived: { maturity: 'vision', featureCount: 0, scenarioCount: 0 } },
    },
  };
  const featuresByCapability = {
    'watering-schedule': [{ scenarios: [{ tags: ['@happy'] }, { tags: ['@edge'] }] }],
  };
  assert.deepEqual(reconcileDiff(consistent, featuresByCapability), []);
});

test('reconcileDiff reports stale maturity and counts against recomputed values', () => {
  // stored says vision/0/0, but the features imply usable/1/2
  const featuresByCapability = {
    'watering-schedule': [{ scenarios: [{ tags: ['@happy'] }, { tags: ['@edge'] }] }],
  };
  const diffs = reconcileDiff(map, featuresByCapability);
  assert.ok(diffs.some((d) => /watering-schedule.*maturity.*vision.*usable/.test(d)), diffs.join('\n'));
  assert.ok(diffs.some((d) => /watering-schedule.*scenarioCount.*'0'.*'2'/.test(d)), diffs.join('\n'));
  // task-reminders genuinely has no features -> no drift for it
  assert.ok(!diffs.some((d) => /task-reminders/.test(d)));
});

test('dependencyFeatureWarnings flags a referenced feature missing from the from capability', async () => {
  const { dependencyFeatureWarnings } = await import('../scripts/reconcile.js');
  const m = {
    dependencies: [
      { from: 'a', to: 'b', features: ['present.feature', 'gone.feature'] },
      { from: 'a', to: 'c' },
    ],
  };
  const names = { a: ['present.feature'] };
  const warnings = dependencyFeatureWarnings(m, names);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /gone\.feature/);
});

test('dependencyFeatureWarnings is silent when every referenced feature exists', async () => {
  const { dependencyFeatureWarnings } = await import('../scripts/reconcile.js');
  const m = { dependencies: [{ from: 'a', to: 'b', features: ['x.feature'] }] };
  assert.deepEqual(dependencyFeatureWarnings(m, { a: ['x.feature', 'y.feature'] }), []);
});
