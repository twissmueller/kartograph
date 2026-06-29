import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateFeatureText } from '../scripts/migrate-tracking.js';

test('strips @done and records the scenario as accepted, keeping the path tag', () => {
  const src = 'Feature: F\n\n  @happy @done\n  Scenario: Water\n    Given a bed\n';
  const { text, states } = migrateFeatureText(src);
  assert.deepEqual(states, [{ name: 'Water', state: 'accepted' }]);
  assert.match(text, /@happy\n {2}Scenario: Water/);
  assert.doesNotMatch(text, /@done/);
});

test('maps @test to developed and @wip to wip', () => {
  const src = 'Feature: F\n\n  @edge @test\n  Scenario: A\n    Given x\n\n  @happy @wip\n  Scenario: B\n    Given y\n';
  const { states } = migrateFeatureText(src);
  assert.deepEqual(states, [{ name: 'A', state: 'developed' }, { name: 'B', state: 'wip' }]);
});

test('removes a tag line that held only a progress tag', () => {
  const src = 'Feature: F\n\n  @done\n  Scenario: Solo\n    Given x\n';
  const { text, states } = migrateFeatureText(src);
  assert.equal(text, 'Feature: F\n\n  Scenario: Solo\n    Given x\n');
  assert.deepEqual(states, [{ name: 'Solo', state: 'accepted' }]);
});

test('a scenario with no progress tag yields no state and unchanged text', () => {
  const src = 'Feature: F\n\n  @happy\n  Scenario: Plain\n    Given x\n';
  const { text, states } = migrateFeatureText(src);
  assert.equal(text, src);
  assert.deepEqual(states, []);
});

test('is idempotent — already-migrated text produces no states and no change', () => {
  const src = 'Feature: F\n\n  @happy\n  Scenario: Plain\n    Given x\n';
  const once = migrateFeatureText(src);
  const twice = migrateFeatureText(once.text);
  assert.equal(twice.text, src);
  assert.deepEqual(twice.states, []);
});

test('higher precedence wins when multiple progress tags are present (done > test > wip)', () => {
  const src = 'Feature: F\n\n  @wip @test @done @happy\n  Scenario: M\n    Given x\n';
  const { text, states } = migrateFeatureText(src);
  assert.deepEqual(states, [{ name: 'M', state: 'accepted' }]);
  assert.match(text, /@happy\n {2}Scenario: M/);
});
