import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSession, saveSession, addRecent } from '../desktop/main/session.js';

test('loadSession returns defaults when the file is absent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'karto-sess-'));
  assert.deepEqual(await loadSession(join(dir, 'nope.json')), { openRoots: [], recent: [] });
});

test('saveSession then loadSession round-trips', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'karto-sess-'));
  const file = join(dir, 'session.json');
  await saveSession(file, { openRoots: ['/a'], recent: ['/a'] });
  assert.deepEqual(await loadSession(file), { openRoots: ['/a'], recent: ['/a'] });
});

test('addRecent dedups, newest first, caps at 10', () => {
  let r = [];
  for (let i = 0; i < 12; i++) r = addRecent(r, `/p${i}`);
  assert.equal(r.length, 10);
  assert.equal(r[0], '/p11');
  r = addRecent(r, '/p5');
  assert.equal(r[0], '/p5');
  assert.equal(r.filter((x) => x === '/p5').length, 1);
});
