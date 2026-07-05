import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listTracking, DEFAULT_LIST_STATE } from '../scripts/list-tracking.js';
import { scenarioId } from '../workflows/lib/ids.js';

// Board-shaped scenarios (as produced by workflows/lib/board-data.js buildBoard).
const scenarios = [
  { capability: 'pm', context: 'ws', feature: 'sign-in.feature', name: 'user signs in', class: 'happy', progress: 'developed' },
  { capability: 'pm', context: 'ws', feature: 'sign-in.feature', name: 'bad password', class: 'error', progress: 'open' },
  { capability: 'pm', context: 'ws', feature: 'profile.feature', name: 'view profile', class: 'happy', progress: 'accepted' },
  { capability: 'billing', context: 'ops', feature: 'invoice.feature', name: 'send invoice', class: 'happy', progress: 'developed' },
];

test('DEFAULT_LIST_STATE is developed', () => {
  assert.equal(DEFAULT_LIST_STATE, 'developed');
});

test('filters to the default state (developed) and maps board fields to the list shape', () => {
  const list = listTracking(scenarios, {});
  assert.deepEqual(list, [
    { context: 'ws', capability: 'pm', feature: 'sign-in.feature', scenario: 'user signs in', state: 'developed', class: 'happy' },
    { context: 'ops', capability: 'billing', feature: 'invoice.feature', scenario: 'send invoice', state: 'developed', class: 'happy' },
  ]);
});

test('filters to an explicit state', () => {
  assert.deepEqual(listTracking(scenarios, {}, 'accepted').map((e) => e.scenario), ['view profile']);
  assert.deepEqual(listTracking(scenarios, {}, 'open').map((e) => e.scenario), ['bad password']);
});

test('attaches a scenarioNote (full object) when one is recorded for the scenario', () => {
  const id = scenarioId('pm', 'sign-in.feature', 'user signs in');
  const map = { scenarioNotes: { [id]: { reason: 'button did nothing', date: '2026-07-05', source: 'walk' } } };
  const list = listTracking(scenarios, map);
  const pm = list.find((e) => e.scenario === 'user signs in');
  assert.deepEqual(pm.note, { reason: 'button did nothing', date: '2026-07-05', source: 'walk' });
  // Scenarios without a note carry no `note` key at all.
  const billing = list.find((e) => e.scenario === 'send invoice');
  assert.equal('note' in billing, false);
});

test('empty or undefined scenarios yields an empty list', () => {
  assert.deepEqual(listTracking([], {}), []);
  assert.deepEqual(listTracking(undefined, {}), []);
});

test('a note whose scenario is not in the requested state is not surfaced', () => {
  const id = scenarioId('pm', 'sign-in.feature', 'bad password'); // this one is `open`
  const map = { scenarioNotes: { [id]: { reason: 'x', date: '2026-07-05', source: 'build' } } };
  const list = listTracking(scenarios, map); // default developed
  assert.equal(list.some((e) => e.scenario === 'bad password'), false);
});

test('does not mutate its inputs', () => {
  const snapshot = JSON.stringify(scenarios);
  const map = { scenarioNotes: {} };
  listTracking(scenarios, map);
  assert.equal(JSON.stringify(scenarios), snapshot);
});
