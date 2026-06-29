import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBoard } from '../workflows/lib/board-data.js';

async function tmpProject(map, features = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'karto-board-'));
  await mkdir(join(dir, '.kartograph'), { recursive: true });
  await writeFile(join(dir, '.kartograph', 'kartograph.json'), JSON.stringify(map));
  for (const [rel, text] of Object.entries(features)) {
    const full = join(dir, 'features', rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, text);
  }
  return dir;
}

test('buildBoard stamps each scenario with its class and its tracked state from the map', async () => {
  const dir = await tmpProject(
    {
      contexts: { care: { name: 'Care', color: '#abc' } },
      capabilities: {
        'intake': { name: 'Intake', context: 'care' },
        'empty-cap': { name: 'Empty', context: 'care' },
      },
      tracking: { 'intake/sign-in.feature#"works"': 'accepted' },
    },
    {
      'care/intake/sign-in.feature':
        'Feature: Sign in\n@happy\nScenario: works\nGiven a user\nWhen they sign in\nThen ok\n',
    },
  );
  const board = await buildBoard(dir);
  assert.deepEqual(board.contexts, [{ context: 'care', name: 'Care', color: '#abc' }]);
  assert.equal(board.capabilities.length, 2);
  assert.equal(board.scenarios.length, 1);
  assert.deepEqual(board.scenarios[0], {
    capability: 'intake', capabilityName: 'Intake', context: 'care',
    feature: 'sign-in.feature', featureName: 'Sign in', name: 'works',
    class: 'happy', progress: 'accepted',
  });
});

test('buildBoard defaults an untracked scenario to open', async () => {
  const dir = await tmpProject(
    { contexts: { care: { name: 'Care' } }, capabilities: { intake: { name: 'Intake', context: 'care' } } },
    { 'care/intake/sign-in.feature': 'Feature: Sign in\n@happy\nScenario: works\nGiven a\nThen b\n' },
  );
  const board = await buildBoard(dir);
  assert.equal(board.scenarios[0].progress, 'open');
});

test('buildBoard tolerates a missing kartograph.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'karto-empty-'));
  const board = await buildBoard(dir);
  assert.deepEqual(board, { scenarios: [], capabilities: [], contexts: [] });
});
