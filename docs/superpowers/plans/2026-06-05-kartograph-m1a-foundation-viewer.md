# Kartograph M1a — Map Foundation & Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the project-agnostic core of the Kartograph plugin — schemas, a validated seed map, the static live-reloading viewer, the ephemeral dev server, and `/karto-show` — so a user can render and explore a `kartograph.json` in the browser before any AI workflow exists.

**Architecture:** Three JSON Schemas (`kartograph`, `glossary`, `adr`) define the persistence model; a deterministic Node validator enforces schema + referential integrity. A pure-function library (`viewer/lib/*`) computes maturity, layout, and graph data and is unit-tested with `node --test`; a thin DOM layer renders it. A ~120-line Node dev server serves files, pushes change events over SSE, and accepts layout saves. No bundler, no framework, no build step.

**Tech Stack:** Node.js ≥ 20 (built-in `node:test`, `node:http`, `node:fs`, global `fetch`), `ajv` + `ajv-formats` for JSON Schema validation, vanilla ES-module JavaScript for the viewer, plain HTML/CSS.

---

## Conventions (apply to every task)

- **Slug pattern** everywhere: `^[a-z0-9][a-z0-9-]*$`.
- **Maturity keys:** `vision | sketched | building | usable | stable`.
- **ADR status:** `proposed | accepted | superseded | deprecated | rejected`.
- The cartography metaphor never appears in code identifiers or UI strings (spec §3.6).
- All source is ES modules (`"type": "module"` in `package.json`); test files end in `.test.js` and live in `test/`.
- Run all tests with `npm test` (which is `node --test`).

## File Structure

```
.claude-plugin/plugin.json     manifest: name + karto-show command
package.json                   type:module, ajv deps, test script
.gitignore                     node_modules, kartograph.layout.json scratch
NOTICE                         attribution (mattpocock/skills, superpowers)
README.md                      one-paragraph what/why + quickstart
reference/glossary.md          the ten bilingual meta-terms (static)
schemas/v1/glossary.schema.json   project-glossary collection
schemas/v1/adr.schema.json        ADR metadata collection
schemas/v1/kartograph.schema.json the whole map ($ref's the two above)
examples/kartograph.seed.json     the non-empty seed map (spec §4.1)
scripts/validate-kartograph.js    validateKartograph() + checkReferentialIntegrity() + CLI
viewer/lib/maturity.js         effectiveMaturity, aggregateMaturity, nodeBrightness
viewer/lib/layout.js           autoPlace
viewer/lib/graph.js            buildGraph, nodeSize
viewer/index.html              shell + panels
viewer/kartograph.js           DOM glue: fetch, render, drag, SSE, layout-save
viewer/styles.css              dark theme
server/serve.js                createServer() + start() + CLI (serve/SSE/layout)
commands/karto-show.md         launches server + opens browser
test/schemas.test.js
test/validate.test.js
test/maturity.test.js
test/layout.test.js
test/graph.test.js
test/server.test.js
```

---

## Task 1: Project skeleton

