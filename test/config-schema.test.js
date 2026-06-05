import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

async function v() {
  const dir = new URL('../schemas/v1/', import.meta.url);
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(JSON.parse(await readFile(new URL('config.schema.json', dir))));
  return ajv.getSchema('https://kartograph.dev/schemas/v1/config.schema.json');
}

test('the example config validates', async () => {
  const validate = await v();
  const cfg = JSON.parse(await readFile(new URL('../kartograph/config.example.json', import.meta.url)));
  assert.equal(validate(cfg), true, JSON.stringify(validate.errors));
});

test('a config missing testCommand is rejected', async () => {
  const validate = await v();
  assert.equal(validate({ language: 'typescript', codeDir: 'src' }), false);
});
