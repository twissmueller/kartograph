import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBoard } from '../workflows/lib/board-data.js';

async function tmpProject(map, features = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'karto-board-'));
  await writeFile(join(dir, 'kartograph.json'), JSON.stringify(map));
  for (const [rel, text] of Object.entries(features)) {
    const full = join(dir, 'features', rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, text);
  }
  return dir;
}

test('buildBoard returns contexts, every capability, and tagged scenarios', async () => {
  const dir = await tmpProject(
    {
      contexts: { care: { name: 'Care', color: '#abc' } },
      capabilities: {
        'intake': { name: 'Intake', context: 'care' },
        'empty-cap': { name: 'Empty', context: 'care' },
      },
    },
    {
      'care/intake/sign-in.feature':
        'Feature: Sign in\n@happy @done\nScenario: works\nGiven a user\nWhen they sign in\nThen ok\n',
    },
  );
  const board = await buildBoard(dir);
  assert.deepEqual(board.contexts, [{ context: 'care', name: 'Care', color: '#abc' }]);
  assert.equal(board.capabilities.length, 2);
  assert.equal(board.scenarios.length, 1);
  assert.deepEqual(board.scenarios[0], {
    capability: 'intake', capabilityName: 'Intake', context: 'care',
    feature: 'sign-in.feature', featureName: 'Sign in', name: 'works',
    class: 'happy', progress: 'done',
  });
});

test('buildBoard tolerates a missing kartograph.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'karto-empty-'));
  const board = await buildBoard(dir);
  assert.deepEqual(board, { scenarios: [], capabilities: [], contexts: [] });
});
