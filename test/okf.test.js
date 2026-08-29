import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseConcept, serializeConcept, parseFrontmatter, conceptId, conceptLink,
  trustTier, verifications, conceptStatus, isStale,
} from '../workflows/lib/okf.js';

const DOC = `---
type: Subjekt
title: Pflanze
description: Eine kultivierte Pflanze im Garten.
tags: [garten, bestand]
status: draft
aliases_to_avoid: [Gewächs, Blume]
generated: { by: kartograph/karto-chart, at: 2026-08-29T10:00:00Z }
verified:
  - { by: human:tobias, at: 2026-08-29T11:00:00Z }
  - { by: process:nightly, at: 2026-08-30T02:00:00Z }
sources:
  - id: survey-beete
    resource: ../.kartograph/surveys/2026-08-29-beete.discovery.json
    title: Survey — Beete anlegen
---

# Definition

Eine kultivierte Pflanze.
`;

test('parses frontmatter scalars, flow lists and flow mappings', () => {
  const { frontmatter: fm } = parseConcept(DOC);
  assert.equal(fm.type, 'Subjekt');
  assert.equal(fm.title, 'Pflanze');
  assert.deepEqual(fm.tags, ['garten', 'bestand']);
  assert.deepEqual(fm.aliases_to_avoid, ['Gewächs', 'Blume']);
  assert.deepEqual(fm.generated, { by: 'kartograph/karto-chart', at: '2026-08-29T10:00:00Z' });
});

test('parses a block sequence of mappings (sources), keeping every key', () => {
  const { frontmatter: fm } = parseConcept(DOC);
  assert.equal(fm.sources.length, 1);
  assert.equal(fm.sources[0].id, 'survey-beete');
  assert.equal(fm.sources[0].resource, '../.kartograph/surveys/2026-08-29-beete.discovery.json');
  assert.equal(fm.sources[0].title, 'Survey — Beete anlegen');
});

test('the body is everything after the frontmatter block', () => {
  const { body } = parseConcept(DOC);
  assert.match(body, /^# Definition/);
  assert.match(body, /Eine kultivierte Pflanze\.$/);
});

test('serialization round-trips: parse -> serialize -> parse is stable', () => {
  const parsed = parseConcept(DOC);
  const out = serializeConcept(parsed);
  const again = parseConcept(out);
  assert.deepEqual(again.frontmatter, parsed.frontmatter);
  assert.equal(serializeConcept(again), out, 'serialization is idempotent, so files stay diffable');
});

test('a file with no frontmatter parses rather than throwing, so it can be reported', () => {
  const { frontmatter, body } = parseConcept('# Just a heading\n\ntext');
  assert.equal(frontmatter, null);
  assert.match(body, /Just a heading/);
});

test('a trailing comment is stripped but a # inside a quoted value survives', () => {
  const fm = parseFrontmatter('type: Begriff   # the kind\ntitle: "Tag #1"');
  assert.equal(fm.type, 'Begriff');
  assert.equal(fm.title, 'Tag #1');
});

test('a concept ID is the bundle path without .md; links are bundle-relative', () => {
  assert.equal(conceptId('garten/pflanze.md'), 'garten/pflanze');
  assert.equal(conceptId('/garten/pflanze.md'), 'garten/pflanze');
  assert.equal(conceptLink('garten/pflanze'), '/garten/pflanze.md');
});

test('OKF §5.2: a bare verified mapping counts as a one-element list', () => {
  const fm = parseFrontmatter('type: Begriff\nverified: { by: human:tobias, at: 2026-08-29T11:00:00Z }');
  assert.equal(verifications(fm).length, 1);
  assert.equal(trustTier(fm), 'human-reviewed');
});

test('OKF §5.3: trust tiers are derived from verified, never stored', () => {
  assert.equal(trustTier({}), 'unverified');
  assert.equal(trustTier({ verified: [{ by: 'process:nightly' }] }), 'machine-confirmed');
  assert.equal(trustTier({ verified: [{ by: 'process:nightly' }, { by: 'human:tobias' }] }), 'human-reviewed');
});

test('OKF §5.4/§5.5: absent status is stable; stale_after is an absolute instant', () => {
  assert.equal(conceptStatus({}), 'stable');
  assert.equal(conceptStatus({ status: 'draft' }), 'draft');
  assert.equal(isStale({}), false);
  assert.equal(isStale({ stale_after: '2026-01-01T00:00:00Z' }, new Date('2026-08-29T00:00:00Z')), true);
  assert.equal(isStale({ stale_after: '2027-01-01T00:00:00Z' }, new Date('2026-08-29T00:00:00Z')), false);
});

test('a value needing quotes survives a round trip', () => {
  const fm = { type: 'Begriff', title: 'Yes: really', description: 'true' };
  const out = serializeConcept({ frontmatter: fm, body: 'x' });
  assert.deepEqual(parseConcept(out).frontmatter, fm);
});
