import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeScenario } from '../workflows/lib/gherkin-edit.js';

const FEATURE = [
  'Feature: Watering',
  '',
  'Background:',
  '  Given the garden is open',
  '',
  '@happy',
  'Scenario: Water the plant',
  '  Given a thirsty plant',
  '  When the gardener waters it',
  '  Then the plant is happy',
  '',
  '@edge',
  'Scenario: Skip watering in rain',
  '  Given rain is forecast',
  '  Then watering is skipped',
  '',
].join('\n');

test('removes a tagged scenario in the middle, keeping Background and the rest', () => {
  const out = removeScenario(FEATURE, 'Water the plant');
  assert.equal(out, [
    'Feature: Watering',
    '',
    'Background:',
    '  Given the garden is open',
    '',
    '@edge',
    'Scenario: Skip watering in rain',
    '  Given rain is forecast',
    '  Then watering is skipped',
    '',
  ].join('\n'));
});

test('removes the last scenario (its tag + steps), leaving the preceding text intact', () => {
  const out = removeScenario(FEATURE, 'Skip watering in rain');
  assert.equal(out, [
    'Feature: Watering',
    '',
    'Background:',
    '  Given the garden is open',
    '',
    '@happy',
    'Scenario: Water the plant',
    '  Given a thirsty plant',
    '  When the gardener waters it',
    '  Then the plant is happy',
    '',
    '',
  ].join('\n'));
});

test('removes an untagged scenario (no tag lines above)', () => {
  const text = [
    'Feature: F',
    'Scenario: Only',
    '  Given a',
    '  Then b',
    '',
  ].join('\n');
  assert.equal(removeScenario(text, 'Only'), 'Feature: F\n');
});

test('throws when the scenario name is not found', () => {
  assert.throws(() => removeScenario(FEATURE, 'Nonexistent'), /scenario not found/);
});

test('preserves CRLF line endings byte-for-byte in the retained text', () => {
  const text = 'Feature: F\r\n@happy\r\nScenario: A\r\n  Given a\r\n@edge\r\nScenario: B\r\n  Given b\r\n';
  const out = removeScenario(text, 'A');
  assert.equal(out, 'Feature: F\r\n@edge\r\nScenario: B\r\n  Given b\r\n');
});
