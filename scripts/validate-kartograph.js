#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { maturityMatchesCounts } from '../workflows/lib/maturity-derive.js';
import { readBundle, checkBundle, checkMapRefs } from '../workflows/lib/knowledge.js';
import { KARTO_DIR } from '../workflows/lib/paths.js';
import { needsMigration } from './migrate-glossary-to-okf.js';

// The project a map file belongs to — its `.kartograph/` parent, so validating another
// project's map resolves that project's knowledge bundle rather than the current directory's.
export function projectRootFor(mapFile) {
  const dir = dirname(resolve(mapFile));
  return basename(dir) === KARTO_DIR ? dirname(dir) : process.cwd();
}

const SCHEMA_DIR = new URL('../schemas/v1/', import.meta.url);
const KARTOGRAPH_ID = 'https://kartograph.dev/schemas/v1/kartograph.schema.json';

let cachedValidator;
async function getValidator() {
  if (cachedValidator) return cachedValidator;
  const read = async (f) => JSON.parse(await readFile(new URL(f, SCHEMA_DIR)));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(await read('adr.schema.json'));
  ajv.addSchema(await read('kartograph.schema.json'));
  cachedValidator = ajv.getSchema(KARTOGRAPH_ID);
  return cachedValidator;
}

export function checkReferentialIntegrity(doc) {
  const errors = [];
  const keys = (o) => new Set(Object.keys(o || {}));
  const contexts = keys(doc.contexts);
  const capabilities = keys(doc.capabilities);
  const subjects = keys(doc.subjects);
  const rules = keys(doc.rules);
  const adrs = keys(doc.adrs);

  for (const [slug, cap] of Object.entries(doc.capabilities || {})) {
    if (!contexts.has(cap.context)) errors.push(`capability '${slug}' references missing context '${cap.context}'`);
    const d = cap.derived;
    if (d && d.maturity && !maturityMatchesCounts(d.maturity, d)) {
      errors.push(`capability '${slug}' maturity '${d.maturity}' is inconsistent with its coverage ` +
        `(featureCount ${d.featureCount}, scenarioCount ${d.scenarioCount}) — maturity must be earned, not declared`);
    }
  }
  for (const dep of doc.dependencies || []) {
    if (!capabilities.has(dep.from)) errors.push(`dependency.from '${dep.from}' is not a capability`);
    if (!capabilities.has(dep.to)) errors.push(`dependency.to '${dep.to}' is not a capability`);
  }
  for (const [slug, s] of Object.entries(doc.subjects || {})) {
    for (const r of s.rules || []) if (!rules.has(r)) errors.push(`subject '${slug}' references missing rule '${r}'`);
  }
  for (const [slug, r] of Object.entries(doc.rules || {})) {
    if (r.subject && !subjects.has(r.subject)) errors.push(`rule '${slug}' references missing subject '${r.subject}'`);
  }
  for (const [slug, a] of Object.entries(doc.adrs || {})) {
    if (a.supersedes && !adrs.has(a.supersedes)) errors.push(`adr '${slug}' supersedes missing adr '${a.supersedes}'`);
  }
  // tracking keys are scenario IDs `<capability>/<feature.feature>#"<name>"`; the capability
  // prefix must resolve so stale state (e.g. after a capability is renamed) is surfaced.
  for (const id of Object.keys(doc.tracking || {})) {
    const cap = id.split('/')[0];
    if (!capabilities.has(cap)) errors.push(`tracking entry '${id}' references missing capability '${cap}'`);
  }
  // scenarioNotes shares the tracking key space; its capability prefix must resolve too.
  for (const id of Object.keys(doc.scenarioNotes || {})) {
    const cap = id.split('/')[0];
    if (!capabilities.has(cap)) errors.push(`scenarioNotes entry '${id}' references missing capability '${cap}'`);
  }
  return errors;
}

// Validate a map. `glossaryRef` pointers are resolved against the knowledge bundle on disk,
// so pass `projectRoot` to have them checked; without it the pointers are left unverified
// (the schema still constrains their shape). This gate reads the filesystem by design — the
// glossary's truth lives in `knowledge/`, and a pointer can only be checked against it there.
export async function validateKartograph(doc, { projectRoot, bundleDir } = {}) {
  const validate = await getValidator();
  const errors = [];
  const warnings = [];
  // A map written before v0.18 keeps its definitions inline, which the schema now rejects as
  // additional properties — an error that says nothing about the actual problem. Lead with the
  // fix instead, so the wall a downstream user hits tells them how to get past it.
  if (needsMigration(doc)) {
    errors.push('this map predates v0.18: it still holds definitions that now live in the '
      + 'knowledge/ bundle. Run /karto-sync to migrate it, or invoke the script directly: '
      + '`node "$CLAUDE_PLUGIN_ROOT"/scripts/migrate-glossary-to-okf.js .` — it is '
      + 'deterministic, idempotent, and leaves a pointer behind for every definition it moves.');
  }
  if (!validate(doc)) {
    for (const e of validate.errors) errors.push(`schema: ${e.instancePath || '/'} ${e.message}`);
  }
  for (const e of checkReferentialIntegrity(doc)) errors.push(`integrity: ${e}`);

  if (projectRoot) {
    const bundle = bundleDir || (doc.knowledge && doc.knowledge.bundle) || undefined;
    const { concepts } = await readBundle(projectRoot, bundle);
    const checked = checkBundle(concepts);
    for (const e of checked.errors) errors.push(`knowledge: ${e}`);
    for (const w of checked.warnings) warnings.push(`knowledge: ${w}`);
    for (const e of checkMapRefs(doc, concepts)) errors.push(`knowledge: ${e}`);
  }
  return { valid: errors.length === 0, errors, warnings };
}

// CLI: node scripts/validate-kartograph.js <file> [--bundle <dir>]
//   --bundle overrides where the knowledge bundle is read from, for a map that is not sitting
//   in its own project (e.g. the shipped seed, whose bundle is examples/seed-knowledge).
// Also exposed as the `kartograph-validate`
// bin. The bin is invoked through a `.bin` symlink whose path differs from this module's own
// (symlink-resolved) path, so resolve argv[1] through realpath before comparing.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const bundleAt = argv.indexOf('--bundle');
  const bundleDir = bundleAt === -1 ? undefined : argv[bundleAt + 1];
  // Drop the flag and its value; with no flag present nothing is dropped (a -1 index must
  // not make `bundleAt + 1` swallow the filename at position 0).
  const file = argv.filter((_a, i) => bundleAt === -1 || (i !== bundleAt && i !== bundleAt + 1))[0];
  if (!file) { console.error('usage: validate-kartograph.js <file> [--bundle <dir>]'); process.exit(2); }
  const doc = JSON.parse(await readFile(file, 'utf8'));
  const { valid, errors, warnings } = await validateKartograph(doc, { projectRoot: projectRootFor(file), bundleDir });
  for (const w of warnings) console.error('  warning: ' + w);
  if (valid) { console.log(`OK: ${file}`); process.exit(0); }
  console.error(`INVALID: ${file}`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
