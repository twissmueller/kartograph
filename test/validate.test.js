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

test('subject referencing a missing rule is caught', async () => {
  const doc = await seed();
  doc.subjects.order = { name: 'Order', rules: ['ghost'] };
  assert.ok(checkReferentialIntegrity(doc).some(e => e.includes('order') && e.includes('ghost')));
});

test('subject referencing a missing glossary term is caught', async () => {
  const doc = await seed();
  doc.subjects.order = { name: 'Order', glossaryRef: 'ghost' };
  assert.ok(checkReferentialIntegrity(doc).some(e => e.includes('order') && e.includes('ghost')));
});

test('rule referencing a missing subject is caught', async () => {
  const doc = await seed();
  doc.rules.must_pay = { name: 'Must pay', statement: 's', subject: 'ghost' };
  assert.ok(checkReferentialIntegrity(doc).some(e => e.includes('must_pay') && e.includes('ghost')));
});

test('actor referencing a missing glossary term is caught', async () => {
  const doc = await seed();
  doc.actors.gardener = { name: 'Gardener', glossaryRef: 'ghost' };
  assert.ok(checkReferentialIntegrity(doc).some(e => e.includes('gardener') && e.includes('ghost')));
});

test('event referencing a missing glossary term is caught', async () => {
  const doc = await seed();
  doc.events.planted = { name: 'Planted', glossaryRef: 'ghost' };
  assert.ok(checkReferentialIntegrity(doc).some(e => e.includes('planted') && e.includes('ghost')));
});

test('glossary term relating to a missing term is caught', async () => {
  const doc = await seed();
  doc.glossary.bed = { term: 'Bed', definition: 'd', type: 'subjekt', related: ['ghost'] };
  assert.ok(checkReferentialIntegrity(doc).some(e => e.includes('bed') && e.includes('ghost')));
});

test('adr superseding a missing adr is caught', async () => {
  const doc = await seed();
  doc.adrs['0002-x'] = { id: '0002-x', title: 't', status: 'accepted', date: '2026-06-05', supersedes: '0001-ghost' };
  assert.ok(checkReferentialIntegrity(doc).some(e => e.includes('0002-x') && e.includes('0001-ghost')));
});

test('maturity inconsistent with counts (stable @ 0 features) is caught', async () => {
  const doc = await seed();
  doc.capabilities['start-here'].derived = { maturity: 'stable', featureCount: 0, scenarioCount: 0 };
  const errors = checkReferentialIntegrity(doc);
  assert.ok(errors.some(e => e.includes('start-here') && e.toLowerCase().includes('maturity')), JSON.stringify(errors));
});

test('reconcile-style maturity (stable with features+scenarios) passes integrity', async () => {
  const doc = await seed();
  doc.capabilities['start-here'].derived = { maturity: 'stable', featureCount: 2, scenarioCount: 6 };
  assert.ok(!checkReferentialIntegrity(doc).some(e => e.toLowerCase().includes('maturity')));
});
