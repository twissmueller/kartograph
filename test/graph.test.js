import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildGraph, nodeSize } from '../viewer/lib/graph.js';

async function seed() {
  return JSON.parse(await readFile(new URL('../examples/kartograph.seed.json', import.meta.url)));
}

test('buildGraph turns the seed map into one node, one context, no edges', async () => {
  const g = buildGraph(await seed());
  assert.equal(g.nodes.length, 1);
  assert.equal(g.nodes[0].slug, 'start-here');
  assert.equal(g.nodes[0].context, 'core');
  assert.equal(g.nodes[0].maturity, 'vision');
  assert.equal(g.contexts.length, 1);
  assert.equal(g.edges.length, 0);
});

test('nodeSize grows with feature count', () => {
  assert.ok(nodeSize(10) > nodeSize(0));
});
