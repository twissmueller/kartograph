import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeature, scenarioClass } from '../workflows/lib/gherkin.js';
import { scenarioProgress, setScenarioProgress } from '../workflows/lib/gherkin.js';

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

test('scenarioProgress maps tags with precedence done > test > wip, else open', () => {
  assert.equal(scenarioProgress([]), 'open');
  assert.equal(scenarioProgress(['@happy']), 'open');
  assert.equal(scenarioProgress(['@wip']), 'wip');
  assert.equal(scenarioProgress(['@test']), 'test');
  assert.equal(scenarioProgress(['@done']), 'done');
  assert.equal(scenarioProgress(['@wip', '@test', '@done']), 'done');
  assert.equal(scenarioProgress(['@wip', '@test']), 'test');
});

const FEATURE = `Feature: Watering

  @happy @wip
  Scenario: Water the bed
    Given a bed
    When I water it
    Then it is wet

  Scenario: Skip on rain
    Given rain
    Then watering is skipped
`;

test('setScenarioProgress swaps the progress tag and preserves class tags', () => {
  const out = setScenarioProgress(FEATURE, 'Water the bed', 'test');
  assert.match(out, /@happy @test\n {2}Scenario: Water the bed/);
  assert.doesNotMatch(out, /@wip/);
});

test('setScenarioProgress to open removes the progress tag, keeping class tags', () => {
  const out = setScenarioProgress(FEATURE, 'Water the bed', 'open');
  assert.match(out, /@happy\n {2}Scenario: Water the bed/);
  assert.doesNotMatch(out, /@wip/);
});

test('setScenarioProgress adds a tag line to a scenario that had none', () => {
  const out = setScenarioProgress(FEATURE, 'Skip on rain', 'wip');
  assert.match(out, /@wip\n {2}Scenario: Skip on rain/);
  assert.match(out, /@happy @wip\n {2}Scenario: Water the bed/);
});

test('setScenarioProgress drops the tag line entirely when only a progress tag remains', () => {
  const src = `Feature: F\n\n  @wip\n  Scenario: Solo\n    Given x\n`;
  const out = setScenarioProgress(src, 'Solo', 'open');
  assert.equal(out, `Feature: F\n\n  Scenario: Solo\n    Given x\n`);
});

test('setScenarioProgress throws on an unknown scenario or invalid progress', () => {
  assert.throws(() => setScenarioProgress(FEATURE, 'Nope', 'wip'), /not found/);
  assert.throws(() => setScenarioProgress(FEATURE, 'Water the bed', 'bogus'), /invalid progress/);
});
