import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isSlug, isFeatureName, readCapabilityFeatures, listFeatureTree } from '../workflows/lib/feature-read.js';

async function tmpProject(map, features = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'karto-feat-'));
  await mkdir(join(dir, '.kartograph'), { recursive: true });
  await writeFile(join(dir, '.kartograph', 'kartograph.json'), JSON.stringify(map));
  for (const [rel, text] of Object.entries(features)) {
    const full = join(dir, 'features', rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, text);
  }
  return dir;
}

test('validators accept slugs/feature names and reject traversal', () => {
  assert.equal(isSlug('care-intake'), true);
  assert.equal(isSlug('../etc'), false);
  assert.equal(isFeatureName('sign-in.feature'), true);
  assert.equal(isFeatureName('sign-in.txt'), false);
});

test('readCapabilityFeatures parses each .feature into scenarios', async () => {
  const dir = await tmpProject({}, {
    'care/intake/sign-in.feature':
      'Feature: Sign in\nA short note.\n@happy\nScenario: works\nGiven a user\nThen ok\n',
  });
  const { files } = await readCapabilityFeatures(dir, 'care', 'intake');
  assert.equal(files.length, 1);
  assert.equal(files[0].file, 'sign-in.feature');
  assert.equal(files[0].feature, 'Sign in');
  assert.equal(files[0].scenarios[0].class, 'happy');
  assert.deepEqual(files[0].scenarios[0].steps, ['Given a user', 'Then ok']);
});

test('readCapabilityFeatures stamps each scenario with its tracked state from the map', async () => {
  const dir = await tmpProject(
    { tracking: { 'intake/sign-in.feature#"works"': 'developed' } },
    { 'care/intake/sign-in.feature': 'Feature: Sign in\n@happy\nScenario: works\nGiven a user\nThen ok\nScenario: other\nGiven x\nThen y\n' },
  );
  const { files } = await readCapabilityFeatures(dir, 'care', 'intake');
  assert.equal(files[0].scenarios[0].progress, 'developed');
  assert.equal(files[0].scenarios[1].progress, 'open', 'untracked scenario defaults to open');
});

test('listFeatureTree groups files by context then capability', async () => {
  const dir = await tmpProject(
    { contexts: { care: { name: 'Care' } }, capabilities: { intake: { name: 'Intake', context: 'care' } } },
    { 'care/intake/sign-in.feature': 'Feature: Sign in\n' },
  );
  const tree = await listFeatureTree(dir);
  assert.equal(tree.contexts[0].context, 'care');
  assert.equal(tree.contexts[0].name, 'Care');
  assert.equal(tree.contexts[0].capabilities[0].capability, 'intake');
  assert.deepEqual(tree.contexts[0].capabilities[0].files, ['sign-in.feature']);
});
