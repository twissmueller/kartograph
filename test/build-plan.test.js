// test/build-plan.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScope, buildPlan } from '../scripts/build-plan.js';

const MAP = {
  capabilities: {
    auth:     { name: 'Auth',     context: 'identity' },
    billing:  { name: 'Billing',  context: 'checkout' },
    checkout: { name: 'Checkout', context: 'checkout' },
    reporting:{ name: 'Reporting',context: 'checkout' },
  },
  // from depends on to: billing->auth, checkout->billing
  dependencies: [
    { from: 'billing', to: 'auth' },
    { from: 'checkout', to: 'billing' },
  ],
};
const SCN = {
  auth:      { open: [{ feature: 'sign-in.feature', name: 'User signs in', class: 'happy' }], total: 1 },
  billing:   { open: [{ feature: 'charge.feature', name: 'Charge a card', class: 'happy' }], total: 2 },
  checkout:  { open: [{ feature: 'pay.feature', name: 'Pay', class: 'happy' }], total: 1 },
  reporting: { open: [], total: 0 }, // nothing charted
};

test('parseScope: no arg = all; context: prefix; bare slug = capability', () => {
  assert.deepEqual(parseScope(), { kind: 'all' });
  assert.deepEqual(parseScope('context:checkout'), { kind: 'context', slug: 'checkout' });
  assert.deepEqual(parseScope('auth'), { kind: 'capability', slug: 'auth' });
});

test('buildPlan orders dependencies before dependents', () => {
  const plan = buildPlan(MAP, SCN, { kind: 'all' });
  const order = plan.order.map((o) => o.capability);
  assert.ok(order.indexOf('auth') < order.indexOf('billing'));
  assert.ok(order.indexOf('billing') < order.indexOf('checkout'));
});

test('buildPlan reports zero-scenario capabilities as skippedEmpty, not in order', () => {
  const plan = buildPlan(MAP, SCN, { kind: 'all' });
  assert.deepEqual(plan.order.map((o) => o.capability).includes('reporting'), false);
  assert.deepEqual(plan.skippedEmpty, [{ capability: 'reporting', context: 'checkout', reason: 'no scenarios charted' }]);
});

test('buildPlan excludes all-accepted capabilities silently (open empty but total>0)', () => {
  const scn = { ...SCN, billing: { open: [], total: 2 } };
  const plan = buildPlan(MAP, scn, { kind: 'all' });
  const slugs = plan.order.map((o) => o.capability);
  assert.equal(slugs.includes('billing'), false);
  assert.equal(plan.skippedEmpty.some((s) => s.capability === 'billing'), false);
});

test('buildPlan dependsOn lists only in-scope capabilities that are in order', () => {
  const plan = buildPlan(MAP, SCN, { kind: 'all' });
  const checkout = plan.order.find((o) => o.capability === 'checkout');
  assert.deepEqual(checkout.dependsOn, ['billing']);
  // billing's dep auth is buildable -> listed
  assert.deepEqual(plan.order.find((o) => o.capability === 'billing').dependsOn, ['auth']);
});

test('buildPlan context scope keeps only that context', () => {
  const plan = buildPlan(MAP, SCN, { kind: 'context', slug: 'checkout' });
  const slugs = plan.order.map((o) => o.capability);
  assert.deepEqual(slugs.includes('auth'), false);
  assert.ok(slugs.includes('billing') && slugs.includes('checkout'));
  // billing depends on auth, but auth is out of scope -> not in dependsOn
  assert.deepEqual(plan.order.find((o) => o.capability === 'billing').dependsOn, []);
});

test('buildPlan capability scope pulls in transitive dependencies', () => {
  const plan = buildPlan(MAP, SCN, { kind: 'capability', slug: 'checkout' });
  const slugs = plan.order.map((o) => o.capability);
  assert.deepEqual(slugs, ['auth', 'billing', 'checkout']);
});

test('buildPlan breaks dependency cycles deterministically with a warning', () => {
  const cyclic = { ...MAP, dependencies: [{ from: 'auth', to: 'billing' }, { from: 'billing', to: 'auth' }] };
  const plan = buildPlan(cyclic, SCN, { kind: 'all' });
  assert.equal(plan.warnings.length >= 1, true);
  // both still appear so the run is usable
  const slugs = plan.order.map((o) => o.capability);
  assert.ok(slugs.includes('auth') && slugs.includes('billing'));
});
