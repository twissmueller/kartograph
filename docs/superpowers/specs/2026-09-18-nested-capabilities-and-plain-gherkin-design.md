# Nested capabilities, plain Gherkin, and the migration of v0 feature trees

Date: 2026-09-18. Status: approved.

## Why

Three older projects (hyperid, mokuso, beatrep) carry feature trees written by the
v0.x Kartograph: `features/<context>/<capability>/<topic>.feature`, plain Gherkin with
`@happy`/`@edge`/`@error` tags, `Background:` blocks, no `capability.md`, no source
intents, and in mokuso German keywords. The v2 `validate-features.js` rejects all of it,
so `kartograph-features` cannot commit in those projects. Two decisions came out of the
review: capabilities may nest, and feature files stay as close to Gherkin as possible —
`Rule:` is optional and the mandatory EARS `Requirement:` line is dropped. A migration
tool moves the old trees onto the new contract without touching a single scenario.

mitoshi displays these trees. It already reads nested directories and ignores
`capability.md`, but its parser rejects any free text between `Rule:` and the first
scenario, which drops every file with a `Requirement:` line. That is fixed alongside.

## 1. Layout: nested capabilities

- Every directory under `features/`, at any depth, is a capability. It holds
  `capability.md`, zero or more `.feature` files, and zero or more sub-capability
  directories. Nothing else belongs there. Files directly under `features/` are errors.
- A capability needs at least one `.feature` file or one sub-capability.
- Directory and feature names are lowercase hyphenated slugs.
- `capability.md` sections, in order: Sources, Purpose and outcome, Scope and exclusions,
  Constraints (optional), Features (required iff the directory holds `.feature` files),
  Capabilities (required iff it holds sub-capabilities), Open questions.
  `## Features` lists exactly the directory's own feature files as
  `- [Title](<name>.feature): text`; `## Capabilities` lists exactly its sub-capabilities
  as `- [Title](<sub>/capability.md): text`.
- The feature header `# Capability:` carries the full path from the project root, e.g.
  `features/admin-console/individual-accounts/capability.md`, and must match the file's
  directory.
- Plans and walks keep the leaf slug in their filename
  (`YYYY-MM-DD-HHMM-<leaf>.md`). Their `capability:` frontmatter is either the leaf slug,
  which the validators resolve to the single directory of that name anywhere under
  `features/` (ambiguity is an error), or the slash-joined path, whose last segment must
  equal the filename's slug. `validate-plan.js` and `validate-walk.js` gain a shared
  (copied, not imported) `resolveCapabilityDir(projectRoot, name)` helper.

## 2. Feature files: plain Gherkin

The validator accepts what Gherkin accepts and checks only Kartograph's additions.

Allowed, previously rejected:
- `Rule:` is optional; scenarios sit directly under `Feature:` or under a rule.
- Free text under `Feature:`, under `Rule:` (before its first scenario or background),
  and under a scenario before its first step. A `Requirement:` line is ordinary
  description text; no EARS check exists any more, in the skill or the validator.
- `Background:` at feature level and at rule level. Its steps are not counted towards a
  scenario's When/Then requirement.
- Tag lines (`@…`) before `Feature:`, before `Rule:`, before scenarios and examples.
- A `# language: <code>` comment on line 1, honoured for `en` and `de`
  (Funktionalität, Regel, Grundlage/Hintergrund, Szenario, Szenariogrundriss, Beispiele,
  Angenommen/Gegeben sei/Gegeben seien, Wenn, Dann, Und, Aber, `*`). Unknown codes are an
  error.
- Outline parameters with spaces, e.g. `<artefact type>`, are placeholders only when no
  `Examples:` header cell in the file declares them.

Still strict:
- Header comments after the optional language line: one or more
  `# Source intent: intents/<YYYY-MM-DD-HHMM-slug>.md`, then `# Capability: <path>`.
- Exactly one `Feature:`; at least one scenario; unique scenario names in a file; every
  scenario has a When and a Then step of its own; every outline has `Examples:`; no
  unresolved template placeholders.
