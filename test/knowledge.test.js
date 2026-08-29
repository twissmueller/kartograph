import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIndex, bodyLinks, checkBundle, checkMapRefs, renderTermConcept,
  renderRootIndex, appendLog, termConceptId, termSlug, SHARED_DIR,
} from '../workflows/lib/knowledge.js';
import { parseConcept } from '../workflows/lib/okf.js';

// Build the in-memory shape `readBundle` returns, without touching disk.
const concept = (path, frontmatter, body = '') => ({
  id: path.replace(/\.md$/, ''), path, frontmatter, body,
});

const pflanze = concept('garten/pflanze.md',
  { type: 'Subjekt', title: 'Pflanze', description: 'Eine kultivierte Pflanze.', aliases_to_avoid: ['Gewächs'] },
  '# Definition\n\nEine kultivierte Pflanze.\n\n# Related\n\n- [Beet](/garten/beet.md)');
const beet = concept('garten/beet.md',
  { type: 'Subjekt', title: 'Beet', description: 'Eine bepflanzte Fläche.' });

test('a term concept ID is <kontext>/<slug>, falling back to the shared area', () => {
  assert.equal(termConceptId('garten', 'pflanze'), 'garten/pflanze');
  assert.equal(termConceptId(null, 'reifegrad'), `${SHARED_DIR}/reifegrad`);
  assert.equal(termSlug('garten/pflanze'), 'pflanze');
});

test('the index derives status and trust rather than storing them', () => {
  const index = buildIndex([pflanze, beet]);
  const entry = index.get('garten/pflanze');
  assert.equal(entry.title, 'Pflanze');
  assert.equal(entry.kontext, 'garten');
  assert.equal(entry.typeSlug, 'subjekt');
  assert.equal(entry.status, 'stable', 'absent status means stable');
  assert.equal(entry.trust, 'unverified');
});

test('body links resolve to concept IDs, absolute and relative alike', () => {
  assert.deepEqual(bodyLinks(pflanze), ['garten/beet']);
  assert.deepEqual(bodyLinks(concept('garten/pflanze.md', {}, 'see [b](./beet.md)')), ['garten/beet']);
  assert.deepEqual(bodyLinks(concept('garten/pflanze.md', {}, 'see [b](../shared/reifegrad.md)')), ['shared/reifegrad']);
  assert.deepEqual(bodyLinks(concept('a/b.md', {}, 'see [x](https://example.com/y.md)')), [], 'external URLs are not bundle links');
});

test('OKF §11: a concept with no frontmatter or no type fails conformance', () => {
  const { errors } = checkBundle([
    concept('garten/broken.md', null, 'no frontmatter'),
    concept('garten/typeless.md', { title: 'X', description: 'd' }),
  ]);
  assert.ok(errors.some((e) => e.includes('broken.md') && e.includes('frontmatter')));
  assert.ok(errors.some((e) => e.includes('typeless.md') && e.includes("'type'")));
});

test('a type outside the meta-glossary vocabulary is rejected', () => {
  const { errors } = checkBundle([concept('garten/x.md', { type: 'Begriffe', title: 'X', description: 'd' })]);
  assert.ok(errors.some((e) => e.includes("unknown type 'Begriffe'")));
});

test('one canonical term: two concepts may not share a title', () => {
  const dup = concept('planung/pflanze.md', { type: 'Subjekt', title: 'Pflanze', description: 'd' });
  const { errors } = checkBundle([pflanze, dup]);
  assert.ok(errors.some((e) => e.includes('already defined')), JSON.stringify(errors));
});

test('a deprecated concept does not block the term it was renamed to', () => {
  const old = concept('garten/gewaechs.md', { type: 'Subjekt', title: 'Pflanze', description: 'd', status: 'deprecated' });
  const { errors } = checkBundle([pflanze, old]);
  assert.deepEqual(errors, [], 'retiring a term frees its title');
});

test('a term another concept rejects as an alias to avoid is a collision', () => {
  const gewaechs = concept('garten/gewaechs.md', { type: 'Subjekt', title: 'Gewächs', description: 'd' });
  const { errors } = checkBundle([pflanze, gewaechs]);
  assert.ok(errors.some((e) => e.includes('alias to avoid')), JSON.stringify(errors));
});

test('OKF §6.1: a broken cross-link is a warning, never an error', () => {
  const { errors, warnings } = checkBundle([pflanze]);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => w.includes('/garten/beet.md')));
});

test('a map pointer into the bundle that does not resolve is fatal', () => {
  const map = {
    subjects: { pflanze: { name: 'Pflanze', glossaryRef: 'garten/pflanze' }, beet: { name: 'Beet', glossaryRef: 'garten/ghost' } },
  };
  const errors = checkMapRefs(map, [pflanze, beet]);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('beet') && errors[0].includes('garten/ghost'));
});

