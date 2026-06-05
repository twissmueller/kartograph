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

test('POST /layout writes kartograph.layout.json to the project root', async () => {
  const projectRoot = await tmpProject();
  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'start-here': { x: 5, y: 9 } }),
    });
    assert.equal(res.status, 200);
    const saved = JSON.parse(await readFile(join(projectRoot, 'kartograph.layout.json'), 'utf8'));
    assert.deepEqual(saved['start-here'], { x: 5, y: 9 });
  } finally {
    server.close();
  }
});

test('a file change pushes a "changed" SSE event', async () => {
  const projectRoot = await tmpProject();
  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const controller = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/events`, { signal: controller.signal });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    setTimeout(() => writeFile(join(projectRoot, 'kartograph.json'), JSON.stringify({ version: '1', meta: { name: 'T2' } })), 150);

    let received = '';
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
      if (received.includes('data: changed')) break;
    }
    controller.abort();
    assert.ok(received.includes('data: changed'), `no change event; got: ${received}`);
  } finally {
    server.close();
  }
});
