import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  compareVersions, migrationVersions, layoutVersion, projectVersion, convertIntent,
  rewriteProvenance, logEntry, migrateProject,
} from "../scripts/migrate-kartograph.js";
import { addHeader, capabilityMarkdown } from "../scripts/migrate-features.js";
import { validateIntent } from "../skills/kartograph-intent/validate-intent.js";

const OLD = "2026-09-15-1042-offline-watering";
const oldIntent = (related = "none", sources = "https://example.org/issue/7") => `---
title: Offline watering schedule
date: 2026-09-15
status: confirmed
role: product owner
language: English
sources: ${sources}
related: ${related}
---

# Offline watering schedule

## Summary

The gardener wants today's tasks without a network. Nothing else.

## Who

- **Speaking:** product owner
- **Benefits:** gardeners
- **Affected:** the sync team

## Goals

- Watering tasks usable offline

## Intended outcomes

- Today's tasks are visible offline

## Non-goals

None identified.

## Constraints

None identified.

## Assumptions

None identified.

## Decisions

None identified.

## Open questions

None identified.

## Terms

None identified.

## Notes

None identified.
`;

const feature = "Feature: Water\n  Tick a task.\n\n  Scenario: Ticking a task\n    When I tick it\n    Then it is done\n";
const concept = `---
type: Actor
title: Gardener
description: The person who tends the garden.
status: draft
aliases_to_avoid: [user]
tags: []
generated: { by: kartograph-knowledge/2.1.0, at: 2026-09-15T10:50:00Z }
sources:
  - id: ${OLD}
    resource: ../intents/${OLD}.md
    title: Offline watering schedule
---

# Definition

The person who tends the garden.

# Relations

None.

# From the intent

> gardeners[^${OLD}]

[^${OLD}]: Offline watering schedule
`;

