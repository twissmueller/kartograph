#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { maturityMatchesCounts } from '../workflows/lib/maturity-derive.js';

const SCHEMA_DIR = new URL('../schemas/v1/', import.meta.url);
const KARTOGRAPH_ID = 'https://kartograph.dev/schemas/v1/kartograph.schema.json';

let cachedValidator;
async function getValidator() {
  if (cachedValidator) return cachedValidator;
  const read = async (f) => JSON.parse(await readFile(new URL(f, SCHEMA_DIR)));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(await read('glossary.schema.json'));
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
  const glossary = keys(doc.glossary);
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
    if (s.glossaryRef && !glossary.has(s.glossaryRef)) errors.push(`subject '${slug}' references missing glossary term '${s.glossaryRef}'`);
  }
  for (const [slug, r] of Object.entries(doc.rules || {})) {
    if (r.subject && !subjects.has(r.subject)) errors.push(`rule '${slug}' references missing subject '${r.subject}'`);
  }
  for (const group of ['actors', 'events']) {
    for (const [slug, n] of Object.entries(doc[group] || {})) {
      if (n.glossaryRef && !glossary.has(n.glossaryRef)) errors.push(`${group} '${slug}' references missing glossary term '${n.glossaryRef}'`);
    }
  }
  for (const [slug, g] of Object.entries(doc.glossary || {})) {
    for (const rel of g.related || []) if (!glossary.has(rel)) errors.push(`glossary '${slug}' relates to missing term '${rel}'`);
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

export async function validateKartograph(doc) {
  const validate = await getValidator();
  const errors = [];
  if (!validate(doc)) {
    for (const e of validate.errors) errors.push(`schema: ${e.instancePath || '/'} ${e.message}`);
  }
  for (const e of checkReferentialIntegrity(doc)) errors.push(`integrity: ${e}`);
  return { valid: errors.length === 0, errors };
}

// CLI: node scripts/validate-kartograph.js <file> — also exposed as the `kartograph-validate`
// bin. The bin is invoked through a `.bin` symlink whose path differs from this module's own
// (symlink-resolved) path, so resolve argv[1] through realpath before comparing.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('usage: validate-kartograph.js <file>'); process.exit(2); }
  const doc = JSON.parse(await readFile(file, 'utf8'));
  const { valid, errors } = await validateKartograph(doc);
  if (valid) { console.log(`OK: ${file}`); process.exit(0); }
  console.error(`INVALID: ${file}`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
