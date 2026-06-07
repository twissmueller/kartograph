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

test('parseFeature captures the steps of each scenario', () => {
  const r = parseFeature(sample);
  assert.deepEqual(r.scenarios[0].steps, [
    'Given a plant due for watering',
    'When the day starts',
    'Then a reminder is shown',
  ]);
  assert.deepEqual(r.scenarios[2].steps, ['Given the moisture sensor is offline']);
});

test('parseFeature captures a feature description block', () => {
  const text = `Feature: Billing
  Money moves between accounts.
  Auditable at all times.

  @happy
  Scenario: charge a card
    Given a valid card
    Then the charge succeeds
`;
  const r = parseFeature(text);
  assert.equal(r.description, 'Money moves between accounts.\nAuditable at all times.');
  assert.deepEqual(r.scenarios[0].steps, ['Given a valid card', 'Then the charge succeeds']);
});

test('parseFeature with no description leaves description undefined', () => {
  const r = parseFeature(sample);
  assert.equal(r.description, undefined);
});

test('parseFeature captures a structured Background block as shared steps', () => {
  const text = `Feature: Project Spaces
  Operator-side visibility.

  Background:
    Given the admin console is reachable at /admin
    And I am authenticated as a SITE_ADMIN

  @happy
  Scenario: search
    When they search
    Then results appear
`;
  const r = parseFeature(text);
  assert.deepEqual(r.background, [
    'Given the admin console is reachable at /admin',
    'And I am authenticated as a SITE_ADMIN',
  ]);
  assert.equal(r.description, 'Operator-side visibility.');
  assert.equal(r.scenarios.length, 1);
  assert.deepEqual(r.scenarios[0].steps, ['When they search', 'Then results appear']);
});

test('parseFeature leaves background undefined when there is no Background block', () => {
  assert.equal(parseFeature(sample).background, undefined);
});
