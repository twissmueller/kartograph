import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATES, DEFAULT_STATE, STATE_LABELS, isState,
  getScenarioState, setScenarioState,
} from '../workflows/lib/tracking.js';

test('the four states are open/wip/developed/accepted with Open as default', () => {
  assert.deepEqual(STATES, ['open', 'wip', 'developed', 'accepted']);
  assert.equal(DEFAULT_STATE, 'open');
  assert.deepEqual(STATE_LABELS, { open: 'Open', wip: 'WIP', developed: 'Developed', accepted: 'Accepted' });
});

test('isState accepts only the four states', () => {
  assert.equal(isState('developed'), true);
  assert.equal(isState('done'), false);
  assert.equal(isState(''), false);
});

test('getScenarioState returns the stored state, or open when absent', () => {
  const map = { tracking: { 'cap/f.feature#"A"': 'accepted' } };
  assert.equal(getScenarioState(map, 'cap/f.feature#"A"'), 'accepted');
  assert.equal(getScenarioState(map, 'cap/f.feature#"B"'), 'open');
  assert.equal(getScenarioState({}, 'anything'), 'open');
  assert.equal(getScenarioState(null, 'anything'), 'open');
});

test('setScenarioState returns a new map with the state set, without mutating the input', () => {
  const map = { meta: { name: 'x' } };
  const next = setScenarioState(map, 'cap/f.feature#"A"', 'developed');
  assert.equal(next.tracking['cap/f.feature#"A"'], 'developed');
  assert.equal(map.tracking, undefined, 'input map not mutated');
  assert.equal(next.meta.name, 'x', 'other fields preserved');
});

test('setScenarioState with the default state removes the key and drops empty tracking', () => {
  const map = { tracking: { 'cap/f.feature#"A"': 'accepted' } };
  const next = setScenarioState(map, 'cap/f.feature#"A"', 'open');
  assert.equal('tracking' in next, false, 'empty tracking is removed entirely');
});

test('setScenarioState keeps other tracked scenarios when one is reset to open', () => {
  const map = { tracking: { 'cap/f.feature#"A"': 'accepted', 'cap/f.feature#"B"': 'wip' } };
  const next = setScenarioState(map, 'cap/f.feature#"A"', 'open');
  assert.deepEqual(next.tracking, { 'cap/f.feature#"B"': 'wip' });
});

test('setScenarioState rejects an invalid state', () => {
  assert.throws(() => setScenarioState({}, 'id', 'done'), /invalid state/);
});
