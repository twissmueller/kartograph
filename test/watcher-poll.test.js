import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, utimes, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { watchProject } from '../desktop/main/watcher.js';

// Wait until predicate() is true or `ms` elapses; returns the final boolean.
async function until(predicate, ms = 1500, step = 25) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, step));
  }
  return predicate();
}

// The mtime-poll backstop must catch an external map change even when the OS file
// watcher delivers nothing. We force that condition with utimes (a metadata-only
// change that fs.watch recursive does not report on macOS), so a fired onChange
// proves the poll — not fs.watch — did the work.
test('watchProject poll backstop fires onChange when the map mtime changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'karto-watch-poll-'));
  await mkdir(join(root, '.kartograph'), { recursive: true });
  const map = join(root, '.kartograph', 'kartograph.json');
  await writeFile(map, JSON.stringify({ capabilities: {} }));

  let fired = 0;
  const w = watchProject(root, () => { fired++; }, { pollMs: 40 });
  try {
    // Let the poll capture the initial mtime before we change it.
    await new Promise((r) => setTimeout(r, 120));
    const before = fired; // tolerate an incidental fs.watch event from setup

    // Bump mtime only (no content write, no rename) — fs.watch stays silent; poll must catch it.
    const future = new Date(Date.now() + 10_000);
    await utimes(map, future, future);

    assert.ok(await until(() => fired > before), 'poll backstop should have fired onChange after mtime change');
  } finally {
    w.close();
    await rm(root, { recursive: true, force: true });
  }
});

// close() must stop the poll so it cannot fire afterwards.
test('watchProject close() stops the poll', async () => {
  const root = await mkdtemp(join(tmpdir(), 'karto-watch-close-'));
  await mkdir(join(root, '.kartograph'), { recursive: true });
  const map = join(root, '.kartograph', 'kartograph.json');
  await writeFile(map, JSON.stringify({ capabilities: {} }));

  let fired = 0;
  const w = watchProject(root, () => { fired++; }, { pollMs: 40 });
  await new Promise((r) => setTimeout(r, 120));
  w.close();
  const baseline = fired; // any event must have happened before close()

  const future = new Date(Date.now() + 10_000);
  await utimes(map, future, future);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(fired, baseline, 'no new onChange should fire after close()');

  await rm(root, { recursive: true, force: true });
});
