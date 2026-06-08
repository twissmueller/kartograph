import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupQuestionsByFeature, countQuestions } from '../viewer/lib/questions.js';

const sample = [
  { question: 'Retention?', feature: { slug: 'logs', description: 'Irrigation logs' }, date: '2026-06-05' },
  { question: 'Owner?', feature: { slug: 'logs', description: 'Irrigation logs' }, date: '2026-06-08' },
  { question: 'Pricing?', feature: { slug: 'billing', description: 'Billing' }, date: '2026-06-07' },
];

test('groups questions by their origin feature', () => {
  const groups = groupQuestionsByFeature(sample);
  assert.equal(groups.length, 2);
  const logs = groups.find((g) => g.slug === 'logs');
  assert.equal(logs.description, 'Irrigation logs');
  assert.equal(logs.questions.length, 2);
});

test('orders features by most recent date first, questions newest first', () => {
  const groups = groupQuestionsByFeature(sample);
  // logs latest date 2026-06-08 > billing 2026-06-07, so logs comes first
  assert.deepEqual(groups.map((g) => g.slug), ['logs', 'billing']);
  assert.equal(groups[0].latestDate, '2026-06-08');
  assert.deepEqual(groups[0].questions.map((q) => q.question), ['Owner?', 'Retention?']);
});

test('empty or missing input yields no groups and a zero count', () => {
  assert.deepEqual(groupQuestionsByFeature([]), []);
  assert.deepEqual(groupQuestionsByFeature(undefined), []);
  assert.equal(countQuestions(undefined), 0);
  assert.equal(countQuestions(sample), 3);
});

test('carries an optional context through to the grouped question', () => {
  const groups = groupQuestionsByFeature([
    { question: 'Q?', feature: { slug: 'a', description: 'A' }, date: '2026-06-08', context: 'core' },
  ]);
  assert.equal(groups[0].questions[0].context, 'core');
});
