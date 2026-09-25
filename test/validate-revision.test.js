import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateRevision, validateRevisionFile, capabilityOf } from "../skills/kartograph-revise/validate-revision.js";

const FILE = "kartograph/2026-09-25-1000-archive-undo.revision.md";
const INTENT = "2026-09-18-1100-project-archiving.intent.md";
const F = "features/project-archiving/archive-project.feature";

const valid = `---
type: Revision
title: Archive undo
description: The owner wants to take an archive back right after doing it.
status: recorded
date: 2026-09-25
role: project owner
language: English
sources: [${INTENT}]
related: []
---

# Archive undo

<!-- template comment, ignored -->

## Conversation

### 1 — Person

After archiving I want an undo right there, and the confirmation dialog can go.

### 2 — AI

**Question:** How long should the undo stay available?
- **A (recommended):** until the message disappears
- **B:** until the person leaves the screen

### 3 — Person

A.

## Affected

- Capability: \`features/project-archiving/capability.md\`
- Feature: \`${F}\`
- Scenario: \`${F} › An owner archives an active project\`
- Screen: \`ProjectsScreen\` in \`plans/2026-09-18-1100-project-archiving.md\`

## Changes

- **Changed:** \`${F} › An owner archives an active project\` — no confirmation dialog before archiving [turn 1]
- **Added:** \`${F}\` — an undo is offered until the message disappears [turns 1, 3]

## Open questions

None identified.
`;

const swap = (from, to) => valid.replace(from, to);
const errs = (text, filename = FILE) => validateRevision(text, { filename }).errors;
const has = (list, re) => list.some((e) => re.test(e));

test("a well-formed revision passes", () => {
  assert.deepEqual(errs(valid), []);
});

test("capabilityOf maps a feature, a scenario or a capability to its capability.md", () => {
  assert.equal(capabilityOf(`${F} › x`), "features/project-archiving/capability.md");
  assert.equal(capabilityOf("features/a/b/c.feature"), "features/a/b/capability.md");
  assert.equal(capabilityOf("features/a/capability.md"), "features/a/capability.md");
});

test("filename, type, status, date and sources are enforced", () => {
  assert.ok(has(errs(valid, "kartograph/2026-09-25-1000-archive-undo.md"), /filename must be/));
  assert.ok(has(errs(swap("type: Revision", "type: Intent")), /type must be Revision/));
  assert.ok(has(errs(swap("status: recorded", "status: draft")), /status must be recorded \| applied/));
  assert.deepEqual(errs(swap("status: recorded", "status: applied")), []);
  assert.ok(has(errs(swap("date: 2026-09-25", "date: 2026-09-24")), /does not match the filename date/));
  assert.ok(has(errs(swap(`sources: [${INTENT}]`, "sources: []")), /sources must name the intent/));
  assert.ok(has(errs(swap(`sources: [${INTENT}]`, "sources: [2026-09-18-1100-project-archiving.mapping.md]")), /must be the file name of an intent/));
  assert.deepEqual(errs(swap("related: []", "related: [2026-09-20-0900-archive-colour.revision.md]")), []);
});

test("the sections are exactly Conversation, Affected, Changes, Open questions", () => {
  assert.ok(has(errs(swap("## Open questions\n\nNone identified.\n", "")), /missing section\(s\): ## Open questions/));
  assert.ok(has(errs(swap("## Affected", "## Notes\n\n- x\n\n## Affected")), /unknown section\(s\): ## Notes/));
  assert.ok(has(errs(swap("## Conversation", "Loose text.\n\n## Conversation")), /nothing but the title/));
});

test("the conversation starts and ends with the person and alternates", () => {
  const aiFirst = valid.replace(/## Conversation\n[\s\S]*?## Affected/, "## Conversation\n\n### 1 — AI\n\n**Question:** What should change?\n\n### 2 — Person\n\nThe dialog can go.\n\n## Affected");
  assert.ok(has(errs(aiFirst), /first block must be the person's/));
  assert.ok(has(errs(swap("### 3 — Person\n\nA.\n", "")), /last block must be the person's/));
  assert.ok(has(errs(swap("### 2 — AI", "### 2 — Person")), /blocks alternate/));
  assert.ok(has(errs(swap("### 3 — Person", "### 4 — Person")), /out of sequence/));
  assert.ok(has(errs(swap("**Question:** How long", "Let me explain.\n**Question:** How long")), /every line is/));
});

test("affected lines have their shapes and name the capability of every feature", () => {
  assert.ok(has(errs(swap("- Capability: `features/project-archiving/capability.md`\n", "")), /at least one '- Capability:'/));
  assert.ok(has(errs(swap("- Feature: `" + F + "`", "- Feature: archive-project.feature")), /'## Affected' lines are/));
  assert.ok(has(errs(swap("- Feature: `" + F + "`", "- Feature: `features/other/x.feature`")), /but not its capability 'features\/other\/capability.md'/));
});

test("every change has a kind, a target in an affected capability, and cites the person", () => {
  assert.ok(has(errs(swap("- **Added:**", "- **Moved:**")), /'## Changes' lines are/));
  assert.ok(has(errs(swap("[turns 1, 3]", "")), /every change cites/));
  assert.ok(has(errs(swap("[turns 1, 3]", "[turn 2]")), /cites turn 2, which is the AI's/));
  assert.ok(has(errs(swap("[turns 1, 3]", "[turn 9]")), /cites turn 9, which '## Conversation' does not have/));
  assert.ok(has(errs(swap("- **Added:** `" + F + "`", "- **Added:** `features/other/x.feature`")), /lies in a capability '## Affected' does not name/));
});

test("open questions are bullets or the empty marker; placeholders are rejected", () => {
  assert.ok(has(errs(swap("None identified.", "Maybe later.")), /bullet list or exactly 'None identified.'/));
  assert.deepEqual(errs(swap("None identified.", "- Whether an undo also restores the order — blocks the added undo")), []);
  assert.ok(has(errs(swap("A.\n", "<the answer>\n")), /template placeholder/));
});

test("inside a project the intents in sources must sit beside it; missing affected paths only warn", (t) => {
  const root = mkdtempSync(join(tmpdir(), "karto-revision-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "kartograph"));
  mkdirSync(join(root, "features", "project-archiving"), { recursive: true });
  writeFileSync(join(root, "features", "project-archiving", "capability.md"), "# Capability: x\n");
  const path = join(root, FILE);
  writeFileSync(path, valid);
  let r = validateRevisionFile(path);
  assert.ok(has(r.errors, new RegExp(`sources names '${INTENT}', which does not exist`)));
  writeFileSync(join(root, "kartograph", INTENT), "---\ntype: Intent\n---\n");
  r = validateRevisionFile(path);
  assert.deepEqual(r.errors, []);
  assert.ok(has(r.warnings, /archive-project\.feature', which does not exist/));
});
