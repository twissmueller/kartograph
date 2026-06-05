import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../server/serve.js';

async function tmpProject() {
  const dir = await mkdtemp(join(tmpdir(), 'karto-'));
  await writeFile(join(dir, 'kartograph.json'), JSON.stringify({ version: '1', meta: { name: 'T' } }));
  return dir;
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
}

test('serves kartograph.json from the project root', async () => {
  const projectRoot = await tmpProject();
  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/kartograph.json`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.meta.name, 'T');
  } finally {
    server.close();
  }
});
