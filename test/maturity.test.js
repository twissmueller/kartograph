import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveMaturity, aggregateMaturity, nodeBrightness } from '../viewer/lib/maturity.js';

test('effectiveMaturity prefers derived, falls back to declaredStage, then vision', () => {
  assert.equal(effectiveMaturity({ derived: { maturity: 'usable' }, declaredStage: 'vision' }), 'usable');
  assert.equal(effectiveMaturity({ declaredStage: 'vision' }), 'vision');
  assert.equal(effectiveMaturity({}), 'vision');
});

test('aggregateMaturity of no capabilities is 0', () => {
  assert.equal(aggregateMaturity({}), 0);
});

test('aggregateMaturity of one vision capability is 0', () => {
  assert.equal(aggregateMaturity({ a: { derived: { maturity: 'vision' } } }), 0);
});

test('aggregateMaturity averages weights', () => {
  const caps = { a: { derived: { maturity: 'usable' } }, b: { derived: { maturity: 'stable' } } };
  assert.equal(aggregateMaturity(caps), (0.7 + 1) / 2);
});

test('nodeBrightness returns a 0..1 value and defaults to the vision floor', () => {
  assert.equal(nodeBrightness('stable'), 1);
  assert.ok(nodeBrightness('mystery') > 0 && nodeBrightness('mystery') < 1);
});
