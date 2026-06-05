import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openScenarios } from '../workflows/lib/open-scenarios.js';

const features = [
  { feature: 'A', scenarios: [{ name: 'happy path', tags: ['@happy'] }, { name: 'done one', tags: ['@happy', '@done'] }] },
];

test('openScenarios returns only scenarios not tagged @done', () => {
  const open = openScenarios(features);
  assert.equal(open.length, 1);
  assert.equal(open[0].name, 'happy path');
});
