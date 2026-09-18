# Nested Capabilities, Plain Gherkin and the v0 Feature-Tree Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let capabilities nest, make the features validator accept plain Gherkin (optional `Rule:`, no EARS line, `Background:`, tags before `Feature:`, `# language: de`), ship a tool that migrates v0 feature trees onto that contract, fix mitoshi's parser, migrate hyperid, beatrep and mokuso, and release v2.1.0.

**Architecture:** The validators stay self-contained single files with pure functions and a thin CLI. `validate-features.js` gains a dialect table and a recursive capability walk; `validate-plan.js` and `validate-walk.js` each get a copied `resolveCapabilityDir` helper. A new `scripts/migrate-features.js` (Node built-ins only) does the mechanical migration and runs the validator at the end. mitoshi's `GherkinParser` learns rule descriptions.

**Tech Stack:** Node ≥ 18 ESM, `node:test`; Kotlin Multiplatform with `kotlin.test` and Gradle for mitoshi.

**Spec:** `docs/superpowers/specs/2026-09-18-nested-capabilities-and-plain-gherkin-design.md`

## Global Constraints

- Validators and the migration script import nothing beyond Node built-ins; skill directories must work when copied on their own.
- Templates and validators change together, with a test for every new rule.
- Skills stay tool-neutral: no runtime-specific tool names, variables or slash commands in any `SKILL.md`.
- The migration never changes a scenario, a step, a tag, a table, a docstring or a comment in a legacy feature. The only body edits it makes are the German block keywords in §5 of the spec.
- Existing `capability.md` files are never overwritten.
- Commit messages end with the attribution lines given for this session.
- Release: bump `version` in `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` and `package.json` to `2.1.0`, annotated tag `v2.1.0`, push commit and tag together.

---

## File map

| file | responsibility |
|---|---|
| `skills/kartograph-features/validate-features.js` | modify: dialects, plain-Gherkin feature check, nested capability walk, `resolveCapabilityDir` |
| `skills/kartograph-features/capability-template.md` | modify: optional `## Capabilities` section |
| `skills/kartograph-features/SKILL.md` | modify: layout, rules, background, language |
| `skills/kartograph-features/example.md` | modify: drop `Requirement:` lines |
| `skills/kartograph-plan/validate-plan.js`, `skills/kartograph-walk/validate-walk.js` | modify: nested capability names and resolution |
| `skills/kartograph-plan/plan-template.md`, `skills/kartograph-walk/walk-template.md`, `skills/kartograph-plan/SKILL.md`, `skills/kartograph-walk/SKILL.md` | modify: capability naming note |
| `scripts/migrate-features.js` | create: the migration tool |
| `test/validate-features.test.js`, `test/validate-plan.test.js`, `test/validate-walk.test.js`, `test/migrate-features.test.js` | tests |
| `CLAUDE.md`, `README.md`, three manifests | docs and release |
| `~/projects/mitoshi/codebase/core/src/commonMain/kotlin/com/ramus/mitoshi/funktionsgraph/GherkinParser.kt` + `FunktionsgraphTest.kt` | mitoshi rule descriptions |

---

### Task 1: Feature files are plain Gherkin (validator body rules)

**Files:**
- Modify: `skills/kartograph-features/validate-features.js` (the `validateFeature` function and the `STEP`/`EARS` constants)
- Test: `test/validate-features.test.js`

**Interfaces:**
- Produces: `export const DIALECTS` (`{ en, de }`, each `{ feature, rule, background, scenario, outline, examples, given, when, then, and, but }` arrays of keywords) and `validateFeature(text, { path, capabilityDir })` → `{ errors, intents }`, where `capabilityDir` may now contain slashes (`"admin-console/individual-accounts"`). The `EARS` export is removed.

- [ ] **Step 1: Replace the rule/EARS test and add the plain-Gherkin tests**

In `test/validate-features.test.js`, delete the test named `"one Feature, rules with an EARS requirement before the first scenario, scenarios with Then"` and put these in its place (keep `FOPTS` as it is defined in that file):

```js
test("one Feature, optional rules, scenarios with When and Then", () => {
  assert.ok(validateFeature(feature + "\nFeature: Another\n", FOPTS).errors.some((e) => /exactly one 'Feature:'/.test(e)));
  const noThen = feature.replace("      Then \"Atlas\" is absent from the active project overview\n", "");
  assert.ok(validateFeature(noThen, FOPTS).errors.some((e) => /has no Then step/.test(e)));
  // A Requirement: line is ordinary description text now — with or without it, with or without EARS wording.
  const noReq = feature.replace("    Requirement: When an owner archives an active project, the system shall remove that project from the active overview.\n", "");
  assert.deepEqual(validateFeature(noReq, FOPTS).errors, []);
  const plain = feature.replace("Requirement: When an owner archives an active project, the system shall remove that project from the active overview.", "Owners archive projects.");
  assert.deepEqual(validateFeature(plain, FOPTS).errors, []);
  // Scenarios directly under Feature: are fine.
  const noRules = feature.replace(/  Rule: [^\n]*\n    Requirement: [^\n]*\n/g, "");
  assert.deepEqual(validateFeature(noRules, FOPTS).errors, []);
  // A rule without a scenario is still an error.
  const emptyRule = feature.replace("  Rule: Non-owners cannot archive a project", "  Rule: Empty\n\n  Rule: Non-owners cannot archive a project");
  assert.ok(validateFeature(emptyRule, FOPTS).errors.some((e) => /rule 'Empty' has no scenario/.test(e)));
});

test("tags before Feature:, backgrounds, docstrings and rule descriptions are accepted", () => {
  const tagged = feature.replace("Feature: Archive a project", "@role:owner\nFeature: Archive a project");
  assert.deepEqual(validateFeature(tagged, FOPTS).errors, []);
  const background = feature.replace("  Rule: Owners can archive their active projects", "  Background:\n    Given the workspace \"Acme\" exists\n\n  Rule: Owners can archive their active projects");
  assert.deepEqual(validateFeature(background, FOPTS).errors, []);
  const ruleBackground = feature.replace("    Scenario: An owner archives an active project", "    Background:\n      Given nothing else\n\n    Scenario: An owner archives an active project");
  assert.deepEqual(validateFeature(ruleBackground, FOPTS).errors, []);
  const docstring = feature.replace("      When Alice archives \"Atlas\"", "      When Alice archives \"Atlas\" with the note\n        \"\"\"\n        Not a step: line\n        \"\"\"");
  assert.deepEqual(validateFeature(docstring, FOPTS).errors, []);
  // Prose after a step inside a scenario is still not Gherkin.
  const prose = feature.replace("      When Alice archives \"Atlas\"", "      When Alice archives \"Atlas\"\n      Because she wants to");
  assert.ok(validateFeature(prose, FOPTS).errors.some((e) => /unexpected line: Because she wants to/.test(e)));
  // A step in a background does not count towards a scenario's When/Then.
  const onlyBackgroundWhen = feature.replace("  Rule: Owners can archive their active projects", "  Background:\n    When something happens\n\n  Rule: Owners can archive their active projects").replace("      When Alice archives \"Atlas\"\n", "");
  assert.ok(validateFeature(onlyBackgroundWhen, FOPTS).errors.some((e) => /needs at least a When and a Then/.test(e)));
});

test("outline parameters with spaces are not placeholders when an Examples header declares them", () => {
  const outline = feature.replace("    Scenario: An owner archives an active project\n      Given Alice owns the active project \"Atlas\"\n      When Alice archives \"Atlas\"\n      Then \"Atlas\" is absent from the active project overview",
    "    Scenario Outline: An owner archives an <artefact type>\n      Given Alice owns the active <artefact type> \"Atlas\"\n      When Alice archives \"Atlas\"\n      Then \"Atlas\" is absent from the active overview\n\n      Examples:\n        | artefact type |\n        | project       |");
  assert.deepEqual(validateFeature(outline, FOPTS).errors, []);
  const undeclared = outline.replace("| artefact type |", "| kind |").replace("| project       |", "| project |");
  assert.ok(validateFeature(undeclared, FOPTS).errors.some((e) => /placeholder: <artefact type>/.test(e)));
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/validate-features.test.js`
Expected: FAIL — the new tests report `has no 'Requirement:' line`, `is not under a 'Rule:'`, `the first line after the header comments must be 'Feature: <title>'` and `'Background:' is not used`.

- [ ] **Step 3: Rewrite `validateFeature` with a dialect table**

In `skills/kartograph-features/validate-features.js` replace the two constants `EARS` and `STEP` and the whole `validateFeature` function with:

```js
export const DIALECTS = {
  en: {
    feature: ["Feature", "Business Need", "Ability"], rule: ["Rule"], background: ["Background"],
    scenario: ["Scenario", "Example"], outline: ["Scenario Outline", "Scenario Template"], examples: ["Examples", "Scenarios"],
    given: ["Given"], when: ["When"], then: ["Then"], and: ["And"], but: ["But"],
  },
  de: {
    feature: ["Funktionalität", "Funktion"], rule: ["Regel"], background: ["Grundlage", "Hintergrund", "Voraussetzungen", "Vorbedingungen"],
    scenario: ["Szenario", "Beispiel"], outline: ["Szenariogrundriss", "Szenariogrundrisse"], examples: ["Beispiele"],
    given: ["Angenommen", "Gegeben sei", "Gegeben seien"], when: ["Wenn"], then: ["Dann"], and: ["Und"], but: ["Aber"],
  },
};
const LANGUAGE = /^#\s*language\s*:\s*([\w-]+)\s*$/;

// "Rule: x" → "x"; null when the line does not start with one of the keywords followed by a colon.
function block(line, words) {
  for (const w of words) if (line.startsWith(w + ":")) return line.slice(w.length + 1).trim();
  return null;
}
// The kind of step a line is: given | when | then | and | but | any (for "* "), or null.
function stepKind(line, d) {
  if (line.startsWith("* ")) return "any";
  for (const k of ["given", "when", "then", "and", "but"]) for (const w of d[k]) if (line.startsWith(w + " ")) return k;
  return null;
}
```