- Every source intent of a feature is listed under `## Sources` of its capability and
  exists on disk when the project has an `intents/` directory.

The `kartograph-features` skill keeps writing English keywords for new files and never
rewrites existing steps. It writes `Rule:` only where the intent states a business rule,
with the rule's statement as plain description text. It prefers explicit Given steps over
`Background:` for new scenarios but tolerates existing backgrounds.

## 3. Provenance: one migration intent per project

The migration writes `intents/2026-09-18-<HHMM>-migrated-feature-tree.md` following
`intent-template.md` (validated by `validate-intent.js`): what was migrated, from which
prior sources (the old `.kartograph/kartograph.json`, hyperid's surveys and issue
references, `features/README.md`), the decisions above, and the open question that no
capability's purpose was written down. Every legacy feature gets that file as its
`# Source intent:`; every generated `capability.md` lists it under `## Sources`.

## 4. Generated `capability.md`

For each directory without one:
- Name: an existing `capability.md` is never overwritten; else the old map's
  `capabilities[<slug>].name` or `contexts[<slug>].name`; else the single feature's title;
  else the slug title-cased.
- Lead sentence: the project's knowledge concept `description` whose `title` equals the
  name (hyperid), else the first sentence of the single feature's description, else
  "Migrated from the Kartograph v0 feature tree; not yet described."
- Purpose and outcome, Scope and exclusions: one sentence each stating that the sources
  did not record it and the features are the current specification. Nothing invented.
- Features and Capabilities: from disk; each feature's line text is its title.
- Open questions: one bullet — purpose, scope and constraints were never written down.

## 5. The migration tool

`scripts/migrate-features.js <project-root> [--time HHMM]`, self-contained (Node built-ins
only), pure functions exported and tested on fixtures in `test/migrate-features.test.js`.
Per project it:
1. Walks `features/`; every directory is a capability.
2. For each `.feature` without the header comments: prepends `# language: de` when
   German step keywords are detected and no language line exists, then
   `# Source intent: <migration intent>` and `# Capability: <path>/capability.md`.
   A German file also gets its block keywords made German (`Feature:` →
   `Funktionalität:`, `Scenario:` → `Szenario:`, `Scenario Outline:` →
   `Szenariogrundriss:`, `Examples:` → `Beispiele:`, `Background:` → `Grundlage:`,
   `Rule:` → `Regel:`), because mokuso's files mix English block keywords with German
   steps and are valid in no single dialect. Nothing else in the body changes: not a
   step, a tag, a background, a table or a comment.
3. Generates missing `capability.md` files per section 4.
4. Writes the migration intent per section 3.
5. Moves a root `features/README.md` to `docs/features-README.md`.
6. Runs `validateTree` and prints what is left for hand fixing; exits 1 if anything is.
Idempotent: a second run changes nothing.

Known hand fixes after the run: eight rationale lines inside scenarios in
`mokuso/features/schreiben/tageszugang/tageszugang.feature` (invalid Gherkin already)
become `#` comments; anything else the validator reports is fixed by hand and reported.

## 6. mitoshi

`GherkinParser` accepts free-text description lines after `Rule:` until the first tag,
background, scenario or examples line, the way `beschreibung()` already does for
`Feature:`. One unit test in `core/src/commonTest`. Verification: a throwaway JVM test
loads the three migrated trees through `DateiFunktionsgraph.leseVerzeichnis` and asserts
zero error diagnostics; it is deleted after the run.

## 7. Order, commits, release

1. Plugin: validator + template + skill text + tests; plan/walk resolution + tests.
2. `scripts/migrate-features.js` + tests.
3. mitoshi parser fix + test, committed in mitoshi.
4. hyperid, beatrep, mokuso: run the tool, hand-fix, validate, one commit each
   (`features: migrate the tree to the Kartograph v2 layout`), pushed to upstream.
   mokuso's commit includes the already-present uncommitted canvases work.
5. Headless mitoshi check over the three trees.
6. CLAUDE.md, README, three manifests to v2.1.0, annotated tag, push.