function project23(t) {
  const root = mkdtempSync(join(tmpdir(), "karto-23-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "intents"));
  writeFileSync(join(root, "intents", `${OLD}.md`), oldIntent());
  const cap = join(root, "features", "watering"); mkdirSync(cap, { recursive: true });
  const intent = `intents/${OLD}.md`;
  writeFileSync(join(cap, "water.feature"), addHeader(feature, { intent, capabilityPath: "watering" }));
  writeFileSync(join(cap, "capability.md"), capabilityMarkdown({ name: "Watering", lead: "Water plants.", intent, features: [{ file: "water.feature", title: "Water", text: "Tick a task." }], capabilities: [] }));
  mkdirSync(join(root, "knowledge", "actors"), { recursive: true });
  writeFileSync(join(root, "knowledge", "actors", "gardener.md"), concept);
  writeFileSync(join(root, "knowledge", "index.md"), `---\nokf_version: "0.2"\n---\n\n# Knowledge\n\n* [Gardener](actors/gardener.md) - The person who tends the garden. _(Actor, draft)_\n`);
  writeFileSync(join(root, "knowledge", "log.md"), `# Knowledge Update Log\n\n## 2026-09-15\n* **Intent**: processed [Offline watering schedule](../intents/${OLD}.md) — 1 new.\n`);
  return root;
}

test("versions compare numerically and the layout is the highest migration document", () => {
  assert.ok(compareVersions("2.10.0", "2.9.1") > 0);
  assert.equal(compareVersions("3.0.0", "3.0.0"), 0);
  assert.deepEqual(migrationVersions(), ["2.1.0", "3.0.0"]);
  assert.equal(layoutVersion(), "3.0.0");
});

test("every migration document has Target state, Recognise and Do, in that order", () => {
  for (const v of migrationVersions()) {
    const text = readFileSync(new URL(`../migrations/${v}.md`, import.meta.url), "utf8");
    const heads = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.deepEqual(heads, ["Target state", "Recognise", "Do"], v);
  }
});

test("projectVersion: new, before 2.1, before 3.0, and from index.md", (t) => {
  const root = mkdtempSync(join(tmpdir(), "karto-v-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(projectVersion(root), null);
  mkdirSync(join(root, "features", "a"), { recursive: true }); writeFileSync(join(root, "features", "a", "x.feature"), feature);
  assert.equal(projectVersion(root), "2.0.0");
  writeFileSync(join(root, "features", "a", "x.feature"), addHeader(feature, { intent: `intents/${OLD}.md`, capabilityPath: "a" }));
  assert.equal(projectVersion(root), "2.3.0");
  mkdirSync(join(root, "kartograph")); writeFileSync(join(root, "kartograph", "index.md"), `---\nokf_version: "0.2"\nkartograph_version: 3.0.0\n---\n\n# Kartograph\n`);
  assert.equal(projectVersion(root), "3.0.0");
});

test("convertIntent produces a legacy intent the validator accepts", () => {
  const out = convertIntent(oldIntent(`intents/2026-09-01-0900-earlier.md`));
  assert.ok(out.startsWith("---\ntype: Intent\ntitle: Offline watering schedule\ndescription: The gardener wants today's tasks without a network.\nstatus: confirmed\n"));
  assert.ok(out.includes("sources: [legacy-no-conversation, https://example.org/issue/7]\nrelated: [2026-09-01-0900-earlier.intent.md]\n"));
  assert.deepEqual(validateIntent(out, { filename: `${OLD}.intent.md` }).errors, []);
  const freeText = validateIntent(convertIntent(oldIntent("the Q3 roadmap")), { filename: `${OLD}.intent.md` }).errors;
  assert.ok(freeText.some((e) => /related entry 'the Q3 roadmap'/.test(e)));
});

test("convertIntent splits a comma list of paths, URLs or backticked values, one item per entry", () => {
  const out = convertIntent(oldIntent("none", "https://example.org/issue/7, https://example.org/pr/12, `notes.md`"));
  assert.ok(out.includes("sources: [legacy-no-conversation, https://example.org/issue/7, https://example.org/pr/12, notes.md]\n"));
});

test("convertIntent keeps a free-text sources value as one item, its own commas replaced by ' —'", () => {
  const out = convertIntent(oldIntent("none", `The owner's request "keep it offline", and the two decisions taken in that conversation`));
  assert.ok(out.includes(`sources: [legacy-no-conversation, The owner's request "keep it offline" — and the two decisions taken in that conversation]\n`));
  assert.deepEqual(validateIntent(out, { filename: `${OLD}.intent.md` }).errors, []);
});

test("convertIntent treats any 'none…' sources or related value as empty, not just an exact 'none'", () => {
  const noSources = convertIntent(oldIntent("none", "none (nothing to link)"));
  assert.ok(noSources.includes("sources: [legacy-no-conversation]\n"));
  const noRelated = convertIntent(oldIntent("none (nothing else linked)"));
  assert.ok(noRelated.includes("related: []\n"));
});

test("rewriteProvenance changes only provenance lines and is idempotent", () => {
  const f = `# Source intent: intents/${OLD}.md\n# Capability: features/a/capability.md\nFeature: X\n  Scenario: mentions intents/${OLD}.md in a step\n`;
  const once = rewriteProvenance(f);
  assert.ok(once.startsWith(`# Source intent: kartograph/${OLD}.intent.md\n`));
  assert.ok(once.includes(`mentions intents/${OLD}.md in a step`));
  assert.equal(rewriteProvenance(once), once);
  assert.equal(rewriteProvenance(`- Intent: \`intents/${OLD}.md\``), `- Intent: \`kartograph/${OLD}.intent.md\``);
  assert.equal(rewriteProvenance(`resource: ../intents/${OLD}.md`), `resource: ../kartograph/${OLD}.intent.md`);
});

test("rewriteProvenance also rewrites '# Added by' and '# Changed by' scenario comments, keeping what follows", () => {
  const f = [
    `  # Added by intents/${OLD}.md`,
    `  # Changed by intents/${OLD}.md: reason`,
    `  Scenario: mentions intents/${OLD}.md in a step`,
  ].join("\n") + "\n";
  const once = rewriteProvenance(f);
  assert.ok(once.includes(`  # Added by kartograph/${OLD}.intent.md\n`));
  assert.ok(once.includes(`  # Changed by kartograph/${OLD}.intent.md: reason\n`));
  assert.ok(once.includes(`mentions intents/${OLD}.md in a step`));
  assert.equal(rewriteProvenance(once), once);
});

test("logEntry adds under today's date, newest first", () => {
  const a = logEntry("", "2026-09-20", "* one");
  assert.equal(a, "# Kartograph Log\n\n## 2026-09-20\n* one\n");
  const b = logEntry(a, "2026-09-24", "* two");
  assert.equal(b, "# Kartograph Log\n\n## 2026-09-24\n* two\n\n## 2026-09-20\n* one\n");
  assert.equal(logEntry(b, "2026-09-24", "* three"), "# Kartograph Log\n\n## 2026-09-24\n* three\n* two\n\n## 2026-09-20\n* one\n");
});

test("a 2.3 project migrates to 3.0.0 in one run, and a second run writes nothing", (t) => {
  const root = project23(t);
  const r = migrateProject(root, { date: "2026-09-24" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.from, "2.3.0"); assert.equal(r.to, "3.0.0");
  assert.ok(!existsSync(join(root, "intents")));
  assert.ok(existsSync(join(root, "kartograph", `${OLD}.intent.md`)));
  assert.ok(readFileSync(join(root, "features", "watering", "water.feature"), "utf8").startsWith(`# Source intent: kartograph/${OLD}.intent.md\n`));
  assert.ok(readFileSync(join(root, "features", "watering", "capability.md"), "utf8").includes(`- Intent: \`kartograph/${OLD}.intent.md\``));
  assert.ok(readFileSync(join(root, "knowledge", "actors", "gardener.md"), "utf8").includes(`resource: ../kartograph/${OLD}.intent.md`));
  assert.ok(readFileSync(join(root, "knowledge", "log.md"), "utf8").includes(`](../kartograph/${OLD}.intent.md)`));
  const index = readFileSync(join(root, "kartograph", "index.md"), "utf8");
  assert.ok(index.startsWith(`---\nokf_version: "0.2"\nkartograph_version: 3.0.0\n---\n\n# Kartograph\n\n* [Offline watering schedule](${OLD}.intent.md) - `));
  assert.ok(readFileSync(join(root, "kartograph", "log.md"), "utf8").includes("* **Migration**: 2.3.0 → 3.0.0 — 1 intents moved into kartograph/."));
  const again = migrateProject(root, { date: "2026-09-25" });
  assert.deepEqual(again.written, []);
  assert.equal(again.from, "3.0.0");
  assert.deepEqual(again.errors, []);
});

test("a bad intent (no frontmatter) is skipped with a per-file error; intents/ stays non-empty and the run continues", (t) => {
  const root = project23(t);
  const badStamp = "2026-09-16-0900-broken-intent";
  writeFileSync(join(root, "intents", `${badStamp}.md`), "not an intent file, no frontmatter here\n");
  const r = migrateProject(root, { date: "2026-09-24" });
  assert.ok(r.errors.some((e) => e.startsWith(`intents/${badStamp}.md: `)));
  assert.ok(existsSync(join(root, "intents")));
  assert.ok(existsSync(join(root, "intents", `${badStamp}.md`)));
  assert.ok(existsSync(join(root, "kartograph", `${OLD}.intent.md`)));
  assert.ok(!existsSync(join(root, "kartograph", `${badStamp}.intent.md`)));
});

test("a rerun does not hide validation errors: it revalidates, reports them, and writes nothing", (t) => {
  const root = project23(t);
  // A scenario with no Then step is a structural error the validator always reports,
  // migration or not — it stays broken across a rerun.
  const capDir = join(root, "features", "watering");
  const broken = "Feature: Water\n  Tick a task.\n\n  Scenario: Ticking a task\n    When I tick it\n";
  writeFileSync(join(capDir, "water.feature"), addHeader(broken, { intent: `intents/${OLD}.md`, capabilityPath: "watering" }));

  const first = migrateProject(root, { date: "2026-09-24" });
  assert.equal(first.from, "2.3.0");
  assert.ok(first.errors.some((e) => /has no Then step/.test(e)));

  const second = migrateProject(root, { date: "2026-09-25" });
  assert.deepEqual(second.written, []);
  assert.equal(second.from, "3.0.0");
  assert.ok(second.errors.some((e) => /has no Then step/.test(e)));
});

test("a v0 project goes to 3.0.0 directly: the migration intent lands in kartograph/, never in intents/", (t) => {
  const root = mkdtempSync(join(tmpdir(), "karto-v0-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "features", "watering"), { recursive: true });
  writeFileSync(join(root, "features", "watering", "water.feature"), feature);
  const r = migrateProject(root, { date: "2026-09-24", time: "1200" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.from, "2.0.0");
  assert.ok(!existsSync(join(root, "intents")));
  assert.deepEqual(readdirSync(join(root, "kartograph")).sort(), ["2026-09-24-1200-migrated-feature-tree.intent.md", "index.md", "log.md"]);
});

test("a new project has nothing to migrate", (t) => {
  const root = mkdtempSync(join(tmpdir(), "karto-new-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const r = migrateProject(root);
  assert.equal(r.from, null);
  assert.deepEqual(r.written, []);
  assert.ok(!existsSync(join(root, "kartograph")));
});