```js
export function validateFeature(text, { path = "x.feature", capabilityDir } = {}) {
  const errors = []; const err = (m) => errors.push(`${path}: ${m}`);
  const lines = text.split(/\r?\n/);
  const intents = [];
  let d = DIALECTS.en;
  let i = 0;
  const lang = LANGUAGE.exec(lines[0] || "");
  if (lang) {
    if (!DIALECTS[lang[1]]) err(`line 1: unknown language '${lang[1]}'; known: ${Object.keys(DIALECTS).join(", ")}`);
    else d = DIALECTS[lang[1]];
    i = 1;
  }

  while (i < lines.length && /^# Source intent: /.test(lines[i])) {
    const p = lines[i].slice("# Source intent: ".length).trim();
    if (!INTENT_PATH.test(p)) err(`line ${i + 1}: source intent path must look like intents/YYYY-MM-DD-HHMM-<slug>.md, got '${p}'`);
    intents.push(p); i++;
  }
  if (!intents.length) err(`line ${i + 1} must be '# Source intent: intents/<file>.md'`);
  const cap = /^# Capability: (.*)$/.exec(lines[i] || "");
  if (!cap) err(`line ${i + 1} must be '# Capability: features/<capability>/capability.md'`);
  else {
    const expected = capabilityDir ? `features/${capabilityDir}/capability.md` : null;
    if (expected && cap[1].trim() !== expected) err(`'# Capability:' must point at ${expected}, got '${cap[1].trim()}'`);
    i++;
  }

  const rest = lines.slice(i);
  const firstCode = rest.map((l) => l.trim()).find((t) => t !== "" && !t.startsWith("#") && !t.startsWith("@"));
  if (!firstCode || block(firstCode, d.feature) === null || !block(firstCode, d.feature)) err(`the first line after the header comments must be '${d.feature[0]}: <title>'`);
  const featureCount = rest.filter((l) => block(l.trim(), d.feature) !== null).length;
  if (featureCount > 1) err(`exactly one '${d.feature[0]}:' per file, found ${featureCount}`);

  let rules = 0; let scenarios = 0;
  let rule = null; let cur = null; const names = new Set();
  let inDocString = null; let expectHeader = false; const headerCells = new Set();
  const closeBlock = () => {
    if (!cur) return;
    if (cur.type === "scenario") {
      const kinds = cur.steps;
      if (!kinds.includes("when") || !kinds.includes("then")) err(`scenario '${cur.name}' needs at least a When and a Then step`);
      if (!kinds.includes("then")) err(`scenario '${cur.name}' has no Then step`);
      if (cur.outline && !cur.examples) err(`scenario outline '${cur.name}' has no 'Examples:'`);
    }
    cur = null;
  };
  const closeRule = () => {
    if (!rule) return;
    closeBlock();
    if (!rule.scenarios) err(`rule '${rule.name}' has no scenario`);
    rule = null;
  };
  for (const line of rest) {
    const t = line.trim();
    if (inDocString !== null) { if (t.startsWith(inDocString)) inDocString = null; continue; }
    if (t === "" || t.startsWith("#") || t.startsWith("@")) continue;
    if (block(t, d.feature) !== null) continue;
    let m;
    if ((m = block(t, d.rule)) !== null) { closeRule(); rules++; rule = { name: m, scenarios: 0 }; continue; }
    if (block(t, d.background) !== null) { closeBlock(); cur = { type: "background", steps: [] }; continue; }
    const outline = block(t, d.outline); const scenario = outline === null ? block(t, d.scenario) : null;
    if (outline !== null || scenario !== null) {
      closeBlock();
      const name = outline ?? scenario;
      if (rule) rule.scenarios++;
      if (names.has(name)) err(`scenario name '${name}' is used twice`); names.add(name);
      scenarios++; cur = { type: "scenario", name, outline: outline !== null, steps: [], examples: false };
      continue;
    }
    if (block(t, d.examples) !== null) { if (cur && cur.type === "scenario") cur.examples = true; expectHeader = true; continue; }
    if (t.startsWith("|")) { if (expectHeader) { for (const c of t.split("|").slice(1, -1)) headerCells.add(c.trim()); expectHeader = false; } continue; }
    if (t.startsWith('"""') || t.startsWith("```")) { inDocString = t.slice(0, 3); continue; }
    const kind = stepKind(t, d);
    if (kind) { if (!cur) err(`step outside any scenario: ${t}`); else cur.steps.push(kind); continue; }
    if (!cur || cur.steps.length === 0) continue; // feature, rule, background or scenario description
    err(`unexpected line: ${t}`);
  }
  closeRule(); closeBlock();
  if (!scenarios) err("at least one scenario is required");
  // `<name>` is a legitimate Scenario Outline parameter; template placeholders are multi-word,
  // unless an Examples header declares that multi-word parameter.
  for (const ph of text.matchAll(/<([A-Za-z][^>\n]* [^>\n]*)>/g)) {
    if (!headerCells.has(ph[1])) { err(`still holds a template placeholder: ${ph[0]}`); break; }
  }
  return { errors, intents };
}
```

Keep `rules` counted but unused beyond this (no "at least one Rule" error any more).

- [ ] **Step 4: Run the whole features test file**

Run: `node --test test/validate-features.test.js`
Expected: PASS for every test. If the tree tests fail on `'Background:' is not used` or `EARS`, the old assertions in those tests must be updated to the new messages.

- [ ] **Step 5: Commit**

```bash
git add skills/kartograph-features/validate-features.js test/validate-features.test.js
git commit -m "feat(features): the validator accepts plain Gherkin — optional Rule, no EARS line, Background, tags before Feature"
```

---

### Task 2: `# language: de` on line 1

**Files:**
- Modify: `skills/kartograph-features/validate-features.js` (already dialect-aware after Task 1; this task pins the header order and the German keywords with tests)
- Test: `test/validate-features.test.js`

**Interfaces:**
- Consumes: `DIALECTS`, `validateFeature` from Task 1.

- [ ] **Step 1: Add the German test**

Append to `test/validate-features.test.js`:

```js
test("a '# language: de' first line switches every keyword to German", () => {
  const de = `# language: de
# Source intent: ${INTENT}
# Capability: features/project-archiving/capability.md
Funktionalität: Projekt archivieren
  Besitzer nehmen ein Projekt aus der Übersicht.

  Regel: Besitzer archivieren ihre aktiven Projekte

    Szenario: Ein Besitzer archiviert ein aktives Projekt
      Angenommen Alice besitzt das aktive Projekt "Atlas"
      Wenn Alice "Atlas" archiviert
      Dann fehlt "Atlas" in der Übersicht der aktiven Projekte
      Und nichts sonst ändert sich
`;
  assert.deepEqual(validateFeature(de, FOPTS).errors, []);
  assert.ok(validateFeature(de.replace("# language: de", "# language: xx"), FOPTS).errors.some((e) => /unknown language 'xx'/.test(e)));
  // Without the language line, English keywords are expected and the German file fails.
  assert.ok(validateFeature(de.replace("# language: de\n", ""), FOPTS).errors.some((e) => /must be 'Feature: <title>'/.test(e)));
  // The language line must be line 1, before the header comments.
  const late = de.replace("# language: de\n", "").replace("# Capability: features/project-archiving/capability.md", "# Capability: features/project-archiving/capability.md\n# language: de");
  assert.ok(validateFeature(late, FOPTS).errors.some((e) => /must be 'Feature: <title>'/.test(e)));
});
```

- [ ] **Step 2: Run it**

Run: `node --test test/validate-features.test.js`
Expected: PASS (Task 1 already implemented the behaviour). If the `late` case passes validation, the language regex is being applied beyond line 1 — fix so it is only tested against `lines[0]`.

- [ ] **Step 3: Commit**

```bash
git add test/validate-features.test.js skills/kartograph-features/validate-features.js
git commit -m "test(features): German feature files via a '# language: de' first line"
```

---

### Task 3: Nested capabilities in the validator and the template

**Files:**
- Modify: `skills/kartograph-features/validate-features.js` (`CAPABILITY_SECTIONS`, `OPTIONAL_SECTIONS`, `validateCapability`, `validateCapabilityDir`, `validateTree`, `main`)
- Modify: `skills/kartograph-features/capability-template.md`
- Test: `test/validate-features.test.js`

**Interfaces:**
- Produces: `validateCapability(text, { path, featureFiles = null, subCapabilities = null })` → `{ errors, intents, listed, listedCapabilities }`; `validateCapabilityDir(dir, { projectRoot, relPath })` where `relPath` is the path under `features/` (`"admin-console/individual-accounts"`); `validateTree(dir)` unchanged signature; `export function resolveCapabilityDir(featuresDir, name)` → `{ dir, rel }` | `{ missing: true }` | `{ ambiguous: string[] }`.

