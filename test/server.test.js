import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
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

test('GET /features/<context>/<slug> returns parsed features', async () => {
  const projectRoot = await tmpProject();
  const dir = join(projectRoot, 'features', 'admin-console', 'licenses-and-access');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'grant.feature'), `Feature: Grant a license
  @happy
  Scenario: grant a seat
    Given an admin
    When they grant a seat
    Then the user gains access

  @error
  Scenario: license expired
    Given an expired license
    Then the grant is rejected
`);
  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/features/admin-console/licenses-and-access`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.files.length, 1);
    const f = body.files[0];
    assert.equal(f.file, 'grant.feature');
    assert.equal(f.feature, 'Grant a license');
    assert.equal(f.scenarios.length, 2);
    assert.equal(f.scenarios[0].class, 'happy');
    assert.deepEqual(f.scenarios[0].steps, ['Given an admin', 'When they grant a seat', 'Then the user gains access']);
    assert.equal(f.scenarios[1].class, 'error');
  } finally {
    server.close();
  }
});

test('GET /features for a capability with no feature directory returns an empty list', async () => {
  const projectRoot = await tmpProject();
  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/features/platform/rate-limiting`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { files: [] });
  } finally {
    server.close();
  }
});

test('GET /features rejects a non-slug path segment with 400', async () => {
  const projectRoot = await tmpProject();
  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/features/..%2Fetc/passwd`);
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('GET /features includes a Background block when present', async () => {
  const projectRoot = await tmpProject();
  const dir = join(projectRoot, 'features', 'admin-console', 'project-spaces');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'spaces.feature'), `Feature: Project Spaces
  Background:
    Given the admin console is reachable at /admin
    And I am authenticated as a SITE_ADMIN

  @happy
  Scenario: search
    When they search
    Then results appear
`);
  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/features/admin-console/project-spaces`);
    assert.equal(res.status, 200);
    const f = (await res.json()).files[0];
    assert.deepEqual(f.background, [
      'Given the admin console is reachable at /admin',
      'And I am authenticated as a SITE_ADMIN',
    ]);
    assert.equal(f.scenarios.length, 1);
  } finally {
    server.close();
  }
});

test('POST /board writes the progress tag to the scenario and nothing else', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'karto-'));
  await writeFile(join(projectRoot, 'kartograph.json'), JSON.stringify({ version: '1', meta: { name: 'T' } }));
  const dir = join(projectRoot, 'features', 'care', 'watering');
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'water.feature');
  await writeFile(file, `Feature: Watering\n\n  @happy\n  Scenario: Water\n    Given a bed\n`);

  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/board`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: 'care', capability: 'watering', feature: 'water.feature', scenario: 'Water', progress: 'done' }),
    });
    assert.equal(res.status, 200);
    const saved = await readFile(file, 'utf8');
    assert.match(saved, /@happy @done\n {2}Scenario: Water/);

    const bad = await fetch(`http://127.0.0.1:${port}/board`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: 'care', capability: 'watering', feature: 'water.feature', scenario: 'Water', progress: 'nope' }),
    });
    assert.equal(bad.status, 400);

    const missing = await fetch(`http://127.0.0.1:${port}/board`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: 'care', capability: 'watering', feature: 'water.feature', scenario: 'Ghost', progress: 'wip' }),
    });
    assert.equal(missing.status, 404);
  } finally {
    server.close();
  }
});

test('GET /board aggregates scenarios across all capabilities with progress + class', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'karto-'));
  await writeFile(join(projectRoot, 'kartograph.json'), JSON.stringify({
    version: '1', meta: { name: 'T' },
    contexts: { care: { name: 'Care', definition: 'd' } },
    capabilities: { watering: { name: 'Watering', context: 'care', definition: 'd' } },
  }));
  const dir = join(projectRoot, 'features', 'care', 'watering');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'water.feature'),
    `Feature: Watering\n\n  @happy @wip\n  Scenario: Water\n    Given a bed\n\n  @edge @done\n  Scenario: Rain\n    Given rain\n`);

  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/board`);
    assert.equal(res.status, 200);
    const { scenarios } = await res.json();
    assert.equal(scenarios.length, 2);
    const water = scenarios.find((s) => s.name === 'Water');
    assert.deepEqual(
      { cap: water.capability, ctx: water.context, file: water.feature, fname: water.featureName, cls: water.class, prog: water.progress },
      { cap: 'watering', ctx: 'care', file: 'water.feature', fname: 'Watering', cls: 'happy', prog: 'wip' });
    assert.equal(scenarios.find((s) => s.name === 'Rain').progress, 'done');
  } finally {
    server.close();
  }
});
