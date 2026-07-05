import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeature } from '../workflows/lib/gherkin.js';
import { setScenarioState, STATES } from '../workflows/lib/tracking.js';
import { setScenarioNote, clearScenarioNote, NOTE_SOURCES } from '../workflows/lib/notes.js';
import { scenarioId } from '../workflows/lib/ids.js';
import { isSlug, isFeatureName } from '../workflows/lib/feature-read.js';
import { mapPath as defaultMapPath } from '../workflows/lib/paths.js';
import { validateKartograph } from './validate-kartograph.js';

const USAGE = 'usage: set-tracking.js <projectRoot> <context> <capability> <feature.feature> "<scenario>" <open|developed|accepted> [--reason "<text>"] [--source walk|build]';

// CLI: set ONE scenario's tracking state in kartograph.json, atomically and validated.
//   node scripts/set-tracking.js <projectRoot> <context> <capability> <feature.feature> "<scenario>" <state> [--reason "..."] [--source walk|build]
// `state` is one of open|developed|accepted. The scenario must exist in its .feature file.
// When state is `open` and --reason is given, a scenarioNote is written (date = today,
// source defaults to `walk`) recording WHY the scenario is stuck. Advancing to
// `developed`/`accepted` clears any existing note for that scenario.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const positional = [];
  let reason = null;
  let source = 'walk';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reason') reason = argv[++i];
    else if (a === '--source') source = argv[++i];
    else positional.push(a);
  }
  const [root, context, capability, feature, scenario, state] = positional;
  if (!root || !isSlug(context) || !isSlug(capability) || !isFeatureName(feature) || !scenario || !STATES.includes(state)) {
    console.error(USAGE);
    process.exit(2);
  }
  if (!NOTE_SOURCES.includes(source)) {
    console.error(`invalid --source: ${source} (expected walk|build)`);
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
  const id = scenarioId(capability, feature, scenario);
  let next = setScenarioState(map, id, state);
  let noted = '';
  if (state === 'open') {
    if (reason) {
      const date = new Date().toISOString().slice(0, 10);
      next = setScenarioNote(next, id, { reason, date, source });
      noted = ` (noted: ${source})`;
    }
  } else {
    next = clearScenarioNote(next, id);
  }
  const { valid, errors } = await validateKartograph(next);
  if (!valid) { console.error('INVALID after set:'); for (const e of errors) console.error('  - ' + e); process.exit(1); }
  const tmp = mapFile + '.settrack.tmp';
  await writeFile(tmp, JSON.stringify(next, null, 2) + '\n');
  await rename(tmp, mapFile);
  console.log(`set ${capability}/${feature}#"${scenario}" -> ${state}${noted}`);
}
