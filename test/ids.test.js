import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextId, capabilityId, featureId, scenarioId } from '../viewer/lib/ids.js';

test('contextId and capabilityId are the slug itself', () => {
  assert.equal(contextId('identity-access'), 'identity-access');
  assert.equal(capabilityId('authentication'), 'authentication');
});

test('featureId is capability-rooted', () => {
  assert.equal(featureId('authentication', 'sign-in.feature'), 'authentication/sign-in.feature');
});

test('scenarioId appends the quoted scenario name', () => {
  assert.equal(
    scenarioId('authentication', 'sign-in.feature', 'user signs in'),
    'authentication/sign-in.feature#"user signs in"',
  );
});

test('ids coerce missing parts to empty strings (no "undefined")', () => {
  assert.equal(contextId(undefined), '');
  assert.equal(featureId('cap', undefined), 'cap/');
  assert.equal(scenarioId('cap', 'f.feature', undefined), 'cap/f.feature#""');
});

test('scenarioId embeds the raw name verbatim (inner quotes are not escaped)', () => {
  assert.equal(
    scenarioId('cap', 'x.feature', 'say "hi"'),
    'cap/x.feature#"say "hi""',
  );
});