- [ ] **Step 1: Add the nested tests**

Append to `test/validate-features.test.js` (the file already imports `mkdtempSync, mkdirSync, writeFileSync, rmSync, join, tmpdir`; add `resolveCapabilityDir` to the import list):

```js
const parentCapability = `# Capability: Admin console

Everything a site admin does at /admin.

## Sources
- Intent: \`${INTENT}\`

## Purpose and outcome
Site admins run the platform from one place.

## Scope and exclusions
Included: the sub-capabilities below. Excluded: tenant-facing screens.

## Capabilities
- [Individual accounts](individual-accounts/capability.md): lock, unlock, delete accounts.

## Open questions
None
`;

test("a parent capability lists its sub-capabilities and may have no features of its own", () => {
  const r = validateCapability(parentCapability, { path: "features/admin-console/capability.md", featureFiles: [], subCapabilities: ["individual-accounts"] });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.listedCapabilities, ["individual-accounts"]);
  const missing = validateCapability(parentCapability, { path: "features/admin-console/capability.md", featureFiles: [], subCapabilities: ["individual-accounts", "system-health"] });
  assert.ok(missing.errors.some((e) => /does not list system-health/.test(e)));
  const gone = validateCapability(parentCapability.replace("individual-accounts/capability.md", "ghost/capability.md"), { path: "features/admin-console/capability.md", featureFiles: [], subCapabilities: ["individual-accounts"] });
  assert.ok(gone.errors.some((e) => /links to 'ghost', which does not exist/.test(e)));
  // With feature files on disk, '## Features' is required; with sub-capabilities, '## Capabilities' is required.
  assert.ok(validateCapability(parentCapability, { path: "x", featureFiles: ["a.feature"], subCapabilities: [] }).errors.some((e) => /missing section '## Features'/.test(e)));
  assert.ok(validateCapability(capability, { ...OPTS, subCapabilities: ["sub"] }).errors.some((e) => /missing section '## Capabilities'/.test(e)));
  // Order: Features before Capabilities.
  const swapped = parentCapability.replace("## Capabilities\n- [Individual accounts](individual-accounts/capability.md): lock, unlock, delete accounts.\n", "## Capabilities\n- [Individual accounts](individual-accounts/capability.md): lock, unlock, delete accounts.\n\n## Features\n- [X](x.feature): y\n");
  assert.ok(validateCapability(swapped, { path: "x", featureFiles: ["x.feature"], subCapabilities: ["individual-accounts"] }).errors.some((e) => /order/.test(e)));
});

