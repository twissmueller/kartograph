import { readFile, writeFile, readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeature, scenarioClass } from '../workflows/lib/gherkin.js';
import { deriveMaturity } from '../workflows/lib/maturity-derive.js';
import { mapPath as defaultMapPath } from '../workflows/lib/paths.js';
import { validateKartograph } from './validate-kartograph.js';

// Pure: recompute every capability's derived block from pre-read features.
// featuresByCapability: { capSlug: [{ scenarios: [{ tags }] }] }
export function reconcileMap(map, featuresByCapability) {
  const next = structuredClone(map);
  for (const [slug, cap] of Object.entries(next.capabilities || {})) {
    const files = featuresByCapability[slug] || [];
    let scenarioCount = 0;
    const classes = new Set();
    for (const f of files) for (const s of f.scenarios || []) {
      scenarioCount++;
      const c = scenarioClass(s.tags);
      if (c) classes.add(c);
    }
    cap.derived = { maturity: deriveMaturity({ featureCount: files.length, scenarioCount, classes }), featureCount: files.length, scenarioCount };
  }
  return next;
}

// Pure: warn for every dependency `features` entry whose filename is not present
// in the `from` capability's directory. namesByCapability: { slug: [filename, ...] }.
// Non-fatal — surfaces drift between a declared edge and the scenarios that justify it.
export function dependencyFeatureWarnings(map, namesByCapability) {
  const warnings = [];
  for (const dep of map.dependencies || []) {
    const have = new Set(namesByCapability[dep.from] || []);
    for (const file of dep.features || []) {
      if (!have.has(file)) warnings.push(`dependency ${dep.from}->${dep.to} references missing feature '${file}'`);
    }
  }
  return warnings;
}

// Read just the .feature filenames per capability (for the dependency check above).
async function readFeatureNamesByCapability(root, map) {
  const out = {};
  for (const [slug, cap] of Object.entries(map.capabilities || {})) {
    const dir = join(root, 'features', cap.context, slug);
    let entries = [];
    try { entries = await readdir(dir); } catch { entries = []; }
    out[slug] = entries.filter((n) => n.endsWith('.feature'));
  }
  return out;
}

// Read all .feature files for a capability from features/<context>/<slug>/.
async function readFeaturesByCapability(root, map) {
  const out = {};
  for (const [slug, cap] of Object.entries(map.capabilities || {})) {
    const dir = join(root, 'features', cap.context, slug);
    let entries = [];
    try { entries = await readdir(dir); } catch { entries = []; }
    const files = [];
    for (const name of entries) {
      if (!name.endsWith('.feature')) continue;
      const text = await readFile(join(dir, name), 'utf8');
      files.push(parseFeature(text));
    }
    out[slug] = files;
  }
  return out;
}

// CLI: node scripts/reconcile.js [.kartograph/kartograph.json] — recompute derived
// blocks, validate, then write via a temp file + rename so the map is never half-written.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const mapPath = process.argv[2] || defaultMapPath(root);
  const map = JSON.parse(await readFile(mapPath, 'utf8'));
  const featuresByCapability = await readFeaturesByCapability(root, map);
  const next = reconcileMap(map, featuresByCapability);
  const { valid, errors } = await validateKartograph(next);
  if (!valid) { console.error('INVALID after reconcile:'); for (const e of errors) console.error('  - ' + e); process.exit(1); }
  const names = await readFeatureNamesByCapability(root, next);
  for (const w of dependencyFeatureWarnings(next, names)) console.error('  warning: ' + w);
  const tmp = mapPath + '.reconcile.tmp';
  await writeFile(tmp, JSON.stringify(next, null, 2) + '\n');
  await rename(tmp, mapPath);
  console.log(`reconciled ${mapPath}`);
}

export { readFeaturesByCapability };