**Files:**
- Create: `package.json`, `.gitignore`, `.claude-plugin/plugin.json`, `NOTICE`, `README.md`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "kartograph",
  "version": "0.1.0",
  "description": "A living map of a software system, maintained jointly by human and AI.",
  "type": "module",
  "license": "MIT",
  "scripts": {
    "test": "node --test",
    "validate": "node scripts/validate-kartograph.js examples/kartograph.seed.json",
    "show": "node server/serve.js"
  },
  "dependencies": {
    "ajv": "^8.17.1",
    "ajv-formats": "^3.0.1"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `ajv` and `ajv-formats` present, no errors.

- [ ] **Step 3: Create `.gitignore`**

```gitignore
node_modules/
*.log
.DS_Store
```

- [ ] **Step 4: Create `.claude-plugin/plugin.json`**

```json
{
  "name": "kartograph",
  "description": "Living map of a software system: explore, chart, and build through schema-gated workflows, rendered in a live static viewer.",
  "version": "0.1.0",
  "commands": ["./commands/karto-show.md"],
  "skills": []
}
```

- [ ] **Step 5: Create `NOTICE`**

```text
Kartograph

Skill ideas are adapted (not copied 1:1) from mattpocock/skills
(https://github.com/mattpocock/skills) under its license.

Kartograph uses and honors the Superpowers project: /karto-explore invokes
superpowers:brainstorming and /karto-build invokes
superpowers:test-driven-development.

Dynamic workflows follow the Claude Code docs:
https://code.claude.com/docs/en/workflows
```

- [ ] **Step 6: Create `README.md`**

```markdown
# Kartograph

A living map of a software system, maintained jointly by human and AI. Contexts,
capabilities, and their maturity — derived from `.feature` files, rendered in a
static, live-reloading viewer.

## Quickstart

    npm install
    npm run validate     # validate the seed map against the schema
    npm test             # run the unit + integration tests
    npm run show         # open the viewer on the seed map

See `docs/superpowers/specs/2026-06-05-kartograph-plugin-design.md` for the design.
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore .claude-plugin/plugin.json NOTICE README.md
git commit -m "chore: scaffold kartograph plugin skeleton"
```

---

## Task 2: Reference meta-glossary

**Files:**
- Create: `reference/glossary.md`

- [ ] **Step 1: Create `reference/glossary.md`** (the ten bilingual framework terms; static, injected into prompts later)

```markdown
# Kartograph — Meta-Glossar

Die Grundbegriffe von Kartograph. Zehn Wörter, mit denen sich jede Anwendung
beschreiben lässt — die gemeinsame Sprache zwischen Mensch und KI. Jeder Begriff
zweisprachig: *Kanonisch (Übersetzung)*.

Mentales Modell: *Eine Anwendung nimmt Subjekte entgegen, transformiert sie nach
Regeln in andere Subjekte oder Ereignisse.*

## Akteur (Actor)
Wer die Anwendung benutzt oder mit ihr interagiert — ein Mensch in einer Rolle oder
ein externes System. Akteure lösen Capabilities aus und nehmen Subjekte oder
Ereignisse entgegen.

## Capability (Fähigkeit)
Eine Sache, die die Anwendung kann: nimmt Subjekte entgegen, transformiert sie nach
Regeln, produziert neue Subjekte oder Ereignisse. Hat einen Reifegrad und lebt in
genau einem Kontext. Besteht aus einem oder mehreren Features.

## Ereignis (Event)
Etwas Bemerkenswertes, das passiert ist (Vergangenheitsform). Hat einen Auslöser und
bezieht sich auf ein oder mehrere Subjekte. Andere Capabilities können darauf
reagieren.

## Feature (Funktion)
Ein lieferbares Stück einer Capability in fachlicher Sprache. Wird durch ein oder
mehrere Szenarien belegt und in `.feature`-Dateien (Gherkin) gespeichert.

## Glossar (Glossary)
Die Sammlung der Begriffe einer Anwendung mit Definitionen — Materialisierung der
gemeinsamen Sprache. Jeder Begriff in genau einer Form; Synonyme sind verboten.

## Kontext (Context)
Ein zusammenhängender Bereich der Anwendung. Innerhalb eines Kontexts gilt eine
konsistente Sprache.

## Regel (Rule)
Eine Bedingung, die immer gelten muss. Regeln gehören zu Subjekten und werden im Code
durch Validierungen, Constraints oder Domain-Logik durchgesetzt.

## Subjekt (Subject)
Eine Sache aus der Welt der Anwendung (Subject Matter), mit der Capabilities umgehen.
Wird im Code zu einer Datenklasse. Hat Identität und Eigenschaften; Regeln gelten für
sie. (Nicht der Handelnde — das ist der Akteur.)

## Szenario (Scenario)
Ein konkreter Beispielfall in Given-When-Then (Gherkin). Deckt Happy-Path, Edge Cases
und Error-Pfade ab. Spezifikation und ausführbarer Test zugleich. Der abgedeckte
Anteil bestimmt den Reifegrad.

## ADR (Architekturentscheidung / Architecture Decision Record)
Eine dokumentierte technische oder strukturelle Festlegung, die das *Wie* prägt, nicht
das *Was*. Hält Kontext, Entscheidung und Konsequenzen fest und hat einen Status
(Vorgeschlagen, Akzeptiert, Abgelöst, Verworfen). Kann sich auf Kontexte und
Capabilities beziehen und eine frühere ADR ablösen.
```

- [ ] **Step 2: Commit**

```bash
git add reference/glossary.md
git commit -m "docs: add ten-term bilingual meta-glossary"
```

---

## Task 3: JSON Schemas

**Files:**
- Create: `schemas/v1/glossary.schema.json`, `schemas/v1/adr.schema.json`, `schemas/v1/kartograph.schema.json`
- Test: `test/schemas.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/schemas.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

async function loadAjv() {
  const dir = new URL('../schemas/v1/', import.meta.url);
  const read = async (f) => JSON.parse(await readFile(new URL(f, dir)));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(await read('glossary.schema.json'));
  ajv.addSchema(await read('adr.schema.json'));
  ajv.addSchema(await read('kartograph.schema.json'));
  return ajv;
}

test('all three schemas compile and cross-reference', async () => {
  const ajv = await loadAjv();
  const v = ajv.getSchema('https://kartograph.dev/schemas/v1/kartograph.schema.json');
  assert.ok(v, 'kartograph schema compiled with its $refs resolved');
});

test('a minimal valid map passes', async () => {
  const ajv = await loadAjv();
  const v = ajv.getSchema('https://kartograph.dev/schemas/v1/kartograph.schema.json');
  const ok = v({
    version: '1',
    meta: { name: 'X' },
    contexts: { core: { name: 'Core', definition: 'd' } },
    capabilities: {},
  });
  assert.equal(ok, true, JSON.stringify(v.errors));
});

test('a bad maturity enum is rejected', async () => {
  const ajv = await loadAjv();
  const v = ajv.getSchema('https://kartograph.dev/schemas/v1/kartograph.schema.json');
  const ok = v({
    version: '1', meta: { name: 'X' },
    contexts: { core: { name: 'Core', definition: 'd' } },
    capabilities: { c: { name: 'C', context: 'core', definition: 'd',
      derived: { maturity: 'NOPE', featureCount: 0, scenarioCount: 0 } } },
  });
  assert.equal(ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/schemas.test.js`
Expected: FAIL — schema files do not exist (`ENOENT`).

- [ ] **Step 3: Create `schemas/v1/glossary.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kartograph.dev/schemas/v1/glossary.schema.json",
  "$defs": {
    "slug": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]*$" },
    "glossaryEntry": {
      "type": "object",
      "additionalProperties": false,
      "required": ["term", "definition", "type"],
      "properties": {
        "term": { "type": "string", "minLength": 1 },
        "definition": { "type": "string", "minLength": 1 },
        "type": { "enum": ["subjekt", "capability", "kontext", "akteur", "ereignis", "regel", "term"] },
        "aliasesToAvoid": { "type": "array", "items": { "type": "string" } },
        "related": { "type": "array", "items": { "$ref": "#/$defs/slug" } }
      }
    },
    "glossary": {
      "type": "object",
      "propertyNames": { "$ref": "#/$defs/slug" },
      "additionalProperties": { "$ref": "#/$defs/glossaryEntry" }
    }
  },
  "$ref": "#/$defs/glossary"
}
```

- [ ] **Step 4: Create `schemas/v1/adr.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kartograph.dev/schemas/v1/adr.schema.json",
  "$defs": {
    "adrEntry": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "title", "status", "date"],
      "properties": {
        "id": { "type": "string", "pattern": "^[0-9]{4}-[a-z0-9][a-z0-9-]*$" },
        "title": { "type": "string", "minLength": 1 },
        "status": { "enum": ["proposed", "accepted", "superseded", "deprecated", "rejected"] },
        "date": { "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
        "contexts": { "type": "array", "items": { "type": "string" } },
        "capabilities": { "type": "array", "items": { "type": "string" } },
        "supersedes": { "type": ["string", "null"] }
      }
    },
    "adrs": {
      "type": "object",
      "additionalProperties": { "$ref": "#/$defs/adrEntry" }
    }
  },
  "$ref": "#/$defs/adrs"
}
```

- [ ] **Step 5: Create `schemas/v1/kartograph.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://kartograph.dev/schemas/v1/kartograph.schema.json",
  "$defs": {
    "slug": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]*$" },
    "maturity": { "enum": ["vision", "sketched", "building", "usable", "stable"] },
    "context": {
      "type": "object", "additionalProperties": false,
      "required": ["name", "definition"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "definition": { "type": "string", "minLength": 1 },
        "color": { "type": "string" }
      }
    },
    "capability": {
      "type": "object", "additionalProperties": false,
      "required": ["name", "context", "definition"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "context": { "$ref": "#/$defs/slug" },
        "definition": { "type": "string", "minLength": 1 },
        "declaredStage": { "enum": ["vision", null] },
        "derived": {
          "type": "object", "additionalProperties": false,
          "properties": {
            "maturity": { "$ref": "#/$defs/maturity" },
            "featureCount": { "type": "integer", "minimum": 0 },
            "scenarioCount": { "type": "integer", "minimum": 0 }
          }
        }
      }
    },
    "subject": {
      "type": "object", "additionalProperties": false,
      "required": ["name"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "glossaryRef": { "$ref": "#/$defs/slug" },
        "properties": { "type": "array", "items": { "type": "string" } },
        "rules": { "type": "array", "items": { "$ref": "#/$defs/slug" } }
      }
    },
    "named": {
      "type": "object", "additionalProperties": false,
      "required": ["name"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "glossaryRef": { "$ref": "#/$defs/slug" }
      }
    },
    "rule": {
      "type": "object", "additionalProperties": false,
      "required": ["name", "statement"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "statement": { "type": "string", "minLength": 1 },
        "subject": { "$ref": "#/$defs/slug" }
      }
    },
    "slugMap": {
      "type": "object",
      "propertyNames": { "$ref": "#/$defs/slug" }
    }
  },
  "type": "object",
  "additionalProperties": false,
  "required": ["version", "meta", "contexts", "capabilities"],
  "properties": {
    "version": { "const": "1" },
    "meta": {
      "type": "object",
      "required": ["name"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "tagline": { "type": "string" }
      }
    },
    "contexts": {
      "allOf": [{ "$ref": "#/$defs/slugMap" }],
      "additionalProperties": { "$ref": "#/$defs/context" }
    },
    "capabilities": {
      "allOf": [{ "$ref": "#/$defs/slugMap" }],
      "additionalProperties": { "$ref": "#/$defs/capability" }
    },
    "subjects": {
      "allOf": [{ "$ref": "#/$defs/slugMap" }],
      "additionalProperties": { "$ref": "#/$defs/subject" }
    },
    "actors": {
      "allOf": [{ "$ref": "#/$defs/slugMap" }],
      "additionalProperties": { "$ref": "#/$defs/named" }
    },
    "events": {
      "allOf": [{ "$ref": "#/$defs/slugMap" }],
      "additionalProperties": { "$ref": "#/$defs/named" }
    },
    "rules": {
      "allOf": [{ "$ref": "#/$defs/slugMap" }],
      "additionalProperties": { "$ref": "#/$defs/rule" }
    },
    "glossary": { "$ref": "https://kartograph.dev/schemas/v1/glossary.schema.json#/$defs/glossary" },
    "adrs": { "$ref": "https://kartograph.dev/schemas/v1/adr.schema.json#/$defs/adrs" },
    "dependencies": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["from", "to"],
        "properties": {
          "from": { "$ref": "#/$defs/slug" },
          "to": { "$ref": "#/$defs/slug" }
        }
      }
    }
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/schemas.test.js`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add schemas/v1/ test/schemas.test.js
git commit -m "feat: add kartograph/glossary/adr JSON schemas"
```

---

## Task 4: Seed map

**Files:**
- Create: `examples/kartograph.seed.json`
- Test: extend `test/schemas.test.js`

- [ ] **Step 1: Write the failing test** (append to `test/schemas.test.js`)

```javascript
test('the seed map validates against the schema', async () => {
  const ajv = await loadAjv();
  const v = ajv.getSchema('https://kartograph.dev/schemas/v1/kartograph.schema.json');
  const seed = JSON.parse(await readFile(new URL('../examples/kartograph.seed.json', import.meta.url)));
  const ok = v(seed);
  assert.equal(ok, true, JSON.stringify(v.errors, null, 2));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/schemas.test.js`
Expected: FAIL — `examples/kartograph.seed.json` does not exist.

- [ ] **Step 3: Create `examples/kartograph.seed.json`**

```json
{
  "version": "1",
  "meta": { "name": "<project>", "tagline": "Uncharted — run /karto-init or /karto-explore to begin" },
  "contexts": {
    "core": { "name": "Core", "definition": "The starting area of the system.", "color": "#33aa77" }
  },
  "capabilities": {
    "start-here": {
      "name": "Start here",
      "context": "core",
      "definition": "Seed capability. Replace it by exploring and charting your first real feature.",
      "declaredStage": "vision",
      "derived": { "maturity": "vision", "featureCount": 0, "scenarioCount": 0 }
    }
  },
  "subjects": {},
  "actors": {},
  "events": {},
  "rules": {},
  "glossary": {},
  "adrs": {},
  "dependencies": []
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/schemas.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add examples/kartograph.seed.json test/schemas.test.js
git commit -m "feat: add non-empty seed map"
```

---

## Task 5: Validator — schema layer

**Files:**
- Create: `scripts/validate-kartograph.js`
- Test: `test/validate.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/validate.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateKartograph } from '../scripts/validate-kartograph.js';

async function seed() {
  return JSON.parse(await readFile(new URL('../examples/kartograph.seed.json', import.meta.url)));
}

test('seed map is valid', async () => {
  const result = await validateKartograph(await seed());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('schema violation is reported as invalid', async () => {
  const doc = await seed();
  doc.capabilities['start-here'].derived.maturity = 'NOPE';
  const result = await validateKartograph(doc);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/validate.test.js`
Expected: FAIL — cannot import `validateKartograph` (file missing).

- [ ] **Step 3: Create `scripts/validate-kartograph.js`** (schema layer only for now; integrity added in Task 6)

```javascript
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

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

export async function validateKartograph(doc) {
  const validate = await getValidator();
  const errors = [];
  if (!validate(doc)) {
    for (const e of validate.errors) errors.push(`schema: ${e.instancePath || '/'} ${e.message}`);
  }
  // Referential integrity layer is added in Task 6.
  return { valid: errors.length === 0, errors };
}

// CLI: node scripts/validate-kartograph.js <file>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('usage: validate-kartograph.js <file>'); process.exit(2); }
  const doc = JSON.parse(await readFile(file, 'utf8'));
  const { valid, errors } = await validateKartograph(doc);
  if (valid) { console.log(`OK: ${file}`); process.exit(0); }
  console.error(`INVALID: ${file}`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/validate.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify the CLI works**

Run: `node scripts/validate-kartograph.js examples/kartograph.seed.json`
Expected: prints `OK: examples/kartograph.seed.json`, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/validate-kartograph.js test/validate.test.js
git commit -m "feat: add kartograph schema validator + CLI"
```

---

## Task 6: Validator — referential integrity layer

**Files:**
- Modify: `scripts/validate-kartograph.js`
- Test: extend `test/validate.test.js`

- [ ] **Step 1: Write the failing test** (append to `test/validate.test.js`)

```javascript
import { checkReferentialIntegrity } from '../scripts/validate-kartograph.js';

test('dangling capability.context is caught by integrity check', async () => {
  const doc = await seed();
  doc.capabilities['start-here'].context = 'ghost';
  const errors = checkReferentialIntegrity(doc);
  assert.ok(errors.some(e => e.includes('start-here') && e.includes('ghost')));
});

test('dangling dependency edge is caught', async () => {
  const doc = await seed();
  doc.dependencies.push({ from: 'start-here', to: 'ghost' });
  const errors = checkReferentialIntegrity(doc);
  assert.ok(errors.some(e => e.includes('ghost')));
});

test('validateKartograph fails when integrity is broken even if schema is fine', async () => {
  const doc = await seed();
  doc.dependencies.push({ from: 'start-here', to: 'ghost' });
  const result = await validateKartograph(doc);
  assert.equal(result.valid, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/validate.test.js`
Expected: FAIL — `checkReferentialIntegrity` is not exported.

- [ ] **Step 3: Add `checkReferentialIntegrity` and wire it into `validateKartograph`**

In `scripts/validate-kartograph.js`, add this exported function:

```javascript
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
  return errors;
}
```

Then change the body of `validateKartograph` to run the integrity layer after the schema layer:

```javascript
export async function validateKartograph(doc) {
  const validate = await getValidator();
  const errors = [];
  if (!validate(doc)) {
    for (const e of validate.errors) errors.push(`schema: ${e.instancePath || '/'} ${e.message}`);
  }
  for (const e of checkReferentialIntegrity(doc)) errors.push(`integrity: ${e}`);
  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/validate.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-kartograph.js test/validate.test.js
git commit -m "feat: add referential-integrity layer to validator"
```

---

## Task 7: Maturity library

**Files:**
- Create: `viewer/lib/maturity.js`
- Test: `test/maturity.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/maturity.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveMaturity, aggregateMaturity, nodeBrightness } from '../viewer/lib/maturity.js';

test('effectiveMaturity prefers derived, falls back to declaredStage, then vision', () => {
  assert.equal(effectiveMaturity({ derived: { maturity: 'usable' }, declaredStage: 'vision' }), 'usable');
  assert.equal(effectiveMaturity({ declaredStage: 'vision' }), 'vision');
  assert.equal(effectiveMaturity({}), 'vision');
});

test('aggregateMaturity of no capabilities is 0', () => {
  assert.equal(aggregateMaturity({}), 0);
});

test('aggregateMaturity of one vision capability is 0', () => {
  assert.equal(aggregateMaturity({ a: { derived: { maturity: 'vision' } } }), 0);
});

test('aggregateMaturity averages weights', () => {
  const caps = { a: { derived: { maturity: 'usable' } }, b: { derived: { maturity: 'stable' } } };
  assert.equal(aggregateMaturity(caps), (0.7 + 1) / 2);
});

test('nodeBrightness returns a 0..1 value and defaults to the vision floor', () => {
  assert.equal(nodeBrightness('stable'), 1);
  assert.ok(nodeBrightness('mystery') > 0 && nodeBrightness('mystery') < 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/maturity.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `viewer/lib/maturity.js`**

```javascript
export const WEIGHTS = { vision: 0, sketched: 0.1, building: 0.3, usable: 0.7, stable: 1 };
export const BRIGHTNESS = { vision: 0.35, sketched: 0.5, building: 0.65, usable: 0.8, stable: 1 };

export function effectiveMaturity(cap) {
  return cap?.derived?.maturity ?? cap?.declaredStage ?? 'vision';
}

export function aggregateMaturity(capabilities, weights = WEIGHTS) {
  const caps = Object.values(capabilities || {});
  if (caps.length === 0) return 0;
  const sum = caps.reduce((acc, c) => acc + (weights[effectiveMaturity(c)] ?? 0), 0);
  return sum / caps.length;
}

export function nodeBrightness(maturity) {
  return BRIGHTNESS[maturity] ?? BRIGHTNESS.vision;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/maturity.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add viewer/lib/maturity.js test/maturity.test.js
git commit -m "feat: add maturity computation library"
```

---

## Task 8: Layout library

**Files:**
- Create: `viewer/lib/layout.js`
- Test: `test/layout.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/layout.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoPlace } from '../viewer/lib/layout.js';

test('existing positions are preserved', () => {
  const out = autoPlace(['a', 'b'], { a: { x: 10, y: 20 } });
  assert.deepEqual(out.a, { x: 10, y: 20 });
});

test('missing nodes get integer positions', () => {
  const out = autoPlace(['a'], {});
  assert.equal(typeof out.a.x, 'number');
  assert.equal(Number.isInteger(out.a.x), true);
  assert.equal(Number.isInteger(out.a.y), true);
});

test('placement is deterministic (no randomness)', () => {
  const a = autoPlace(['x', 'y', 'z'], {});
  const b = autoPlace(['x', 'y', 'z'], {});
  assert.deepEqual(a, b);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/layout.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `viewer/lib/layout.js`**

```javascript
// Deterministic circular auto-placement for nodes without a saved position.
// No Math.random — same input always yields the same output.
export function autoPlace(slugs, existingLayout = {}, opts = {}) {
  const { width = 1200, height = 800, radius = 300 } = opts;
  const cx = opts.cx ?? width / 2;
  const cy = opts.cy ?? height / 2;
  const missing = slugs.filter((s) => !existingLayout[s]);
  const placed = {};
  missing.forEach((slug, i) => {
    const angle = (2 * Math.PI * i) / Math.max(missing.length, 1);
    placed[slug] = {
      x: Math.round(cx + radius * Math.cos(angle)),
      y: Math.round(cy + radius * Math.sin(angle)),
    };
  });
  return { ...placed, ...existingLayout };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/layout.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add viewer/lib/layout.js test/layout.test.js
git commit -m "feat: add deterministic auto-layout library"
```

---

## Task 9: Graph library

**Files:**
- Create: `viewer/lib/graph.js`
- Test: `test/graph.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/graph.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildGraph, nodeSize } from '../viewer/lib/graph.js';

async function seed() {
  return JSON.parse(await readFile(new URL('../examples/kartograph.seed.json', import.meta.url)));
}

test('buildGraph turns the seed map into one node, one context, no edges', async () => {
  const g = buildGraph(await seed());
  assert.equal(g.nodes.length, 1);
  assert.equal(g.nodes[0].slug, 'start-here');
  assert.equal(g.nodes[0].context, 'core');
  assert.equal(g.nodes[0].maturity, 'vision');
  assert.equal(g.contexts.length, 1);
  assert.equal(g.edges.length, 0);
});

test('nodeSize grows with feature count', () => {
  assert.ok(nodeSize(10) > nodeSize(0));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/graph.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `viewer/lib/graph.js`**

```javascript
import { effectiveMaturity } from './maturity.js';

export function buildGraph(k) {
  const nodes = Object.entries(k.capabilities || {}).map(([slug, c]) => ({
    slug,
    name: c.name,
    context: c.context,
    maturity: effectiveMaturity(c),
    featureCount: c.derived?.featureCount ?? 0,
  }));
  const contexts = Object.entries(k.contexts || {}).map(([slug, c]) => ({
    slug, name: c.name, color: c.color ?? '#666666',
  }));
  const edges = (k.dependencies || []).map((d) => ({ from: d.from, to: d.to }));
  return { nodes, edges, contexts };
}

export function nodeSize(featureCount) {
  return 30 + 4 * featureCount;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/graph.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add viewer/lib/graph.js test/graph.test.js
git commit -m "feat: add graph-building library"
```

---

## Task 10: Dev server — static serving

**Files:**
- Create: `server/serve.js`
- Test: `test/server.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/server.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../server/serve.js';

async function tmpProject() {
  const dir = await mkdtemp(join(tmpdir(), 'karto-'));
  await writeFile(join(dir, 'kartograph.json'), JSON.stringify({ version: '1', meta: { name: 'T' } }));
  return dir;
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
}

test('serves kartograph.json from the project root', async () => {
  const projectRoot = await tmpProject();
  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/kartograph.json`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.meta.name, 'T');
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server.test.js`
Expected: FAIL — cannot import `createServer`.

- [ ] **Step 3: Create `server/serve.js`**

```javascript
import http from 'node:http';
import { createReadStream, watch } from 'node:fs';
import { stat, readFile, writeFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.feature': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

async function tryServeFile(res, baseDir, urlPath) {
  const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(baseDir, safe);
  try {
    const s = await stat(filePath);
    if (!s.isFile()) return false;
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

export function createServer({ projectRoot, viewerDir }) {
  const sseClients = new Set();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';

    if (path === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('retry: 1000\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (path === '/layout' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const json = JSON.parse(body || '{}');
        await writeFile(join(projectRoot, 'kartograph.layout.json'), JSON.stringify(json, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400);
        res.end(String(e.message));
      }
      return;
    }

    // viewer assets first, then project files (kartograph.json, .feature, .md, layout)
    if (await tryServeFile(res, viewerDir, path)) return;
    if (await tryServeFile(res, projectRoot, path)) return;
    res.writeHead(404);
    res.end('not found');
  });

  // Watch the project for changes and notify SSE clients.
  const notify = (() => {
    let timer = null;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const c of sseClients) c.write('data: changed\n\n');
      }, 100);
    };
  })();

  let watcher;
  try {
    watcher = watch(projectRoot, { recursive: true }, (_event, filename) => {
      if (!filename) return notify();
      if (/kartograph|\.feature$|decisions|\.json$/.test(filename)) notify();
    });
  } catch {
    // recursive watch unsupported on this platform; watch the root file only
    watcher = watch(join(projectRoot, 'kartograph.json'), notify);
  }
  server.on('close', () => watcher?.close());

  return server;
}

export function start({ projectRoot, viewerDir, port = 4123 }) {
  const server = createServer({ projectRoot, viewerDir });
  server.listen(port, () => {
    console.log(`Kartograph viewer: http://127.0.0.1:${port}`);
  });
  return server;
}

// CLI: node server/serve.js [port]   (projectRoot = cwd, viewer = sibling ../viewer)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 4123);
  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  start({ projectRoot: process.cwd(), viewerDir, port });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add server/serve.js test/server.test.js
git commit -m "feat: add dev server with static file serving"
```

---

## Task 11: Dev server — layout save

**Files:**
- Modify: none (handler already present from Task 10)
- Test: extend `test/server.test.js`

- [ ] **Step 1: Write the failing test** (append to `test/server.test.js`)

```javascript
test('POST /layout writes kartograph.layout.json to the project root', async () => {
  const projectRoot = await tmpProject();
  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'start-here': { x: 5, y: 9 } }),
    });
    assert.equal(res.status, 200);
    const saved = JSON.parse(await readFile(join(projectRoot, 'kartograph.layout.json'), 'utf8'));
    assert.deepEqual(saved['start-here'], { x: 5, y: 9 });
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it passes** (handler already exists — this is a guard test)

Run: `node --test test/server.test.js`
Expected: PASS (2 tests). If it fails, fix the `/layout` branch in `server/serve.js`.

- [ ] **Step 3: Commit**

```bash
git add test/server.test.js
git commit -m "test: cover layout-save endpoint"
```

---

## Task 12: Dev server — live-reload SSE

**Files:**
- Modify: none (SSE + watch already present from Task 10)
- Test: extend `test/server.test.js`

- [ ] **Step 1: Write the failing test** (append to `test/server.test.js`)

```javascript
test('a file change pushes a "changed" SSE event', async () => {
  const projectRoot = await tmpProject();
  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const controller = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/events`, { signal: controller.signal });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    // trigger a change after the stream is open
    setTimeout(() => writeFile(join(projectRoot, 'kartograph.json'), JSON.stringify({ version: '1', meta: { name: 'T2' } })), 150);

    let received = '';
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
      if (received.includes('data: changed')) break;
    }
    controller.abort();
    assert.ok(received.includes('data: changed'), `no change event; got: ${received}`);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test test/server.test.js`
Expected: PASS (3 tests). On Linux without recursive-watch support the fallback watches `kartograph.json` directly, which this test still triggers.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all test files pass (schemas, validate, maturity, layout, graph, server).

- [ ] **Step 4: Commit**

```bash
git add test/server.test.js
git commit -m "test: cover live-reload SSE endpoint"
```

---

## Task 13: Viewer DOM layer

**Files:**
- Create: `viewer/styles.css`, `viewer/index.html`, `viewer/kartograph.js`

This task has no unit test (DOM rendering); the pure logic it uses is already tested in Tasks 7–9. It ends with a manual smoke check.

- [ ] **Step 1: Create `viewer/styles.css`**

```css
:root { --bg: #1a1d21; --panel: #23272e; --ink: #e6e6e6; --muted: #9aa0a6; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 14px/1.5 -apple-system, system-ui, sans-serif; }
header { padding: 16px 20px; display: flex; justify-content: space-between; align-items: baseline; }
header h1 { font-size: 18px; margin: 0; }
header .stats { color: var(--muted); font-size: 13px; }
#canvas { position: relative; height: 70vh; margin: 0 16px; border-radius: 10px;
  background: #15171b; overflow: hidden; }
.context-region { position: absolute; border: 1px solid #ffffff22; border-radius: 12px;
  background: #ffffff08; }
.context-label { position: absolute; color: var(--muted); font-size: 12px; padding: 4px 8px; }
.node { position: absolute; transform: translate(-50%, -50%); border-radius: 10px;
  padding: 8px 12px; cursor: grab; color: #fff; user-select: none; white-space: nowrap; }
.node small { display: block; opacity: 0.8; font-size: 11px; }
svg.edges { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.edges line { stroke: #ffffff33; stroke-width: 1; }
.panels { display: flex; gap: 16px; padding: 16px; }
.panel { flex: 1; background: var(--panel); border-radius: 10px; padding: 12px 16px; }
.panel h2 { font-size: 13px; text-transform: uppercase; color: var(--muted); margin: 0 0 8px; }
.bar { height: 8px; border-radius: 4px; background: #ffffff14; overflow: hidden; }
.bar > div { height: 100%; background: #6cc070; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
td { padding: 2px 4px; border-bottom: 1px solid #ffffff10; vertical-align: top; }
```

- [ ] **Step 2: Create `viewer/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Kartograph</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header>
    <div><h1 id="title">Kartograph</h1><div class="stats" id="stats"></div></div>
    <div class="stats" id="maturity"></div>
  </header>
  <div id="canvas"><svg class="edges" id="edges"></svg></div>
  <div class="panels">
    <div class="panel"><h2>Maturity</h2><div class="bar"><div id="maturityBar"></div></div><div id="maturityBreakdown" class="stats"></div></div>
    <div class="panel"><h2>Glossary</h2><table id="glossary"></table></div>
    <div class="panel"><h2>Decisions (ADR)</h2><table id="adrs"></table></div>
  </div>
  <script type="module" src="/kartograph.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `viewer/kartograph.js`**

```javascript
import { buildGraph, nodeSize } from '/lib/graph.js';
import { aggregateMaturity, nodeBrightness, WEIGHTS } from '/lib/maturity.js';
import { autoPlace } from '/lib/layout.js';

const canvas = document.getElementById('canvas');
const edgesSvg = document.getElementById('edges');
let layout = {};

async function loadJSON(path, fallback) {
  try { const r = await fetch(path, { cache: 'no-store' }); return r.ok ? await r.json() : fallback; }
  catch { return fallback; }
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '#666666');
  const n = parseInt(m ? m[1] : '666666', 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function shade(hex, brightness) {
  const { r, g, b } = hexToRgb(hex);
  const f = 0.4 + 0.6 * brightness; // never fully black
  return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
}

async function saveLayout() {
  await fetch('/layout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(layout) });
}

function render(k) {
  const g = buildGraph(k);
  const contextColor = Object.fromEntries(g.contexts.map((c) => [c.slug, c.color]));
  document.getElementById('title').textContent = k.meta?.name ?? 'Kartograph';
  document.getElementById('stats').textContent =
    `${g.nodes.length} capabilities · ${g.contexts.length} contexts`;

  // maturity panel
  const pct = Math.round(aggregateMaturity(k.capabilities) * 100);
  document.getElementById('maturity').textContent = `maturity ${pct}%`;
  document.getElementById('maturityBar').style.width = pct + '%';
  const counts = {};
  for (const n of g.nodes) counts[n.maturity] = (counts[n.maturity] ?? 0) + 1;
  document.getElementById('maturityBreakdown').textContent =
    Object.keys(WEIGHTS).map((m) => `${m} ${counts[m] ?? 0}`).join(' · ');

  // positions
  layout = autoPlace(g.nodes.map((n) => n.slug), layout, { width: canvas.clientWidth, height: canvas.clientHeight });

  // nodes
  for (const el of canvas.querySelectorAll('.node')) el.remove();
  const pos = {};
  for (const n of g.nodes) {
    const p = layout[n.slug];
    pos[n.slug] = p;
    const el = document.createElement('div');
    el.className = 'node';
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.style.background = shade(contextColor[n.context] ?? '#666666', nodeBrightness(n.maturity));
    el.style.fontSize = Math.max(12, Math.min(18, 11 + n.featureCount / 3)) + 'px';
    el.innerHTML = `${n.name}<small>${n.maturity}${n.featureCount ? ` · ${n.featureCount} features` : ''}</small>`;
    makeDraggable(el, n.slug, pos);
    canvas.appendChild(el);
  }

  // edges
  edgesSvg.innerHTML = '';
  for (const e of g.edges) {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
    edgesSvg.appendChild(line);
  }

  // glossary + adr panels
  const gTable = document.getElementById('glossary');
  gTable.innerHTML = Object.values(k.glossary ?? {})
    .map((t) => `<tr><td><b>${t.term}</b></td><td>${t.definition}</td></tr>`).join('') || '<tr><td>—</td></tr>';
  const aTable = document.getElementById('adrs');
  aTable.innerHTML = Object.values(k.adrs ?? {})
    .map((a) => `<tr><td>${a.id}</td><td>${a.title}</td><td>${a.status}</td></tr>`).join('') || '<tr><td>—</td></tr>';
}

function makeDraggable(el, slug, pos) {
  let startX, startY, origX, origY;
  el.addEventListener('pointerdown', (ev) => {
    el.setPointerCapture(ev.pointerId); el.style.cursor = 'grabbing';
    startX = ev.clientX; startY = ev.clientY; origX = layout[slug].x; origY = layout[slug].y;
  });
  el.addEventListener('pointermove', (ev) => {
    if (startX === undefined) return;
    const x = origX + (ev.clientX - startX), y = origY + (ev.clientY - startY);
    layout[slug] = { x, y }; pos[slug] = { x, y };
    el.style.left = x + 'px'; el.style.top = y + 'px';
    for (const line of edgesSvg.querySelectorAll('line')) {/* simplest: full re-render on drop */}
  });
  el.addEventListener('pointerup', async () => {
    startX = undefined; el.style.cursor = 'grab';
    await saveLayout(); reload();
  });
}

async function reload() {
  const k = await loadJSON('/kartograph.json', { meta: { name: 'Kartograph' }, contexts: {}, capabilities: {} });
  render(k);
}

async function boot() {
  layout = await loadJSON('/kartograph.layout.json', {});
  await reload();
  const es = new EventSource('/events');
  es.onmessage = () => reload();
}
boot();
```

- [ ] **Step 4: Manual smoke check**

Run: `node server/serve.js 4123` from a directory containing a copy of the seed map:

```bash
cp examples/kartograph.seed.json /tmp/karto-demo/kartograph.json 2>/dev/null || (mkdir -p /tmp/karto-demo && cp examples/kartograph.seed.json /tmp/karto-demo/kartograph.json)
( cd /tmp/karto-demo && node /Users/tobias.wissmueller/projects/kartograph/server/serve.js 4123 ) &
open http://127.0.0.1:4123
```

Expected: the browser shows title `<project>`, one "Start here" node labelled `vision`, a "Maturity 0%" bar, and empty Glossary/ADR panels. Drag the node; confirm `/tmp/karto-demo/kartograph.layout.json` is written. Edit `/tmp/karto-demo/kartograph.json` (e.g. change `meta.name`) and confirm the page updates without reload. Then stop the server (`kill %1`).

- [ ] **Step 5: Commit**

```bash
git add viewer/styles.css viewer/index.html viewer/kartograph.js
git commit -m "feat: add static viewer DOM layer (render, drag, live-reload)"
```

---

## Task 14: `/karto-show` command

**Files:**
- Create: `commands/karto-show.md`

- [ ] **Step 1: Create `commands/karto-show.md`**

````markdown
---
description: Open the Kartograph viewer in the browser on the current project's map, with live reload.
---

Launch the Kartograph viewer for the current project.

1. Confirm a `kartograph.json` exists in the project root. If it does not, copy the seed
   map so there is something to show:
   `cp "${CLAUDE_PLUGIN_ROOT}/examples/kartograph.seed.json" kartograph.json`
2. Start the ephemeral dev server in the background, serving the project root and the
   plugin's viewer, on port 4123 (try 4124+ if busy):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/server/serve.js" 4123
   ```

   Run it with `run_in_background: true` so the session stays responsive.
3. Open the browser at `http://127.0.0.1:4123` (`open` on macOS, `xdg-open` on Linux).
4. Tell the user the viewer is live, that edits to `kartograph.json`,
   `kartograph/decisions/`, and `features/**` auto-refresh the page, and that dragging
   nodes saves `kartograph.layout.json`. Remind them to stop the background server when
   done.
````

- [ ] **Step 2: Verify the plugin manifest references the command**

Confirm `.claude-plugin/plugin.json` lists `"./commands/karto-show.md"` in `commands` (added in Task 1). No code change expected.

- [ ] **Step 3: Commit**

```bash
git add commands/karto-show.md
git commit -m "feat: add /karto-show command"
```

---

## Final verification

- [ ] **Run the whole suite**

Run: `npm test`
Expected: every test file passes — schemas (4), validate (5), maturity (5), layout (3), graph (2), server (3).

- [ ] **Validate the seed via the npm script**

Run: `npm run validate`
Expected: `OK: examples/kartograph.seed.json`.

- [ ] **Confirm the tree matches the File Structure section** and that no step left a placeholder behind.

---

## Self-Review (completed during planning)

- **Spec coverage (M1a slice):** plugin skeleton + `plugin.json` (Task 1) ✓; `schemas/v1/` kartograph+glossary+adr (Task 3) ✓; seed map §4.1 (Task 4); deterministic gate §10 schema+integrity layers (Tasks 5–6) ✓; maturity model §6 keys/weights (Task 7) ✓; viewer English-UI/domain-terms §12 (Task 13) ✓; tiny dev server serve/SSE/layout-save §12 (Tasks 10–12) ✓; `/karto-show` (Task 14) ✓; bilingual meta-glossary §2 (Task 2) ✓; attribution §18 (NOTICE, Task 1) ✓. `discovery.schema.json`, `karto-grill`, `/karto-explore`, `/karto-init` are **M1b** — intentionally out of scope here.
- **Type consistency:** `effectiveMaturity`, `aggregateMaturity`, `nodeBrightness`, `WEIGHTS` (maturity.js); `autoPlace` (layout.js); `buildGraph`, `nodeSize` (graph.js); `validateKartograph`, `checkReferentialIntegrity` (validator); `createServer`, `start` (server) — names used identically across tasks and tests.
- **No placeholders:** every code step ships complete, runnable content.
- **Note:** maturity here is rendered from the cached `derived` block in `kartograph.json`. Recomputing it from `.feature` files (reconciliation) is the `chart`/`build` job in M2/M3, per spec §1/§9 — deliberately not in M1a.
```
