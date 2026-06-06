import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverage, sortByScenarioCount, filterScenarios } from '../viewer/lib/features.js';

test('coverage reports which classes a feature has at least one scenario for', () => {
  const scenarios = [
    { class: 'happy' }, { class: 'happy' }, { class: 'edge' }, { class: null },
  ];
  assert.deepEqual(coverage(scenarios), { happy: true, edge: true, error: false });
});

test('coverage on no scenarios is all false', () => {
  assert.deepEqual(coverage([]), { happy: false, edge: false, error: false });
});

test('sortByScenarioCount orders features by scenario count, most first, stably', () => {
  const files = [
    { file: 'a', scenarios: [{}] },
    { file: 'b', scenarios: [{}, {}, {}] },
    { file: 'c', scenarios: [{}, {}] },
    { file: 'd', scenarios: [{}, {}, {}] },
  ];
  assert.deepEqual(sortByScenarioCount(files).map((f) => f.file), ['b', 'd', 'c', 'a']);
});

test('sortByScenarioCount does not mutate its input', () => {
  const files = [{ file: 'a', scenarios: [] }, { file: 'b', scenarios: [{}] }];
  sortByScenarioCount(files);
  assert.deepEqual(files.map((f) => f.file), ['a', 'b']);
});

test('filterScenarios keeps active classes and always keeps untagged', () => {
  const scenarios = [
    { name: 'h', class: 'happy' },
    { name: 'e', class: 'edge' },
    { name: 'x', class: 'error' },
    { name: 'u', class: null },
  ];
  const kept = filterScenarios(scenarios, { happy: true, edge: false, error: false });
  assert.deepEqual(kept.map((s) => s.name), ['h', 'u']);
});

test('filterScenarios with all classes off keeps only untagged scenarios', () => {
  const scenarios = [
    { name: 'h', class: 'happy' },
    { name: 'u1', class: null },
    { name: 'u2', class: undefined },
  ];
  const kept = filterScenarios(scenarios, { happy: false, edge: false, error: false });
  assert.deepEqual(kept.map((s) => s.name), ['u1', 'u2']);
});
