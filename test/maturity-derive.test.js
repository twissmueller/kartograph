import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveMaturity } from '../workflows/lib/maturity-derive.js';

test('no features -> vision', () => {
  assert.equal(deriveMaturity({ featureCount: 0, scenarioCount: 0, classes: new Set() }), 'vision');
});
test('features but no scenarios -> sketched', () => {
  assert.equal(deriveMaturity({ featureCount: 2, scenarioCount: 0, classes: new Set() }), 'sketched');
});
test('only happy -> building', () => {
  assert.equal(deriveMaturity({ featureCount: 1, scenarioCount: 3, classes: new Set(['happy']) }), 'building');
});
test('happy + edge -> usable', () => {
  assert.equal(deriveMaturity({ featureCount: 1, scenarioCount: 4, classes: new Set(['happy', 'edge']) }), 'usable');
});
test('happy + edge + error -> stable', () => {
  assert.equal(deriveMaturity({ featureCount: 1, scenarioCount: 6, classes: new Set(['happy', 'edge', 'error']) }), 'stable');
});
test('scenarios with no recognized class still count as building', () => {
  assert.equal(deriveMaturity({ featureCount: 1, scenarioCount: 2, classes: new Set() }), 'building');
});
test('coverage is cumulative: error without edge is NOT stable', () => {
  assert.equal(deriveMaturity({ featureCount: 1, scenarioCount: 2, classes: new Set(['happy', 'error']) }), 'building');
});
