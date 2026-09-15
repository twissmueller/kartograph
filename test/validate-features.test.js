import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateCapability, validateFeature, validateCapabilityDir, validateTree } from "../skills/kartograph-features/validate-features.js";

const INTENT = "intents/2026-09-15-1042-archive-projects.md";

const capability = `# Capability: Project archiving

Owners can take a project out of the active overview without deleting it.

## Sources
- Intent: \`${INTENT}\`

## Purpose and outcome
Project owners can remove active projects from the active overview by archiving them.

## Scope and exclusions
Includes archiving active projects and rejecting non-owner attempts. Deleting is excluded.

## Features
- [Archive a project](archive-project.feature): successful and rejected attempts.

## Open questions
- Where, if anywhere, does an archived project remain accessible? Blocks post-archive access.
`;

const feature = `# Source intent: ${INTENT}
# Capability: features/project-archiving/capability.md
Feature: Archive a project
  Project owners can remove an active project from the active overview.

  Rule: Owners can archive their active projects
    Requirement: When an owner archives an active project, the system shall remove that project from the active overview.

    Scenario: An owner archives an active project
      Given Alice owns the active project "Atlas"
      When Alice archives "Atlas"
      Then "Atlas" is absent from the active project overview

  Rule: Non-owners cannot archive a project
    Requirement: If a non-owner attempts to archive an active project, then the system shall reject the request and leave the project unchanged.

    Scenario: A non-owner tries to archive an active project
      Given Alice owns the active project "Atlas"
      And Bob is not its owner
      When Bob attempts to archive "Atlas"
      Then the request is rejected
      And "Atlas" remains unchanged in the active project overview
`;

const OPTS = { path: "features/project-archiving/capability.md", featureFiles: ["archive-project.feature"] };

test("a well-formed capability.md passes", () => {
  const r = validateCapability(capability, OPTS);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.intents, [INTENT]);
});

test("capability heading, lead paragraph and section order are enforced", () => {
  assert.ok(validateCapability(capability.replace("# Capability: Project archiving", "# Project archiving"), OPTS).errors.some((e) => /must be '# Capability: <name>'/.test(e)));
  assert.ok(validateCapability(capability.replace("Owners can take a project out of the active overview without deleting it.\n", ""), OPTS).errors.some((e) => /lead paragraph/.test(e)));
  assert.ok(validateCapability(capability.replace("## Open questions", "## Risks\n- none\n\n## Open questions"), OPTS).errors.some((e) => /unknown section '## Risks'/.test(e)));
  const swapped = capability.replace("## Purpose and outcome\nProject owners can remove active projects from the active overview by archiving them.\n\n", "").replace("## Features", "## Purpose and outcome\nlate\n\n## Features");
  assert.ok(validateCapability(swapped, OPTS).errors.some((e) => /order/.test(e)));
  assert.deepEqual(validateCapability(capability.replace("## Features", "## Constraints\n- Existing Android build only\n\n## Features"), OPTS).errors, []);
});

