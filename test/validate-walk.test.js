import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateWalk, validateWalkFile } from "../skills/kartograph-walk/validate-walk.js";

const FILE = "walks/2026-09-16-0930-project-archiving.md";

const valid = `---
capability: project-archiving
features: [archive-project.feature]
driver: compose-hot-reload
surface: desktop
date: 2026-09-16
walker: product owner
---

# Walk: Project archiving

## Summary

- **Passed:** 1
- **Failed:** 1
- **Skipped:** 0
- **Not drivable:** 0

A desktop window proves the shared UI, nothing platform-specific.

## archive-project.feature

### An owner archives an active project

- **Verdict:** passed
- **Observed:** "Atlas" disappeared from the active project overview.
- **Person said:** —
- **Stuck at:** —

### A non-owner tries to archive an active project

- **Verdict:** failed
- **Observed:** The request was rejected, but "Atlas" also vanished from the overview.
- **Person said:** The project must stay where it was.
- **Stuck at:** —
`;

const swap = (from, to) => valid.replace(from, to);

test("a well-formed walk passes", () => {
  assert.deepEqual(validateWalk(valid, { filename: FILE }).errors, []);
});

test("filename, capability and date must agree", () => {
  assert.ok(validateWalk(valid, { filename: "walks/archiving.md" }).errors.some((e) => /filename must be/.test(e)));
  assert.ok(validateWalk(swap("capability: project-archiving", "capability: other"), { filename: FILE }).errors.some((e) => /does not match the filename's/.test(e)));
  assert.ok(validateWalk(swap("date: 2026-09-16", "date: 2026-09-15"), { filename: FILE }).errors.some((e) => /does not match the filename date/.test(e)));
});

test("frontmatter keys, driver, surface and features list are constrained", () => {
  assert.ok(validateWalk(swap("walker: product owner\n", ""), { filename: FILE }).errors.some((e) => /missing 'walker'/.test(e)));
  assert.ok(validateWalk(swap("driver: compose-hot-reload", "driver: selenium"), { filename: FILE }).errors.some((e) => /driver must be/.test(e)));
  assert.ok(validateWalk(swap("surface: desktop", "surface: tv"), { filename: FILE }).errors.some((e) => /surface must be/.test(e)));
  assert.ok(validateWalk(swap("features: [archive-project.feature]", "features: archive-project.feature"), { filename: FILE }).errors.some((e) => /must be a non-empty list/.test(e)));
  assert.ok(validateWalk(swap("features: [archive-project.feature]", "features: [archive-project.feature, restore.feature]"), { filename: FILE }).errors.some((e) => /no '## restore.feature' section/.test(e)));
});

test("summary lines must exist, be numbers, and match the tally", () => {
  assert.ok(validateWalk(swap("- **Skipped:** 0\n", ""), { filename: FILE }).errors.some((e) => /missing the '- \*\*Skipped:\*\*/.test(e)));
  assert.ok(validateWalk(swap("- **Passed:** 1", "- **Passed:** 2"), { filename: FILE }).errors.some((e) => /says Passed: 2 but the scenarios tally 1/.test(e)));
  assert.ok(validateWalk(swap("A desktop window proves the shared UI, nothing platform-specific.\n", ""), { filename: FILE }).errors.some((e) => /what this surface proves/.test(e)));
});

test("scenario sections need the four lines in order and a valid verdict", () => {
  assert.ok(validateWalk(swap("- **Verdict:** passed", "- **Verdict:** ok"), { filename: FILE }).errors.some((e) => /verdict must be/.test(e)));
  assert.ok(validateWalk(swap("- **Person said:** —\n- **Stuck at:** —\n\n### A non-owner", "- **Stuck at:** —\n- **Person said:** —\n\n### A non-owner"), { filename: FILE }).errors.some((e) => /lines must be in the order/.test(e)));
  assert.ok(validateWalk(swap("- **Stuck at:** —\n\n### A non-owner", "\n### A non-owner"), { filename: FILE }).errors.some((e) => /missing '- \*\*Stuck at:\*\*'/.test(e)));
});

test("a failure needs the person's words; not drivable needs where it stuck", () => {
  const noWords = swap("- **Person said:** The project must stay where it was.", "- **Person said:** —");
  assert.ok(validateWalk(noWords, { filename: FILE }).errors.some((e) => /needs the person's words/.test(e)));
  const nd = swap("- **Verdict:** passed", "- **Verdict:** not drivable").replace("- **Passed:** 1", "- **Passed:** 0").replace("- **Not drivable:** 0", "- **Not drivable:** 1");
  assert.ok(validateWalk(nd, { filename: FILE }).errors.some((e) => /needs 'Stuck at'/.test(e)));
  const ndOk = nd.replace('- **Observed:** "Atlas" disappeared from the active project overview.\n- **Person said:** —\n- **Stuck at:** —', '- **Observed:** —\n- **Person said:** —\n- **Stuck at:** Given — no project named "Atlas" exists in the sample data.');
  assert.deepEqual(validateWalk(ndOk, { filename: FILE }).errors, []);
});

test("template placeholders are rejected", () => {
  assert.ok(validateWalk(swap("# Walk: Project archiving", "# Walk: <capability title>"), { filename: FILE }).errors.some((e) => /placeholder/.test(e)));
});

test("against a project, features and scenario names must exist", (t) => {
  const root = mkdtempSync(join(tmpdir(), "karto-walk-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "features", "project-archiving"), { recursive: true });
  mkdirSync(join(root, "walks"));
  writeFileSync(join(root, "features", "project-archiving", "archive-project.feature"),
    "Feature: Archive a project\n  Rule: x\n    Scenario: An owner archives an active project\n      Given a\n      When b\n      Then c\n    Scenario: A non-owner tries to archive an active project\n      Given a\n      When b\n      Then c\n");
  const path = join(root, "walks", "2026-09-16-0930-project-archiving.md");
  writeFileSync(path, valid);
  assert.deepEqual(validateWalkFile(path).errors, []);
  writeFileSync(path, valid.replace("### An owner archives an active project", "### An owner archives a project"));
  assert.ok(validateWalkFile(path).errors.some((e) => /is not a scenario in features\/project-archiving\/archive-project.feature/.test(e)));
  writeFileSync(path, valid.replace(/archive-project\.feature/g, "gone.feature"));
  assert.ok(validateWalkFile(path).errors.some((e) => /gone.feature does not exist/.test(e)));
});

test("a nested capability is found by leaf slug or by path; ambiguity is an error", (t) => {
  const root = mkdtempSync(join(tmpdir(), "karto-walk-nested-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cap = join(root, "features", "admin-console", "project-archiving"); mkdirSync(cap, { recursive: true });
  mkdirSync(join(root, "walks"));
  writeFileSync(join(cap, "archive-project.feature"),
    "Feature: Archive a project\n  Scenario: An owner archives an active project\n    Given a\n    When b\n    Then c\n  Scenario: A non-owner tries to archive an active project\n    Given a\n    When b\n    Then c\n");
  const path = join(root, "walks", "2026-09-16-0930-project-archiving.md");
  writeFileSync(path, valid);
  assert.deepEqual(validateWalkFile(path).errors, []);
  writeFileSync(path, valid.replace("capability: project-archiving", "capability: admin-console/project-archiving"));
  assert.deepEqual(validateWalkFile(path).errors, []);
  mkdirSync(join(root, "features", "other", "project-archiving"), { recursive: true });
  writeFileSync(path, valid);
  assert.ok(validateWalkFile(path).errors.some((e) => /ambiguous/.test(e)));
  assert.ok(validateWalk(valid.replace("capability: project-archiving", "capability: Admin/Console"), { filename: FILE }).errors.some((e) => /capability must be/.test(e)));
});
