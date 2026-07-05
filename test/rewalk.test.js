import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewalkCandidates } from '../workflows/lib/rewalk.js';

// Edges are { from, to } = "from depends on to". Building `to` may break `from`.
const baseMap = {
  dependencies: [
    { from: 'checkout', to: 'catalog' }, // checkout depends on catalog
    { from: 'wishlist', to: 'catalog' }, // wishlist depends on catalog
    { from: 'catalog', to: 'search' }, // catalog depends on search (unrelated to catalog build)
  ],
  tracking: {
    'checkout/pay.feature#"A"': 'accepted',
    'checkout/pay.feature#"B"': 'developed', // not accepted -> excluded
    'wishlist/save.feature#"C"': 'accepted',
    'catalog/browse.feature#"D"': 'accepted', // catalog itself, not a dependent -> excluded
    'search/query.feature#"E"': 'accepted', // search does not depend on catalog -> excluded
  },
};

test('candidates are the ACCEPTED scenarios of capabilities that depend on the built one', () => {
  const got = rewalkCandidates(baseMap, 'catalog');
  assert.deepEqual(got, [
    { capability: 'checkout', scenarioId: 'checkout/pay.feature#"A"' },
    { capability: 'wishlist', scenarioId: 'wishlist/save.feature#"C"' },
  ]);
});

test('only accepted scenarios count — developed/open dependents are excluded', () => {
  const got = rewalkCandidates(baseMap, 'catalog');
  assert.ok(!got.some((c) => c.scenarioId === 'checkout/pay.feature#"B"'));
});

test('the built capability\'s own scenarios are never candidates', () => {
  const got = rewalkCandidates(baseMap, 'catalog');
  assert.ok(!got.some((c) => c.capability === 'catalog'));
});

test('no edges pointing at the built capability -> no candidates', () => {
  // Nothing depends on `search`? Here catalog depends on search, so build `search`
  // and catalog's accepted scenario IS a candidate — assert the inverse with a
  // capability that has no incoming edge.
  assert.deepEqual(rewalkCandidates(baseMap, 'checkout'), []);
});

test('building a leaf that others depend on surfaces those dependents', () => {
  assert.deepEqual(rewalkCandidates(baseMap, 'search'), [
    { capability: 'catalog', scenarioId: 'catalog/browse.feature#"D"' },
  ]);
});

test('transitive dependents are NOT followed (direct dependents only, v1)', () => {
  // chain: a depends on b, b depends on c. Building c must surface b, NOT a.
  const map = {
    dependencies: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ],
    tracking: {
      'a/f.feature#"x"': 'accepted',
      'b/f.feature#"y"': 'accepted',
    },
  };
  assert.deepEqual(rewalkCandidates(map, 'c'), [
    { capability: 'b', scenarioId: 'b/f.feature#"y"' },
  ]);
});

test('a dependent with no accepted scenarios yields nothing', () => {
  const map = {
    dependencies: [{ from: 'checkout', to: 'catalog' }],
    tracking: { 'checkout/pay.feature#"A"': 'developed' },
  };
  assert.deepEqual(rewalkCandidates(map, 'catalog'), []);
});

test('output is deterministic: sorted by capability then scenarioId, deduped', () => {
  const map = {
    dependencies: [
      { from: 'zeta', to: 'core' },
      { from: 'alpha', to: 'core' },
      { from: 'alpha', to: 'core' }, // duplicate edge -> still one Set entry
    ],
    tracking: {
      'zeta/f.feature#"z2"': 'accepted',
      'zeta/f.feature#"z1"': 'accepted',
      'alpha/f.feature#"a1"': 'accepted',
    },
  };
  assert.deepEqual(rewalkCandidates(map, 'core'), [
    { capability: 'alpha', scenarioId: 'alpha/f.feature#"a1"' },
    { capability: 'zeta', scenarioId: 'zeta/f.feature#"z1"' },
    { capability: 'zeta', scenarioId: 'zeta/f.feature#"z2"' },
  ]);
});

test('empty / missing inputs are safe', () => {
  assert.deepEqual(rewalkCandidates({}, 'catalog'), []);
  assert.deepEqual(rewalkCandidates(null, 'catalog'), []);
  assert.deepEqual(rewalkCandidates(baseMap, ''), []);
  assert.deepEqual(rewalkCandidates(baseMap, undefined), []);
  assert.deepEqual(rewalkCandidates({ dependencies: [{ from: 'x', to: 'catalog' }] }, 'catalog'), []);
});
