import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateKartograph, checkReferentialIntegrity } from '../scripts/validate-kartograph.js';

async function seed() {
  return JSON.parse(await readFile(new URL('../examples/kartograph.seed.json', import.meta.url)));
}

test('seed map is valid', async () => {
  const result = await validateKartograph(await seed());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('schema violation is reported as invalid', async () => {
  const doc = await seed();
  doc.capabilities['start-here'].derived.maturity = 'NOPE';
  const result = await validateKartograph(doc);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('dangling capability.context is caught by integrity check', async () => {
  const doc = await seed();
  doc.capabilities['start-here'].context = 'ghost';
  const errors = checkReferentialIntegrity(doc);
  assert.ok(errors.some(e => e.includes('start-here') && e.includes('ghost')));
});

test('dangling dependency edge is caught', async () => {
  const doc = await seed();
  doc.dependencies.push({ from: 'start-here', to: 'ghost' });
  const errors = checkReferentialIntegrity(doc);
  assert.ok(errors.some(e => e.includes('ghost')));
});

test('validateKartograph fails when integrity is broken even if schema is fine', async () => {
  const doc = await seed();
  doc.dependencies.push({ from: 'start-here', to: 'ghost' });
  const result = await validateKartograph(doc);
  assert.equal(result.valid, false);
});
