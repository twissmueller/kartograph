import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConversation, parseList } from "../skills/kartograph-converse/validate-conversation.js";

const FILE = "kartograph/2026-09-24-1430-export-csv.conversation.md";

const valid = `---
type: Conversation
title: Export CSV
description: The coach wants to hand session data to a spreadsheet.
status: recorded
date: 2026-09-24
role: coach
language: English
sources: []
related: []
---

# Export CSV

<!-- template comment, ignored -->

### 1 — Person

I want to export my sessions as CSV.

### 2 — AI

> Looked up: \`features/session-history/capability.md\`
Reasoning (shortened): history already lists sessions, so export may extend it.

**Question:** Is this an addition to Session history, or a separate ability?
- **A (recommended):** an addition to Session history
- **B:** a separate capability

### 3 — Person

A, it belongs to history. Columns like \`<date>\` stay as they are.

### 4 — AI

**Question:** Is anything missing?
- **A (recommended):** nothing is missing
- **B:** something is missing

### 5 — Person

Nothing is missing.
`;

const swap = (from, to) => valid.replace(from, to);
const errs = (text, filename = FILE) => validateConversation(text, { filename }).errors;
const has = (list, re) => list.some((e) => re.test(e));

test("a well-formed conversation passes", () => {
  assert.deepEqual(errs(valid), []);
});

test("parseList reads flat one-line lists", () => {
  assert.deepEqual(parseList("[]"), []);
  assert.deepEqual(parseList("[a.md, b.md]"), ["a.md", "b.md"]);
  assert.equal(parseList("none"), null);
});

test("filename, type, status and date are enforced", () => {
  assert.ok(has(errs(valid, "kartograph/2026-09-24-1430-export-csv.md"), /filename must be/));
  assert.ok(has(errs(valid, "kartograph/2026-09-24-1430-a-b-c-d-e-f.conversation.md"), /at most 5/));
  assert.ok(has(errs(swap("type: Conversation", "type: Intent")), /type must be Conversation/));
  assert.ok(has(errs(swap("status: recorded", "status: draft")), /status must be recorded/));
  assert.ok(has(errs(swap("date: 2026-09-24", "date: 2026-09-23")), /does not match the filename date/));
});

test("frontmatter keys are exact and ordered; lists are lists", () => {
  assert.ok(has(errs(swap("role: coach\n", "")), /missing 'role'/));
  assert.ok(has(errs(swap("related: []\n", "related: []\nowner: me\n")), /unknown key 'owner'/));
  assert.ok(has(errs(swap("sources: []", "sources: none")), /sources must be a list/));
  assert.ok(has(errs(swap("related: []", "related: [notes.md]")), /related entry 'notes.md'/));
  assert.deepEqual(errs(swap("related: []", "related: [2026-09-20-0900-history.intent.md]")), []);
});

test("the H1 equals the title and nothing but blocks follows it", () => {
  assert.ok(has(errs(swap("# Export CSV", "# Something else")), /does not match the frontmatter title/));
  assert.ok(has(errs(swap("### 1 — Person", "## Summary\n\n### 1 — Person")), /only numbered/));
  assert.ok(has(errs(swap("### 1 — Person", "Loose text.\n\n### 1 — Person")), /only numbered/));
});

test("blocks are numbered from 1, alternate, and end with the person", () => {
  assert.ok(has(errs(swap("### 3 — Person", "### 4 — Person")), /out of sequence/));
  assert.ok(has(errs(swap("### 2 — AI", "### 2 — Person")), /blocks alternate/));
  assert.ok(has(errs(valid + "\n### 6 — AI\n\n**Question:** More?\n"), /last block must be the person's/));
  assert.ok(has(errs(swap("Nothing is missing.\n", "")), /block 5 \(Person\) is empty/));
});

test("an AI block holds only lookups, one reasoning line, one question and options", () => {
  assert.ok(has(errs(swap("**Question:** Is anything missing?", "Let me explain at length.\n\n**Question:** Is anything missing?")), /every line is/));
  assert.ok(has(errs(swap("**Question:** Is anything missing?", "**Question:** Is anything missing?\n**Question:** Really?")), /exactly one '\*\*Question:\*\*'/));
  assert.ok(has(errs(swap("so export may extend it.", "so export may extend it.\n  and a second line")), /only the question and the options may continue/));
  assert.ok(has(errs(swap("- **B:** a separate capability", "- **B (recommended):** a separate capability")), /at most one option/));
});

test("template placeholders are rejected outside code spans", () => {
  assert.ok(has(errs(swap("I want to export my sessions as CSV.", "<what the person said>")), /template placeholder/));
});
