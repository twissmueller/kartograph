import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_COLUMNS, boardColumns, capabilityStatuses, groupByContext, buildAcceptanceTree } from '../workflows/lib/board.js';

test('groupByContext orders by the contexts list, preserves within-context order', () => {
  const caps = [
    { capability: 'a', context: 'care' },
    { capability: 'b', context: 'admin' },
    { capability: 'c', context: 'care' },
  ];
  const contexts = [{ context: 'admin', name: 'Admin', color: '#111' }, { context: 'care', name: 'Care' }];
  const groups = groupByContext(caps, contexts);
  assert.deepEqual(groups.map((g) => g.context), ['admin', 'care']);
  assert.deepEqual(groups.map((g) => g.name), ['Admin', 'Care']);
  assert.equal(groups[0].color, '#111');
  assert.deepEqual(groups[1].capabilities.map((c) => c.capability), ['a', 'c']);
});

test('groupByContext puts capabilities with an unlisted context last, under their slug', () => {
  const caps = [{ capability: 'x', context: 'ghost' }, { capability: 'y', context: 'care' }];
  const groups = groupByContext(caps, [{ context: 'care', name: 'Care' }]);
  assert.deepEqual(groups.map((g) => g.context), ['care', 'ghost']);
  assert.equal(groups[1].name, 'ghost'); // falls back to the slug
});

test('capabilityStatuses: green=all done, yellow=some done, red=none done or no scenarios', () => {
  const scenarios = [
    { capability: 'a', progress: 'accepted' },
    { capability: 'a', progress: 'accepted' },
    { capability: 'b', progress: 'accepted' },
    { capability: 'b', progress: 'developed' },
    { capability: 'c', progress: 'open' },
  ];
  const st = capabilityStatuses(scenarios, ['a', 'b', 'c', 'd']);
  assert.equal(st.a, 'green');   // all done
  assert.equal(st.b, 'yellow');  // some done
  assert.equal(st.c, 'red');     // none done
  assert.equal(st.d, 'red');     // no scenarios at all
});

test('capabilityStatuses on empty input is an empty map', () => {
  assert.deepEqual(capabilityStatuses([], []), {});
  assert.deepEqual(capabilityStatuses(undefined, undefined), {});
});

test('BOARD_COLUMNS is the three ordered progress states', () => {
  assert.deepEqual(BOARD_COLUMNS, ['open', 'developed', 'accepted']);
});

test('boardColumns groups scenarios by their server-provided progress', () => {
  const scenarios = [
    { name: 'a', progress: 'open' },
    { name: 'b', progress: 'developed' },
    { name: 'c', progress: 'accepted' },
    { name: 'd', progress: 'developed' },
  ];
  const cols = boardColumns(scenarios);
  assert.deepEqual(cols.open.map((s) => s.name), ['a']);
  assert.deepEqual(cols.developed.map((s) => s.name), ['b', 'd']);
  assert.deepEqual(cols.accepted.map((s) => s.name), ['c']);
});

test('a scenario with an unknown/missing progress falls into open', () => {
  const cols = boardColumns([{ name: 'x' }, { name: 'y', progress: 'bogus' }]);
  assert.deepEqual(cols.open.map((s) => s.name), ['x', 'y']);
});

test('boardColumns on empty/undefined input yields three empty columns', () => {
  for (const input of [[], undefined]) {
    const cols = boardColumns(input);
    assert.deepEqual(Object.keys(cols), ['open', 'developed', 'accepted']);
    assert.equal(cols.open.length + cols.developed.length + cols.accepted.length, 0);
  }
});

