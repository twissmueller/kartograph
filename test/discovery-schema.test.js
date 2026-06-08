import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { validateDiscovery } from '../scripts/validate-discovery.js';

async function loadValidator() {
  const dir = new URL('../schemas/v1/', import.meta.url);
  const read = async (f) => JSON.parse(await readFile(new URL(f, dir)));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(await read('discovery.schema.json'));
  return ajv.getSchema('https://kartograph.dev/schemas/v1/discovery.schema.json');
}

const minimal = {
  date: '2026-06-05',
  slug: 'watering-schedule',
  conversationSummary: 'We discussed reminding gardeners to water plants.',
  sources: { description: 'Gardeners want watering reminders.' },
  findings: {
    subjects: [], events: [], actors: [], rules: [],
    affectedCapabilities: [], capabilityCandidates: [],
    glossaryAdditions: [], adrCandidates: [], placement: [],
  },
};

test('a minimal discovery doc validates', async () => {
  const v = await loadValidator();
  assert.equal(v(minimal), true, JSON.stringify(v.errors));
});

test('a richer discovery doc validates', async () => {
  const v = await loadValidator();
  const doc = structuredClone(minimal);
  doc.findings.subjects.push({ slug: 'plant', name: 'Plant', definition: 'A cultivated plant.' });
  doc.findings.capabilityCandidates.push({ slug: 'task-reminders', name: 'Task reminders', context: 'care', definition: 'Remind the gardener.' });
  doc.findings.adrCandidates.push({ title: 'Use local notifications', rationale: 'Offline-friendly.' });
  doc.findings.placement.push({ kind: 'capabilityCandidate', slug: 'task-reminders', context: 'care' });
  assert.equal(v(doc), true, JSON.stringify(v.errors));
});

test('missing required top-level field is rejected', async () => {
  const v = await loadValidator();
  const doc = structuredClone(minimal);
  delete doc.findings;
  assert.equal(v(doc), false);
});

test('a non-slug subject slug is rejected', async () => {
  const v = await loadValidator();
  const doc = structuredClone(minimal);
  doc.findings.subjects.push({ slug: 'Not A Slug', name: 'X', definition: 'd' });
  assert.equal(v(doc), false);
});

test('validateDiscovery accepts a minimal doc and rejects a broken one', async () => {
  const ok = await validateDiscovery(minimal);
  assert.equal(ok.valid, true, JSON.stringify(ok.errors));
  const bad = structuredClone(minimal);
  delete bad.conversationSummary;
  const res = await validateDiscovery(bad);
  assert.equal(res.valid, false);
  assert.ok(res.errors.length > 0);
});

test('findings.openQuestions is optional and shape-checked when present', async () => {
  const v = await loadValidator();
  // optional: minimal (no openQuestions key) still validates
  assert.equal(v(minimal), true, JSON.stringify(v.errors));
  // present and well-formed validates (with and without an optional context)
  const ok = structuredClone(minimal);
  ok.findings.openQuestions = [
    { question: 'How long do we retain irrigation logs?' },
    { question: 'Who owns the watering schedule?', context: 'watering' },
  ];
  assert.equal(v(ok), true, JSON.stringify(v.errors));
  // empty question rejected
  const empty = structuredClone(minimal);
  empty.findings.openQuestions = [{ question: '' }];
  assert.equal(v(empty), false);
  // unknown property rejected
  const extra = structuredClone(minimal);
  extra.findings.openQuestions = [{ question: 'ok?', answer: 'no' }];
  assert.equal(v(extra), false);
});

test('findings.dependencies is optional and shape-checked when present', async () => {
  const v = await loadValidator();
  // optional: minimal (no dependencies key) still validates
  assert.equal(v(minimal), true, JSON.stringify(v.errors));
  // present and well-formed validates
  const ok = structuredClone(minimal);
  ok.findings.dependencies = [{ from: 'a', to: 'b', features: ['grant.feature'] }];
  assert.equal(v(ok), true, JSON.stringify(v.errors));
  // malformed entry (missing 'to') rejected
  const bad = structuredClone(minimal);
  bad.findings.dependencies = [{ from: 'a' }];
  assert.equal(v(bad), false);
});
