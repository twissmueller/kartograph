// scripts/build-plan.js
import { fileURLToPath } from 'node:url';
import { buildBoard } from '../workflows/lib/board-data.js';
import { readMap } from '../workflows/lib/map-store.js';

// Parse the command scope token. No arg = whole map; "context:<slug>" = one context;
// any bare token = a capability (and, in buildPlan, its transitive dependencies).
export function parseScope(arg) {
  if (!arg) return { kind: 'all' };
  if (arg.startsWith('context:')) return { kind: 'context', slug: arg.slice('context:'.length) };
  return { kind: 'capability', slug: arg };
}

// All capabilities `slug` transitively depends on (following from->to edges), including `slug`.
function transitiveDeps(slug, depsAll) {
  const seen = new Set();
  const stack = [slug];
  while (stack.length) {
    const s = stack.pop();
    if (seen.has(s)) continue;
    seen.add(s);
    for (const d of depsAll[s] || []) stack.push(d);
  }
  return seen;
}

// Kahn topological sort: a dependency (edge target) precedes its dependent (edge source).
// Ties break by the given node order (declaration order). Cycles: leftover nodes are
// appended in declaration order and a warning is emitted, so the result is always usable.
function topoSort(nodes, deps) {
  const inScope = new Set(nodes);
  const dependents = new Map(nodes.map((n) => [n, []]));
  const indegree = new Map(nodes.map((n) => [n, 0]));
  for (const n of nodes) {
    for (const d of deps[n] || []) {
      if (!inScope.has(d)) continue;
      dependents.get(d).push(n);
      indegree.set(n, indegree.get(n) + 1);
    }
  }
  const queue = nodes.filter((n) => indegree.get(n) === 0);
  const out = [];
  const warnings = [];
  while (queue.length) {
    const n = queue.shift();
    out.push(n);
    for (const m of dependents.get(n)) {
      indegree.set(m, indegree.get(m) - 1);
      if (indegree.get(m) === 0) queue.push(m);
    }
  }
  if (out.length < nodes.length) {
    const remaining = nodes.filter((n) => !out.includes(n));
    warnings.push(`dependency cycle among: ${remaining.join(', ')} — appended in declaration order`);
    out.push(...remaining);
  }
  return { order: out, warnings };
}

// Pure: compute the dependency-ordered build plan for a scope.
export function buildPlan(map, scenariosByCapability, scope) {
  const caps = map.capabilities || {};
  const allSlugs = Object.keys(caps);
  const depsAll = {};
  for (const e of map.dependencies || []) {
    if (!caps[e.from] || !caps[e.to]) continue;
    (depsAll[e.from] ||= []).push(e.to);
  }

  let inScope;
  if (scope.kind === 'context') {
    inScope = new Set(allSlugs.filter((s) => caps[s].context === scope.slug));
  } else if (scope.kind === 'capability') {
    inScope = new Set([...transitiveDeps(scope.slug, depsAll)].filter((s) => caps[s]));
  } else {
    inScope = new Set(allSlugs);
  }

  const scopedNodes = allSlugs.filter((s) => inScope.has(s));
  const scopedDeps = {};
  for (const s of scopedNodes) scopedDeps[s] = (depsAll[s] || []).filter((d) => inScope.has(d));

  const { order: sortedAll, warnings } = topoSort(scopedNodes, scopedDeps);

  const skippedEmpty = [];
  const buildable = new Set();
  for (const s of sortedAll) {
    const info = scenariosByCapability[s] || { open: [], total: 0 };
    if (info.total === 0) { skippedEmpty.push({ capability: s, context: caps[s].context, reason: 'no scenarios charted' }); continue; }
    if (info.open.length === 0) continue; // all accepted — nothing to build
    buildable.add(s);
  }

  const order = sortedAll.filter((s) => buildable.has(s)).map((s) => ({
    capability: s,
    context: caps[s].context,
    dependsOn: (scopedDeps[s] || []).filter((d) => buildable.has(d)),
    openScenarios: scenariosByCapability[s].open,
  }));

  return { scope, order, skippedEmpty, warnings };
}

// CLI: node scripts/build-plan.js [projectRoot] [scope]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || process.cwd();
  const scope = parseScope(process.argv[3]);
  const map = await readMap(root);
  const board = await buildBoard(root);
  const scenariosByCapability = {};
  for (const slug of Object.keys(map.capabilities || {})) scenariosByCapability[slug] = { open: [], total: 0 };
  for (const s of board.scenarios) {
    const e = (scenariosByCapability[s.capability] ||= { open: [], total: 0 });
    e.total++;
    if (s.progress !== 'accepted') e.open.push({ feature: s.feature, name: s.name, class: s.class });
  }
  const plan = buildPlan(map, scenariosByCapability, scope);
  console.log(JSON.stringify(plan, null, 2));
}
