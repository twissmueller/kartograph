import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderSurveyHtml } from '../workflows/lib/survey-html.js';
import { writeSurveyHtml } from '../scripts/survey-to-html.js';

// A representative discovery document covering every section, plus a value that must be
// HTML-escaped.
const fullDoc = {
  date: '2026-06-11',
  slug: 'watering-schedule',
  conversationSummary:
    'We discussed watering the beds.\n\nA second paragraph about <timers>.',
  sources: {
    description: 'Watering schedule for the garden',
    issue: 'https://github.com/acme/garden/issues/42',
  },
  findings: {
    subjects: [{ slug: 'bed', name: 'Bed', definition: 'A planting bed <x>' }],
    events: [{ slug: 'bed-watered', name: 'Bed watered' }],
    actors: [{ slug: 'gardener', name: 'Gardener' }],
    rules: [{ slug: 'no-overwater', name: 'No overwatering', statement: 'A bed is watered at most once per day', subject: 'bed' }],
    affectedCapabilities: ['plant-catalog'],
    capabilityCandidates: [{ slug: 'watering', name: 'Watering', context: 'care', definition: 'Schedule watering' }],
    glossaryAdditions: [{ slug: 'watering', term: 'Watering', definition: 'Applying water', type: 'capability', aliasesToAvoid: ['irrigation'] }],
    adrCandidates: [{ title: 'Use cron for scheduling', rationale: 'Hard to reverse', contexts: ['care'], capabilities: ['watering'] }],
    placement: [{ kind: 'capabilityCandidate', slug: 'watering', context: 'care' }],
    dependencies: [{ from: 'watering', to: 'plant-catalog', reason: 'reads canonical plant records', features: ['schedule-watering.feature'] }],
    openQuestions: [{ question: 'How often in winter?', context: 'care' }],
  },
};

test('renderSurveyHtml emits a self-contained HTML document', () => {
  const html = renderSurveyHtml(fullDoc);
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<style>/);
  assert.match(html, /Watering schedule for the garden/);
  assert.match(html, /2026-06-11/);
});

test('renderSurveyHtml escapes HTML in survey text', () => {
  const html = renderSurveyHtml({
    ...fullDoc,
    conversationSummary: 'Danger <script>alert(1)</script> here',
  });
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test('renderSurveyHtml renders every populated section', () => {
  const html = renderSurveyHtml(fullDoc);
  for (const needle of [
    'Bed', 'Bed watered', 'Gardener', 'No overwatering',
    'plant-catalog', 'Watering', 'Use cron for scheduling',
    'reads canonical plant records', 'How often in winter?', 'irrigation',
  ]) {
    assert.match(html, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `expected section content: ${needle}`);
  }
});

test('renderSurveyHtml links the source issue', () => {
  const html = renderSurveyHtml(fullDoc);
  assert.match(html, /href="https:\/\/github\.com\/acme\/garden\/issues\/42"/);
});

test('renderSurveyHtml omits empty/absent sections', () => {
  const sparse = {
    date: '2026-06-11',
    slug: 'tiny',
    conversationSummary: 'Just a chat.',
    sources: { description: 'A tiny feature' },
    findings: {
      subjects: [], events: [], actors: [], rules: [],
      affectedCapabilities: [], capabilityCandidates: [],
      glossaryAdditions: [], adrCandidates: [], placement: [],
      // dependencies and openQuestions absent
    },
  };
  const html = renderSurveyHtml(sparse);
  assert.doesNotMatch(html, /Subjects/);
  assert.doesNotMatch(html, /Open Questions/i);
  assert.doesNotMatch(html, /Dependencies/i);
  // header still present
  assert.match(html, /A tiny feature/);
});

test('writeSurveyHtml writes a sibling .discovery.html next to the JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'karto-survey-'));
  try {
    const jsonPath = join(dir, '2026-06-11-watering-schedule.discovery.json');
    await writeFile(jsonPath, JSON.stringify(fullDoc), 'utf8');
    const htmlPath = await writeSurveyHtml(jsonPath);
    assert.equal(htmlPath, join(dir, '2026-06-11-watering-schedule.discovery.html'));
    const html = await readFile(htmlPath, 'utf8');
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /Watering schedule for the garden/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
