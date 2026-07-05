import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFeature, scenarioClass } from './gherkin.js';
import { getScenarioState } from './tracking.js';
import { scenarioId } from './ids.js';
import { mapPath } from './paths.js';

export const isSlug = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(s);
export const isFeatureName = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]*\.feature$/.test(s);

// Parse every .feature in features/<context>/<slug> into structured scenarios, each
// stamped with its tracked state (`progress`) read from kartograph.json's tracking block.
// Throws if context/slug are not valid slugs (path-traversal guard).
export async function readCapabilityFeatures(projectRoot, context, slug) {
  if (!isSlug(context) || !isSlug(slug)) throw new Error('invalid context or slug');
  let map;
  try { map = JSON.parse(await readFile(mapPath(projectRoot), 'utf8')); }
  catch { map = {}; }
  const dir = join(projectRoot, 'features', context, slug);
  let names = [];
  try { names = (await readdir(dir)).filter((n) => n.endsWith('.feature')).sort(); }
  catch { names = []; }
  const files = [];
  for (const name of names) {
    const parsed = parseFeature(await readFile(join(dir, name), 'utf8'));
    files.push({
      file: name,
      feature: parsed.feature,
      description: parsed.description,
      background: parsed.background,
      scenarios: parsed.scenarios.map((s) => ({
        name: s.name, tags: s.tags, class: scenarioClass(s.tags),
        progress: getScenarioState(map, scenarioId(slug, name, s.name)), steps: s.steps,
      })),
    });
  }
  return { files };
}

// The full context -> capability -> .feature file tree for the browser, driven by
// the map's declared contexts/capabilities. Capabilities with no feature dir show
// an empty files list. Tolerant of a missing/garbled map.
export async function listFeatureTree(projectRoot) {
  let map;
  try { map = JSON.parse(await readFile(mapPath(projectRoot), 'utf8')); }
  catch { map = {}; }
  const ctxMeta = map.contexts || {};
  const caps = Object.entries(map.capabilities || {});
  const byContext = new Map();
  for (const [slug, cap] of caps) {
    const context = cap.context;
    if (!context) continue;
    let names = [];
    try {
      names = (await readdir(join(projectRoot, 'features', context, slug)))
        .filter((n) => n.endsWith('.feature')).sort();
    } catch { names = []; }
    if (!byContext.has(context)) byContext.set(context, []);
    byContext.get(context).push({ capability: slug, name: cap.name || slug, files: names });
  }
  const contexts = [...byContext.entries()].map(([context, capabilities]) => ({
    context, name: (ctxMeta[context] && ctxMeta[context].name) || context, capabilities,
  }));
  return { contexts };
}
