import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openScenarios } from '../workflows/lib/open-scenarios.js';

const features = [
  { feature: 'sign-in.feature', scenarios: [{ name: 'happy path', tags: ['@happy'] }, { name: 'accepted one', tags: ['@happy'] }] },
];

test('openScenarios returns scenarios whose tracked state is not accepted', () => {
  const map = { tracking: { 'auth/sign-in.feature#"accepted one"': 'accepted' } };
  const open = openScenarios(features, map, 'auth');
  assert.equal(open.length, 1);
  assert.equal(open[0].name, 'happy path');
});

test('openScenarios treats developed/untracked scenarios as still open', () => {
  const map = { tracking: { 'auth/sign-in.feature#"happy path"': 'developed' } };
  const open = openScenarios(features, map, 'auth');
  assert.deepEqual(open.map((s) => s.name), ['happy path', 'accepted one']);
});

test('openScenarios with no tracking returns everything', () => {
  const open = openScenarios(features, {}, 'auth');
  assert.equal(open.length, 2);
});