test('a rendered term concept carries its provenance and parses back', () => {
  const text = renderTermConcept({
    type: 'subjekt', title: 'Pflanze', description: 'Eine kultivierte Pflanze.',
    status: 'draft', aliasesToAvoid: ['Gewächs'],
    generatedBy: 'kartograph/karto-chart', generatedAt: '2026-08-29T10:00:00Z',
    sources: [{ id: 'survey-beete', resource: '../.kartograph/surveys/2026-08-29-beete.discovery.json' }],
    related: [{ id: 'garten/beet', title: 'Beet' }],
  });
  const { frontmatter: fm, body } = parseConcept(text);
  assert.equal(fm.type, 'Subjekt', 'the slug is written as the canonical German type name');
  assert.equal(fm.status, 'draft');
  assert.deepEqual(fm.aliases_to_avoid, ['Gewächs']);
  assert.equal(fm.sources[0].id, 'survey-beete', 'the survey it came from is recorded');
  assert.match(body, /# Aliases to avoid/);
  assert.match(body, /\[Beet\]\(\/garten\/beet\.md\)/);
});

test('a stable term omits the status key, since absent means stable', () => {
  const text = renderTermConcept({ type: 'begriff', title: 'Reifegrad', description: 'd', status: 'stable' });
  assert.equal(parseConcept(text).frontmatter.status, undefined);
});

test('the root index declares the OKF version and groups by directory', () => {
  const md = renderRootIndex([pflanze, beet]);
  assert.match(md, /^---\nokf_version: "0\.2"\n---/);
  assert.match(md, /# garten/);
  assert.match(md, /\* \[Beet\]\(garten\/beet\.md\) - Eine bepflanzte Fläche\./);
});

test('the log prepends the newest dated group and keeps history', () => {
  const first = appendLog('', '2026-08-28', ['**Creation**: Established the bundle.']);
  const second = appendLog(first, '2026-08-29', ['**Update**: Added [Pflanze](/garten/pflanze.md).']);
  assert.match(second, /# Knowledge Update Log/);
  assert.ok(second.indexOf('2026-08-29') < second.indexOf('2026-08-28'), 'newest first');
  assert.match(second, /Established the bundle/);
});

// --- the on-disk path, against the shipped demo bundle -----------------------

test('readBundle walks a real bundle and skips the reserved filenames', async () => {
  const { readBundle } = await import('../workflows/lib/knowledge.js');
  const root = new URL('..', import.meta.url).pathname;
  const { concepts, reserved } = await readBundle(root, 'examples/demo-knowledge');
  const ids = concepts.map((c) => c.id);
  assert.ok(ids.includes('shared/bed') && ids.includes('planning/bed-layout') && ids.includes('planning/planning'),
    'terms, capabilities and contexts all became concepts');
  assert.deepEqual(reserved.map((r) => r.path).sort(), ['index.md', 'log.md'],
    'index.md and log.md are never concept documents');
  assert.equal(concepts.find((c) => c.id === 'shared/bed').frontmatter.title, 'Bed');
  assert.equal(concepts.find((c) => c.id === 'planning/planning').frontmatter.type, 'Kontext');
});

test('a missing bundle reads as empty rather than throwing', async () => {
  const { readBundle } = await import('../workflows/lib/knowledge.js');
  const { concepts } = await readBundle(new URL('..', import.meta.url).pathname, 'no-such-bundle');
  assert.deepEqual(concepts, [], 'a project that has charted no terms yet is not an error');
});

test('the shipped demo bundle is conformant and internally consistent', async () => {
  const { validateKnowledge } = await import('../scripts/validate-knowledge.js');
  const root = new URL('..', import.meta.url).pathname;
  const { valid, errors, warnings, count } = await validateKnowledge(root, 'examples/demo-knowledge');
  assert.equal(valid, true, JSON.stringify(errors));
  assert.ok(count >= 15, `expected the migrated demo bundle, got ${count} concepts`);
  // The demo's one undefined node (the plant-watered event) migrated as a labelled stub.
  assert.ok(warnings.every((w) => w.includes('migration stub')), JSON.stringify(warnings));
});

test('the demo map points at concepts that exist in the demo bundle', async () => {
  const { readBundle } = await import('../workflows/lib/knowledge.js');
  const { readFile } = await import('node:fs/promises');
  const root = new URL('..', import.meta.url).pathname;
  const map = JSON.parse(await readFile(new URL('../examples/demo.kartograph.json', import.meta.url), 'utf8'));
  assert.equal(map.glossary, undefined, 'the shipped example carries no glossary data');
  assert.equal(map.knowledge.bundle, 'knowledge');
  const { concepts } = await readBundle(root, 'examples/demo-knowledge');
  assert.deepEqual(checkMapRefs(map, concepts), []);
});
