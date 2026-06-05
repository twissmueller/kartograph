import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveMaturity, maturityFromCounts, maturityMatchesCounts } from '../workflows/lib/maturity-derive.js';

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

// maturityFromCounts: what init may claim WITHOUT scenario class tags. It must never
// reach usable/stable — those are earned later by charting real @edge/@error scenarios.
test('maturityFromCounts: no features -> vision', () => {
  assert.equal(maturityFromCounts({ featureCount: 0, scenarioCount: 0 }), 'vision');
});
test('maturityFromCounts: features but no scenarios -> sketched', () => {
  assert.equal(maturityFromCounts({ featureCount: 2, scenarioCount: 0 }), 'sketched');
});
test('maturityFromCounts: scenarios present -> building, never usable/stable', () => {
  assert.equal(maturityFromCounts({ featureCount: 1, scenarioCount: 9 }), 'building');
});

// maturityMatchesCounts: the validator gate that stops a map claiming maturity its
// on-disk counts cannot justify (the bug: 'stable' with zero features).
test('maturityMatchesCounts: stable with zero features is inconsistent', () => {
  assert.equal(maturityMatchesCounts('stable', { featureCount: 0, scenarioCount: 0 }), false);
});
test('maturityMatchesCounts: vision with zero features is consistent', () => {
  assert.equal(maturityMatchesCounts('vision', { featureCount: 0, scenarioCount: 0 }), true);
});
test('maturityMatchesCounts: stable with features+scenarios is consistent (reconcile output)', () => {
  assert.equal(maturityMatchesCounts('stable', { featureCount: 2, scenarioCount: 6 }), true);
});
test('maturityMatchesCounts: sketched needs features and zero scenarios', () => {
  assert.equal(maturityMatchesCounts('sketched', { featureCount: 2, scenarioCount: 0 }), true);
  assert.equal(maturityMatchesCounts('sketched', { featureCount: 0, scenarioCount: 0 }), false);
  assert.equal(maturityMatchesCounts('building', { featureCount: 1, scenarioCount: 0 }), false);
});
test('maturityMatchesCounts: vision must have zero features', () => {
  assert.equal(maturityMatchesCounts('vision', { featureCount: 1, scenarioCount: 0 }), false);
});
