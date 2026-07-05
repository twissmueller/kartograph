import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const SCRIPT = fileURLToPath(new URL('../scripts/set-tracking.js', import.meta.url));
const ID = 'greet/hello.feature#"welcome"';
const TODAY = new Date().toISOString().slice(0, 10);

async function project() {
  const root = await mkdtemp(join(tmpdir(), 'karto-settrack-'));
  await mkdir(join(root, '.kartograph'), { recursive: true });
  await writeFile(join(root, '.kartograph', 'kartograph.json'), JSON.stringify({
    version: '1', meta: { name: 'X' },
    contexts: { core: { name: 'Core', definition: 'd' } },
    capabilities: { greet: { name: 'Greet', context: 'core', definition: 'd' } },
  }, null, 2) + '\n');
  const dir = join(root, 'features', 'core', 'greet');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'hello.feature'),
    'Feature: Hello\n\n  @happy\n  Scenario: welcome\n    Then greet\n');
  return root;
}

const readMap = async (root) => JSON.parse(await readFile(join(root, '.kartograph', 'kartograph.json'), 'utf8'));
const set = (root, ...args) => run(process.execPath, [SCRIPT, root, 'core', 'greet', 'hello.feature', 'welcome', ...args]);

test('open --reason --source build writes a scenarioNote (date = today) and no tracking key', async () => {
  const root = await project();
  await set(root, 'open', '--reason', 'ambiguous Then', '--source', 'build');
  const map = await readMap(root);
  assert.deepEqual(map.scenarioNotes[ID], { reason: 'ambiguous Then', date: TODAY, source: 'build' });
  assert.equal('tracking' in map, false, 'open removes the tracking key');
});

test('open --reason defaults source to walk', async () => {
  const root = await project();
  await set(root, 'open', '--reason', 'failed the walk');
  const map = await readMap(root);
  assert.equal(map.scenarioNotes[ID].source, 'walk');
});

test('advancing to developed clears an existing note', async () => {
  const root = await project();
  await set(root, 'open', '--reason', 'stuck', '--source', 'build');
  await set(root, 'developed');
  const map = await readMap(root);
  assert.equal('scenarioNotes' in map, false, 'note cleared on advance');
  assert.equal(map.tracking[ID], 'developed');
});

test('advancing to accepted clears an existing note', async () => {
  const root = await project();
  await set(root, 'open', '--reason', 'stuck');
  await set(root, 'accepted');
  const map = await readMap(root);
  assert.equal('scenarioNotes' in map, false);
  assert.equal(map.tracking[ID], 'accepted');
});

test('open without a reason writes no note', async () => {
  const root = await project();
  await set(root, 'open');
  const map = await readMap(root);
  assert.equal('scenarioNotes' in map, false);
});

test('an invalid --source is rejected with exit code 2', async () => {
  const root = await project();
  await assert.rejects(set(root, 'open', '--reason', 'x', '--source', 'chart'), (err) => {
    assert.equal(err.code, 2);
    return true;
  });
});
