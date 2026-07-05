import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, surveyFilename } from '../workflows/lib/survey.js';

test('slugify lowercases, hyphenates, strips punctuation', () => {
  assert.equal(slugify('Watering Schedule!'), 'watering-schedule');
  assert.equal(slugify('  Plant   Catalog  '), 'plant-catalog');
  assert.equal(slugify('Crop/Rotation'), 'crop-rotation');
});

test('slugify yields a valid slug or empty string', () => {
  assert.match(slugify('Ümläut Ödd'), /^[a-z0-9][a-z0-9-]*$|^$/);
});

test('surveyFilename builds the dated path', () => {
  assert.equal(
    surveyFilename('2026-06-05', 'watering-schedule'),
    '.kartograph/surveys/2026-06-05-watering-schedule.discovery.json'
  );
});
