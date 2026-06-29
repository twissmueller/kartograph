import { readFile, writeFile, readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeature } from '../workflows/lib/gherkin.js';
import { setScenarioState } from '../workflows/lib/tracking.js';
import { scenarioId } from '../viewer/lib/ids.js';
import { mapPath as defaultMapPath } from '../workflows/lib/paths.js';
import { validateKartograph } from './validate-kartograph.js';

// One-shot migration of the legacy progress TAGS (@wip/@test/@done) into the map's
// `tracking` block. Maturity-bearing path tags (@happy/@edge/@error) are kept; the
// three progress tags are removed from the .feature text.
const PROGRESS_TAGS = ['@wip', '@test', '@done'];
// Precedence mirrors the old scenarioProgress: done > test > wip.
const TAG_TO_STATE = [['@done', 'accepted'], ['@test', 'developed'], ['@wip', 'wip']];

// Pure: strip the progress tags from a .feature's text and report each scenario's
// migrated state. Returns { text, states: [{ name, state }] }. A tag line left empty
// after stripping is removed entirely; every other line is preserved verbatim.
export function migrateFeatureText(source) {
  const parsed = parseFeature(source);
  const states = [];
  for (const s of parsed.scenarios) {
    const hit = TAG_TO_STATE.find(([tag]) => (s.tags || []).includes(tag));
    if (hit) states.push({ name: s.name, state: hit[1] });
  }
  const isTagLine = (l) => l.trim().startsWith('@');
  const out = [];
  for (const line of String(source).split('\n')) {
    if (!isTagLine(line)) { out.push(line); continue; }
    const indent = line.match(/^\s*/)[0];
    const kept = line.trim().split(/\s+/).filter((t) => t.startsWith('@') && !PROGRESS_TAGS.includes(t));
    if (kept.length) out.push(indent + kept.join(' '));
    // else: drop the now-empty tag line
  }
  return { text: out.join('\n'), states };
}

// Read each capability's .feature filenames from features/<context>/<slug>/.
async function featureNames(root, context, slug) {
  try { return (await readdir(join(root, 'features', context, slug))).filter((n) => n.endsWith('.feature')); }
  catch { return []; }
}

// CLI: node scripts/migrate-tracking.js [projectRoot] — fold progress tags into the map's
// tracking block, strip them from the .feature files, validate, then write atomically.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || process.cwd();
  const mapFile = defaultMapPath(root);
  let map = JSON.parse(await readFile(mapFile, 'utf8'));
  let moved = 0, touchedFiles = 0;
  for (const [slug, cap] of Object.entries(map.capabilities || {})) {
    if (!cap.context) continue;
    for (const file of await featureNames(root, cap.context, slug)) {
      const path = join(root, 'features', cap.context, slug, file);
      const src = await readFile(path, 'utf8');
      const { text, states } = migrateFeatureText(src);
      for (const { name, state } of states) {
        map = setScenarioState(map, scenarioId(slug, file, name), state);
        moved++;
      }
      if (text !== src) { await writeFile(path, text); touchedFiles++; }
    }
  }
  const { valid, errors } = await validateKartograph(map);
  if (!valid) { console.error('INVALID after migration:'); for (const e of errors) console.error('  - ' + e); process.exit(1); }
  const tmp = mapFile + '.migrate.tmp';
  await writeFile(tmp, JSON.stringify(map, null, 2) + '\n');
  await rename(tmp, mapFile);
  console.log(`migrated ${moved} scenario state(s) into ${mapFile}; rewrote ${touchedFiles} .feature file(s)`);
}