test("a nested tree validates, with full paths in the feature headers", (t) => {
  const root = mkdtempSync(join(tmpdir(), "karto-nested-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "intents"), { recursive: true }); writeFileSync(join(root, INTENT), "# intent\n");
  const sub = join(root, "features", "admin-console", "individual-accounts"); mkdirSync(sub, { recursive: true });
  writeFileSync(join(root, "features", "admin-console", "capability.md"), parentCapability);
  writeFileSync(join(sub, "capability.md"), capability.replace("# Capability: Project archiving", "# Capability: Individual accounts"));
  writeFileSync(join(sub, "archive-project.feature"), feature.replace("# Capability: features/project-archiving/capability.md", "# Capability: features/admin-console/individual-accounts/capability.md"));
  const r = validateTree(join(root, "features"));
  assert.deepEqual(r.errors, []);
  // The leaf's header must carry the full path.
  writeFileSync(join(sub, "archive-project.feature"), feature);
  assert.ok(validateTree(join(root, "features")).errors.some((e) => /must point at features\/admin-console\/individual-accounts\/capability.md/.test(e)));
  // A capability with neither features nor sub-capabilities is an error.
  mkdirSync(join(root, "features", "empty")); writeFileSync(join(root, "features", "empty", "capability.md"), capability);
  assert.ok(validateTree(join(root, "features")).errors.some((e) => /needs at least one .feature file or one sub-capability/.test(e)));
  // Resolution by leaf slug, by path, and ambiguity.
  assert.equal(resolveCapabilityDir(join(root, "features"), "individual-accounts").rel, "admin-console/individual-accounts");
  assert.equal(resolveCapabilityDir(join(root, "features"), "admin-console/individual-accounts").rel, "admin-console/individual-accounts");
  assert.ok(resolveCapabilityDir(join(root, "features"), "nope").missing);
  mkdirSync(join(root, "features", "other", "individual-accounts"), { recursive: true });
  assert.deepEqual(resolveCapabilityDir(join(root, "features"), "individual-accounts").ambiguous, ["admin-console/individual-accounts", "other/individual-accounts"]);
});
```

Also change the existing test `"stray files, missing capability.md and bad directory names are rejected"`: the assertion that a subdirectory inside a capability is an error (`no subdirectories inside a capability`) must go, since subdirectories are sub-capabilities now; replace it with an assertion that a sub-directory with a bad name (`"Bad Name"`) yields `capability directory must be a lowercase hyphenated slug`.

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/validate-features.test.js`
Expected: FAIL — `unknown section '## Capabilities'`, `resolveCapabilityDir is not a function`, `no subdirectories inside a capability`.

- [ ] **Step 3: Implement the nested walk**

In `validate-features.js`:

```js
export const CAPABILITY_SECTIONS = ["Sources", "Purpose and outcome", "Scope and exclusions", "Constraints", "Features", "Capabilities", "Open questions"];
export const OPTIONAL_SECTIONS = new Set(["Constraints", "Features", "Capabilities"]);
```

In `validateCapability`, change the signature to `(text, { path = "capability.md", featureFiles = null, subCapabilities = null } = {})`, and after the generic section checks add:

```js
  if (featureFiles && featureFiles.length && !names.includes("Features")) err("missing section '## Features'");
  if (subCapabilities && subCapabilities.length && !names.includes("Capabilities")) err("missing section '## Capabilities'");
```

Change the `## Features` cross-check to use `featureFiles !== null` instead of `featureFiles.length` as the guard:

```js
    for (const f of listed) if (featureFiles !== null && !featureFiles.includes(f)) err(`'## Features' links to '${f}', which does not exist`);
    for (const f of featureFiles || []) if (!listed.includes(f)) err(`'## Features' does not list ${f}`);
```

Add, right after the Features block:

```js
  const listedCapabilities = [];
  const caps = sections.find((s) => s.name === "Capabilities");
  if (caps) {
    for (const l of content(caps.lines)) {
      const m = /^- \[([^\]]+)\]\(([^)]+)\/capability\.md\): \S/.exec(l);
      if (!m) { if (!/^\s{2,}\S/.test(l)) err(`'## Capabilities' lines must be '- [Title](<sub>/capability.md): text'; got: ${l.trim()}`); continue; }
      if (!SLUG.test(m[2])) err(`sub-capability link '${m[2]}' must be a slug directory in this directory`);
      listedCapabilities.push(m[2]);
    }
    for (const c of listedCapabilities) if (subCapabilities !== null && !subCapabilities.includes(c)) err(`'## Capabilities' links to '${c}', which does not exist`);
    for (const c of subCapabilities || []) if (!listedCapabilities.includes(c)) err(`'## Capabilities' does not list ${c}`);
  }
```

and return `{ errors, intents, listed, listedCapabilities }`.

Replace `validateCapabilityDir` and `validateTree`, and add `resolveCapabilityDir`:

```js
export function validateCapabilityDir(dir, { projectRoot, relPath } = {}) {
  const errors = []; const warnings = [];
  const name = basename(dir);
  const rel = (f) => `features/${relPath ?? name}/${f}`;
  if (!SLUG.test(name)) errors.push(`${dir}: capability directory must be a lowercase hyphenated slug`);
  const entries = readdirSync(dir).sort();
  const featureFiles = entries.filter((f) => f.endsWith(".feature"));
  const subCapabilities = entries.filter((e) => statSync(join(dir, e)).isDirectory());
  for (const e of entries) {
    if (subCapabilities.includes(e) || e === "capability.md" || e.endsWith(".feature")) continue;
    errors.push(`${rel(e)}: only capability.md, .feature files and sub-capability directories belong here`);
  }
  if (!featureFiles.length && !subCapabilities.length) errors.push(`${dir}: needs at least one .feature file or one sub-capability`);
  let capIntents = [];
  if (!entries.includes("capability.md")) errors.push(`${rel("capability.md")}: missing`);
  else {
    const r = validateCapability(readFileSync(join(dir, "capability.md"), "utf8"), { path: rel("capability.md"), featureFiles, subCapabilities });
    errors.push(...r.errors); capIntents = r.intents;
  }
  const allIntents = new Set(capIntents);
  for (const f of featureFiles) {
    if (!SLUG.test(f.replace(/\.feature$/, ""))) errors.push(`${rel(f)}: feature filename must be a lowercase hyphenated slug`);
    const r = validateFeature(readFileSync(join(dir, f), "utf8"), { path: rel(f), capabilityDir: relPath ?? name });
    errors.push(...r.errors);
    for (const p of r.intents) { allIntents.add(p); if (!capIntents.includes(p)) errors.push(`${rel(f)}: source intent '${p}' is not listed under '## Sources' in capability.md`); }
  }
  if (projectRoot) {
    const intentsDir = join(projectRoot, "intents");
    for (const p of allIntents) {
      if (!existsSync(join(projectRoot, p))) (existsSync(intentsDir) ? errors : warnings).push(`${rel("capability.md")}: source intent '${p}' does not exist`);
    }
  }
  for (const s of subCapabilities) {
    const r = validateCapabilityDir(join(dir, s), { projectRoot, relPath: `${relPath ?? name}/${s}` });
    errors.push(...r.errors); warnings.push(...r.warnings);
  }
  return { errors, warnings };
}

export function validateTree(dir) {
  const errors = []; const warnings = [];
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return { errors: [`${dir}: no such directory`], warnings };
  const projectRoot = dirname(resolve(dir));
  const entries = readdirSync(dir);
  if (!entries.length) warnings.push(`${dir}: no capabilities yet`);
  for (const e of entries) {
    const p = join(dir, e);
    if (!statSync(p).isDirectory()) { errors.push(`${p}: only capability directories belong under features/`); continue; }
    const r = validateCapabilityDir(p, { projectRoot, relPath: e });
    errors.push(...r.errors); warnings.push(...r.warnings);
  }
  return { errors, warnings };
}

// Finds a capability directory by leaf slug (anywhere under features/) or by slash-joined path.
export function resolveCapabilityDir(featuresDir, name) {
  if (name.includes("/")) {
    const p = join(featuresDir, name);
    return existsSync(p) && statSync(p).isDirectory() ? { dir: p, rel: name } : { missing: true };
  }
  const hits = [];
  const walk = (d, rel) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d).sort()) {
      const p = join(d, e); if (!statSync(p).isDirectory()) continue;
      const r = rel ? `${rel}/${e}` : e;
      if (e === name) hits.push(r);
      walk(p, r);
    }
  };
  walk(featuresDir, "");
  if (!hits.length) return { missing: true };
  if (hits.length > 1) return { ambiguous: hits };
  return { dir: join(featuresDir, hits[0]), rel: hits[0] };
}
```

Replace `main` so a capability directory at any depth is recognised:

```js
function main(argv) {
  const target = argv[0] || "features";
  if (!existsSync(target) || !statSync(target).isDirectory()) { console.error(`error: ${target}: no such directory`); return 2; }
  const parts = resolve(target).split(sep);
  const idx = parts.lastIndexOf("features");
  const res = idx === -1 || idx === parts.length - 1
    ? validateTree(target)
    : validateCapabilityDir(resolve(target), { projectRoot: parts.slice(0, idx).join(sep), relPath: parts.slice(idx + 1).join("/") });
  for (const w of res.warnings) console.log(`warning: ${w}`);
  for (const e of res.errors) console.log(`error: ${e}`);
  if (res.errors.length) return 1;
  console.log(`ok ${target}`);
  return 0;
}
```

Add `sep` to the `node:path` import. Update the header comment of the file (the four lines describing the tree) to say: one directory per capability at any depth; a capability holds `capability.md`, `.feature` files and sub-capability directories.

- [ ] **Step 4: Update the template**

In `skills/kartograph-features/capability-template.md`, after the `## Features` block insert:

```markdown
## Capabilities
- [<Sub-capability title>](<sub-capability>/capability.md): <one line on what it covers>
<!-- only when this directory holds sub-capability directories; list each exactly once. -->
```

and change the `## Features` comment to say the section is present only when the directory holds `.feature` files.

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: PASS across all five test files.

- [ ] **Step 6: Commit**

```bash
git add skills/kartograph-features test/validate-features.test.js
git commit -m "feat(features): capabilities nest — every directory under features/ is a capability with its own capability.md"
```

---

### Task 4: Plan and walk resolve nested capability names

**Files:**
- Modify: `skills/kartograph-plan/validate-plan.js:133-134` (the capability slug check) and `:218-220` (the `capDir` lookup)
- Modify: `skills/kartograph-walk/validate-walk.js:100-101` and `:170-172`
- Modify: `skills/kartograph-plan/plan-template.md:2`, `skills/kartograph-walk/walk-template.md:2`
- Test: `test/validate-plan.test.js`, `test/validate-walk.test.js`

**Interfaces:**
- Consumes: nothing imported — each validator gets its own copy of `resolveCapabilityDir` from Task 3 (self-contained rule).
- Produces: `capability:` frontmatter accepts `slug` or `slug/slug/...`; filename slug equals the last segment.

- [ ] **Step 1: Add the tests**

In `test/validate-plan.test.js`, find the existing test that builds a temp project root (`mkdtempSync(join(tmpdir(), "karto-plan-"))`, around line 352) and add a new test after it that reuses the same well-formed plan text variable defined in the file (call it `PLAN` below; use the file's actual name) and the same feature-file fixture:

```js
test("a nested capability is found by leaf slug or by path; ambiguity is an error", (t) => {
  const root = mkdtempSync(join(tmpdir(), "karto-plan-nested-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cap = join(root, "features", "admin-console", "project-archiving"); mkdirSync(cap, { recursive: true });
  // write the same feature file the existing projectRoot test writes, into `cap`
  writeFileSync(join(cap, "archive-project.feature"), FEATURE_FIXTURE);
  mkdirSync(join(root, "docs", "code-design"), { recursive: true }); writeFileSync(join(root, "docs", "code-design", "stack.md"), "stack: kmp\n");
  const byLeaf = validatePlan(PLAN, { filename: "2026-09-16-1100-project-archiving.md", projectRoot: root });
  assert.deepEqual(byLeaf.errors, []);
  const byPath = validatePlan(PLAN.replace("capability: project-archiving", "capability: admin-console/project-archiving"), { filename: "2026-09-16-1100-project-archiving.md", projectRoot: root });
  assert.deepEqual(byPath.errors, []);
  mkdirSync(join(root, "features", "other", "project-archiving"), { recursive: true });
  assert.ok(validatePlan(PLAN, { filename: "2026-09-16-1100-project-archiving.md", projectRoot: root }).errors.some((e) => /ambiguous/.test(e)));
  assert.ok(validatePlan(PLAN.replace("capability: project-archiving", "capability: Admin/Console"), { filename: "2026-09-16-1100-project-archiving.md" }).errors.some((e) => /capability must be/.test(e)));
});
```

Write the equivalent test in `test/validate-walk.test.js` against `validateWalk` with the walk fixture and a filename `2026-09-16-1100-project-archiving.md`.

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/validate-plan.test.js test/validate-walk.test.js`
Expected: FAIL — `capability must be a lowercase hyphenated slug` for the path form, and `features/project-archiving/ does not exist` warnings instead of resolution.

- [ ] **Step 3: Implement in both validators**

In both files, replace the slug check line with:

```js
  const CAP_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
  if (fm.capability !== undefined && !CAP_NAME.test(fm.capability)) err(`capability must be a lowercase hyphenated slug or a slash-joined path of slugs, got '${fm.capability}'`);
  if (fileCap && fm.capability && fm.capability.split("/").pop() !== fileCap) err(`capability '${fm.capability}' does not match the filename's '${fileCap}'`);
```

Paste the `resolveCapabilityDir` function from Task 3 into each file (top-level, after the constants), and replace the lookup:

```js
    if (fm.capability) {
      const found = resolveCapabilityDir(join(projectRoot, "features"), fm.capability);
      if (found.ambiguous) err(`capability '${fm.capability}' is ambiguous (${found.ambiguous.join(", ")}); use the slash-joined path`);
      else if (found.missing) warnings.push(`features/${fm.capability}/ does not exist in the project`);
      else {
        const capDir = found.dir; const capRel = found.rel;
        // … existing body, with every `features/${fm.capability}/` in messages replaced by `features/${capRel}/`
      }
    }
```

Update the templates' line 2 comment to `capability: <capability directory name under features/; a nested one as its leaf slug, or the slash-joined path when the slug is ambiguous>`.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/kartograph-plan skills/kartograph-walk test/validate-plan.test.js test/validate-walk.test.js
git commit -m "feat(plan,walk): nested capabilities are found by leaf slug or path"
```

---

### Task 5: Skill texts, example, CLAUDE.md and README

**Files:**
- Modify: `skills/kartograph-features/SKILL.md` (sections 1, 2, 3), `skills/kartograph-features/example.md`, `skills/kartograph-plan/SKILL.md`, `skills/kartograph-walk/SKILL.md`, `CLAUDE.md`, `README.md`

- [ ] **Step 1: features SKILL.md**

In section 1 replace `` every `features/*/capability.md` and `.feature` `` with `` every `capability.md` and `.feature` under `features/`, at any depth ``.

In section 3 replace the table and the paragraphs from "One directory per capability" to the end of the fenced header block with:

```markdown
| artifact | path |
|---|---|
| capability description | `features/<capability>/capability.md` |
| feature and its scenarios | `features/<capability>/<feature>.feature` |
| sub-capability | `features/<capability>/<sub-capability>/…`, the same shape one level down |

One directory per capability, never per intent. A capability is a lasting product
ability; a feature a coherent part of it; a scenario a concrete example of its behaviour.
A capability may hold sub-capabilities as directories of the same shape, as deep as the
product needs (rarely more than three levels); the parent's `capability.md` lists them
under `## Capabilities` and its own features under `## Features`. Every directory under
`features/` is a capability with its own `capability.md`.

**`capability.md`** follows `capability-template.md` in this file's directory: Capability,
Sources, Purpose and outcome, Scope and exclusions, Constraints, Features, Capabilities,
Open questions. Short. Preserve existing content and sources when another intent extends
the capability. "Not specified" is not "out of scope".

**`.feature`** files are plain Gherkin: one `Feature:` per file with a brief
outcome-oriented description, then scenarios. Group scenarios under `Rule:` headings
only where the intent states a business rule; put the rule's statement, in the intent's
words, as description text under the `Rule:` line. Scenarios: initial conditions, one
action or event, observable results, no implementation detail, independent of each
other. Prefer explicit Given steps over `Background:` in new scenarios; existing
backgrounds stay. `Scenario Outline` only for genuine value variants. Cover success,
rejection and boundary behaviour where the sources say what happens; never pad to a
count. English Gherkin keywords for new files, the intent's language for prose, never
mixed dialects; a file that already starts with `# language: <code>` keeps that dialect.
Start every new file with

```gherkin
# Source intent: intents/<file>.md
# Capability: features/<capability>/capability.md
```

where the capability path is the full path from the project root, e.g.
`features/admin-console/individual-accounts/capability.md`.
```

- [ ] **Step 2: example.md**

Remove every `Requirement:` line from `skills/kartograph-features/example.md`, replacing each with the same sentence as plain description text under its `Rule:` without the `Requirement:` prefix and without forcing EARS wording (keep the sentence as it is; only drop the prefix).

- [ ] **Step 3: plan and walk SKILL.md**

In `skills/kartograph-plan/SKILL.md` and `skills/kartograph-walk/SKILL.md`, where the skill reads the named capability from `features/`, add one sentence: "A capability may sit inside another one (`features/<parent>/<capability>/`); resolve the name as the single directory of that slug anywhere under `features/`, and use the slash-joined path in the frontmatter when the slug occurs twice."

- [ ] **Step 4: CLAUDE.md and README**

In `CLAUDE.md` under *Rules the features skill must keep*, replace the first bullet with:

```markdown
- One directory per **capability**, never per intent; capabilities may nest as
  sub-capability directories of the same shape. Every directory under `features/` holds a
  `capability.md`; `## Features` lists its own `.feature` files, `## Capabilities` its
  sub-capabilities. Feature files are plain Gherkin: `Rule:` optional, no requirement
  line, `Background:` allowed, tags anywhere Gherkin allows them, `# language: de` on
  line 1 for German files. The validator checks only Kartograph's additions: the two
  header comments, one `Feature:`, unique scenario names, a When and a Then per scenario.
```

In `README.md`, in the `kartograph-features` section (around line 87-100), update the tree illustration to show a nested capability and drop any mention of `Requirement:` or EARS. Add to the version history line: `v2.1.0` capabilities nest, feature files are plain Gherkin, `scripts/migrate-features.js` moves v0 trees.

- [ ] **Step 5: Verify no runtime-specific references slipped in and tests pass**

Run: `grep -rn 'CLAUDE_PLUGIN_ROOT\|/kartograph:' skills/ ; npm test`
Expected: grep prints nothing; tests PASS.

- [ ] **Step 6: Commit**

```bash
git add skills CLAUDE.md README.md
git commit -m "docs: nested capabilities and plain Gherkin in the skills, CLAUDE.md and README"
```

---

### Task 6: Migration tool — pure functions

**Files:**
- Create: `scripts/migrate-features.js`
- Test: `test/migrate-features.test.js`

**Interfaces:**
- Produces:
  - `export const GERMAN_STEP = /^\s*(Angenommen|Gegeben sei|Gegeben seien|Wenn|Dann|Und|Aber) /m`
  - `export function hasHeader(text)` → boolean (a `# Source intent:` line within the first three lines)
  - `export function germanise(text)` → text with `Feature:`→`Funktionalität:`, `Scenario Outline:`→`Szenariogrundriss:`, `Scenario:`→`Szenario:`, `Examples:`→`Beispiele:`, `Background:`→`Grundlage:`, `Rule:`→`Regel:` at line start (after indentation), nothing else
  - `export function addHeader(text, { intent, capabilityPath })` → text with `# language: de` (only when `GERMAN_STEP` matches and no language line exists), `# Source intent: <intent>`, `# Capability: features/<capabilityPath>/capability.md` prepended; German files also `germanise`d
  - `export function featureInfo(text)` → `{ title, description }` (title after `Feature:`/`Funktionalität:`; description = first non-empty, non-tag, non-keyword line after it, or `""`)
  - `export function capabilityMarkdown({ name, lead, intent, features, capabilities })` → string, `features: [{ file, text }]`, `capabilities: [{ slug, name }]`
  - `export function migrationIntent({ project, date, time, sources, contexts })` → string passing `validateIntent`

- [ ] **Step 1: Write the tests**

Create `test/migrate-features.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasHeader, germanise, addHeader, featureInfo, capabilityMarkdown, migrationIntent } from "../scripts/migrate-features.js";
import { validateCapability, validateFeature } from "../skills/kartograph-features/validate-features.js";
import { validateIntent } from "../skills/kartograph-explore/validate-intent.js";

const INTENT = "intents/2026-09-18-1200-migrated-feature-tree.md";

const english = `@role:athlete
Feature: Move session
  As the athlete I move a session to another day.

  Background:
    Given a plan started on Monday 7 September 2026

  @happy
  Scenario: Moving a session one day later
    When I move the session of Wednesday 9 September 2026 to Thursday 10 September 2026
    Then the session calendar shows that session on Thursday 10 September 2026
`;

const german = `Feature: Einstiegsseite
  Nach dem Entsperren landet der Tagebuchschreiber auf der Einstiegsseite.

  @happy
  Scenario: Nach dem Entsperren öffnet sich die Einstiegsseite
    Angenommen der Tagebuchschreiber hat die App per Touch ID entsperrt
    Wenn er auf den Bildschirm schaut
    Dann steht die Einstiegsseite da
    Und es gibt keinen Knopf „Heute schreiben“ mehr
`;

test("hasHeader recognises migrated files", () => {
  assert.equal(hasHeader(english), false);
  assert.equal(hasHeader(`# Source intent: ${INTENT}\n# Capability: x\n` + english), true);
  assert.equal(hasHeader(`# language: de\n# Source intent: ${INTENT}\n# Capability: x\n` + german), true);
});

test("addHeader prepends the two comments and leaves the body byte-identical", () => {
  const out = addHeader(english, { intent: INTENT, capabilityPath: "scheduling/move-session" });
  assert.equal(out, `# Source intent: ${INTENT}\n# Capability: features/scheduling/move-session/capability.md\n` + english);
  assert.deepEqual(validateFeature(out, { path: "x", capabilityDir: "scheduling/move-session" }).errors, []);
});

test("a German file gets the language line and German block keywords, steps untouched", () => {
  const out = addHeader(german, { intent: INTENT, capabilityPath: "schreiben/hauptmenue" });
  assert.ok(out.startsWith(`# language: de\n# Source intent: ${INTENT}\n# Capability: features/schreiben/hauptmenue/capability.md\nFunktionalität: Einstiegsseite\n`));
  assert.ok(out.includes("  Szenario: Nach dem Entsperren öffnet sich die Einstiegsseite\n    Angenommen der Tagebuchschreiber hat die App per Touch ID entsperrt\n"));
  assert.deepEqual(validateFeature(out, { path: "x", capabilityDir: "schreiben/hauptmenue" }).errors, []);
  assert.equal(germanise("    Scenario Outline: X\n      Examples:\n  Background:\n  Rule: R\n"), "    Szenariogrundriss: X\n      Beispiele:\n  Grundlage:\n  Regel: R\n");
  assert.equal(germanise("    When Scenario: not at line start"), "    When Scenario: not at line start");
});

test("featureInfo reads the title and the first description line", () => {
  assert.deepEqual(featureInfo(english), { title: "Move session", description: "As the athlete I move a session to another day." });
  assert.deepEqual(featureInfo("Feature: Bare\n\n  Scenario: S\n"), { title: "Bare", description: "" });
  assert.deepEqual(featureInfo("# language: de\nFunktionalität: Einstiegsseite\n  Text.\n"), { title: "Einstiegsseite", description: "Text." });
});

test("capabilityMarkdown produces a capability.md the validator accepts", () => {
  const leaf = capabilityMarkdown({ name: "Move session", lead: "Move a session to another day.", intent: INTENT, features: [{ file: "move-session.feature", text: "As the athlete I move a session to another day." }], capabilities: [] });
  assert.deepEqual(validateCapability(leaf, { path: "x", featureFiles: ["move-session.feature"], subCapabilities: [] }).errors, []);
  assert.ok(leaf.includes("## Open questions\n- Purpose, scope and constraints of this capability were never written down"));
  const parent = capabilityMarkdown({ name: "Scheduling", lead: "Migrated from the Kartograph v0 feature tree; not yet described.", intent: INTENT, features: [], capabilities: [{ slug: "move-session", name: "Move session" }] });
  assert.deepEqual(validateCapability(parent, { path: "x", featureFiles: [], subCapabilities: ["move-session"] }).errors, []);
  assert.ok(!parent.includes("## Features"));
});

test("migrationIntent passes validate-intent", () => {
  const text = migrationIntent({ project: "beatrep", date: "2026-09-18", time: "1200", sources: [".kartograph/kartograph.json"], contexts: ["scheduling", "training"] });
  const r = validateIntent(text, { filename: "2026-09-18-1200-migrated-feature-tree.md" });
  assert.deepEqual(r.errors, []);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/migrate-features.test.js`
Expected: FAIL — cannot find module `../scripts/migrate-features.js`.

- [ ] **Step 3: Read the intent contract before writing `migrationIntent`**

Run: `sed -n 14,30p skills/kartograph-explore/validate-intent.js` and read `skills/kartograph-explore/intent-template.md`. The section list, `LIST_SECTIONS`, `EMPTY_MARKER` (`None identified.`) and `WHO_LABELS` define what `migrationIntent` must emit. Adjust the template string below to those exact names if they differ.

- [ ] **Step 4: Create `scripts/migrate-features.js` with the pure functions**

```js
#!/usr/bin/env node
// Migrates a project's features/ tree from the Kartograph v0 layout
// (features/<context>/<capability>/<topic>.feature, no capability.md, no source intent)
// onto the v2 contract: every directory is a capability with a capability.md, every
// feature starts with '# Source intent:' and '# Capability:' comments, and German files
// declare '# language: de'. It never changes a scenario, a step, a tag or a comment.
//
//   node scripts/migrate-features.js <project-root> [--time HHMM] [--date YYYY-MM-DD]
//
// Node built-ins only. Pure functions are exported for tests; the CLI is at the bottom.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync, renameSync, realpathSync } from "node:fs";
import { basename, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateTree } from "../skills/kartograph-features/validate-features.js";

export const GERMAN_STEP = /^\s*(Angenommen|Gegeben sei|Gegeben seien|Wenn|Dann|Und|Aber) /m;
const LANGUAGE = /^#\s*language\s*:/;
const BLOCKS_DE = [["Scenario Outline:", "Szenariogrundriss:"], ["Scenario:", "Szenario:"], ["Feature:", "Funktionalität:"], ["Examples:", "Beispiele:"], ["Background:", "Grundlage:"], ["Rule:", "Regel:"]];

export function hasHeader(text) {
  return text.split(/\r?\n/, 3).some((l) => l.startsWith("# Source intent: "));
}

export function germanise(text) {
  return text.split("\n").map((line) => {
    const t = line.trimStart(); const indent = line.slice(0, line.length - t.length);
    for (const [en, de] of BLOCKS_DE) if (t.startsWith(en)) return indent + de + t.slice(en.length);
    return line;
  }).join("\n");
}

export function addHeader(text, { intent, capabilityPath }) {
  const lines = text.split(/\r?\n/);
  let language = ""; let body = text;
  if (LANGUAGE.test(lines[0])) { language = lines[0] + "\n"; body = lines.slice(1).join("\n"); }
  else if (GERMAN_STEP.test(text)) { language = "# language: de\n"; body = germanise(text); }
  return `${language}# Source intent: ${intent}\n# Capability: features/${capabilityPath}/capability.md\n${body}`;
}

const TITLE = /^\s*(?:Feature|Funktionalität|Funktion|Business Need|Ability):\s*(.*)$/;
const KEYWORD = /^\s*(?:Rule|Regel|Background|Grundlage|Hintergrund|Scenario Outline|Szenariogrundriss|Scenario|Szenario|Example|Beispiel|Examples|Beispiele):/;
export function featureInfo(text) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => TITLE.test(l));
  if (at === -1) return { title: "", description: "" };
  const title = TITLE.exec(lines[at])[1].trim();
  let description = "";
  for (const l of lines.slice(at + 1)) {
    const t = l.trim();
    if (t === "" || t.startsWith("#")) continue;
    if (t.startsWith("@") || KEYWORD.test(t)) break;
    description = t; break;
  }
  return { title, description };
}

export function capabilityMarkdown({ name, lead, intent, features, capabilities }) {
  const out = [`# Capability: ${name}`, "", lead, "", "## Sources", `- Intent: \`${intent}\``, "",
    "## Purpose and outcome",
    "The sources this capability was migrated from did not record its purpose; the scenarios of its features are the observable outcome it stands for today.", "",
    "## Scope and exclusions",
    "Included is what the features and sub-capabilities listed below specify. Nothing was recorded as excluded.", ""];
  if (features.length) { out.push("## Features"); for (const f of features) out.push(`- [${f.title}](${f.file}): ${f.text}`); out.push(""); }
  if (capabilities.length) { out.push("## Capabilities"); for (const c of capabilities) out.push(`- [${c.name}](${c.slug}/capability.md): ${c.text}`); out.push(""); }
  out.push("## Open questions",
    "- Purpose, scope and constraints of this capability were never written down; the migrated features are its only description. Blocks: judging whether a later intent extends or contradicts it.", "");
  return out.join("\n");
}
```

Note: `features[].title` and `capabilities[].text` are used above; the tests pass `features: [{ file, text }]` — make the test objects `{ file, title, text }` and `capabilities: [{ slug, name, text }]` so both the title and the one-line text are explicit. Update the test in Step 1 accordingly.

```js
export function migrationIntent({ project, date, time, sources, contexts }) {
  const src = sources.length ? sources.map((s) => `\`${s}\``).join(", ") : "none";
  return `---
title: Migrated feature tree
date: ${date}
status: confirmed
role: maintainer
language: en
sources: ${src}
related: none
---

# Migrated feature tree

## Summary

The ${project} feature tree predates Kartograph v2. It was written by the v0 Kartograph as \`features/<context>/<capability>/<topic>.feature\`, plain Gherkin with \`@happy\`, \`@edge\` and \`@error\` tags and no capability descriptions. On ${date} it was migrated onto the v2 contract without changing a single scenario: every directory became a capability with a \`capability.md\`, every feature file received its source and capability header, and German files declared their dialect. This intent is the provenance every migrated file points at.

## Who

- **Speaking:** maintainer of ${project}, responsible for keeping the specification and the code in step
- **Benefits:** the Kartograph skills, which can now read, extend and validate the tree
- **Affected:** anyone reading the feature files; the layout is the same, only headers and capability descriptions were added

## Goals

- Keep every existing scenario word for word.
- Give every capability a place for its description and its open questions.
- Let \`kartograph-features\` commit again in this project.

## Intended outcomes

- \`node validate-features.js features\` prints \`ok\` for the whole tree.
- Every feature file names this intent and its capability in its first comment lines.
- Every directory under \`features/\` holds a \`capability.md\`.

## Non-goals

- Rewriting scenarios, steps or tags, because they may be bound to tests and to accepted walks.
- Writing the purpose and scope of each capability, because the migration has no source for them.

## Constraints

- The former grouping (${contexts.length ? contexts.join(", ") : "none"}) stays as parent capabilities so tools that group by directory keep working.

## Assumptions

- The old feature files were the accepted specification at the time of migration.

## Decisions

- **Every directory is a capability** — because the tools group by directory and nesting keeps that grouping. Rejected: flattening, which would lose the grouping.
- **One migration intent for the whole tree** — because no exploring conversation produced these files. Rejected: pointing at surveys or issues, which do not follow the intent contract.

## Open questions

- **What is each capability's purpose, scope and constraints?** — who can answer: the product owner. Why it matters: without it a later intent cannot be judged as extending or contradicting the capability.

## Terms

- **capability** — a directory under \`features/\` with its own \`capability.md\`.
- **sub-capability** — a capability directory inside another one.

## Notes

Generated by \`scripts/migrate-features.js\` of the Kartograph plugin at ${time} on ${date}.
`;
}
```

- [ ] **Step 5: Run the tests**

Run: `node --test test/migrate-features.test.js`
Expected: PASS. If `migrationIntent` fails `validateIntent`, print `r.errors` and align the section names, the `Who` labels and the list format with `validate-intent.js` (Step 3).

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-features.js test/migrate-features.test.js
git commit -m "feat(scripts): migrate-features — headers, German dialect, capability.md and intent generation"
```

---

### Task 7: Migration tool — the project walk and CLI

**Files:**
- Modify: `scripts/migrate-features.js`
- Test: `test/migrate-features.test.js`

**Interfaces:**
- Consumes: the Task 6 functions and `validateTree` from `validate-features.js`.
- Produces: `export function migrateProject(root, { date, time })` → `{ written: string[], intent: string, errors: string[] }`; CLI `node scripts/migrate-features.js <root> [--date YYYY-MM-DD] [--time HHMM]`, exit 1 when validation errors remain.

- [ ] **Step 1: Write the end-to-end test**

Append to `test/migrate-features.test.js` (add `mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync` from `node:fs`, `join` from `node:path`, `tmpdir` from `node:os`, and `migrateProject` to the imports):

```js
function v0Project() {
  const root = mkdtempSync(join(tmpdir(), "karto-migrate-"));
  mkdirSync(join(root, "features", "scheduling", "move-session"), { recursive: true });
  mkdirSync(join(root, "features", "training"), { recursive: true });
  mkdirSync(join(root, ".kartograph"), { recursive: true });
  writeFileSync(join(root, ".kartograph", "kartograph.json"), JSON.stringify({ contexts: { scheduling: { name: "Scheduling" } }, capabilities: { "move-session": { name: "Move a session", context: "scheduling" } } }));
  writeFileSync(join(root, "features", "scheduling", "move-session", "move-session.feature"), english);
  writeFileSync(join(root, "features", "training", "general-fitness.feature"), english.replace("Move session", "General fitness"));
  writeFileSync(join(root, "features", "README.md"), "# old layout\n");
  return root;
}

test("migrateProject turns a v0 tree into a passing v2 tree and is idempotent", (t) => {
  const root = v0Project();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const r = migrateProject(root, { date: "2026-09-18", time: "1200" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.intent, "intents/2026-09-18-1200-migrated-feature-tree.md");
  assert.ok(existsSync(join(root, r.intent)));
  assert.ok(existsSync(join(root, "docs", "features-README.md")) && !existsSync(join(root, "features", "README.md")));
  const parent = readFileSync(join(root, "features", "scheduling", "capability.md"), "utf8");
  assert.ok(parent.startsWith("# Capability: Scheduling\n"));
  assert.ok(parent.includes("- [Move a session](move-session/capability.md):"));
  const leaf = readFileSync(join(root, "features", "scheduling", "move-session", "capability.md"), "utf8");
  assert.ok(leaf.startsWith("# Capability: Move a session\n\nAs the athlete I move a session to another day.\n"));
  const training = readFileSync(join(root, "features", "training", "capability.md"), "utf8");
  assert.ok(training.startsWith("# Capability: General fitness\n"));
  const feature = readFileSync(join(root, "features", "scheduling", "move-session", "move-session.feature"), "utf8");
  assert.ok(feature.startsWith(`# Source intent: ${r.intent}\n# Capability: features/scheduling/move-session/capability.md\n@role:athlete\nFeature: Move session\n`));
  const before = { feature, leaf, parent };
  const again = migrateProject(root, { date: "2026-09-18", time: "1300" });
  assert.deepEqual(again.written, []);
  assert.equal(readFileSync(join(root, "features", "scheduling", "move-session", "move-session.feature"), "utf8"), before.feature);
  assert.equal(readFileSync(join(root, "features", "scheduling", "move-session", "capability.md"), "utf8"), before.leaf);
});

