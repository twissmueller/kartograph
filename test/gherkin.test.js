import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeature, scenarioClass } from '../workflows/lib/gherkin.js';

const sample = `@watering
Feature: Watering schedule

  @happy
  Scenario: water due today
    Given a plant due for watering
    When the day starts
    Then a reminder is shown

  @edge
  Scenario: already watered
    Given a plant watered today
    Then no reminder is shown

  @error
  Scenario Outline: sensor offline
    Given the moisture sensor is offline
`;

test('parseFeature extracts the feature title and scenarios with tags', () => {
  const r = parseFeature(sample);
  assert.equal(r.feature, 'Watering schedule');
  assert.equal(r.scenarios.length, 3);
  assert.deepEqual(r.scenarios.map(s => s.name), ['water due today', 'already watered', 'sensor offline']);
  assert.ok(r.scenarios[0].tags.includes('@happy'));
  assert.ok(r.scenarios[2].tags.includes('@error'));
});

test('feature-level tags do not leak onto the first scenario', () => {
  const r = parseFeature(sample);
  assert.ok(!r.scenarios[0].tags.includes('@watering'));
});

test('scenarioClass maps tags to happy/edge/error, error wins', () => {
  assert.equal(scenarioClass(['@happy']), 'happy');
  assert.equal(scenarioClass(['@edge']), 'edge');
  assert.equal(scenarioClass(['@happy', '@edge']), 'edge');
  assert.equal(scenarioClass(['@happy', '@error']), 'error');
  assert.equal(scenarioClass(['@edge', '@error']), 'error');
  assert.equal(scenarioClass(['@todo']), null);
});

test('parseFeature on empty text yields no scenarios', () => {
  assert.deepEqual(parseFeature('').scenarios, []);
});