test("sources need an intent line with the right path shape", () => {
  assert.ok(validateCapability(capability.replace(`- Intent: \`${INTENT}\``, "- Decision: `docs/adr-1.md`"), OPTS).errors.some((e) => /needs at least one '- Intent:/.test(e)));
  assert.ok(validateCapability(capability.replace(INTENT, "intent/archive.md"), OPTS).errors.some((e) => /must look like intents\//.test(e)));
});

test("the features list must match the .feature files in the directory", () => {
  const r = validateCapability(capability, { ...OPTS, featureFiles: ["archive-project.feature", "restore-project.feature"] });
  assert.ok(r.errors.some((e) => /does not list restore-project.feature/.test(e)));
  const r2 = validateCapability(capability.replace("archive-project.feature", "gone.feature"), OPTS);
  assert.ok(r2.errors.some((e) => /links to 'gone.feature', which does not exist/.test(e)));
  assert.ok(validateCapability(capability.replace("- [Archive a project](archive-project.feature): successful", "- archive-project.feature: successful"), OPTS).errors.some((e) => /must be '- \[Title\]/.test(e)));
});

test("open questions are bullets or exactly None; placeholders are rejected", () => {
  assert.deepEqual(validateCapability(capability.replace(/## Open questions\n[\s\S]*$/, "## Open questions\nNone\n"), OPTS).errors, []);
  assert.ok(validateCapability(capability.replace(/## Open questions\n[\s\S]*$/, "## Open questions\nNothing open.\n"), OPTS).errors.some((e) => /bullet list or exactly 'None'/.test(e)));
  assert.ok(validateCapability(capability.replace("Project archiving", "<meaningful name>"), OPTS).errors.some((e) => /placeholder/.test(e)));
});

const FOPTS = { path: "features/project-archiving/archive-project.feature", capabilityDir: "project-archiving" };

test("a well-formed feature file passes", () => {
  const r = validateFeature(feature, FOPTS);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.intents, [INTENT]);
});

test("header comments are required and the capability path must match the directory", () => {
  assert.ok(validateFeature(feature.replace(`# Source intent: ${INTENT}\n`, ""), FOPTS).errors.some((e) => /line 1 must be '# Source intent:/.test(e)));
  assert.ok(validateFeature(feature.replace("features/project-archiving/capability.md", "features/other/capability.md"), FOPTS).errors.some((e) => /must point at features\/project-archiving\/capability.md/.test(e)));
  const two = feature.replace(`# Source intent: ${INTENT}\n`, `# Source intent: ${INTENT}\n# Source intent: intents/2026-09-16-0900-restore.md\n`);
  assert.deepEqual(validateFeature(two, FOPTS).errors, []);
  assert.equal(validateFeature(two, FOPTS).intents.length, 2);
});

test("one Feature, rules with an EARS requirement before the first scenario, scenarios with Then", () => {
  assert.ok(validateFeature(feature + "\nFeature: Another\n", FOPTS).errors.some((e) => /exactly one 'Feature:'/.test(e)));
  const noReq = feature.replace("    Requirement: When an owner archives an active project, the system shall remove that project from the active overview.\n", "");
  assert.ok(validateFeature(noReq, FOPTS).errors.some((e) => /has no 'Requirement:' line/.test(e)));
  const notEars = feature.replace("Requirement: When an owner archives an active project, the system shall remove that project from the active overview.", "Requirement: Owners archive projects.");
  assert.ok(validateFeature(notEars, FOPTS).errors.some((e) => /EARS form/.test(e)));
  const noThen = feature.replace(`      Then "Atlas" is absent from the active project overview\n`, "");
  assert.ok(validateFeature(noThen, FOPTS).errors.some((e) => /has no Then step/.test(e)));
  const noRule = feature.replace(/  Rule: Owners can archive their active projects\n    Requirement: [^\n]*\n/, "");
  assert.ok(validateFeature(noRule, FOPTS).errors.some((e) => /is not under a 'Rule:'/.test(e)));
  const dup = feature.replace("Scenario: A non-owner tries to archive an active project", "Scenario: An owner archives an active project");
  assert.ok(validateFeature(dup, FOPTS).errors.some((e) => /used twice/.test(e)));
});

test("scenario outlines need Examples and tables are tolerated", () => {
  const outline = feature.replace("Scenario: An owner archives an active project", "Scenario Outline: An owner archives an active project").replace(`"Atlas" is absent from the active project overview\n`, `"<name>" is absent from the active project overview\n\n    Examples:\n      | name  |\n      | Atlas |\n`);
  assert.deepEqual(validateFeature(outline, FOPTS).errors, []);
  const noExamples = feature.replace("Scenario: An owner archives an active project", "Scenario Outline: An owner archives an active project");
  assert.ok(validateFeature(noExamples, FOPTS).errors.some((e) => /has no 'Examples:'/.test(e)));
});

// --- directory and tree -----------------------------------------------------

function tree(t, { intentExists = true, files } = {}) {
  const root = mkdtempSync(join(tmpdir(), "karto-features-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "intents"));
  if (intentExists) writeFileSync(join(root, INTENT), "# x\n");
  const cap = join(root, "features", "project-archiving");
  mkdirSync(cap, { recursive: true });
  for (const [p, txt] of Object.entries(files || { "capability.md": capability, "archive-project.feature": feature })) writeFileSync(join(cap, p), txt);
  return root;
}

test("a well-formed tree passes", (t) => {
  const root = tree(t);
  const r = validateTree(join(root, "features"));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test("a feature's source intent must be listed in capability.md and must exist", (t) => {
  const other = feature.replace(INTENT, "intents/2026-09-16-0900-restore.md");
  const root = tree(t, { files: { "capability.md": capability, "archive-project.feature": other } });
  const { errors } = validateTree(join(root, "features"));
  assert.ok(errors.some((e) => /is not listed under '## Sources'/.test(e)));
  assert.ok(errors.some((e) => /does not exist/.test(e)));
});

test("stray files, missing capability.md and bad directory names are rejected", (t) => {
  const root = tree(t, { files: { "archive-project.feature": feature, "notes.txt": "x" } });
  mkdirSync(join(root, "features", "Bad Name"));
  writeFileSync(join(root, "features", "README.md"), "x");
  const { errors } = validateTree(join(root, "features"));
  assert.ok(errors.some((e) => /capability.md: missing/.test(e)));
  assert.ok(errors.some((e) => /only capability.md and .feature files belong here/.test(e)));
  assert.ok(errors.some((e) => /must be a lowercase hyphenated slug/.test(e)));
  assert.ok(errors.some((e) => /only capability directories belong under features\//.test(e)));
});

test("a single capability directory can be validated on its own", (t) => {
  const root = tree(t);
  assert.deepEqual(validateCapabilityDir(join(root, "features", "project-archiving"), { projectRoot: root }).errors, []);
});
