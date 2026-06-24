import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFeature, scenarioClass, scenarioProgress } from './gherkin.js';
import { mapPath } from './paths.js';

// Build the cross-capability board model for a project: every context, every
// capability (even scenario-less ones), and every scenario across all .feature
// files, each stamped with its class + progress. Pure of HTTP; reads the project
// from disk. Tolerant: a missing/garbled map yields empty arrays.
export async function buildBoard(projectRoot) {
  let map;
  try { map = JSON.parse(await readFile(mapPath(projectRoot), 'utf8')); }
  catch { map = { capabilities: {} }; }

  const capabilities = Object.entries(map.capabilities || {})
    .map(([slug, cap]) => ({ capability: slug, capabilityName: cap.name || slug, context: cap.context }));
  const contexts = Object.entries(map.contexts || {})
    .map(([slug, ctx]) => ({ context: slug, name: ctx.name || slug, color: ctx.color }));

  const scenarios = [];
  for (const [slug, cap] of Object.entries(map.capabilities || {})) {
    const context = cap.context;
    if (!context) continue;
    const dir = join(projectRoot, 'features', context, slug);
    let names = [];
    try { names = (await readdir(dir)).filter((n) => n.endsWith('.feature')).sort(); }
    catch { continue; }
    for (const name of names) {
      let parsed;
      try { parsed = parseFeature(await readFile(join(dir, name), 'utf8')); }
      catch { continue; }
      for (const s of parsed.scenarios) {
        scenarios.push({
          capability: slug, capabilityName: cap.name || slug, context,
          feature: name, featureName: parsed.feature || name, name: s.name,
          class: scenarioClass(s.tags), progress: scenarioProgress(s.tags),
        });
      }
    }
  }
  return { scenarios, capabilities, contexts };
}
