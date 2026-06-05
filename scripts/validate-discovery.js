import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const SCHEMA_DIR = new URL('../schemas/v1/', import.meta.url);
const DISCOVERY_ID = 'https://kartograph.dev/schemas/v1/discovery.schema.json';

let cachedValidator;
async function getValidator() {
  if (cachedValidator) return cachedValidator;
  const read = async (f) => JSON.parse(await readFile(new URL(f, SCHEMA_DIR)));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(await read('discovery.schema.json'));
  cachedValidator = ajv.getSchema(DISCOVERY_ID);
  return cachedValidator;
}

export async function validateDiscovery(doc) {
  const validate = await getValidator();
  const errors = [];
  if (!validate(doc)) {
    for (const e of validate.errors) errors.push(`schema: ${e.instancePath || '/'} ${e.message}`);
  }
  return { valid: errors.length === 0, errors };
}

// CLI: node scripts/validate-discovery.js <file>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('usage: validate-discovery.js <file>'); process.exit(2); }
  const doc = JSON.parse(await readFile(file, 'utf8'));
  const { valid, errors } = await validateDiscovery(doc);
  if (valid) { console.log(`OK: ${file}`); process.exit(0); }
  console.error(`INVALID: ${file}`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
