import { effectiveMaturity } from './maturity.js';

export function buildGraph(k) {
  const nodes = Object.entries(k.capabilities || {}).map(([slug, c]) => ({
    slug,
    name: c.name,
    context: c.context,
    maturity: effectiveMaturity(c),
    featureCount: c.derived?.featureCount ?? 0,
    scenarioCount: c.derived?.scenarioCount ?? 0,
  }));
  const contexts = Object.entries(k.contexts || {}).map(([slug, c]) => ({
    slug, name: c.name, color: c.color ?? '#666666',
  }));
  const edges = (k.dependencies || []).map((d) => ({ from: d.from, to: d.to }));
  return { nodes, edges, contexts };
}

export function nodeSize(featureCount) {
  return 30 + 4 * featureCount;
}
