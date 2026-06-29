import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeature } from '../workflows/lib/gherkin.js';
import { setScenarioState, STATES } from '../workflows/lib/tracking.js';
import { scenarioId } from '../viewer/lib/ids.js';
import { isSlug, isFeatureName } from '../workflows/lib/feature-read.js';
import { mapPath as defaultMapPath } from '../workflows/lib/paths.js';
import { validateKartograph } from './validate-kartograph.js';

// CLI: set ONE scenario's tracking state in kartograph.json, atomically and validated.
//   node scripts/set-tracking.js <projectRoot> <context> <capability> <feature.feature> "<scenario>" <state>
// `state` is one of open|developed|accepted. The scenario must exist in its .feature file.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [root, context, capability, feature, scenario, state] = process.argv.slice(2);
  if (!root || !isSlug(context) || !isSlug(capability) || !isFeatureName(feature) || !scenario || !STATES.includes(state)) {
    console.error('usage: set-tracking.js <projectRoot> <context> <capability> <feature.feature> "<scenario>" <open|developed|accepted>');
    process.exit(2);
  }
  const featureFile = join(root, 'features', context, capability, feature);
  const src = await readFile(featureFile, 'utf8');
  if (!parseFeature(src).scenarios.some((s) => s.name === scenario)) {
    console.error(`scenario not found in ${feature}: ${scenario}`);
    process.exit(1);
  }
  const mapFile = defaultMapPath(root);
  const map = JSON.parse(await readFile(mapFile, 'utf8'));
  const next = setScenarioState(map, scenarioId(capability, feature, scenario), state);
  const { valid, errors } = await validateKartograph(next);
  if (!valid) { console.error('INVALID after set:'); for (const e of errors) console.error('  - ' + e); process.exit(1); }
  const tmp = mapFile + '.settrack.tmp';
  await writeFile(tmp, JSON.stringify(next, null, 2) + '\n');
  await rename(tmp, mapFile);
  console.log(`set ${capability}/${feature}#"${scenario}" -> ${state}`);
}
