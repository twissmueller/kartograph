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
