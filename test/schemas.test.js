import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

async function loadAjv() {
  const dir = new URL('../schemas/v1/', import.meta.url);
  const read = async (f) => JSON.parse(await readFile(new URL(f, dir)));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(await read('glossary.schema.json'));
  ajv.addSchema(await read('adr.schema.json'));
  ajv.addSchema(await read('kartograph.schema.json'));
  return ajv;
}

test('all three schemas compile and cross-reference', async () => {
  const ajv = await loadAjv();
  const v = ajv.getSchema('https://kartograph.dev/schemas/v1/kartograph.schema.json');
  assert.ok(v, 'kartograph schema compiled with its $refs resolved');
});

test('a minimal valid map passes', async () => {
  const ajv = await loadAjv();
  const v = ajv.getSchema('https://kartograph.dev/schemas/v1/kartograph.schema.json');
  const ok = v({
    version: '1',
    meta: { name: 'X' },
    contexts: { core: { name: 'Core', definition: 'd' } },
    capabilities: {},
  });
  assert.equal(ok, true, JSON.stringify(v.errors));
});

test('a bad maturity enum is rejected', async () => {
  const ajv = await loadAjv();
  const v = ajv.getSchema('https://kartograph.dev/schemas/v1/kartograph.schema.json');
  const ok = v({
    version: '1', meta: { name: 'X' },
    contexts: { core: { name: 'Core', definition: 'd' } },
    capabilities: { c: { name: 'C', context: 'core', definition: 'd',
      derived: { maturity: 'NOPE', featureCount: 0, scenarioCount: 0 } } },
  });
  assert.equal(ok, false);
});

test('the seed map validates against the schema', async () => {
  const ajv = await loadAjv();
  const v = ajv.getSchema('https://kartograph.dev/schemas/v1/kartograph.schema.json');
  const seed = JSON.parse(await readFile(new URL('../examples/kartograph.seed.json', import.meta.url)));
  const ok = v(seed);
  assert.equal(ok, true, JSON.stringify(v.errors, null, 2));
});

test('a dependency may carry justifying feature filenames', async () => {
  const ajv = await loadAjv();
  const v = ajv.getSchema('https://kartograph.dev/schemas/v1/kartograph.schema.json');
  const ok = v({
    version: '1', meta: { name: 'X' },
    contexts: { core: { name: 'Core', definition: 'd' } },
    capabilities: {
      a: { name: 'A', context: 'core', definition: 'd' },
      b: { name: 'B', context: 'core', definition: 'd' },
    },
    dependencies: [{ from: 'a', to: 'b', features: ['grant.feature', 'revoke.feature'] }],
  });
  assert.equal(ok, true, JSON.stringify(v.errors));
});

test('a dependency with a non-array features is rejected', async () => {
  const ajv = await loadAjv();
  const v = ajv.getSchema('https://kartograph.dev/schemas/v1/kartograph.schema.json');
  const ok = v({
    version: '1', meta: { name: 'X' },
    contexts: { core: { name: 'Core', definition: 'd' } },
    capabilities: { a: { name: 'A', context: 'core', definition: 'd' }, b: { name: 'B', context: 'core', definition: 'd' } },
    dependencies: [{ from: 'a', to: 'b', features: 'grant.feature' }],
  });
  assert.equal(ok, false);
});

test('a map may carry open questions stamped with their origin feature', async () => {
  const ajv = await loadAjv();
  const v = ajv.getSchema('https://kartograph.dev/schemas/v1/kartograph.schema.json');
  const ok = v({
    version: '1', meta: { name: 'X' },
    contexts: { core: { name: 'Core', definition: 'd' } },
    capabilities: {},
    openQuestions: [
      { question: 'Retention period?', feature: { slug: 'logs', description: 'Irrigation logs' }, date: '2026-06-08' },
      { question: 'Owner?', feature: { slug: 'logs', description: 'Irrigation logs' }, date: '2026-06-08', context: 'core' },
    ],
  });
  assert.equal(ok, true, JSON.stringify(v.errors));
});

test('an open question missing its feature or date is rejected', async () => {
  const ajv = await loadAjv();
  const v = ajv.getSchema('https://kartograph.dev/schemas/v1/kartograph.schema.json');
  const base = { version: '1', meta: { name: 'X' }, contexts: { core: { name: 'Core', definition: 'd' } }, capabilities: {} };
  assert.equal(v({ ...base, openQuestions: [{ question: 'Q?', date: '2026-06-08' }] }), false, 'no feature');
  assert.equal(v({ ...base, openQuestions: [{ question: 'Q?', feature: { slug: 'a', description: 'A' } }] }), false, 'no date');
  assert.equal(v({ ...base, openQuestions: [{ question: 'Q?', feature: { slug: 'a', description: 'A' }, date: 'June' }] }), false, 'bad date');
});

test('a dependency may carry a free-text reason', async () => {
  const ajv = await loadAjv();
  const v = ajv.getSchema('https://kartograph.dev/schemas/v1/kartograph.schema.json');
  const ok = v({
    version: '1', meta: { name: 'X' },
    contexts: { core: { name: 'Core', definition: 'd' } },
    capabilities: { a: { name: 'A', context: 'core', definition: 'd' }, b: { name: 'B', context: 'core', definition: 'd' } },
    dependencies: [{ from: 'a', to: 'b', reason: 'reads B records to validate', features: ['x.feature'] }],
  });
  assert.equal(ok, true, JSON.stringify(v.errors));
});