test('buildAcceptanceTree groups context -> capability -> feature -> scenarios with counts and status', () => {
  const scenarios = [
    { context: 'ws', capability: 'pm', capabilityName: 'Project Mgmt', feature: 'sign-in.feature', featureName: 'Sign in', name: 'user signs in', class: 'happy', progress: 'accepted' },
    { context: 'ws', capability: 'pm', capabilityName: 'Project Mgmt', feature: 'sign-in.feature', featureName: 'Sign in', name: 'bad password', class: 'error', progress: 'accepted' },
    { context: 'ws', capability: 'pm', capabilityName: 'Project Mgmt', feature: 'profile.feature', featureName: 'Profile', name: 'view', class: 'happy', progress: 'developed' },
    { context: 'ws', capability: 'pm', capabilityName: 'Project Mgmt', feature: 'profile.feature', featureName: 'Profile', name: 'edit', class: 'edge', progress: 'open' },
  ];
  const contexts = [{ context: 'ws', name: 'Workspace', color: '#abc' }];
  const capabilities = [{ capability: 'pm', capabilityName: 'Project Mgmt', context: 'ws' }];
  const tree = buildAcceptanceTree(scenarios, { contexts, capabilities });

  assert.equal(tree.contexts.length, 1);
  const ctx = tree.contexts[0];
  assert.equal(ctx.context, 'ws');
  assert.equal(ctx.name, 'Workspace');
  assert.equal(ctx.color, '#abc');
  assert.equal(ctx.total, 1);          // one capability
  assert.equal(ctx.doneCount, 0);      // pm is not all-accepted
  assert.equal(ctx.status, 'progress');

  const cap = ctx.capabilities[0];
  assert.equal(cap.capability, 'pm');
  assert.equal(cap.name, 'Project Mgmt');
  assert.equal(cap.total, 2);          // two features
  assert.equal(cap.doneCount, 1);      // sign-in is done
  assert.equal(cap.status, 'progress');

  // features are sorted by filename ascending
  assert.deepEqual(cap.features.map((f) => f.feature), ['profile.feature', 'sign-in.feature']);
  const prof = cap.features.find((f) => f.feature === 'profile.feature');
  const sign = cap.features.find((f) => f.feature === 'sign-in.feature');
  assert.equal(sign.total, 2);
  assert.equal(sign.accepted, 2);
  assert.equal(sign.status, 'done');
  assert.equal(prof.total, 2);
  assert.equal(prof.accepted, 0);
  assert.equal(prof.status, 'progress'); // one 'test', one 'open' -> started but not done
  assert.deepEqual(prof.scenarios.map((s) => s.name), ['view', 'edit']); // scenario order preserved
});

test('buildAcceptanceTree: untouched when all scenarios open or none; done when all accepted', () => {
  const capabilities = [
    { capability: 'a', capabilityName: 'A', context: 'c1' },
    { capability: 'b', capabilityName: 'B', context: 'c1' },
    { capability: 'empty', capabilityName: 'Empty', context: 'c1' },
  ];
  const contexts = [{ context: 'c1', name: 'C1' }];
  const scenarios = [
    { context: 'c1', capability: 'a', capabilityName: 'A', feature: 'a.feature', featureName: 'A', name: 's1', class: 'happy', progress: 'open' },
    { context: 'c1', capability: 'b', capabilityName: 'B', feature: 'b.feature', featureName: 'B', name: 's1', class: 'happy', progress: 'accepted' },
  ];
  const tree = buildAcceptanceTree(scenarios, { contexts, capabilities });
  const ctx = tree.contexts[0];
  const a = ctx.capabilities.find((c) => c.capability === 'a');
  const b = ctx.capabilities.find((c) => c.capability === 'b');
  const empty = ctx.capabilities.find((c) => c.capability === 'empty');

  assert.equal(a.status, 'untouched');          // single open scenario
  assert.equal(b.status, 'done');               // single accepted scenario
  assert.equal(empty.status, 'untouched');      // no scenarios at all
  assert.equal(empty.total, 0);
  assert.equal(empty.features.length, 0);
  assert.equal(ctx.total, 3);                    // three capabilities
  assert.equal(ctx.doneCount, 1);               // only b
  assert.equal(ctx.status, 'progress');         // mix of done + open
});

test('buildAcceptanceTree orders contexts by the contexts list and puts unlisted contexts last', () => {
  const capabilities = [
    { capability: 'x', capabilityName: 'X', context: 'ghost' },
    { capability: 'y', capabilityName: 'Y', context: 'care' },
  ];
  const contexts = [{ context: 'care', name: 'Care' }];
  const tree = buildAcceptanceTree([], { contexts, capabilities });
  assert.deepEqual(tree.contexts.map((c) => c.context), ['care', 'ghost']);
  assert.equal(tree.contexts[1].name, 'ghost'); // falls back to the slug
});