test("an existing capability.md is never overwritten and gets the migration intent only when it lacks the one a feature names", (t) => {
  const root = v0Project();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const own = capabilityMarkdown({ name: "Kept", lead: "Kept lead.", intent: "intents/2026-09-01-0900-earlier.md", features: [{ file: "move-session.feature", title: "Move session", text: "kept" }], capabilities: [] });
  writeFileSync(join(root, "features", "scheduling", "move-session", "capability.md"), own);
  mkdirSync(join(root, "intents")); writeFileSync(join(root, "intents", "2026-09-01-0900-earlier.md"), "# earlier\n");
  const r = migrateProject(root, { date: "2026-09-18", time: "1200" });
  const kept = readFileSync(join(root, "features", "scheduling", "move-session", "capability.md"), "utf8");
  assert.ok(kept.startsWith("# Capability: Kept\n"));
  assert.ok(kept.includes("- Intent: `intents/2026-09-01-0900-earlier.md`\n- Intent: `intents/2026-09-18-1200-migrated-feature-tree.md`"));
  assert.deepEqual(r.errors, []);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test test/migrate-features.test.js`
Expected: FAIL — `migrateProject is not a function`.

- [ ] **Step 3: Implement `migrateProject` and the CLI**

Append to `scripts/migrate-features.js`:

```js
function titleCase(slug) { return slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "); }

function readMap(root) {
  const p = join(root, ".kartograph", "kartograph.json");
  if (!existsSync(p)) return { contexts: {}, capabilities: {} };
  try { const j = JSON.parse(readFileSync(p, "utf8")); return { contexts: j.contexts || {}, capabilities: j.capabilities || {} }; }
  catch { return { contexts: {}, capabilities: {} }; }
}

// title → description of every knowledge concept whose frontmatter has type: Capability.
function readKnowledge(root) {
  const out = new Map(); const dir = join(root, "knowledge");
  const walk = (d) => { if (!existsSync(d)) return; for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else if (e.endsWith(".md")) {
    const fm = /^---\n([\s\S]*?)\n---/.exec(readFileSync(p, "utf8")); if (!fm) continue;
    const type = /^type:\s*(\S+)/m.exec(fm[1])?.[1]; const title = /^title:\s*(.+)$/m.exec(fm[1])?.[1]?.trim(); const desc = /^description:\s*(.+)$/m.exec(fm[1])?.[1]?.trim();
    if (type === "Capability" && title && desc) out.set(title, desc.replace(/^["']|["']$/g, ""));
  } } };
  walk(dir); return out;
}

function firstSentence(s) { const m = /^(.*?[.!?])(\s|$)/.exec(s); return m ? m[1] : s; }

function ensureIntentListed(text, intent) {
  if (text.includes(`- Intent: \`${intent}\``)) return text;
  const lines = text.split("\n"); const at = lines.findIndex((l) => l.trim() === "## Sources");
  if (at === -1) return text;
  let end = at + 1; while (end < lines.length && !/^## /.test(lines[end])) end++;
  let last = end - 1; while (last > at && lines[last].trim() === "") last--;
  lines.splice(last + 1, 0, `- Intent: \`${intent}\``);
  return lines.join("\n");
}

export function migrateProject(root, { date, time } = {}) {
  const now = new Date();
  date = date || now.toISOString().slice(0, 10);
  time = time || `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const written = [];
  const featuresDir = join(root, "features");
  const intentsDir = join(root, "intents");
  let intent = existsSync(intentsDir) ? readdirSync(intentsDir).filter((f) => /^\d{4}-\d{2}-\d{2}-\d{4}-migrated-feature-tree\.md$/.test(f)).sort().pop() : null;
  intent = intent ? `intents/${intent}` : `intents/${date}-${time}-migrated-feature-tree.md`;
  const map = readMap(root); const knowledge = readKnowledge(root);
  const sources = [".kartograph/kartograph.json", "features/README.md"].filter((s) => existsSync(join(root, s)));
  const contexts = readdirSync(featuresDir).filter((e) => statSync(join(featuresDir, e)).isDirectory()).sort();

  const readme = join(featuresDir, "README.md");
  if (existsSync(readme)) { mkdirSync(join(root, "docs"), { recursive: true }); renameSync(readme, join(root, "docs", "features-README.md")); written.push("docs/features-README.md"); }

  const visit = (dir, rel) => {
    const entries = readdirSync(dir).sort();
    const featureFiles = entries.filter((f) => f.endsWith(".feature"));
    const subs = entries.filter((e) => statSync(join(dir, e)).isDirectory());
    const features = [];
    for (const f of featureFiles) {
      const p = join(dir, f); let text = readFileSync(p, "utf8");
      if (!hasHeader(text)) { text = addHeader(text, { intent, capabilityPath: rel }); writeFileSync(p, text); written.push(`features/${rel}/${f}`); }
      const info = featureInfo(text);
      features.push({ file: f, title: info.title || f.replace(/\.feature$/, ""), text: info.description || info.title || f });
    }
    const children = subs.map((s) => visit(join(dir, s), `${rel}/${s}`));
    const slug = basename(dir);
    const mapped = map.capabilities[slug]?.name || map.contexts[slug]?.name;
    const name = mapped || (featureFiles.length === 1 ? features[0].title : titleCase(slug));
    const lead = knowledge.get(name) || (featureFiles.length === 1 && features[0].text !== features[0].title ? firstSentence(features[0].text) : "Migrated from the Kartograph v0 feature tree; not yet described.");
    const capFile = join(dir, "capability.md");
    if (!existsSync(capFile)) {
      writeFileSync(capFile, capabilityMarkdown({ name, lead, intent, features, capabilities: children.map((c) => ({ slug: c.slug, name: c.name, text: c.lead })) }));
      written.push(`features/${rel}/capability.md`);
    } else if (featureFiles.some((f) => readFileSync(join(dir, f), "utf8").includes(`# Source intent: ${intent}`))) {
      const cur = readFileSync(capFile, "utf8"); const next = ensureIntentListed(cur, intent);
      if (next !== cur) { writeFileSync(capFile, next); written.push(`features/${rel}/capability.md`); }
    }
    return { slug, name, lead };
  };
  for (const c of contexts) visit(join(featuresDir, c), c);

  if (!existsSync(join(root, intent))) {
    mkdirSync(intentsDir, { recursive: true });
    writeFileSync(join(root, intent), migrationIntent({ project: basename(resolve(root)), date, time, sources, contexts }));
    written.push(intent);
  }
  const { errors } = validateTree(featuresDir);
  return { written, intent, errors };
}

function main(argv) {
  const root = argv.find((a) => !a.startsWith("--"));
  if (!root || !existsSync(join(root, "features"))) { console.error("usage: migrate-features.js <project-root> [--date YYYY-MM-DD] [--time HHMM]"); return 2; }
  const opt = (k) => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i + 1]; };
  const r = migrateProject(root, { date: opt("--date"), time: opt("--time") });
  for (const w of r.written) console.log(`wrote ${w}`);
  for (const e of r.errors) console.log(`error: ${e}`);
  console.log(r.errors.length ? `${r.errors.length} error(s) left for hand fixing` : `ok ${root}`);
  return r.errors.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exit(main(process.argv.slice(2)));
```

Note the existing-`capability.md` case: the migration intent is added under `## Sources` only when a feature in that directory now names it (mokuso's three pre-existing files).

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS. If the intent test fails on the existing-capability case, check `ensureIntentListed` keeps the bullet inside `## Sources`.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-features.js test/migrate-features.test.js
git commit -m "feat(scripts): migrate-features walks a v0 tree, writes capability.md files and the migration intent, validates"
```

---

### Task 8: mitoshi accepts rule descriptions

**Files:**
- Modify: `~/projects/mitoshi/codebase/core/src/commonMain/kotlin/com/ramus/mitoshi/funktionsgraph/GherkinParser.kt` (the `Rule:` branch in `lies()`, around line 161-166)
- Test: `~/projects/mitoshi/codebase/core/src/commonTest/kotlin/com/ramus/mitoshi/funktionsgraph/FunktionsgraphTest.kt`

- [ ] **Step 1: Write the failing test**

Append inside `class FunktionsgraphTest`:

```kotlin
    @Test
    fun `eine Regel darf eine Beschreibung vor ihrem ersten Szenario tragen`() {
        val text = """
            # Source intent: intents/2026-09-18-1200-x.md
            # Capability: features/sync/capability.md
            Feature: Automatic sync
              Rule: Edits travel between devices
                Requirement: When a device edits a set, the system shall sync it.
                Two lines of prose are fine.

                Scenario: An edit arrives
                  When the phone edits a set
                  Then the tablet shows the edit
        """.trimIndent()
        val m = modell("sync/automatic-sync.feature" to text)
        assertTrue(m.diagnosen.none { it.schwere == Schwere.FEHLER }, m.diagnosen.toString())
        assertEquals(listOf("An edit arrives"), m.funktionalitaeten.single().szenarien.map { it.name })
    }
```

(If `FunktionsModell` exposes diagnostics under another property name, use that; the existing tests in the file show it.)

- [ ] **Step 2: Run it**

Run: `cd ~/projects/mitoshi/codebase && ./gradlew :core:jvmTest --tests "com.ramus.mitoshi.funktionsgraph.FunktionsgraphTest" -q`
Expected: FAIL with a diagnostic `Unerwartete Zeile: "Requirement: …"`.

- [ ] **Step 3: Consume the description after `Rule:`**

In `lies()`, change the rule branch to:

```kotlin
                blockName(t, d.regelWorte) != null -> {
                    val name = blockName(t, d.regelWorte)!!
                    val neueRegel = AstRegel(name, verbrauchteTags(), null, mutableListOf())
                    regeln += neueRegel
                    aktuelleRegel = neueRegel
                    i++
                    // Gherkin erlaubt unter Rule: freien Beschreibungstext bis zum ersten
                    // Tag oder Block-Schlüsselwort — wie unter Feature:. Kartograph legt dort
                    // die Anforderung der Regel ab; sie ist für den Graphen ohne Bedeutung.
                    beschreibung(d)
                }
```

- [ ] **Step 4: Run the core tests**

Run: `cd ~/projects/mitoshi/codebase && ./gradlew :core:jvmTest -q`
Expected: PASS.

- [ ] **Step 5: Commit in mitoshi**

```bash
cd ~/projects/mitoshi && git add codebase/core/src && git commit -m "Funktionsgraph: Beschreibungstext unter Rule: wird überlesen statt als Fehler gemeldet"
```

---

### Task 9: Migrate hyperid

**Files:**
- `~/projects/hyperid/features/**`, `~/projects/hyperid/intents/`, `~/projects/hyperid/docs/features-README.md`

- [ ] **Step 1: Run the tool**

Run: `cd ~/projects/kartograph && node scripts/migrate-features.js ~/projects/hyperid --time 1200`
Expected: `wrote …` lines for 109 feature files, 68 capability.md files, the intent and the README move; then either `ok` or a short list of errors.

- [ ] **Step 2: Hand-fix whatever is listed**

Expected residuals: possibly duplicate scenario names within a file, or a scenario without a When. Fix each with the smallest edit that keeps the wording (a duplicate title gets a distinguishing suffix; a missing When is reported back to the user rather than invented — leave it and note it). Re-run `node skills/kartograph-features/validate-features.js ~/projects/hyperid/features` until it prints `ok`, or list what remains.

- [ ] **Step 3: Validate the intent and inspect the diff**

Run: `node skills/kartograph-explore/validate-intent.js ~/projects/hyperid/intents/2026-09-18-1200-migrated-feature-tree.md && cd ~/projects/hyperid && git status --short | grep -v '^??' | head`
Expected: intent `ok`; only `features/` files modified, plus new files. The pre-existing unrelated modifications (`.kartograph/kartograph.json`, `docs/testing/README.md`, untracked `distribution/log-walk.sh`, `docs/testing/walks/…`) are NOT staged.

- [ ] **Step 4: Commit and push**

```bash
cd ~/projects/hyperid && git add features intents docs/features-README.md && git commit -m "features: migrate the tree to the Kartograph v2 layout" && git push
```

---

### Task 10: Migrate beatrep

- [ ] **Step 1: Run the tool**

Run: `cd ~/projects/kartograph && node scripts/migrate-features.js ~/projects/beatrep --time 1200`
Expected: 15 legacy feature files get headers, ~20 capability.md files are written, the intent is written; `features/icloud-sync/` (already v2) is untouched.

- [ ] **Step 2: Hand-fix, validate, commit, push**

Run: `node skills/kartograph-features/validate-features.js ~/projects/beatrep/features && node skills/kartograph-explore/validate-intent.js ~/projects/beatrep/intents/2026-09-18-1200-migrated-feature-tree.md`
Expected: `ok` twice.

```bash
cd ~/projects/beatrep && git add features intents && git commit -m "features: migrate the tree to the Kartograph v2 layout" && git push
```

---

### Task 11: Migrate mokuso

- [ ] **Step 1: Run the tool**

Run: `cd ~/projects/kartograph && node scripts/migrate-features.js ~/projects/mokuso --time 1200`
Expected: 25 German files get `# language: de` and German block keywords, the English legacy files get headers, capability.md files are written where missing, the three existing ones get the migration intent under `## Sources`.

- [ ] **Step 2: Hand-fix the known prose lines**

In `~/projects/mokuso/features/schreiben/tageszugang/tageszugang.feature`, prefix the eight lines starting with `Denn ` / `Gleich ob ` that follow a `Dann`/`Und` step inside a scenario with `# ` (they are rationale, not steps). Then run the validator until `ok`.

- [ ] **Step 3: Validate, commit (includes the pending canvases work), push**

```bash
node skills/kartograph-features/validate-features.js ~/projects/mokuso/features
cd ~/projects/mokuso && git add features intents && git commit -m "features: Canvases beside the diary; migrate the tree to the Kartograph v2 layout" && git push
```

---

### Task 12: mitoshi reads all three trees

- [ ] **Step 1: Throwaway JVM test**

Create `~/projects/mitoshi/codebase/core/src/jvmTest/kotlin/com/ramus/mitoshi/funktionsgraph/MigrierteBaeumeTest.kt`:

```kotlin
package com.ramus.mitoshi.funktionsgraph

import com.ramus.mitoshi.arbeitsbereich.Schwere
import kotlin.test.Test
import kotlin.test.assertTrue

class MigrierteBaeumeTest {
    @Test
    fun `die migrierten Baeume laden ohne Fehler`() {
        val home = System.getProperty("user.home")
        for (p in listOf("hyperid", "beatrep", "mokuso")) {
            val m = DateiFunktionsgraph.leseVerzeichnis("$home/projects/$p/features")
            val fehler = m.diagnosen.filter { it.schwere == Schwere.FEHLER }
            assertTrue(fehler.isEmpty(), "$p: $fehler")
            assertTrue(m.funktionalitaeten.isNotEmpty(), "$p: keine Funktionalitäten")
            println("$p: ${m.funktionalitaeten.size} Funktionalitäten, ${m.funktionalitaeten.sumOf { it.szenarien.size }} Szenarien")
        }
    }
}
```

- [ ] **Step 2: Run it, then delete it**

Run: `cd ~/projects/mitoshi/codebase && ./gradlew :core:jvmTest --tests "com.ramus.mitoshi.funktionsgraph.MigrierteBaeumeTest" -i 2>&1 | grep -E "Funktionalitäten|FAILED|PASSED|BUILD"` then `rm core/src/jvmTest/kotlin/com/ramus/mitoshi/funktionsgraph/MigrierteBaeumeTest.kt`
Expected: three lines with counts close to 109/688, 17/127, 31/231, and `BUILD SUCCESSFUL`. `git status` in mitoshi clean afterwards.

---

### Task 13: Release v2.1.0

- [ ] **Step 1: Bump the three manifests**

Set `"version": "2.1.0"` in `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` and `package.json`. Bump `generated.by` in `skills/kartograph-knowledge/SKILL.md` and `concept-template.md` to `kartograph-knowledge/2.1.0` (CLAUDE.md rule).

- [ ] **Step 2: Final checks**

Run: `npm test && node skills/kartograph-features/validate-features.js ~/projects/hyperid/features && node skills/kartograph-features/validate-features.js ~/projects/beatrep/features && node skills/kartograph-features/validate-features.js ~/projects/mokuso/features`
Expected: all PASS / `ok`.

- [ ] **Step 3: Commit, tag, push**

```bash
git add -A && git commit -m "feat: capabilities nest, feature files are plain Gherkin, migrate-features moves v0 trees (v2.1.0)"
git tag -a v2.1.0 -m "v2.1.0 — nested capabilities, plain Gherkin, v0 feature-tree migration"
git push origin main && git push origin v2.1.0
```
