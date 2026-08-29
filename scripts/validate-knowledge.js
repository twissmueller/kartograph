#!/usr/bin/env node
// Validate a Kartograph knowledge bundle: OKF v0.2 conformance (§11) plus the two rules
// Kartograph adds — a `type` from the meta-glossary vocabulary, and one canonical term per
// concept. Each concept's frontmatter is additionally checked against
// schemas/v1/knowledge-concept.schema.json.
//
// Warnings are things OKF says a consumer MUST NOT reject a bundle for (broken cross-links,
// missing recommended fields). They are printed but never fail the run.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readBundle, checkBundle, KNOWLEDGE_DIR } from '../workflows/lib/knowledge.js';

const SCHEMA_DIR = new URL('../schemas/v1/', import.meta.url);

let cachedValidator;
async function getValidator() {
  if (cachedValidator) return cachedValidator;
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  cachedValidator = ajv.compile(JSON.parse(await readFile(new URL('knowledge-concept.schema.json', SCHEMA_DIR))));
  return cachedValidator;
}

// Pure: run the frontmatter schema over pre-read concepts.
export function schemaErrors(concepts, validate) {
  const errors = [];
  for (const c of concepts) {
    if (!c.frontmatter) continue; // reported by checkBundle as a conformance failure
    if (!validate(c.frontmatter)) {
      for (const e of validate.errors) errors.push(`${c.path}: frontmatter ${e.instancePath || '/'} ${e.message}`);
    }
  }
  return errors;
}

export async function validateKnowledge(projectRoot, dir = KNOWLEDGE_DIR) {
  const { concepts } = await readBundle(projectRoot, dir);
  const { errors, warnings } = checkBundle(concepts);
  const validate = await getValidator();
  const all = [...errors, ...schemaErrors(concepts, validate)];
  return { valid: all.length === 0, errors: all, warnings, count: concepts.length };
}

// CLI: node scripts/validate-knowledge.js [projectRoot] [bundleDir]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || process.cwd();
  const dir = process.argv[3] || KNOWLEDGE_DIR;
  const { valid, errors, warnings, count } = await validateKnowledge(root, dir);
  for (const w of warnings) console.error('  warning: ' + w);
  if (valid) { console.log(`OK: ${dir} (${count} concepts)`); process.exit(0); }
  console.error(`INVALID: ${dir}`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
