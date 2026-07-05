import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeScenario } from '../workflows/lib/gherkin-edit.js';
import { isSlug, isFeatureName } from '../workflows/lib/feature-read.js';

const USAGE = 'usage: retire-scenario.js <projectRoot> <context> <capability> <feature.feature> "<scenario>"';

// CLI: remove ONE scenario from its .feature file, atomically. The pure edit lives
// in workflows/lib/gherkin-edit.js (removeScenario). Used by /karto-chart when a
// survey carries a retire-scenario revision. Map-side tracking/notes cleanup is done
// separately by applyRevisions; maturity is recomputed by reconcile afterwards.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [root, context, capability, feature, scenario] = process.argv.slice(2);
  if (!root || !isSlug(context) || !isSlug(capability) || !isFeatureName(feature) || !scenario) {
    console.error(USAGE);
    process.exit(2);
  }
  const file = join(root, 'features', context, capability, feature);
  const src = await readFile(file, 'utf8');
  let next;
  try { next = removeScenario(src, scenario); }
  catch (e) { console.error(e.message); process.exit(1); }
  const tmp = file + '.retire.tmp';
  await writeFile(tmp, next);
  await rename(tmp, file);
  console.log(`retired ${capability}/${feature}#"${scenario}"`);
}
