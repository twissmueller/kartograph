# Conversation, Intent, Mapping and Versioned Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `kartograph-explore` into three skills (converse → intent → map) writing typed documents into one flat `kartograph/` OKF bundle, make knowledge and features build on the mapping, and add a `kartograph-migrate` skill driven by per-version `migrations/<version>.md` documents; release as 3.0.0.

**Architecture:** Each new skill is a directory under `skills/` with its `SKILL.md`, a template and a self-contained validator (pure function + thin CLI, Node built-ins only), exactly like the existing skills. A bundle-structure validator lives in `kartograph-migrate`. The mechanical migration lives in `scripts/migrate-kartograph.js`, which composes `scripts/migrate-features.js`; both always write the newest layout. The plugin's layout version is the highest `migrations/<x.y.z>.md`; every skill but migrate starts with an identical version gate.

**Tech Stack:** Node ≥ 18 ES modules, `node:test`, markdown skills; no dependencies.

**Spec:** `docs/superpowers/specs/2026-09-24-conversation-intent-mapping-design.md`

## Global Constraints

- Validators: one file each, no imports beyond Node built-ins; pure function returning `{ errors, warnings }` plus a CLI guarded by `fileURLToPath(import.meta.url) === realpathSync(process.argv[1])`.
- Frontmatter of conversation, intent and mapping is flat `key: value`; `sources` and `related` are one-line lists `[a, b]` or `[]`.
- Document file names: `<YYYY-MM-DD-HHMM>-<slug>.<conversation|intent|mapping>.md`, slug at most five lowercase hyphenated words; `kartograph/` has no subdirectories.
- `kartograph/index.md` frontmatter is exactly `okf_version: "0.2"` and `kartograph_version: <x.y.z>`; body `# Kartograph` then `* [Title](file) - description _(Type, status)_` lines, newest first.
- `kartograph/log.md` starts `# Kartograph Log`, `## YYYY-MM-DD` headings newest first.
- The legacy marker in an intent's `sources` is exactly `legacy-no-conversation`.
- Skills are tool-neutral: no runtime-specific tool, variable or slash command in any `SKILL.md`; the plugin root is "two levels above this file's directory".
- Angle-bracket placeholders are errors in every artifact.
- The version gate text is byte-identical in every skill except `kartograph-migrate`.
- Never touch a scenario's steps or title; migration rewrites only provenance lines.
- Release version 3.0.0 in `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` and `package.json`; `generated.by` actor `kartograph-knowledge/3.0.0`.
- Pushing, tagging and `npm publish` happen only after the person says yes in chat.

## Review Focus

- A conversation where the person speaks twice in a row (voice mode splits) → the validator rejects it and the skill merges the two into one block; the alternation test pins it (Task 1).
- An intent that cites an AI block (e.g. the AI's recommendation instead of the person's "A") → rejected when the conversation is beside it (Task 2).
- A mapping whose bold outcome differs from the intent only by the `[turn n]` citation, trailing period or wrapped line → still matches (Task 3, normalisation test).
- Running the migration twice, or on a project already on 3.0.0, or on a brand-new project → writes nothing (Task 7, idempotence and `null` version tests).
- A legacy intent whose old `related` names a free-text item instead of an intent file → the validator surfaces it rather than the script inventing a name (Task 7, convert test).

---

### Task 1: Conversation template and validator

**Files:**
- Create: `skills/kartograph-converse/conversation-template.md`
- Create: `skills/kartograph-converse/validate-conversation.js`
- Test: `test/validate-conversation.test.js`

**Interfaces:**
- Produces: `validateConversation(text: string, { filename?: string }) → { errors: string[], warnings: string[] }`; `parseList(value: string) → string[] | null`; constants `TYPE`, `FILENAME`, `DOC_NAME`, `FRONTMATTER_KEYS`, `BLOCK`.

- [ ] **Step 1: Write the failing test** — `test/validate-conversation.test.js`

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/validate-conversation.test.js`
Expected: FAIL with `Cannot find module '…/skills/kartograph-converse/validate-conversation.js'`

- [ ] **Step 3: Write the validator** — `skills/kartograph-converse/validate-conversation.js`

```js
#!/usr/bin/env node
// Validates a conversation recorded by kartograph-converse, so every conversation has the
// shape of `conversation-template.md`: flat frontmatter, one H1, then numbered blocks that
// alternate between the AI and the person and end with the person.
//
//   node validate-conversation.js <kartograph/file.conversation.md> [...]
//   node validate-conversation.js        validate every *.conversation.md in ./kartograph
//
// Exit code 1 when any file has errors. Pure function `validateConversation` is exported for tests.
// Self-contained on purpose: a skill directory must work when copied on its own.
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

export const TYPE = "Conversation";
export const FILENAME = /^(\d{4}-\d{2}-\d{2})-(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.conversation\.md$/;
export const DOC_NAME = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:conversation|intent|mapping)\.md$/;
export const MAX_SLUG_WORDS = 5;
export const FRONTMATTER_KEYS = ["type", "title", "description", "status", "date", "role", "language", "sources", "related"];
export const STATUSES = ["recorded"];
export const BLOCK = /^### (\d+) — (AI|Person)[ \t]*$/;
const AI_LINES = [
  ["lookup", /^> Looked up: \S/],
  ["reasoning", /^Reasoning \(shortened\): \S/],
  ["question", /^\*\*Question:\*\* \S/],
  ["option", /^- \*\*[^*]+:\*\* \S/],
];
const PLACEHOLDER = /<[A-Za-z][^>\n]*>/;
const COMMENT = /<!--[\s\S]*?-->/g;

// The frontmatter is flat `key: value` lines; nothing more is needed.
function splitFrontmatter(text) {
  const src = String(text).replace(/^﻿/, "");
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { frontmatter: null, body: src };
  const entries = [];
  for (const line of m[1].split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) { entries.push({ key: null, raw: line }); continue; }
    entries.push({ key: kv[1], value: kv[2].trim().replace(/^"(.*)"$/, "$1") });
  }
  return { frontmatter: entries, body: src.slice(m[0].length) };
}

// Flat frontmatter lists are written `[a, b]`; `[]` is empty.
export function parseList(value) {
  const m = /^\[(.*)\]$/.exec(String(value ?? "").trim());
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim()).filter((s) => s !== "");
}

function checkFrontmatter(entries, keys, err) {
  const fm = {};
  for (const e of entries) {
    if (e.key === null) { err(`frontmatter line is not 'key: value': ${e.raw.trim()}`); continue; }
    if (e.key in fm) err(`frontmatter key '${e.key}' appears twice`);
    fm[e.key] = e.value;
  }
  const present = entries.filter((e) => e.key).map((e) => e.key);
  for (const k of keys) if (!(k in fm)) err(`frontmatter is missing '${k}'`);
  for (const k of present) if (!keys.includes(k)) err(`frontmatter has unknown key '${k}'`);
  const known = present.filter((k) => keys.includes(k));
  if (known.join() !== keys.filter((k) => known.includes(k)).join()) err(`frontmatter keys must be in the order ${keys.join(", ")}`);
  for (const [k, v] of Object.entries(fm)) {
    if (v === "") err(`frontmatter '${k}' is empty`);
    if (PLACEHOLDER.test(v)) err(`frontmatter '${k}' still holds a template placeholder: ${v}`);
  }
  return fm;
}

// Code spans and fences may quote angle brackets verbatim; they are never template placeholders.
const withoutCode = (s) => s.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");

export function blocksOf(body) {
  const h1 = []; const blocks = []; const stray = [];
  let current = null;
  for (const line of body.replace(COMMENT, "").split(/\r?\n/)) {
    const b = BLOCK.exec(line);
    if (b) { current = { n: Number(b[1]), speaker: b[2], lines: [] }; blocks.push(current); continue; }
    if (/^# /.test(line)) { h1.push(line.slice(2).trim()); current = null; continue; }
    if (/^#{2,6} /.test(line)) { stray.push(line.trim()); continue; }
    if (current) current.lines.push(line);
    else if (line.trim() !== "") stray.push(line.trim());
  }
  return { h1, blocks, stray };
}

function checkAi(block, err) {
  const where = `block ${block.n} (AI)`;
  const count = { question: 0, reasoning: 0, recommended: 0 };
  let prev = null;
  for (const line of block.lines) {
    if (line.trim() === "") continue;
    if (/^\s{2,}\S/.test(line)) {
      if (prev !== "question" && prev !== "option") err(`${where}: only the question and the options may continue on an indented line; got: ${line.trim()}`);
      continue;
    }
    const kind = AI_LINES.find(([, re]) => re.test(line))?.[0];
    if (!kind) { err(`${where}: every line is '> Looked up: …', 'Reasoning (shortened): …', '**Question:** …' or an option '- **A:** …'; got: ${line.trim()}`); prev = null; continue; }
    if (kind === "question") count.question++;
    if (kind === "reasoning") count.reasoning++;
    if (kind === "option" && /\(recommended\)/i.test(line)) count.recommended++;
    prev = kind;
  }
  if (count.question !== 1) err(`${where}: needs exactly one '**Question:**' line, found ${count.question}`);
  if (count.reasoning > 1) err(`${where}: at most one 'Reasoning (shortened):' line, found ${count.reasoning}`);
  if (count.recommended > 1) err(`${where}: at most one option is '(recommended)', found ${count.recommended}`);
}

export function validateConversation(text, { filename } = {}) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);

  let fileDate = null;
  if (filename !== undefined) {
    const m = FILENAME.exec(basename(filename));
    if (!m) err(`filename must be YYYY-MM-DD-HHMM-<slug>.conversation.md with a lowercase hyphenated slug, got '${basename(filename)}'`);
    else {
      fileDate = m[1];
      const words = m[3].split("-").length;
      if (words > MAX_SLUG_WORDS) err(`slug has ${words} words, at most ${MAX_SLUG_WORDS} allowed`);
    }
  }

  const { frontmatter, body } = splitFrontmatter(text);
  if (!frontmatter) { err("no frontmatter block at the top of the file"); return { errors, warnings }; }
  const fm = checkFrontmatter(frontmatter, FRONTMATTER_KEYS, err);
  if (fm.type !== undefined && fm.type !== TYPE) err(`type must be ${TYPE}, got '${fm.type}'`);
  if (fm.status !== undefined && !STATUSES.includes(fm.status)) err(`status must be ${STATUSES.join(" | ")}, got '${fm.status}'`);
  if (fm.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) err(`date must be YYYY-MM-DD, got '${fm.date}'`);
  if (fileDate && fm.date && fm.date !== fileDate) err(`date '${fm.date}' does not match the filename date '${fileDate}'`);
  if (fm.sources !== undefined && parseList(fm.sources) === null) err(`sources must be a list like [a, b] or [], got '${fm.sources}'`);
  if (fm.related !== undefined) {
    const related = parseList(fm.related);
    if (related === null) err(`related must be a list like [a, b] or [], got '${fm.related}'`);
    else for (const r of related) if (!DOC_NAME.test(r)) err(`related entry '${r}' must be the file name of a kartograph/ document`);
  }

  const { h1, blocks, stray } = blocksOf(body);
  if (h1.length !== 1) err(`exactly one '# title' heading expected, found ${h1.length}`);
  else if (fm.title && h1[0] !== fm.title) err(`'# ${h1[0]}' does not match the frontmatter title '${fm.title}'`);
  for (const s of stray) err(`only numbered '### n — AI' and '### n — Person' blocks belong under the title; got: ${s}`);

  if (blocks.length < 2) err(`a conversation has at least two blocks, found ${blocks.length}`);
  blocks.forEach((b, i) => {
    if (b.n !== i + 1) err(`block ${b.n} is out of sequence; expected ${i + 1}`);
    if (i > 0 && b.speaker === blocks[i - 1].speaker) err(`block ${b.n} (${b.speaker}) follows another ${b.speaker} block; blocks alternate`);
    if (b.speaker === "Person" && !b.lines.some((l) => l.trim() !== "")) err(`block ${b.n} (Person) is empty`);
    if (b.speaker === "AI") checkAi(b, err);
  });
  if (blocks.length && blocks[blocks.length - 1].speaker !== "Person") err("the last block must be the person's");

  const ph = PLACEHOLDER.exec(withoutCode(body.replace(COMMENT, "")));
  if (ph) err(`body still holds a template placeholder: ${ph[0]}`);

  return { errors, warnings };
}

export function validateConversationFile(path) {
  return validateConversation(readFileSync(path, "utf8"), { filename: path });
}

function main(argv) {
  let files = argv;
  if (files.length === 0) {
    if (!existsSync("kartograph")) { console.error("usage: validate-conversation.js <file.conversation.md> [...]  (or run where ./kartograph exists)"); return 2; }
    files = readdirSync("kartograph").filter((f) => f.endsWith(".conversation.md")).sort().map((f) => join("kartograph", f));
  }
  let failed = 0;
  for (const f of files) {
    if (!existsSync(f) || !statSync(f).isFile()) { console.error(`error: ${f}: no such file`); failed++; continue; }
    const { errors, warnings } = validateConversationFile(f);
    for (const w of warnings) console.log(`warning: ${f}: ${w}`);
    for (const e of errors) console.log(`error: ${f}: ${e}`);
    if (errors.length) failed++; else console.log(`ok ${f}`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
```

- [ ] **Step 4: Write the template** — `skills/kartograph-converse/conversation-template.md`

````markdown
---
type: Conversation
title: <short name for what the conversation was about>
description: <one sentence: what the person brought up>
status: recorded
date: <YYYY-MM-DD>
role: <the role the person spoke from>
language: <language of the conversation>
sources: [<issue, ticket, URL or document the request came from — or an empty list>]
related: [<earlier kartograph/ documents this conversation follows up — or an empty list>]
---

# <title>

<!-- One block per message, numbered from 1, alternating between AI and Person, ending
     with the person. The person's words verbatim. An AI block holds only: one line per
     lookup, at most one line of shortened reasoning, the question verbatim, and the
     options verbatim, one line each. validate-conversation.js checks that shape. -->

### 1 — Person

<what the person said, verbatim>

### 2 — AI

> Looked up: <path, commit hash and subject, or features/….feature › scenario>
Reasoning (shortened): <one line: why this question>

**Question:** <the question, verbatim>
- **A (recommended):** <option, one line>
- **B:** <option, one line>

### 3 — Person

<the answer, verbatim>
````

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/validate-conversation.test.js`
Expected: PASS, 8 tests

- [ ] **Step 6: Commit**

```bash
git add skills/kartograph-converse test/validate-conversation.test.js
git commit -m "feat(converse): conversation template and validator"
```

---

### Task 2: Intent template and validator move to kartograph-intent

**Files:**
- Move: `skills/kartograph-explore/intent-template.md` → `skills/kartograph-intent/intent-template.md`
- Move: `skills/kartograph-explore/validate-intent.js` → `skills/kartograph-intent/validate-intent.js` (then rewrite)
- Modify: `test/validate-intent.test.js` (rewrite)
- Modify: `test/migrate-features.test.js:8` (import path only; its content changes in Task 6)

**Interfaces:**
- Produces: `validateIntent(text, { filename?, turns?: Map<number,"AI"|"Person"> }) → { errors, warnings }`; `turnsOf(conversationText) → Map<number,"AI"|"Person">`; `validateIntentFile(path)`; constants `LEGACY = "legacy-no-conversation"`, `CONVERSATION`, `CITED_SECTIONS`, `SECTIONS`.

- [ ] **Step 1: Move the files**

```bash
mkdir -p skills/kartograph-intent
git mv skills/kartograph-explore/intent-template.md skills/kartograph-intent/intent-template.md
git mv skills/kartograph-explore/validate-intent.js skills/kartograph-intent/validate-intent.js
sed -i '' 's#skills/kartograph-explore/validate-intent.js#skills/kartograph-intent/validate-intent.js#' test/migrate-features.test.js
```

- [ ] **Step 2: Write the failing test** — replace `test/validate-intent.test.js` entirely

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateIntent, turnsOf, SECTIONS, LEGACY } from "../skills/kartograph-intent/validate-intent.js";

const FILE = "kartograph/2026-09-15-1042-offline-watering.intent.md";

const valid = `---
type: Intent
title: Offline watering schedule
description: The gardener wants today's watering tasks usable without a network connection.
status: derived
date: 2026-09-15
role: product owner
language: English
sources: [2026-09-15-1042-offline-watering.conversation.md]
related: []
---

# Offline watering schedule

## Summary

The gardener wants to see and tick off today's watering tasks without a network connection.

## Who

- **Speaking:** product owner of the garden app
- **Benefits:** gardeners in greenhouses with no reception
- **Affected:** the sync team

## Goals

- Watering tasks usable without a network connection [turn 1]

## Intended outcomes

- Today's tasks are visible offline [turn 3]
- A task ticked offline shows as done after reconnecting [turns 3, 5]

## Non-goals

- Editing the schedule offline — rare, and it needs conflict handling [turn 5]

## Constraints

- Must work on the existing Android build [turn 7]

## Assumptions

- Tasks for the day are already on the device before the connection drops

## Decisions

- **Cache the whole day** — because a day is small. Rejected: caching the week (stale data). [turn 7]

## Open questions

- **How long may cached tasks be shown?** — who can answer: the head gardener. Why it
  matters: staleness rules.

## Terms

- **Watering task**: one plant bed to water on one day

## Notes

None identified.
`;

const conversation = [1, 2, 3, 4, 5, 6, 7].map((n) => `### ${n} — ${n % 2 ? "Person" : "AI"}\n\ntext\n`).join("\n");
const swap = (from, to) => valid.replace(from, to);
const errs = (text, opts = {}) => validateIntent(text, { filename: FILE, ...opts }).errors;
const has = (list, re) => list.some((e) => re.test(e));

test("a well-formed intent passes, with and without the conversation beside it", () => {
  assert.deepEqual(errs(valid), []);
  assert.deepEqual(errs(valid, { turns: turnsOf(conversation) }), []);
  assert.equal(SECTIONS.length, 11);
});

test("turnsOf reads block numbers and speakers", () => {
  const t = turnsOf(conversation);
  assert.equal(t.get(1), "Person");
  assert.equal(t.get(2), "AI");
  assert.equal(t.size, 7);
});

test("filename, type and flat lists are enforced", () => {
  assert.ok(has(errs(valid, { filename: "kartograph/2026-09-15-1042-offline-watering.md" }), /filename must be/));
  assert.ok(has(errs(swap("type: Intent", "type: Conversation")), /type must be Intent/));
  assert.ok(has(errs(swap("related: []", "related: none")), /related must be a list/));
  assert.ok(has(errs(swap("role: product owner\n", "")), /missing 'role'/));
});

test("sources name exactly one conversation with the intent's stamp and slug, or the legacy marker", () => {
  assert.ok(has(errs(swap("sources: [2026-09-15-1042-offline-watering.conversation.md]", "sources: []")), /exactly one conversation file/));
  assert.ok(has(errs(swap("2026-09-15-1042-offline-watering.conversation.md", "2026-09-14-0900-other.conversation.md")), /stamp and slug/));
  assert.ok(has(errs(swap("sources: [2026-09-15-1042-offline-watering.conversation.md]", `sources: [2026-09-15-1042-offline-watering.conversation.md, ${LEGACY}]`)), /exactly one conversation file/));
});

test("status follows the origin", () => {
  assert.ok(has(errs(swap("status: derived", "status: draft")), /never 'draft'/));
  const legacy = swap("sources: [2026-09-15-1042-offline-watering.conversation.md]", `sources: [${LEGACY}, https://example.org/issue/7]`);
  assert.ok(has(errs(legacy), /legacy intent is never 'derived'/));
  assert.deepEqual(errs(legacy.replace("status: derived", "status: confirmed")), []);
});

test("goals, outcomes, non-goals, constraints and decisions cite the person's block", () => {
  assert.ok(has(errs(swap("- Today's tasks are visible offline [turn 3]", "- Today's tasks are visible offline")), /## Intended outcomes: every entry cites/));
  assert.ok(has(errs(swap("[turn 7]\n\n## Assumptions", "[turn 9]\n\n## Assumptions"), { turns: turnsOf(conversation) }), /cites turn 9, which the conversation does not have/));
  assert.ok(has(errs(swap("[turn 3]\n- A task", "[turn 2]\n- A task"), { turns: turnsOf(conversation) }), /cites turn 2, which is the AI's/));
  const legacy = swap("sources: [2026-09-15-1042-offline-watering.conversation.md]", `sources: [${LEGACY}]`).replace("status: derived", "status: confirmed").replace(/ \[turns? [\d, ]+\]/g, "");
  assert.deepEqual(errs(legacy), []);
});

test("sections, H1, lists and placeholders keep the old rules", () => {
  assert.ok(has(errs(swap("# Offline watering schedule", "# Something else")), /does not match the frontmatter title/));
  assert.ok(has(errs(swap("## Notes\n\nNone identified.\n", "")), /missing section\(s\): ## Notes/));
  assert.ok(has(errs(swap("- **Affected:** the sync team\n", "")), /## Who is missing the '\*\*Affected:\*\*'/));
  assert.ok(has(errs(swap("- Tasks for the day are already on the device before the connection drops", "Prose instead.")), /## Assumptions must be a bullet list/));
  assert.ok(has(errs(swap("- **Watering task**: one plant bed to water on one day", "- <term>")), /template placeholder/));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/validate-intent.test.js`
Expected: FAIL — `turnsOf` / `LEGACY` are not exported (SyntaxError on import)

- [ ] **Step 4: Rewrite the validator** — replace `skills/kartograph-intent/validate-intent.js` entirely

```js
#!/usr/bin/env node
// Validates an intent derived by kartograph-intent (or migrated from before 3.0.0), so
// every intent has the shape of `intent-template.md`, and every goal, outcome, non-goal,
// constraint and decision cites the person's words in its conversation.
//
//   node validate-intent.js <kartograph/file.intent.md> [...]
//   node validate-intent.js        validate every *.intent.md in ./kartograph
//
// When the conversation named in `sources` sits beside the intent, the CLI also checks
// that every cited block exists and is the person's. Exit code 1 when any file has errors.
// Pure functions `validateIntent` and `turnsOf` are exported for tests.
// Self-contained on purpose: a skill directory must work when copied on its own.
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const TYPE = "Intent";
export const FILENAME = /^(\d{4}-\d{2}-\d{2})-(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.intent\.md$/;
export const DOC_NAME = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:conversation|intent|mapping)\.md$/;
export const CONVERSATION = /^(\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*)\.conversation\.md$/;
export const LEGACY = "legacy-no-conversation";
export const MAX_SLUG_WORDS = 5;
export const FRONTMATTER_KEYS = ["type", "title", "description", "status", "date", "role", "language", "sources", "related"];
export const STATUSES = ["draft", "derived", "confirmed"];
export const SECTIONS = [
  "Summary", "Who", "Goals", "Intended outcomes", "Non-goals", "Constraints",
  "Assumptions", "Decisions", "Open questions", "Terms", "Notes",
];
export const LIST_SECTIONS = new Set([
  "Goals", "Intended outcomes", "Non-goals", "Constraints", "Assumptions", "Decisions",
  "Open questions", "Terms",
]);
export const CITED_SECTIONS = ["Goals", "Intended outcomes", "Non-goals", "Constraints", "Decisions"];
export const EMPTY_MARKER = "None identified.";
export const WHO_LABELS = ["**Speaking:**", "**Benefits:**", "**Affected:**"];
const CITATION = /\[turns? (\d+(?:, ?\d+)*)\]/g;
const PLACEHOLDER = /<[A-Za-z][^>\n]*>/;

// The frontmatter is flat `key: value` lines; nothing more is needed.
function splitFrontmatter(text) {
  const src = String(text).replace(/^﻿/, "");
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { frontmatter: null, body: src };
  const entries = [];
  for (const line of m[1].split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) { entries.push({ key: null, raw: line }); continue; }
    entries.push({ key: kv[1], value: kv[2].trim().replace(/^"(.*)"$/, "$1") });
  }
  return { frontmatter: entries, body: src.slice(m[0].length) };
}

// Flat frontmatter lists are written `[a, b]`; `[]` is empty.
export function parseList(value) {
  const m = /^\[(.*)\]$/.exec(String(value ?? "").trim());
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim()).filter((s) => s !== "");
}

function checkFrontmatter(entries, keys, err) {
  const fm = {};
  for (const e of entries) {
    if (e.key === null) { err(`frontmatter line is not 'key: value': ${e.raw.trim()}`); continue; }
    if (e.key in fm) err(`frontmatter key '${e.key}' appears twice`);
    fm[e.key] = e.value;
  }
  const present = entries.filter((e) => e.key).map((e) => e.key);
  for (const k of keys) if (!(k in fm)) err(`frontmatter is missing '${k}'`);
  for (const k of present) if (!keys.includes(k)) err(`frontmatter has unknown key '${k}'`);
  const known = present.filter((k) => keys.includes(k));
  if (known.join() !== keys.filter((k) => known.includes(k)).join()) err(`frontmatter keys must be in the order ${keys.join(", ")}`);
  for (const [k, v] of Object.entries(fm)) {
    if (v === "") err(`frontmatter '${k}' is empty`);
    if (PLACEHOLDER.test(v)) err(`frontmatter '${k}' still holds a template placeholder: ${v}`);
  }
  return fm;
}

function sectionsOf(body) {
  const h1 = [];
  const sections = [];
  let current = null;
  for (const line of body.split(/\r?\n/)) {
    if (/^# /.test(line)) { h1.push(line.slice(2).trim()); current = null; continue; }
    const h2 = /^## (.*)$/.exec(line);
    if (h2) { current = { name: h2[1].trim(), lines: [] }; sections.push(current); continue; }
    if (current) current.lines.push(line);
  }
  return { h1, sections };
}

// Top-level bullets, each joined with its indented continuation lines.
function bulletsOf(lines) {
  const out = [];
  for (const l of lines) {
    if (/^[-*] /.test(l)) out.push(l.slice(2).trim());
    else if (/^\s{2,}\S/.test(l) && out.length) out[out.length - 1] += " " + l.trim();
  }
  return out;
}

const hasContent = (lines) => lines.some((l) => l.trim() !== "");

export function turnsOf(conversationText) {
  const turns = new Map();
  for (const m of String(conversationText).matchAll(/^### (\d+) — (AI|Person)[ \t]*$/gm)) turns.set(Number(m[1]), m[2]);
  return turns;
}

export function validateIntent(text, { filename, turns } = {}) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);

  let fileDate = null;
  let fileStem = null;
  if (filename !== undefined) {
    const m = FILENAME.exec(basename(filename));
    if (!m) err(`filename must be YYYY-MM-DD-HHMM-<slug>.intent.md with a lowercase hyphenated slug, got '${basename(filename)}'`);
    else {
      fileDate = m[1];
      fileStem = `${m[1]}-${m[2]}-${m[3]}`;
      const words = m[3].split("-").length;
      if (words > MAX_SLUG_WORDS) err(`slug has ${words} words, at most ${MAX_SLUG_WORDS} allowed`);
    }
  }

  const { frontmatter, body } = splitFrontmatter(text);
  if (!frontmatter) { err("no frontmatter block at the top of the file"); return { errors, warnings }; }
  const fm = checkFrontmatter(frontmatter, FRONTMATTER_KEYS, err);
  if (fm.type !== undefined && fm.type !== TYPE) err(`type must be ${TYPE}, got '${fm.type}'`);
  if (fm.status !== undefined && !STATUSES.includes(fm.status)) err(`status must be ${STATUSES.join(" | ")}, got '${fm.status}'`);
  if (fm.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) err(`date must be YYYY-MM-DD, got '${fm.date}'`);
  if (fileDate && fm.date && fm.date !== fileDate) err(`date '${fm.date}' does not match the filename date '${fileDate}'`);

  let origin = null;
  if (fm.sources !== undefined) {
    const sources = parseList(fm.sources);
    if (sources === null) err(`sources must be a list like [a, b] or [], got '${fm.sources}'`);
    else {
      const conversations = sources.filter((s) => CONVERSATION.test(s));
      const legacy = sources.includes(LEGACY);
      if (conversations.length + (legacy ? 1 : 0) !== 1) err(`sources must name exactly one conversation file or '${LEGACY}'`);
      else if (conversations.length) {
        origin = "conversation";
        const stem = CONVERSATION.exec(conversations[0])[1];
        if (fileStem && stem !== fileStem) err(`sources names '${conversations[0]}', but an intent takes its conversation's stamp and slug: expected '${fileStem}.conversation.md'`);
        if (fm.status === "draft") err("an intent derived from a conversation is 'derived' or 'confirmed', never 'draft'");
      } else {
        origin = "legacy";
        if (fm.status === "derived") err("a legacy intent is never 'derived'; it keeps the status it had");
      }
    }
  }
  if (fm.related !== undefined) {
    const related = parseList(fm.related);
    if (related === null) err(`related must be a list like [a, b] or [], got '${fm.related}'`);
    else for (const r of related) if (!DOC_NAME.test(r)) err(`related entry '${r}' must be the file name of a kartograph/ document`);
  }

  const { h1, sections } = sectionsOf(body);
  if (h1.length !== 1) err(`exactly one '# title' heading expected, found ${h1.length}`);
  else if (fm.title && h1[0] !== fm.title) err(`'# ${h1[0]}' does not match the frontmatter title '${fm.title}'`);

  const names = sections.map((s) => s.name);
  if (names.join("\n") !== SECTIONS.join("\n")) {
    const missing = SECTIONS.filter((s) => !names.includes(s));
    const extra = names.filter((s) => !SECTIONS.includes(s));
    if (missing.length) err(`missing section(s): ${missing.map((s) => `## ${s}`).join(", ")}`);
    if (extra.length) err(`unknown section(s): ${extra.map((s) => `## ${s}`).join(", ")}`);
    if (!missing.length && !extra.length) err(`sections must be in the order: ${SECTIONS.join(", ")}`);
  }

  for (const s of sections) {
    if (!hasContent(s.lines)) { err(`## ${s.name} is empty (write '${EMPTY_MARKER}' if nothing was found)`); continue; }
    const content = s.lines.filter((l) => l.trim() !== "");
    if (LIST_SECTIONS.has(s.name)) {
      const isMarker = content.length === 1 && content[0].trim() === EMPTY_MARKER;
      const bad = content.filter((l) => !/^(?:[-*] |\s{2,}\S)/.test(l));
      if (!isMarker && bad.length) err(`## ${s.name} must be a bullet list or exactly '${EMPTY_MARKER}'; offending line: ${bad[0].trim()}`);
    }
    if (s.name === "Who") {
      for (const label of WHO_LABELS) if (!content.some((l) => l.includes(label))) err(`## Who is missing the '${label}' line`);
    }
    if (origin === "conversation" && CITED_SECTIONS.includes(s.name)) {
      for (const b of bulletsOf(s.lines)) {
        const nums = [...b.matchAll(CITATION)].flatMap((m) => m[1].split(/,\s*/).map(Number));
        if (!nums.length) { err(`## ${s.name}: every entry cites the person's block it comes from, like [turn 3]; missing in: ${b}`); continue; }
        if (!turns) continue;
        for (const n of nums) {
          if (!turns.has(n)) err(`## ${s.name}: cites turn ${n}, which the conversation does not have`);
          else if (turns.get(n) !== "Person") err(`## ${s.name}: cites turn ${n}, which is the AI's, not the person's`);
        }
      }
    }
  }

  const ph = PLACEHOLDER.exec(body);
  if (ph) err(`body still holds a template placeholder: ${ph[0]}`);

  return { errors, warnings };
}

// Reads the intent and, when the conversation it names sits beside it, that conversation's turns.
export function validateIntentFile(path) {
  const text = readFileSync(path, "utf8");
  const sources = parseList(/^sources:\s*(.*)$/m.exec(text)?.[1]) || [];
  const conversation = sources.find((s) => CONVERSATION.test(s));
  const beside = conversation && join(dirname(path), conversation);
  const turns = beside && existsSync(beside) ? turnsOf(readFileSync(beside, "utf8")) : undefined;
  return validateIntent(text, { filename: path, turns });
}

function main(argv) {
  let files = argv;
  if (files.length === 0) {
    if (!existsSync("kartograph")) { console.error("usage: validate-intent.js <file.intent.md> [...]  (or run where ./kartograph exists)"); return 2; }
    files = readdirSync("kartograph").filter((f) => f.endsWith(".intent.md")).sort().map((f) => join("kartograph", f));
  }
  let failed = 0;
  for (const f of files) {
    if (!existsSync(f) || !statSync(f).isFile()) { console.error(`error: ${f}: no such file`); failed++; continue; }
    const { errors, warnings } = validateIntentFile(f);
    for (const w of warnings) console.log(`warning: ${f}: ${w}`);
    for (const e of errors) console.log(`error: ${f}: ${e}`);
    if (errors.length) failed++; else console.log(`ok ${f}`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
```

- [ ] **Step 5: Update the template frontmatter and citation guidance** — in `skills/kartograph-intent/intent-template.md`, replace the frontmatter block with

```markdown
---
type: Intent
title: <short name for what the person wants>
description: <one sentence: what the person wants, and why>
status: derived
date: <YYYY-MM-DD>
role: <the role the person spoke from>
language: <language of the conversation>
sources: [<the conversation's file name: YYYY-MM-DD-HHMM-slug.conversation.md>]
related: [<earlier kartograph/ documents the conversation follows up — or an empty list>]
---
```

and replace the HTML comment under the H1 with

```markdown
<!-- Section headings stay exactly as written here, in this order, whatever the language of
     the content. Every entry under Goals, Intended outcomes, Non-goals, Constraints and
     Decisions ends with the person's block it comes from: [turn 3] or [turns 3, 5].
     validate-intent.js checks both, so no intent drifts from this shape. -->
```

and replace the three guidance lines under `## Goals`, `## Intended outcomes`, `## Decisions`:

```markdown
## Goals

<Why the work exists. One bullet per goal, in the person's words where possible, each
ending with its citation, like [turn 3].>

## Intended outcomes

<What will observably be true when it is done. One observable statement per bullet, on
one line, each ending with its citation. The mapping checks these one by one.>
```

```markdown
## Decisions

<One entry per choice the person made — an option the AI recommended counts only when the
person chose it.>

- **<decision>** — because <reason>. Rejected: <alternative(s) and why>. [turn <n>]
```

(In `## Non-goals` and `## Constraints` append ", each ending with its citation" to the guidance sentence.)

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/validate-intent.test.js`
Expected: PASS, 7 tests

- [ ] **Step 7: Commit**

```bash
git add -A skills/kartograph-intent skills/kartograph-explore test/validate-intent.test.js test/migrate-features.test.js
git commit -m "feat(intent): typed intent with turn citations, moved to kartograph-intent"
```

(`npm test` as a whole stays red until Tasks 5 and 6 update the features paths.)

---

### Task 3: Mapping template and validator

**Files:**
- Create: `skills/kartograph-map/mapping-template.md`
- Create: `skills/kartograph-map/validate-mapping.js`
- Test: `test/validate-mapping.test.js`

**Interfaces:**
- Produces: `validateMapping(text, { filename?, outcomes?: string[] }) → { errors, warnings }`; `outcomesOf(intentText) → string[]`; `normalizeOutcome(s) → string`; constants `SECTIONS`, `GROUPS`.

- [ ] **Step 1: Write the failing test** — `test/validate-mapping.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMapping, outcomesOf, normalizeOutcome } from "../skills/kartograph-map/validate-mapping.js";

const FILE = "kartograph/2026-09-15-1042-offline-watering.mapping.md";

const intent = `## Intended outcomes

- Today's tasks are visible offline [turn 3]
- A task ticked offline shows as done
  after reconnecting [turns 3, 5]
- Overdue tasks are highlighted. [turn 9]
- Watering can be planned by week [turn 11]

## Non-goals
`;

const valid = `---
type: Mapping
title: Offline watering schedule
description: Half of the offline schedule exists; ticking offline is new.
status: mapped
date: 2026-09-15
sources: [2026-09-15-1042-offline-watering.intent.md]
related: []
---

# Offline watering schedule

## Done

- **Today's tasks are visible offline** — \`3f2a9c1\` feat: cache today's tasks; \`features/watering/today.feature › Showing today's tasks offline\`

## Partly done

- **A task ticked offline shows as done after reconnecting** — exists: \`features/watering/tick.feature › Ticking a task\`. Missing: the offline queue.

## New

- **Overdue tasks are highlighted** — nothing marks tasks by age today.

## Contradicts

- **Watering can be planned by week** — conflicts with \`2026-09-01-0900-daily-only.intent.md\`: "plan by week" versus "the schedule is daily only". Open question: Is the weekly plan a change of the daily-only decision?

## Researched

- git log: all 214 commits
- features: watering, planning
- kartograph: 2026-09-01-0900-daily-only.intent.md
`;

const swap = (from, to) => valid.replace(from, to);
const errs = (text, opts = {}) => validateMapping(text, { filename: FILE, outcomes: outcomesOf(intent), ...opts }).errors;
const has = (list, re) => list.some((e) => re.test(e));

test("a well-formed mapping passes", () => {
  assert.deepEqual(errs(valid), []);
});

test("outcomes are read from the intent without citations, wraps or trailing periods", () => {
  assert.deepEqual(outcomesOf(intent), [
    "Today's tasks are visible offline",
    "A task ticked offline shows as done after reconnecting",
    "Overdue tasks are highlighted",
    "Watering can be planned by week",
  ]);
  assert.equal(normalizeOutcome("  A  b [turn 2]. "), "A b");
});

test("frontmatter: type, status, and one intent with the same stamp and slug", () => {
  assert.ok(has(errs(swap("type: Mapping", "type: Intent")), /type must be Mapping/));
  assert.ok(has(errs(swap("status: mapped", "status: draft")), /status must be mapped/));
  assert.ok(has(errs(swap("sources: [2026-09-15-1042-offline-watering.intent.md]", "sources: []")), /exactly one intent file/));
  assert.ok(has(errs(swap("sources: [2026-09-15-1042-offline-watering.intent.md]", "sources: [2026-09-14-1000-other.intent.md]")), /stamp and slug/));
});

test("sections are exact and in order; empty groups say so", () => {
  assert.ok(has(errs(swap("## Researched", "## Findings")), /unknown section/));
  const noNew = swap("- **Overdue tasks are highlighted** — nothing marks tasks by age today.", "None identified.");
  assert.ok(has(errs(noNew), /'Overdue tasks are highlighted' is not mapped/));
  assert.deepEqual(errs(noNew, { outcomes: outcomesOf(intent).filter((o) => !o.startsWith("Overdue")) }), []);
  assert.ok(has(errs(swap("- git log: all 214 commits\n- features: watering, planning\n- kartograph: 2026-09-01-0900-daily-only.intent.md", "None identified.")), /Researched says what was read/));
});

test("each group's entries carry their evidence", () => {
  assert.ok(has(errs(swap("\`3f2a9c1\` feat: cache today's tasks; ", "")), /## Done: .* needs a commit hash and a features\/ citation/));
  assert.ok(has(errs(swap(". Missing: the offline queue.", ".")), /needs 'Missing:'/));
  assert.ok(has(errs(swap("exists: \`features/watering/tick.feature › Ticking a task\`", "exists: the tick screen")), /needs what exists, cited/));
  assert.ok(has(errs(swap(" Open question: Is the weekly plan a change of the daily-only decision?", "")), /needs 'Open question:'/));
  assert.ok(has(errs(swap("- **Overdue tasks are highlighted**", "- Overdue tasks are highlighted")), /starts with the intended outcome in bold/));
});

test("every intended outcome is mapped exactly once, and nothing else is", () => {
  const twice = swap("## Contradicts\n", "## Contradicts\n\n- **Overdue tasks are highlighted** — again. Open question: which?\n");
  assert.ok(has(errs(twice), /mapped twice/));
  assert.ok(has(errs(swap("**Overdue tasks are highlighted**", "**Something invented**")), /'Something invented' is not an intended outcome/));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/validate-mapping.test.js`
Expected: FAIL with `Cannot find module '…/skills/kartograph-map/validate-mapping.js'`

- [ ] **Step 3: Write the validator** — `skills/kartograph-map/validate-mapping.js`

```js
#!/usr/bin/env node
// Validates a mapping written by kartograph-map, so every mapping has the shape of
// `mapping-template.md`: every intended outcome of its intent sits in exactly one of the
// groups Done, Partly done, New, Contradicts, with the evidence that group needs.
//
//   node validate-mapping.js <kartograph/file.mapping.md> [...]
//   node validate-mapping.js        validate every *.mapping.md in ./kartograph
//
// When the intent named in `sources` sits beside the mapping, the CLI also checks that its
// intended outcomes are mapped exactly once. Exit code 1 when any file has errors.
// Pure functions are exported for tests.
// Self-contained on purpose: a skill directory must work when copied on its own.
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const TYPE = "Mapping";
export const FILENAME = /^(\d{4}-\d{2}-\d{2})-(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.mapping\.md$/;
export const INTENT = /^(\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*)\.intent\.md$/;
export const DOC_NAME = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:conversation|intent|mapping)\.md$/;
export const FRONTMATTER_KEYS = ["type", "title", "description", "status", "date", "sources", "related"];
export const STATUSES = ["mapped"];
export const SECTIONS = ["Done", "Partly done", "New", "Contradicts", "Researched"];
export const GROUPS = SECTIONS.slice(0, 4);
export const EMPTY_MARKER = "None identified.";
const ENTRY = /^\*\*(.+?)\*\*/;
const COMMIT = /`[0-9a-f]{7,40}`/;
const FEATURE_CITE = /`features\/[^`]+`/;
const PLACEHOLDER = /<[A-Za-z][^>\n]*>/;

// The frontmatter is flat `key: value` lines; nothing more is needed.
function splitFrontmatter(text) {
  const src = String(text).replace(/^﻿/, "");
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { frontmatter: null, body: src };
  const entries = [];
  for (const line of m[1].split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) { entries.push({ key: null, raw: line }); continue; }
    entries.push({ key: kv[1], value: kv[2].trim().replace(/^"(.*)"$/, "$1") });
  }
  return { frontmatter: entries, body: src.slice(m[0].length) };
}

export function parseList(value) {
  const m = /^\[(.*)\]$/.exec(String(value ?? "").trim());
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim()).filter((s) => s !== "");
}

function checkFrontmatter(entries, keys, err) {
  const fm = {};
  for (const e of entries) {
    if (e.key === null) { err(`frontmatter line is not 'key: value': ${e.raw.trim()}`); continue; }
    if (e.key in fm) err(`frontmatter key '${e.key}' appears twice`);
    fm[e.key] = e.value;
  }
  const present = entries.filter((e) => e.key).map((e) => e.key);
  for (const k of keys) if (!(k in fm)) err(`frontmatter is missing '${k}'`);
  for (const k of present) if (!keys.includes(k)) err(`frontmatter has unknown key '${k}'`);
  const known = present.filter((k) => keys.includes(k));
  if (known.join() !== keys.filter((k) => known.includes(k)).join()) err(`frontmatter keys must be in the order ${keys.join(", ")}`);
  for (const [k, v] of Object.entries(fm)) {
    if (v === "") err(`frontmatter '${k}' is empty`);
    if (PLACEHOLDER.test(v)) err(`frontmatter '${k}' still holds a template placeholder: ${v}`);
  }
  return fm;
}

function sectionsOf(body) {
  const h1 = [];
  const sections = [];
  let current = null;
  for (const line of body.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/)) {
    if (/^# /.test(line)) { h1.push(line.slice(2).trim()); current = null; continue; }
    const h2 = /^## (.*)$/.exec(line);
    if (h2) { current = { name: h2[1].trim(), lines: [] }; sections.push(current); continue; }
    if (current) current.lines.push(line);
  }
  return { h1, sections };
}

function bulletsOf(lines) {
  const out = [];
  for (const l of lines) {
    if (/^[-*] /.test(l)) out.push(l.slice(2).trim());
    else if (/^\s{2,}\S/.test(l) && out.length) out[out.length - 1] += " " + l.trim();
  }
  return out;
}

// An outcome compares without its turn citation, surrounding space, or a closing period.
export function normalizeOutcome(s) {
  return String(s).replace(/\s*\[turns? [^\]]*\]/g, "").replace(/\s+/g, " ").trim().replace(/[.;]$/, "");
}

export function outcomesOf(intentText) {
  const lines = String(intentText).split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim() === "## Intended outcomes");
  if (at === -1) return [];
  const section = [];
  for (const l of lines.slice(at + 1)) { if (/^## /.test(l)) break; section.push(l); }
  return bulletsOf(section).map(normalizeOutcome);
}

export function validateMapping(text, { filename, outcomes } = {}) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);

  let fileDate = null;
  let fileStem = null;
  if (filename !== undefined) {
    const m = FILENAME.exec(basename(filename));
    if (!m) err(`filename must be YYYY-MM-DD-HHMM-<slug>.mapping.md with a lowercase hyphenated slug, got '${basename(filename)}'`);
    else { fileDate = m[1]; fileStem = `${m[1]}-${m[2]}-${m[3]}`; }
  }

  const { frontmatter, body } = splitFrontmatter(text);
  if (!frontmatter) { err("no frontmatter block at the top of the file"); return { errors, warnings }; }
  const fm = checkFrontmatter(frontmatter, FRONTMATTER_KEYS, err);
  if (fm.type !== undefined && fm.type !== TYPE) err(`type must be ${TYPE}, got '${fm.type}'`);
  if (fm.status !== undefined && !STATUSES.includes(fm.status)) err(`status must be ${STATUSES.join(" | ")}, got '${fm.status}'`);
  if (fm.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) err(`date must be YYYY-MM-DD, got '${fm.date}'`);
  if (fileDate && fm.date && fm.date !== fileDate) err(`date '${fm.date}' does not match the filename date '${fileDate}'`);
  if (fm.sources !== undefined) {
    const sources = parseList(fm.sources);
    const intents = (sources || []).filter((s) => INTENT.test(s));
    if (sources === null || intents.length !== 1) err("sources must name exactly one intent file");
    else if (fileStem && INTENT.exec(intents[0])[1] !== fileStem) err(`sources names '${intents[0]}', but a mapping takes its intent's stamp and slug: expected '${fileStem}.intent.md'`);
  }
  if (fm.related !== undefined) {
    const related = parseList(fm.related);
    if (related === null) err(`related must be a list like [a, b] or [], got '${fm.related}'`);
    else for (const r of related) if (!DOC_NAME.test(r)) err(`related entry '${r}' must be the file name of a kartograph/ document`);
  }

  const { h1, sections } = sectionsOf(body);
  if (h1.length !== 1) err(`exactly one '# title' heading expected, found ${h1.length}`);
  else if (fm.title && h1[0] !== fm.title) err(`'# ${h1[0]}' does not match the frontmatter title '${fm.title}'`);
  const names = sections.map((s) => s.name);
  if (names.join("\n") !== SECTIONS.join("\n")) {
    const missing = SECTIONS.filter((s) => !names.includes(s));
    const extra = names.filter((s) => !SECTIONS.includes(s));
    if (missing.length) err(`missing section(s): ${missing.map((s) => `## ${s}`).join(", ")}`);
    if (extra.length) err(`unknown section(s): ${extra.map((s) => `## ${s}`).join(", ")}`);
    if (!missing.length && !extra.length) err(`sections must be in the order: ${SECTIONS.join(", ")}`);
  }

  const seen = new Map();
  for (const s of sections) {
    const content = s.lines.filter((l) => l.trim() !== "");
    if (!content.length) { err(`## ${s.name} is empty (write '${EMPTY_MARKER}' if nothing belongs there)`); continue; }
    const isMarker = content.length === 1 && content[0].trim() === EMPTY_MARKER;
    const bad = content.filter((l) => !/^(?:[-*] |\s{2,}\S)/.test(l));
    if (!isMarker && bad.length) { err(`## ${s.name} must be a bullet list or exactly '${EMPTY_MARKER}'; offending line: ${bad[0].trim()}`); continue; }
    if (s.name === "Researched") { if (isMarker) err("## Researched says what was read; it is never empty"); continue; }
    if (!GROUPS.includes(s.name)) continue;
    for (const b of bulletsOf(s.lines)) {
      const m = ENTRY.exec(b);
      if (!m) { err(`## ${s.name}: every entry starts with the intended outcome in bold; got: ${b}`); continue; }
      const outcome = normalizeOutcome(m[1]);
      const rest = b.slice(m[0].length);
      if (seen.has(outcome)) err(`'${outcome}' is mapped twice, under ## ${seen.get(outcome)} and ## ${s.name}`);
      else seen.set(outcome, s.name);
      if (s.name === "Done" && !(COMMIT.test(rest) && FEATURE_CITE.test(rest))) err(`## Done: '${outcome}' needs a commit hash and a features/ citation, both in backticks`);
      if (s.name === "Partly done") {
        if (!COMMIT.test(rest) && !FEATURE_CITE.test(rest)) err(`## Partly done: '${outcome}' needs what exists, cited as a commit hash or a features/ path in backticks`);
        if (!/Missing:/.test(rest)) err(`## Partly done: '${outcome}' needs 'Missing:' and what is not there yet`);
      }
      if (s.name === "Contradicts" && !/Open question:/.test(rest)) err(`## Contradicts: '${outcome}' needs 'Open question:' and the question a follow-up conversation settles`);
    }
  }
  if (outcomes) {
    for (const o of outcomes) if (!seen.has(o)) err(`intended outcome '${o}' is not mapped`);
    for (const o of seen.keys()) if (!outcomes.includes(o)) err(`'${o}' is not an intended outcome of the intent`);
  }

  const ph = PLACEHOLDER.exec(body.replace(/<!--[\s\S]*?-->/g, ""));
  if (ph) err(`body still holds a template placeholder: ${ph[0]}`);

  return { errors, warnings };
}

export function validateMappingFile(path) {
  const text = readFileSync(path, "utf8");
  const intent = (parseList(/^sources:\s*(.*)$/m.exec(text)?.[1]) || []).find((s) => INTENT.test(s));
  const beside = intent && join(dirname(path), intent);
  const outcomes = beside && existsSync(beside) ? outcomesOf(readFileSync(beside, "utf8")) : undefined;
  return validateMapping(text, { filename: path, outcomes });
}

function main(argv) {
  let files = argv;
  if (files.length === 0) {
    if (!existsSync("kartograph")) { console.error("usage: validate-mapping.js <file.mapping.md> [...]  (or run where ./kartograph exists)"); return 2; }
    files = readdirSync("kartograph").filter((f) => f.endsWith(".mapping.md")).sort().map((f) => join("kartograph", f));
  }
  let failed = 0;
  for (const f of files) {
    if (!existsSync(f) || !statSync(f).isFile()) { console.error(`error: ${f}: no such file`); failed++; continue; }
    const { errors, warnings } = validateMappingFile(f);
    for (const w of warnings) console.log(`warning: ${f}: ${w}`);
    for (const e of errors) console.log(`error: ${f}: ${e}`);
    if (errors.length) failed++; else console.log(`ok ${f}`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
```

- [ ] **Step 4: Write the template** — `skills/kartograph-map/mapping-template.md`

```markdown
---
type: Mapping
title: <the intent's title>
description: <one sentence: how much of the intent the project already has>
status: mapped
date: <YYYY-MM-DD>
sources: [<the intent's file name: YYYY-MM-DD-HHMM-slug.intent.md>]
related: [<earlier kartograph/ documents the research leaned on — or an empty list>]
---

# <the intent's title>

<!-- Every intended outcome of the intent appears in exactly one of the four groups, in
     bold and word for word as the intent states it, without its turn citation. An empty
     group is 'None identified.'. validate-mapping.js checks all of that. -->

## Done

- **<intended outcome>** — `<commit hash>` <commit subject>; `features/<capability>/<feature>.feature › <scenario>`

## Partly done

- **<intended outcome>** — exists: `<commit hash, or features/….feature › scenario>`. Missing: <what is not there yet>.

## New

- **<intended outcome>** — <one line: why nothing that exists covers it>

## Contradicts

- **<intended outcome>** — conflicts with `<commit, features/….feature › scenario, or kartograph/ document>`: "<what the intent says>" versus "<what exists>". Open question: <what a follow-up conversation has to settle>

## Researched

- git log: <how far back, how many commits>
- features: <the capabilities read>
- kartograph: <the earlier documents read, or none>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/validate-mapping.test.js`
Expected: PASS, 6 tests

- [ ] **Step 6: Commit**

```bash
git add skills/kartograph-map test/validate-mapping.test.js
git commit -m "feat(map): mapping template and validator"
```

---

### Task 4: Bundle validator for kartograph/

**Files:**
- Create: `skills/kartograph-migrate/validate-kartograph.js`
- Test: `test/validate-kartograph.test.js`

**Interfaces:**
- Produces: `validateKartograph(dir: string) → { errors, warnings, version: string | null }`; constants `DOC`, `TYPES`.

- [ ] **Step 1: Write the failing test** — `test/validate-kartograph.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateKartograph } from "../skills/kartograph-migrate/validate-kartograph.js";

const C = "2026-09-24-1430-export-csv.conversation.md";
const I = "2026-09-24-1430-export-csv.intent.md";
const doc = (type, sources = "[]") => `---\ntype: ${type}\ntitle: Export CSV\ndescription: x.\nstatus: s\nsources: ${sources}\n---\n\n# Export CSV\n`;
const index = (lines) => `---\nokf_version: "0.2"\nkartograph_version: 3.0.0\n---\n\n# Kartograph\n\n${lines.join("\n")}\n`;
const LINES = [`* [Export CSV](${I}) - x. _(Intent, derived)_`, `* [Export CSV](${C}) - x. _(Conversation, recorded)_`];

function bundle(t, { files = {}, idx = LINES } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "karto-bundle-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const all = { [C]: doc("Conversation"), [I]: doc("Intent", `[${C}]`), "index.md": index(idx), "log.md": "# Kartograph Log\n\n## 2026-09-24\n* **Intent**: derived.\n\n## 2026-09-20\n* x\n", ...files };
  for (const [f, text] of Object.entries(all)) if (text !== null) writeFileSync(join(dir, f), text);
  return dir;
}
const has = (list, re) => list.some((e) => re.test(e));

test("a well-formed bundle passes and reports its version", (t) => {
  const r = validateKartograph(bundle(t));
  assert.deepEqual(r.errors, []);
  assert.equal(r.version, "3.0.0");
});

test("the bundle is flat and holds only index, log and typed documents", (t) => {
  const dir = bundle(t, { files: { "notes.md": "x" } });
  mkdirSync(join(dir, "intents"));
  const { errors } = validateKartograph(dir);
  assert.ok(has(errors, /intents\/: kartograph\/ is flat/));
  assert.ok(has(errors, /notes\.md: only index\.md, log\.md/));
});

test("the file-name suffix and the type agree", (t) => {
  assert.ok(has(validateKartograph(bundle(t, { files: { [C]: doc("Intent") } })).errors, /type must be Conversation/));
});

test("index.md lists every document exactly once with its type", (t) => {
  assert.ok(has(validateKartograph(bundle(t, { idx: [LINES[0]] })).errors, new RegExp(`lists '${C}' 0 times`)));
  assert.ok(has(validateKartograph(bundle(t, { idx: [...LINES, "* [Gone](2026-01-01-0000-gone.intent.md) - x. _(Intent, derived)_"] })).errors, /which does not exist/));
  assert.ok(has(validateKartograph(bundle(t, { idx: [LINES[0].replace("(Intent", "(Mapping"), LINES[1]] })).errors, /listed as Mapping/));
  assert.ok(has(validateKartograph(bundle(t, { files: { "index.md": index(LINES).replace("kartograph_version: 3.0.0", "kartograph_version: three") } })).errors, /must be x\.y\.z/));
});

test("log.md is dated newest first and sources resolve", (t) => {
  assert.ok(has(validateKartograph(bundle(t, { files: { "log.md": "# Kartograph Log\n\n## 2026-09-20\n\n## 2026-09-24\n" } })).errors, /newest first/));
  assert.ok(has(validateKartograph(bundle(t, { files: { [C]: null } , idx: [LINES[0]] })).errors, new RegExp(`sources names '${C}', which does not exist`)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/validate-kartograph.test.js`
Expected: FAIL with `Cannot find module '…/skills/kartograph-migrate/validate-kartograph.js'`

- [ ] **Step 3: Write the validator** — `skills/kartograph-migrate/validate-kartograph.js`

```js
#!/usr/bin/env node
// Validates the structure of a project's kartograph/ bundle: one flat directory holding
// index.md, log.md and documents named <YYYY-MM-DD-HHMM>-<slug>.<type>.md whose `type`
// agrees with the suffix, every document listed exactly once in index.md, and every
// `sources` entry naming a sibling document resolving. Each document's own shape is
// checked by the validator of the skill that writes it.
//
//   node validate-kartograph.js [kartograph]
//
// Exit code 1 when there are errors. `validateKartograph` is exported for tests.
// Self-contained on purpose: a skill directory must work when copied on its own.
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DOC = /^(\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*)\.(conversation|intent|mapping)\.md$/;
export const TYPES = { conversation: "Conversation", intent: "Intent", mapping: "Mapping" };
export const OKF_VERSION = "0.2";
const VERSION = /^\d+\.\d+\.\d+$/;
const INDEX_LINE = /^\* \[([^\]]+)\]\(([^)\s]+)\) - \S.* _\((\w+), [a-z]+\)_$/;

function frontmatterOf(text) {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(String(text).replace(/^﻿/, ""));
  if (!m) return null;
  const fm = {};
  for (const l of m[1].split(/\r?\n/)) { const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(l); if (kv) fm[kv[1]] = kv[2].trim(); }
  return { fm, body: String(text).slice(m[0].length) };
}

export function validateKartograph(dir) {
  const errors = []; const warnings = []; let version = null;
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return { errors: [`${dir}: no such directory`], warnings, version };
  const entries = readdirSync(dir).filter((e) => !e.startsWith(".")).sort();
  const docs = [];
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { errors.push(`${e}/: kartograph/ is flat; no subdirectories`); continue; }
    if (e === "index.md" || e === "log.md") continue;
    const m = DOC.exec(e);
    if (!m) { errors.push(`${e}: only index.md, log.md and YYYY-MM-DD-HHMM-slug.(conversation|intent|mapping).md belong in kartograph/`); continue; }
    const fm = frontmatterOf(readFileSync(p, "utf8"))?.fm ?? {};
    if (fm.type !== TYPES[m[2]]) errors.push(`${e}: type must be ${TYPES[m[2]]} for a .${m[2]}.md file, got '${fm.type ?? "none"}'`);
    docs.push({ file: e, kind: m[2], fm });
  }

  if (!entries.includes("index.md")) errors.push("index.md: missing");
  else {
    const parsed = frontmatterOf(readFileSync(join(dir, "index.md"), "utf8"));
    if (!parsed) errors.push("index.md: no frontmatter");
    else {
      const keys = Object.keys(parsed.fm);
      if (keys.join() !== "okf_version,kartograph_version") errors.push(`index.md: frontmatter is exactly okf_version and kartograph_version, got ${keys.join(", ") || "nothing"}`);
      if (parsed.fm.okf_version !== undefined && parsed.fm.okf_version.replace(/^"(.*)"$/, "$1") !== OKF_VERSION) errors.push(`index.md: okf_version must be "${OKF_VERSION}"`);
      if (parsed.fm.kartograph_version !== undefined) {
        if (VERSION.test(parsed.fm.kartograph_version)) version = parsed.fm.kartograph_version;
        else errors.push(`index.md: kartograph_version must be x.y.z, got '${parsed.fm.kartograph_version}'`);
      }
      const lines = parsed.body.split(/\r?\n/).filter((l) => l.trim() !== "");
      if (lines[0] !== "# Kartograph") errors.push("index.md: the body starts with '# Kartograph'");
      const listed = [];
      for (const l of lines.slice(1)) {
        const im = INDEX_LINE.exec(l);
        if (!im) { errors.push(`index.md: every line is '* [Title](file) - description _(Type, status)_'; got: ${l}`); continue; }
        const d = docs.find((x) => x.file === im[2]);
        if (!d) { errors.push(`index.md: links to '${im[2]}', which does not exist`); continue; }
        if (im[3] !== TYPES[d.kind]) errors.push(`index.md: '${im[2]}' is listed as ${im[3]}, but it is a ${TYPES[d.kind]}`);
        listed.push(im[2]);
      }
      for (const d of docs) {
        const n = listed.filter((f) => f === d.file).length;
        if (n !== 1) errors.push(`index.md: lists '${d.file}' ${n} times; exactly once`);
      }
    }
  }

  if (!entries.includes("log.md")) errors.push("log.md: missing");
  else {
    const lines = readFileSync(join(dir, "log.md"), "utf8").split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines[0] !== "# Kartograph Log") errors.push("log.md: starts with '# Kartograph Log'");
    const dates = lines.filter((l) => l.startsWith("## ")).map((l) => l.slice(3).trim());
    for (const d of dates) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) errors.push(`log.md: '## ${d}' is not a date`);
    for (let i = 1; i < dates.length; i++) if (dates[i] >= dates[i - 1]) errors.push(`log.md: dates are newest first, each once; '${dates[i]}' follows '${dates[i - 1]}'`);
  }

  for (const d of docs) {
    const list = /^\[(.*)\]$/.exec(d.fm.sources ?? "")?.[1].split(",").map((s) => s.trim()).filter(Boolean) ?? [];
    for (const s of list) if (DOC.test(s) && !docs.some((x) => x.file === s)) errors.push(`${d.file}: sources names '${s}', which does not exist`);
  }
  return { errors, warnings, version };
}

function main(argv) {
  const dir = argv[0] || "kartograph";
  const { errors, warnings } = validateKartograph(dir);
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of errors) console.log(`error: ${e}`);
  if (!errors.length) console.log(`ok ${dir}`);
  return errors.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/validate-kartograph.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add skills/kartograph-migrate/validate-kartograph.js test/validate-kartograph.test.js
git commit -m "feat(migrate): kartograph/ bundle structure validator"
```

---

### Task 5: Features provenance points into kartograph/

**Files:**
- Modify: `skills/kartograph-features/validate-features.js:22,95,97,161,164,269`
- Modify: `skills/kartograph-features/capability-template.md:6`
- Modify: `skills/kartograph-features/example.md:4,6,27,48`
- Modify: `test/validate-features.test.js`

**Interfaces:**
- Produces: `INTENT_PATH = /^kartograph\/\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.intent\.md$/` (consumed by Tasks 6 and 7).

- [ ] **Step 1: Update the tests first**

```bash
sed -i '' \
  -e 's#intents/2026-09-15-1042-archive-projects\.md#kartograph/2026-09-15-1042-archive-projects.intent.md#g' \
  -e 's#intents/2026-09-16-0900-restore\.md#kartograph/2026-09-16-0900-restore.intent.md#g' \
  -e 's#join(root, "intents")#join(root, "kartograph")#g' \
  -e 's#must look like intents\\/#must look like kartograph\\/#g' \
  test/validate-features.test.js
grep -n 'intents' test/validate-features.test.js
```

Expected grep output: nothing.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/validate-features.test.js`
Expected: FAIL — "source intent path must look like intents/…" errors on every fixture

- [ ] **Step 3: Change the validator**

In `skills/kartograph-features/validate-features.js`:

```js
export const INTENT_PATH = /^kartograph\/\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.intent\.md$/;
```

and replace every message fragment with sed:

```bash
sed -i '' \
  -e 's#must look like intents/YYYY-MM-DD-HHMM-<slug>\.md#must look like kartograph/YYYY-MM-DD-HHMM-<slug>.intent.md#g' \
  -e "s#- Intent: \`intents/<file>\.md\`#- Intent: \`kartograph/<file>.intent.md\`#" \
  -e "s#'\# Source intent: intents/<file>\.md'#'\# Source intent: kartograph/<file>.intent.md'#" \
  -e 's#const intentsDir = join(projectRoot, "intents");#const intentsDir = join(projectRoot, "kartograph");#' \
  skills/kartograph-features/validate-features.js
grep -n 'intents/' skills/kartograph-features/validate-features.js
```

Expected grep output: nothing.

- [ ] **Step 4: Change the template and the example**

```bash
sed -i '' 's#- Intent: `intents/<YYYY-MM-DD-HHMM-slug>\.md`#- Intent: `kartograph/<YYYY-MM-DD-HHMM-slug>.intent.md`#' skills/kartograph-features/capability-template.md
sed -i '' 's#intents/2026-09-15-1042-archive-projects\.md#kartograph/2026-09-15-1042-archive-projects.intent.md#g' skills/kartograph-features/example.md
sed -n 1,8p skills/kartograph-features/example.md
```

Then edit line 4 of `example.md` by hand so the sentence speaks of "intents under `kartograph/`" instead of "intents." (read the line first; keep its meaning).

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/validate-features.test.js`
Expected: PASS, all tests

- [ ] **Step 6: Commit**

```bash
git add skills/kartograph-features test/validate-features.test.js
git commit -m "feat(features): provenance points at kartograph/<file>.intent.md"
```

---

### Task 6: migrate-features.js writes the newest layout

**Files:**
- Modify: `scripts/migrate-features.js:84-95` (`migrationIntent` frontmatter), `:193-199,253-257` (`migrateProject` intent path)
- Modify: `test/migrate-features.test.js`

**Interfaces:**
- Consumes: `validateIntent` from Task 2 (legacy origin), `INTENT_PATH` from Task 5.
- Produces: `migrateProject(root, { date, time }) → { written, removed, intent: "kartograph/<date>-<time>-migrated-feature-tree.intent.md", errors }` (consumed by Task 7).

- [ ] **Step 1: Update the tests first**

```bash
sed -i '' \
  -e 's#const INTENT = "intents/2026-09-18-1200-migrated-feature-tree.md";#const INTENT = "kartograph/2026-09-18-1200-migrated-feature-tree.intent.md";#' \
  -e 's#{ filename: "2026-09-18-1200-migrated-feature-tree.md" }#{ filename: "2026-09-18-1200-migrated-feature-tree.intent.md" }#' \
  -e 's#assert.equal(r.intent, "intents/2026-09-18-1200-migrated-feature-tree.md");#assert.equal(r.intent, "kartograph/2026-09-18-1200-migrated-feature-tree.intent.md");\n  assert.ok(!existsSync(join(root, "intents")));#' \
  -e 's#intents/2026-09-01-0900-earlier\.md#kartograph/2026-09-01-0900-earlier.intent.md#g' \
  -e 's#mkdirSync(join(root, "intents")); writeFileSync(join(root, "intents", "2026-09-01-0900-earlier.md")#mkdirSync(join(root, "kartograph")); writeFileSync(join(root, "kartograph", "2026-09-01-0900-earlier.intent.md")#' \
  -e 's#intents/2026-09-18-1200-migrated-feature-tree\.md#kartograph/2026-09-18-1200-migrated-feature-tree.intent.md#g' \
  test/migrate-features.test.js
grep -n 'intents' test/migrate-features.test.js
```

Expected grep output: only the new `assert.ok(!existsSync(join(root, "intents")));` line.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/migrate-features.test.js`
Expected: FAIL — `r.intent` is still `intents/…`, and `migrationIntent passes validate-intent` fails with "frontmatter is missing 'type'"

- [ ] **Step 3: Change `migrationIntent`'s frontmatter** — in `scripts/migrate-features.js` replace the head of `migrationIntent` up to the closing `---` with

```js
export function migrationIntent({ project, date, time, sources, contexts }) {
  const src = ["legacy-no-conversation", ...sources].join(", ");
  const grouping = contexts.length ? contexts.join(", ") : "none";
  return `---
type: Intent
title: Migrated feature tree
description: The ${project} feature tree was moved onto the capability contract without changing a scenario.
status: confirmed
date: ${date}
role: maintainer
language: en
sources: [${src}]
related: []
---
```

(The body after `---` stays byte-identical.)

- [ ] **Step 4: Change the intent path in `migrateProject`** — replace

```js
  const intentsDir = join(root, "intents");
  let intent = existsSync(intentsDir) ? readdirSync(intentsDir).filter((f) => /^\d{4}-\d{2}-\d{2}-\d{4}-migrated-feature-tree\.md$/.test(f)).sort().pop() : null;
  intent = intent ? `intents/${intent}` : `intents/${date}-${time}-migrated-feature-tree.md`;
```

with

```js
  // The intent is written in the newest layout directly (kartograph/ since 3.0.0), never in
  // an intermediate one a later migration would have to move again.
  const intentsDir = join(root, "kartograph");
  let intent = existsSync(intentsDir) ? readdirSync(intentsDir).filter((f) => /^\d{4}-\d{2}-\d{2}-\d{4}-migrated-feature-tree\.intent\.md$/.test(f)).sort().pop() : null;
  intent = intent ? `kartograph/${intent}` : `kartograph/${date}-${time}-migrated-feature-tree.intent.md`;
```

The later `mkdirSync(intentsDir, { recursive: true })` and `writeFileSync(join(root, intent), …)` need no change. Also update the header comment line "onto the v2 contract" paragraph by appending: `// The provenance intent is written to kartograph/ (the 3.0.0 layout).`

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/migrate-features.test.js test/validate-features.test.js test/validate-intent.test.js`
Expected: PASS, all tests

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-features.js test/migrate-features.test.js
git commit -m "feat(migrate): migrate-features writes its intent into kartograph/"
```

---

### Task 7: migrate-kartograph.js and the migration documents

**Files:**
- Create: `scripts/migrate-kartograph.js`
- Create: `migrations/2.1.0.md`
- Create: `migrations/3.0.0.md`
- Test: `test/migrate-kartograph.test.js`

**Interfaces:**
- Consumes: `hasHeader`, `migrateProject as migrateFeatures`, `addHeader`, `capabilityMarkdown` (tests) from `scripts/migrate-features.js`; `validateTree` (Task 5); `validateBundle` from knowledge; `validateKartograph` (Task 4); `validateIntent` (Task 2).
- Produces: `compareVersions(a, b) → number`; `migrationVersions(pluginRoot?) → string[]`; `layoutVersion(pluginRoot?) → string | null`; `projectVersion(root) → string | null`; `featuresAreV0(root) → boolean`; `convertIntent(text) → string`; `rewriteProvenance(text) → string`; `indexMarkdown(docs, version) → string`; `logEntry(log, date, line) → string`; `migrateProject(root, { date?, time?, pluginRoot? }) → { from, to, written, removed, errors }`. CLI: `--check` prints `project: <v|new>`, `layout: <v>`, `pending: <migrations/x.md, …|none>`.

- [ ] **Step 1: Write the migration documents** (the layout version comes from them, so they exist before the test)

`migrations/2.1.0.md`:

```markdown
# Kartograph 2.1.0 — every directory under features/ is a capability

## Target state

- Every directory under `features/` is a capability with its own `capability.md`
  (Capability, Sources, Purpose and outcome, Scope and exclusions, Constraints, Features,
  Capabilities, Open questions).
- Every `.feature` file starts with its `# Source intent:` and `# Capability:` comment
  lines, after `# language: de` where the file is German.
- One migration intent is the provenance of every file that had none.

## Recognise

A `.feature` file under `features/` with no `# Source intent:` in its first three lines.

## Do

- Mechanical, `scripts/migrate-features.js` (run by `scripts/migrate-kartograph.js`):
  write the missing `capability.md` files and headers, declare German files' dialect,
  move `features/README.md` to `docs/features-README.md`, remove empty leftover
  directories, and write the migration intent. The script writes that intent in the
  newest layout (`kartograph/<stamp>-migrated-feature-tree.intent.md` since 3.0.0).
- Judgment: none. Scenarios, steps, tags and titles are never touched.
```

`migrations/3.0.0.md`:

```markdown
# Kartograph 3.0.0 — conversation, intent and mapping in kartograph/

## Target state

- `kartograph/` at the project root is one flat Open Knowledge Format bundle: `index.md`
  (frontmatter `okf_version: "0.2"` and `kartograph_version: 3.0.0`), `log.md`, and
  documents named `<YYYY-MM-DD-HHMM>-<slug>.<type>.md` whose `type` is Conversation,
  Intent or Mapping. No subdirectories.
- There is no `intents/` directory. Every earlier intent is
  `kartograph/<stamp>-<slug>.intent.md` with `type: Intent`, a one-sentence
  `description`, its old status, and `legacy-no-conversation` first in `sources`.
- Provenance points into `kartograph/`: `# Source intent: kartograph/<file>.intent.md` in
  `.feature` files, ``- Intent: `kartograph/<file>.intent.md` `` in `capability.md`, and
  `../kartograph/<file>.intent.md` in `knowledge/` concepts and `knowledge/log.md`.

## Recognise

An `intents/` directory, or `knowledge/`, `features/`, `plans/` or `walks/` without
`kartograph/index.md`.

## Do

- Mechanical, `scripts/migrate-kartograph.js`: move and convert every intent, rewrite the
  provenance lines (never a step, scenario or title), write `index.md` and `log.md`,
  remove the empty `intents/`.
- Judgment: an old `related` entry that names no intent file cannot be converted; the
  intent validator reports it. Move its text to the intent's `## Notes` and drop it from
  `related`. No mapping is written for a legacy intent.
```

- [ ] **Step 2: Write the failing test** — `test/migrate-kartograph.test.js`

```js
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
const oldIntent = (related = "none") => `---
title: Offline watering schedule
date: 2026-09-15
status: confirmed
role: product owner
language: English
sources: https://example.org/issue/7
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

test("rewriteProvenance changes only provenance lines and is idempotent", () => {
  const f = `# Source intent: intents/${OLD}.md\n# Capability: features/a/capability.md\nFeature: X\n  Scenario: mentions intents/${OLD}.md in a step\n`;
  const once = rewriteProvenance(f);
  assert.ok(once.startsWith(`# Source intent: kartograph/${OLD}.intent.md\n`));
  assert.ok(once.includes(`mentions intents/${OLD}.md in a step`));
  assert.equal(rewriteProvenance(once), once);
  assert.equal(rewriteProvenance(`- Intent: \`intents/${OLD}.md\``), `- Intent: \`kartograph/${OLD}.intent.md\``);
  assert.equal(rewriteProvenance(`resource: ../intents/${OLD}.md`), `resource: ../kartograph/${OLD}.intent.md`);
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/migrate-kartograph.test.js`
Expected: FAIL with `Cannot find module '…/scripts/migrate-kartograph.js'`

- [ ] **Step 4: Write the script** — `scripts/migrate-kartograph.js`

```js
#!/usr/bin/env node
// Migrates a project onto the newest Kartograph layout in one run. It composes every
// mechanical step the documents in migrations/ describe and always writes the newest
// layout directly, never an intermediate one:
//   2.1.0  a v0 features/ tree gets capability.md files and headers (migrate-features.js,
//          which writes its provenance intent into kartograph/ already)
//   3.0.0  intents/<stamp>-<slug>.md become kartograph/<stamp>-<slug>.intent.md, the
//          provenance lines in features/ and knowledge/ follow, kartograph/index.md and
//          log.md are written, and the empty intents/ is removed.
//
//   node scripts/migrate-kartograph.js <project-root> --check   versions and pending documents
//   node scripts/migrate-kartograph.js <project-root> [--date YYYY-MM-DD] [--time HHMM]
//
// Node built-ins only. Pure functions are exported for tests; the CLI is at the bottom.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync, rmSync, rmdirSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { hasHeader, migrateProject as migrateFeatures } from "./migrate-features.js";
import { validateTree } from "../skills/kartograph-features/validate-features.js";
import { validateBundle } from "../skills/kartograph-knowledge/validate-knowledge.js";
import { validateKartograph, DOC } from "../skills/kartograph-migrate/validate-kartograph.js";
import { validateIntent } from "../skills/kartograph-intent/validate-intent.js";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const LEGACY = "legacy-no-conversation";
const OLD_INTENT = /^(\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const LEGACY_DIRS = ["intents", "knowledge", "features", "plans", "walks"];

export function compareVersions(a, b) {
  const pa = a.split(".").map(Number); const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

export function migrationVersions(pluginRoot = PLUGIN_ROOT) {
  const dir = join(pluginRoot, "migrations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((f) => /^(\d+\.\d+\.\d+)\.md$/.exec(f)?.[1]).filter(Boolean).sort(compareVersions);
}

export function layoutVersion(pluginRoot = PLUGIN_ROOT) {
  const v = migrationVersions(pluginRoot);
  return v.length ? v[v.length - 1] : null;
}

function listFiles(dir, keep) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir).sort()) {
    if (e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, keep));
    else if (keep(e)) out.push(p);
  }
  return out;
}

export function featuresAreV0(root) {
  return listFiles(join(root, "features"), (f) => f.endsWith(".feature")).some((p) => !hasHeader(readFileSync(p, "utf8")));
}

// The layout a project is on: kartograph/index.md says so; before 3.0.0 there was no such
// file, so the layout tells. null is a new project with no Kartograph files at all.
export function projectVersion(root) {
  const index = join(root, "kartograph", "index.md");
  if (existsSync(index)) return /^kartograph_version:\s*"?(\d+\.\d+\.\d+)"?\s*$/m.exec(readFileSync(index, "utf8"))?.[1] ?? "0.0.0";
  if (!LEGACY_DIRS.some((d) => existsSync(join(root, d)))) return null;
  return featuresAreV0(root) ? "2.0.0" : "2.3.0";
}

function firstSentence(s) { const m = /^(.*?[.!?])(\s|$)/.exec(s); return m ? m[1] : s; }

// Old flat values: 'none', one item, or a comma-separated list, items maybe in backticks.
function listOf(v) {
  if (!v || /^none$/i.test(v.trim())) return [];
  return v.split(/,\s*/).map((s) => s.replace(/[`[\]]/g, "").trim()).filter(Boolean);
}

export function newName(oldFile) {
  const m = OLD_INTENT.exec(basename(oldFile));
  return m ? `${m[1]}.intent.md` : null;
}

export function convertIntent(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!m) throw new Error("intent has no frontmatter");
  const old = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) old[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, "$1");
  }
  const body = text.slice(m[0].length);
  const summary = /^## Summary[ \t]*\r?\n([\s\S]*?)(?=^## )/m.exec(body)?.[1] ?? "";
  const description = firstSentence(summary.replace(/\s+/g, " ").trim()) || old.title;
  const sources = [LEGACY, ...listOf(old.sources)];
  const related = listOf(old.related).map((r) => (r.startsWith("intents/") && newName(r)) || r);
  return [
    "---", "type: Intent", `title: ${old.title}`, `description: ${description}`, `status: ${old.status}`,
    `date: ${old.date}`, `role: ${old.role}`, `language: ${old.language}`,
    `sources: [${sources.join(", ")}]`, `related: [${related.join(", ")}]`, "---", "",
  ].join("\n") + body;
}

// Only provenance moves: the two header comments, capability.md's Sources lines, and the
// knowledge bundle's relative links. A step that mentions a path is left alone.
export function rewriteProvenance(text) {
  return text
    .replace(/^(# Source intent: )intents\/([^\s`]+)\.md[ \t]*$/gm, "$1kartograph/$2.intent.md")
    .replace(/^(- Intent: `)intents\/([^`]+)\.md`/gm, "$1kartograph/$2.intent.md`")
    .replace(/^(\s*resource: )\.\.\/intents\/([^\s]+)\.md[ \t]*$/gm, "$1../kartograph/$2.intent.md")
    .replace(/\]\(\.\.\/intents\/([^)\s]+)\.md\)/g, "](../kartograph/$1.intent.md)");
}

function docInfo(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const get = (k) => new RegExp(`^${k}:\\s*(.*)$`, "m").exec(fm)?.[1].trim() ?? "";
  return { type: get("type"), title: get("title"), description: get("description"), status: get("status") };
}

export function indexMarkdown(docs, version) {
  const lines = ["---", 'okf_version: "0.2"', `kartograph_version: ${version}`, "---", "", "# Kartograph", ""];
  for (const d of [...docs].sort((a, b) => b.file.localeCompare(a.file))) lines.push(`* [${d.title}](${d.file}) - ${d.description} _(${d.type}, ${d.status})_`);
  return lines.join("\n") + "\n";
}

export function logEntry(log, date, line) {
  const head = "# Kartograph Log";
  const text = log && log.startsWith(head) ? log : `${head}\n`;
  const heading = `## ${date}`;
  if (text.includes(`\n${heading}\n`)) return text.replace(`\n${heading}\n`, `\n${heading}\n${line}\n`);
  const rest = text.slice(head.length).replace(/^\n+/, "");
  return `${head}\n\n${heading}\n${line}\n${rest ? `\n${rest}` : ""}`;
}

export function migrateProject(root, { date, time, pluginRoot = PLUGIN_ROOT } = {}) {
  const now = new Date();
  date = date || now.toISOString().slice(0, 10);
  time = time || `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const to = layoutVersion(pluginRoot);
  const from = projectVersion(root);
  const written = []; const removed = []; const errors = [];
  if (from === null || compareVersions(from, to) >= 0) return { from, to, written, removed, errors };

  // 2.1.0 — a v0 features tree; migrate-features.js writes its intent into kartograph/ already.
  if (featuresAreV0(root)) {
    const r = migrateFeatures(root, { date, time });
    written.push(...r.written); removed.push(...r.removed.map((d) => `features${d}`));
  }

  // 3.0.0 — intents/ into kartograph/, provenance follows.
  const kdir = join(root, "kartograph");
  mkdirSync(kdir, { recursive: true });
  const idir = join(root, "intents");
  let moved = 0;
  if (existsSync(idir)) {
    for (const f of readdirSync(idir).filter((e) => OLD_INTENT.test(e)).sort()) {
      const name = newName(f);
      writeFileSync(join(kdir, name), convertIntent(readFileSync(join(idir, f), "utf8")));
      rmSync(join(idir, f));
      written.push(`kartograph/${name}`); moved++;
    }
    if (!readdirSync(idir).length) { rmdirSync(idir); removed.push("intents"); }
  }
  for (const d of ["features", "knowledge"]) {
    for (const p of listFiles(join(root, d), (f) => f.endsWith(".feature") || f.endsWith(".md"))) {
      const text = readFileSync(p, "utf8");
      const next = rewriteProvenance(text);
      if (next !== text) { writeFileSync(p, next); written.push(relative(root, p)); }
    }
  }

  const docs = readdirSync(kdir).filter((f) => DOC.test(f)).map((f) => ({ file: f, ...docInfo(readFileSync(join(kdir, f), "utf8")) }));
  writeFileSync(join(kdir, "index.md"), indexMarkdown(docs, to));
  const logPath = join(kdir, "log.md");
  writeFileSync(logPath, logEntry(existsSync(logPath) ? readFileSync(logPath, "utf8") : "", date, `* **Migration**: ${from} → ${to} — ${moved} intents moved into kartograph/.`));
  written.push("kartograph/index.md", "kartograph/log.md");

  errors.push(...validateKartograph(kdir).errors.map((e) => `kartograph/${e}`));
  for (const d of docs.filter((x) => x.file.endsWith(".intent.md"))) {
    errors.push(...validateIntent(readFileSync(join(kdir, d.file), "utf8"), { filename: d.file }).errors.map((e) => `kartograph/${d.file}: ${e}`));
  }
  if (existsSync(join(root, "features"))) errors.push(...validateTree(join(root, "features")).errors);
  if (existsSync(join(root, "knowledge"))) errors.push(...validateBundle(join(root, "knowledge")).errors);
  return { from, to, written: [...new Set(written)], removed, errors };
}

function main(argv) {
  const root = argv.find((a) => !a.startsWith("--") && !/^\d/.test(a));
  if (!root || !existsSync(root)) { console.error("usage: migrate-kartograph.js <project-root> [--check] [--date YYYY-MM-DD] [--time HHMM]"); return 2; }
  const opt = (k) => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i + 1]; };
  if (argv.includes("--check")) {
    const from = projectVersion(root);
    const pending = from === null ? [] : migrationVersions().filter((v) => compareVersions(v, from) > 0);
    console.log(`project: ${from ?? "new"}`);
    console.log(`layout: ${layoutVersion()}`);
    console.log(`pending: ${pending.length ? pending.map((v) => `migrations/${v}.md`).join(", ") : "none"}`);
    return 0;
  }
  const r = migrateProject(root, { date: opt("--date"), time: opt("--time") });
  if (r.from === null) { console.log("new project: nothing to migrate"); return 0; }
  if (!r.written.length) { console.log(`up to date: ${r.to}`); return 0; }
  for (const w of r.written) console.log(`wrote ${w}`);
  for (const d of r.removed) console.log(`removed ${d}`);
  for (const e of r.errors) console.log(`error: ${e}`);
  console.log(r.errors.length ? `${r.errors.length} error(s) left for hand fixing` : `ok ${r.from} → ${r.to}`);
  return r.errors.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exit(main(process.argv.slice(2)));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/migrate-kartograph.test.js`
Expected: PASS, 9 tests

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS, every suite (the knowledge test fixtures still use `../intents/` strings; the knowledge validator does not check resource paths)

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate-kartograph.js migrations test/migrate-kartograph.test.js
git commit -m "feat(migrate): migration documents and migrate-kartograph.js"
```

---

### Task 8: The converse, intent, map and migrate skills; explore retires

**Files:**
- Create: `skills/kartograph-converse/SKILL.md`
- Create: `skills/kartograph-intent/SKILL.md`
- Create: `skills/kartograph-map/SKILL.md`
- Create: `skills/kartograph-migrate/SKILL.md`
- Delete: `skills/kartograph-explore/SKILL.md` (the directory is then empty)
- Test: `test/skills.test.js`

**Interfaces:**
- Consumes: the templates and validators of Tasks 1–4; `scripts/migrate-kartograph.js --check` output of Task 7.
- Produces: the version gate text (byte-identical, reused in Task 9).

The version gate section, used verbatim in every skill but migrate:

```markdown
## 0. Version gate

Before anything else, check that the project is on this plugin's layout. The plugin's
layout version is the highest version among the files named like `3.0.0.md` in the
`migrations/` directory at the plugin root, two levels above this file's directory; if
that directory is not there, skip this step. The project is behind when
`kartograph/index.md` names a lower `kartograph_version`, or when `kartograph/index.md`
does not exist but any of `intents/`, `knowledge/`, `features/`, `plans/` or `walks/`
does. Then stop and say only: "This project is on an older Kartograph layout; run
kartograph-migrate first." A project with none of these is new and passes.
```

- [ ] **Step 1: Write the failing consistency test** — `test/skills.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const skills = readdirSync(new URL("skills/", root)).filter((d) => existsSync(new URL(`skills/${d}/SKILL.md`, root))).sort();

test("twelve skills, explore retired", () => {
  assert.deepEqual(skills, [
    "kartograph-adapters", "kartograph-converse", "kartograph-deliver", "kartograph-domain",
    "kartograph-features", "kartograph-intent", "kartograph-knowledge", "kartograph-map",
    "kartograph-migrate", "kartograph-plan", "kartograph-screens", "kartograph-walk",
  ]);
  assert.ok(!existsSync(new URL("skills/kartograph-explore", root)));
});

test("each SKILL.md's name is its directory", () => {
  for (const s of skills) assert.match(read(`skills/${s}/SKILL.md`), new RegExp(`^---\\nname: ${s}\\n`), s);
});

test("every skill but migrate carries the same version gate, right after Hard rules", () => {
  const gate = (text) => /\n## 0\. Version gate\n([\s\S]*?)\n## /.exec(text)?.[1];
  const gated = skills.filter((s) => s !== "kartograph-migrate");
  const first = gate(read(`skills/${gated[0]}/SKILL.md`));
  assert.ok(first, `${gated[0]} has no '## 0. Version gate'`);
  for (const s of gated) {
    const text = read(`skills/${s}/SKILL.md`);
    assert.equal(gate(text), first, `${s}'s version gate differs`);
    const heads = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.equal(heads[heads.indexOf("Hard rules") + 1], "0. Version gate", `${s}: the gate follows Hard rules`);
  }
});

test("outside the version gate, no skill but migrate mentions intents/", () => {
  for (const s of skills.filter((x) => x !== "kartograph-migrate")) {
    const body = read(`skills/${s}/SKILL.md`).replace(/\n## 0\. Version gate\n[\s\S]*?\n(?=## )/, "\n");
    assert.ok(!/(^|[^a-z])intents\//.test(body), `${s} still mentions intents/ outside its version gate`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/skills.test.js`
Expected: FAIL — the skills list still has `kartograph-explore` and lacks converse/intent/map/migrate

- [ ] **Step 3: Write `skills/kartograph-converse/SKILL.md`**

```markdown
---
name: kartograph-converse
description: Use when a person brings an idea, a feature request, a problem, or a change they want, and no conversation about it has been recorded under kartograph/ yet — before any intent is derived, and before anything is designed, planned, specified, or coded. Also use for a follow-up conversation on the open questions or contradictions an earlier mapping recorded.
---

# Kartograph Converse

One conversation that pulls what a person really wants out of their head and records it,
block by block, as `kartograph/<YYYY-MM-DD-HHMM>-<slug>.conversation.md`. You steer the
conversation as well as you can; you do not interpret it. No goals, no buckets, no
summary: deriving the intent is not your job. The conversation file is the only output.

## Hard rules

- Write only the conversation file, `kartograph/index.md` and `kartograph/log.md`, and
  commit only those. No code, no other files.
- Record the person's words verbatim. Never paraphrase, correct, or summarise them.
- Never conclude on the person's behalf. What you find in the project is used only to ask.
- Ask in plain chat: one question per message, always with your recommended answer and,
  where there are choices, lettered options.
- You drive. Every message ends with the next question or the written file. Never stop to
  wait for the person to ask what comes next, and never ask whether to write.
- Do not name or start any later phase.
- Write the file in the language of the conversation.

## 0. Version gate

Before anything else, check that the project is on this plugin's layout. The plugin's
layout version is the highest version among the files named like `3.0.0.md` in the
`migrations/` directory at the plugin root, two levels above this file's directory; if
that directory is not there, skip this step. The project is behind when
`kartograph/index.md` names a lower `kartograph_version`, or when `kartograph/index.md`
does not exist but any of `intents/`, `knowledge/`, `features/`, `plans/` or `walks/`
does. Then stop and say only: "This project is on an older Kartograph layout; run
kartograph-migrate first." A project with none of these is new and passes.

## 1. Orient, silently

Read the project's instruction file, its README, and `kartograph/index.md`, so earlier
conversations and intents are not asked again. Then look at what exists, cheaply:
`git log --oneline` for the recent history, and the top-level capabilities under
`features/` (each `capability.md`'s heading and first lines). Fetch any referenced issue
or URL.

## 2. Look up while you talk

Whenever a topic touches something that may already exist, look it up before you ask:
drill from the top-level capability down through its sub-capabilities to the `.feature`
files and their scenarios, and search the history (`git log --oneline --grep`, or
`git log --oneline -- <path>`) for the commits that touched it. Use what you find only to
ask a better question — "Session history already has a scenario for this. Is this a change
to it?" — never to answer for the person, and never to decide that something is done or
planned.

## 3. Open up, then converge

Before any solution is discussed, establish in order: **who is speaking** (their role),
**what they want and why** (when they open with a solution, ask what outcome it serves),
**for whom things change**, and **how they will recognise success**. When the goal could
be read more than one way, offer two or three framings as options and let them pick.

Then converge like a tough, friendly reviewer, one dependent decision at a time: sharpen
vague words by asking for the concrete case ("walk me through the last time…"), ask what
is deliberately left out, ask what cannot change, and ask about anything the lookups
showed may overlap or conflict. Never loop on the unanswerable: when the person cannot
answer, move on; their answer is recorded as they gave it.

The conversation ends when the person says they are done or nothing is open. The last
question is always "Is anything missing?", recommending "Nothing is missing".

## 4. Record

Keep the record as you go, in the shape of `conversation-template.md` in this file's
directory: one block per message, numbered from 1, alternating between `AI` and `Person`,
ending with the person. When the person sends two messages in a row, they are one block.

- **Person blocks:** every word, verbatim. A spoken answer is transcribed, not tidied.
- **AI blocks:** only these lines —
  - `> Looked up: …`, one per lookup made for this message: the path, the commit hash and
    subject, or `features/….feature › scenario`; never the content;
  - `Reasoning (shortened): …`, at most one line: why you asked this;
  - `**Question:** …`, the question verbatim;
  - `- **A (recommended):** …`, `- **B:** …`, the options verbatim, one line each.

  Everything else you said (explanations, restatements, background) is not recorded.

## 5. Write and report

Write immediately when the conversation ends, without asking, to
`kartograph/<YYYY-MM-DD-HHMM>-<slug>.conversation.md` (the stamp is when the conversation
started; slug: the topic, lowercase, hyphenated, at most five words). Frontmatter as in the
template: `status: recorded`; `sources` lists the issue, ticket or URL the request came
from, else `[]`; `related` lists the earlier `kartograph/` documents this conversation
follows up, else `[]`. A follow-up is a new file, never an edit of an earlier one.

Update the bundle. If `kartograph/index.md` does not exist, create it with the frontmatter
`okf_version: "0.2"` and `kartograph_version:` the plugin's layout version from step 0,
then a `# Kartograph` heading. Add `* [title](file) - description _(Conversation, recorded)_`
as the first line under the heading. In `kartograph/log.md` (create it with a
`# Kartograph Log` heading if missing) add, under today's `## YYYY-MM-DD` (a new date goes
first): `* **Conversation**: recorded [title](file) — n blocks.`

Then validate: run `node validate-conversation.js kartograph/<file>` with the script from
this file's directory, and fix every reported error until it prints `ok`. Never commit a
file that does not pass.

Then commit and push, without asking: stage **only** the conversation file,
`kartograph/index.md` and `kartograph/log.md`, commit as `conversation: <title>`, and push
to the current branch's upstream. No git or no upstream: skip that part and say so. Show
the path and the commit, then stop.
```

- [ ] **Step 4: Write `skills/kartograph-intent/SKILL.md`**

```markdown
---
name: kartograph-intent
description: Use when a conversation has been recorded under kartograph/ and no intent has been derived from it yet, or when the person asks to derive the intent of a recorded conversation. Works from a fresh context; reads only files.
---

# Kartograph Intent

Derive what the person wants from one recorded conversation and write it as
`kartograph/<stamp>-<slug>.intent.md`, beside the conversation it came from. Read, derive,
write, commit, push, report. **Fully automated: ask nothing, wait for nothing.**

## Hard rules

- Write only the intent file, `kartograph/index.md` and `kartograph/log.md`, and commit
  only those. Never the conversation.
- Derive only from the conversation. What the person did not say is an assumption or an
  open question, never a statement. Never read code or features to fill a gap.
- The person's words decide. An option the AI recommended is a decision only when the
  person chose it; a question the person could not answer is an open question.
- Every goal, intended outcome, non-goal, constraint and decision cites the person's block
  it comes from: `[turn 8]`, or `[turns 8, 12]`.
- No questions, no review, no confirmation. Run to the end and report.
- Write in the language of the conversation.

## 0. Version gate

(the gate text, verbatim as above)

## 1. Read

Take the conversation the person named; otherwise the newest `kartograph/*.conversation.md`
that has no `.intent.md` with the same stamp and slug. If that intent already exists, say
so and stop. Read the conversation in full, and the documents it names under `related`.

## 2. Derive

Sort everything the person said into exactly one bucket:

| bucket | test |
|---|---|
| goal | why the work exists |
| intended outcome | what will observably be true when it is done |
| non-goal | deliberately left out, and why |
| constraint | what cannot change: time, money, platform, law, existing systems |
| assumption | taken for granted by either side, stated so it can be denied |
| decision | a choice, with its reason and the rejected alternatives |
| open question | what the person could not answer yet, and who can |

The mapping later checks intended outcomes one by one against the project, so write each
as one observable statement on one bullet line, in the person's words where possible.
Terms are words the person used with a specific meaning; where they used two words for one
thing, record both and the one they settled on.

## 3. Write, commit, push, report

Fill `intent-template.md` from this file's directory into
`kartograph/<stamp>-<slug>.intent.md`, with the conversation's stamp and slug. Frontmatter:
`status: derived` (the person has not seen it in this form); `sources` holds the
conversation's file name; `related` the earlier documents the conversation named. Keep
every section, writing "None identified." where empty. Section headings stay exactly as in
the template, whatever the language of the content.

Update the bundle: add `* [title](file) - description _(Intent, derived)_` as the first
line under `# Kartograph` in `kartograph/index.md`, and under today's date in
`kartograph/log.md`: `* **Intent**: derived [title](file) from [conversation title](conversation file).`

Then validate: run `node validate-intent.js kartograph/<file>` with the script from this
file's directory (it also checks every citation against the conversation), and fix every
reported error until it prints `ok`. Never commit a file that does not pass.

Stage only the intent file, `kartograph/index.md` and `kartograph/log.md`, commit as
`intent: <title>`, and push to the branch's upstream. No git or no upstream: skip and say
so. Report the path, the commit, and the open questions. Then you are done.
```

(In the actual file, "(the gate text, verbatim as above)" is replaced by the gate section's body — the test enforces byte-identity.)

- [ ] **Step 5: Write `skills/kartograph-map/SKILL.md`**

```markdown
---
name: kartograph-map
description: Use when an intent has been derived under kartograph/ and has not yet been held against what the project already has, or when the person asks what of an intent is already done, partly done, new, or in conflict. Works from a fresh context; reads only files and the git history.
---

# Kartograph Map

Hold one intent against what the project already has and write down, outcome by outcome,
what is done, partly done, new, or in conflict with something that exists:
`kartograph/<stamp>-<slug>.mapping.md`, beside the intent. Research, sort, write, commit,
push, report. **Fully automated: ask nothing, wait for nothing.**

## Hard rules

- Write only the mapping file, `kartograph/index.md` and `kartograph/log.md`, and commit
  only those. Never the intent, `features/`, `knowledge/`, or code.
- The truth is what exists: the feature files under `features/` and the git history.
  Earlier intents, mappings and conversations are background, never proof that something
  is done.
- Every *Done* and *Partly done* entry cites its evidence in backticks: a commit hash, or a
  `features/….feature › scenario`. No evidence, not done.
- Never resolve a contradiction. Record both sides and the question a follow-up
  conversation has to settle.
- No questions, no review, no confirmation. Run to the end and report.
- Write in the intent's language.

## 0. Version gate

(the gate text, verbatim)

## 1. Read

Take the intent the person named; otherwise the newest `kartograph/*.intent.md` that has no
`.mapping.md` with the same stamp and slug. A legacy intent (`legacy-no-conversation` in its
`sources`) predates mapping and is never mapped. If the mapping already exists, say so and
stop. Read the intent in full; its intended outcomes are what you map.

## 2. Research

In this order, as deep as each outcome needs:

1. **Features.** Every `capability.md` from the top level down through its
   sub-capabilities, and the `.feature` files of every capability an outcome touches,
   scenario by scenario.
2. **The git history.** `git log --oneline` in full, then `git log --grep` and
   `git log -- <path>` for the words and paths an outcome names; `git show --stat` where
   the subject alone does not tell what changed. Read code only to confirm what a commit
   claims.
3. **The bundle.** Earlier intents, mappings and conversations in `kartograph/`, for what
   was already asked for, decided, or found in conflict.

## 3. Sort

Each intended outcome goes, word for word as the intent states it and without its turn
citation, into exactly one group:

| group | when | the entry carries |
|---|---|---|
| Done | a scenario specifies it and a commit built it | the commit hash(es) and the `feature › scenario` |
| Partly done | some of it exists: a scenario with no commit behind it, a commit with no scenario, or part of the behaviour | what exists, cited, then `Missing:` what does not |
| New | nothing that exists covers it | one line on why nothing covers it |
| Contradicts | it conflicts with a scenario, a commit, or an earlier intent | both statements, then `Open question:` |

## 4. Write, commit, push, report

Fill `mapping-template.md` from this file's directory into
`kartograph/<stamp>-<slug>.mapping.md`, with the intent's stamp and slug. `status: mapped`;
`sources` holds the intent's file name. Under *Researched*, say how far back the history
was read and which capabilities and documents were read. An empty group is
"None identified.".

Update the bundle: add `* [title](file) - description _(Mapping, mapped)_` as the first line
under `# Kartograph` in `kartograph/index.md`, and under today's date in
`kartograph/log.md`: `* **Mapping**: mapped [title](file) — n done, n partly done, n new, n contradicts.`

Then validate: run `node validate-mapping.js kartograph/<file>` with the script from this
file's directory (it also checks that every intended outcome of the intent is mapped
exactly once), and fix every reported error until it prints `ok`. Never commit a file that
does not pass.

Stage only the mapping file, `kartograph/index.md` and `kartograph/log.md`, commit as
`mapping: <title>`, and push to the branch's upstream. No git or no upstream: skip and say
so. Report the path, the commit, the count per group, and every contradiction as the open
question it raises. Then you are done.
```

- [ ] **Step 6: Write `skills/kartograph-migrate/SKILL.md`**

```markdown
---
name: kartograph-migrate
description: Use when a Kartograph skill stopped because the project is on an older Kartograph layout, after updating the Kartograph plugin, or when the person asks to migrate a project to the current Kartograph version.
---

# Kartograph Migrate

Bring a project's Kartograph files onto this plugin's layout, in one step and one commit,
whatever version the project comes from. **Fully automated: ask nothing, wait for
nothing.**

## Hard rules

- Change only Kartograph's own files: `kartograph/`, `intents/`, `features/`, `knowledge/`,
  and what a migration document names. Never code; never a scenario's steps or title.
- Reach the final target state directly. Never replay versions one by one, never write an
  intermediate layout a later version changes again.
- Never invent. What a migration cannot derive is noted in `kartograph/log.md` and
  reported, never filled in.
- One commit for the whole migration. Never commit a result the validators reject.

## 1. Check

The plugin root is two levels above this file's directory. In the project, run
`node <plugin root>/scripts/migrate-kartograph.js . --check`. It prints the project's
layout version (`new` when there are no Kartograph files at all), the plugin's layout
version, and the pending migration documents. `new`, or `pending: none`: say the project
is up to date and stop.

## 2. Read the pending documents

Read every pending `migrations/<version>.md` at the plugin root, oldest first. Each states
the **Target state** after that version, how to **Recognise** a project that is not there,
and what to **Do**. The goal is the newest document's target state together with every
earlier target state it does not replace. Of the *Do* steps, keep only those that still
matter for that goal: a step a later version redoes or undoes is dropped.

## 3. Migrate

In the project, run `node <plugin root>/scripts/migrate-kartograph.js .`. It performs every
mechanical step of every pending version at once, writing the newest layout directly, and
prints what it wrote, what it removed, and every validator error left. Then carry out the
judgment steps the documents name, merged as in step 2. Fix each remaining validator error
by hand with the smallest correction that keeps the file's meaning; what cannot be fixed
without inventing is noted in `kartograph/log.md` under today's migration line. Re-run the
validators the script names until none reports an error:
`node <plugin root>/skills/kartograph-migrate/validate-kartograph.js kartograph`,
`node <plugin root>/skills/kartograph-intent/validate-intent.js`,
`node <plugin root>/skills/kartograph-features/validate-features.js features` and
`node <plugin root>/skills/kartograph-knowledge/validate-knowledge.js knowledge` for the
directories that exist.

## 4. Verify, commit, push, report

Run the check again: it must print `pending: none`. Run `git status` and confirm that only
the files the migration names changed. Stage exactly those, commit once as
`chore: migrate to kartograph <layout version>`, and push to the branch's upstream. No git
or no upstream: skip and say so. Report the versions (from → to), the moved and rewritten
files by count, and every note left in the log. Then you are done.
```

- [ ] **Step 7: Retire explore**

```bash
git rm skills/kartograph-explore/SKILL.md
rmdir skills/kartograph-explore 2>/dev/null; ls skills
```

Expected `ls`: adapters, converse, deliver, domain, features, intent, knowledge, map, migrate, plan, screens, walk (all `kartograph-` prefixed).

- [ ] **Step 8: Run the test** — it still fails on the nine existing skills lacking the gate; that is Task 9.

Run: `node --test test/skills.test.js`
Expected: tests 1, 2 PASS; test 3 FAIL naming `kartograph-adapters`'s missing gate; test 4 FAIL naming a skill that mentions `intents/`

- [ ] **Step 9: Commit**

```bash
git add -A skills test/skills.test.js
git commit -m "feat: converse, intent, map and migrate skills; explore retires"
```

---

### Task 9: Version gate and mapping in the existing skills

**Files:**
- Modify: `skills/kartograph-{knowledge,features,plan,screens,domain,adapters,walk,deliver}/SKILL.md`
- Modify: `skills/kartograph-knowledge/concept-template.md:7,10`

**Interfaces:**
- Consumes: the version gate text (Task 8), the mapping groups (Task 3), `kartograph/<file>.intent.md` provenance (Task 5).

- [ ] **Step 1: Insert the gate into each of the eight skills** — run from the repo root

```bash
node - <<'EOF'
const fs = require("fs");
const gate = /\n(## 0\. Version gate\n[\s\S]*?\n)(?=## )/.exec(fs.readFileSync("skills/kartograph-converse/SKILL.md", "utf8"))[1];
for (const s of ["knowledge", "features", "plan", "screens", "domain", "adapters", "walk", "deliver"]) {
  const p = `skills/kartograph-${s}/SKILL.md`;
  const text = fs.readFileSync(p, "utf8");
  if (text.includes("## 0. Version gate")) continue;
  const at = text.indexOf("\n## ", text.indexOf("## Hard rules") + 1);
  fs.writeFileSync(p, text.slice(0, at + 1) + gate + "\n" + text.slice(at + 1));
}
EOF
grep -c "## 0. Version gate" skills/*/SKILL.md
```

Expected: `1` for every skill except `kartograph-migrate` (`0`).

- [ ] **Step 2: Rings and deliver never touch kartograph/** — replace `` `intents/` `` with `` `kartograph/` `` in the "Never …" sentences:

```bash
sed -i '' 's#Never `intents/`,#Never `kartograph/`,#; s#domain code, `intents/`,#domain code, `kartograph/`,#' \
  skills/kartograph-screens/SKILL.md skills/kartograph-domain/SKILL.md skills/kartograph-adapters/SKILL.md skills/kartograph-deliver/SKILL.md
grep -n "intents/" skills/kartograph-{screens,domain,adapters,deliver}/SKILL.md
```

Expected grep output: nothing.

- [ ] **Step 3: Knowledge reads the intent and its mapping** — in `skills/kartograph-knowledge/SKILL.md`:

Frontmatter description becomes:

```
description: Use when an intent under kartograph/ has been mapped and its concepts have not yet been recorded in the project's knowledge/ bundle, or when the person asks to extract, update, or extend the knowledge base from an intent. Works from a fresh context; reads only files.
```

Replace the first two sentences of `## 1. Read` with:

```markdown
Take the intent the person named; otherwise the newest `kartograph/*.intent.md` that has a
`.mapping.md` with the same stamp and slug. An intent without its mapping is not ready: say
so and stop. Read the intent and its mapping. Then read
```

(the sentence continues unchanged with "`knowledge/log.md` (if the log already lists…").

Append to `## 2. Extract`, after the paragraph ending "names the question in its body.":

```markdown
The mapping decides what is new behaviour: an intended outcome under *Done* adds no Event
or Command, since it is already built and specified; those under *Partly done* and *New*
do. Who, Terms, Decisions and Constraints are read in full, because a word can be new
where the behaviour is not. An outcome under *Contradicts* yields nothing yet; the concepts
it touches stay as they are.
```

In `## 4. Write, commit, push` replace `kartograph-knowledge/2.1.0` with `kartograph-knowledge/3.0.0`, `resource: ../intents/<file>.md` with `resource: ../kartograph/<file>.intent.md`, and `[<title>](../intents/<file>.md)` with `[<title>](../kartograph/<file>.intent.md)`.

In `skills/kartograph-knowledge/concept-template.md` replace `kartograph-knowledge/2.1.0` with `kartograph-knowledge/3.0.0` and `resource: ../intents/<YYYY-MM-DD-HHMM-slug>.md` with `resource: ../kartograph/<YYYY-MM-DD-HHMM-slug>.intent.md`.

- [ ] **Step 4: Features reads the intent and its mapping** — in `skills/kartograph-features/SKILL.md`:

Frontmatter description becomes:

```
description: Use when an intent under kartograph/ has been mapped and the behaviour it asks for is not yet specified as capabilities and Gherkin features under features/, or when the person asks to derive, update, or extend the feature specifications from an intent. Works from a fresh context; reads only files.
```

Replace the first sentence of `## 1. Read` ("Take the intent the person named; otherwise the newest file in `intents/`.") with:

```markdown
Take the intent the person named; otherwise the newest `kartograph/*.intent.md` that has a
`.mapping.md` with the same stamp and slug. An intent without its mapping is not ready: say
so and stop. Read the intent and its mapping.
```

Insert at the top of `## 2. Reconcile`:

```markdown
Start from the mapping. An intended outcome under *Done* is already covered: link to the
scenario it cites and change nothing. *Partly done* and *New* are what you specify, by the
rules below; for *Partly done*, the part after `Missing:` is what is new. An outcome under
*Contradicts* is never specified: record it under *Open questions* of the capability it
touches, with both statements quoted, and report it.
```

In `## 3. Write` replace the header block with:

````markdown
```gherkin
# Source intent: kartograph/<file>.intent.md
# Capability: features/<capability>/capability.md
```
````

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS, every suite, including `test/skills.test.js` (4 tests)

- [ ] **Step 6: Commit**

```bash
git add skills
git commit -m "feat: version gate in every skill; knowledge and features build on the mapping"
```

---

### Task 10: Manifests, OpenCode, README, CLAUDE.md, diagram

**Files:**
- Modify: `.claude-plugin/plugin.json` (skills list, description)
- Modify: `.codex-plugin/plugin.json` (description)
- Modify: `package.json` (description, `files`)
- Modify: `opencode/index.js`
- Modify: `README.md`, `CLAUDE.md`, `docs/phases.svg`
- Test: `test/skills.test.js` (add a test)

**Interfaces:**
- Consumes: the twelve skill directories.

- [ ] **Step 1: Add the failing manifest test** — append to `test/skills.test.js`

```js
test("every skill is in the Claude Code manifest and has an OpenCode tool; npm ships migrations and scripts", () => {
  const manifest = JSON.parse(read(".claude-plugin/plugin.json"));
  assert.deepEqual(manifest.skills.map((s) => s.replace("./skills/", "")).sort(), skills);
  const opencode = read("opencode/index.js");
  for (const s of skills) assert.ok(opencode.includes(`skill: "${s}"`), `opencode/index.js has no tool for ${s}`);
  const pkg = JSON.parse(read("package.json"));
  for (const f of ["migrations/", "scripts/"]) assert.ok(pkg.files.includes(f), `package.json files lacks ${f}`);
});
```

Run: `node --test test/skills.test.js` — Expected: FAIL on the manifest list.

- [ ] **Step 2: Claude Code manifest** — in `.claude-plugin/plugin.json` set

```json
  "skills": [
    "./skills/kartograph-converse",
    "./skills/kartograph-intent",
    "./skills/kartograph-map",
    "./skills/kartograph-knowledge",
    "./skills/kartograph-features",
    "./skills/kartograph-plan",
    "./skills/kartograph-screens",
    "./skills/kartograph-domain",
    "./skills/kartograph-adapters",
    "./skills/kartograph-walk",
    "./skills/kartograph-deliver",
    "./skills/kartograph-migrate"
  ]
```

and in all three manifests replace the description's opening "Explore a person's intent into intents/<date>-<slug>.md, extract its concepts" with "Record a conversation with a person, derive their intent from it, and map that intent against what the project already has, all in one kartograph/ bundle; extract its concepts". In `package.json` add `"migrations/"` and `"scripts/"` to `files`.

- [ ] **Step 3: OpenCode tools** — in `opencode/index.js`:

Add after `stacksDir`:

```js
const pluginRoot = fileURLToPath(new URL("../", import.meta.url));
```

Replace `intentArg` with:

```js
const intentArg = {
  intent: tool.schema.string().optional().describe("Path of the intent file under kartograph/; omit for the newest mapped intent."),
};
```

Replace the `kartograph_explore` entry with these three, and add `kartograph_migrate` after `kartograph_deliver`:

```js
    kartograph_converse: skillTool({
      skill: "kartograph-converse",
      files: ["conversation-template.md"],
      description:
        "Use when a person brings an idea, a feature request, a problem, or a change they want, " +
        "and no conversation about it has been recorded under kartograph/ yet — before any intent " +
        "is derived, and before anything is designed, planned, specified, or coded. Also use for a " +
        "follow-up conversation on what an earlier mapping left open. Returns the instructions to " +
        "follow for the rest of the conversation.",
      args: { topic: tool.schema.string().optional().describe("What the person brought up, in their words, if already known.") },
      opening: (a) => (a.topic ? `The person's opening request: ${a.topic}\n\n` : ""),
    }),
    kartograph_intent: skillTool({
      skill: "kartograph-intent",
      files: ["intent-template.md"],
      description:
        "Use when a conversation has been recorded under kartograph/ and no intent has been " +
        "derived from it yet. Returns the instructions to follow for the rest of the conversation.",
      args: { conversation: tool.schema.string().optional().describe("Path of the conversation file; omit for the newest without an intent.") },
      opening: (a) => (a.conversation ? `The conversation to derive from: ${a.conversation}\n\n` : ""),
    }),
    kartograph_map: skillTool({
      skill: "kartograph-map",
      files: ["mapping-template.md"],
      description:
        "Use when an intent has been derived under kartograph/ and has not yet been held against " +
        "what the project already has — features and git history. Returns the instructions to " +
        "follow for the rest of the conversation.",
      args: { intent: tool.schema.string().optional().describe("Path of the intent file; omit for the newest without a mapping.") },
      opening: (a) => (a.intent ? `The intent to map: ${a.intent}\n\n` : ""),
    }),
```

```js
    kartograph_migrate: skillTool({
      skill: "kartograph-migrate",
      files: [],
      description:
        "Use when a Kartograph tool stopped because the project is on an older Kartograph layout, " +
        "after updating the plugin, or when the person asks to migrate a project to the current " +
        "Kartograph version. Returns the instructions to follow for the rest of the conversation.",
      args: {},
      opening: () => "",
      extraNote: `\nThe plugin root the instructions refer to is: ${pluginRoot}`,
    }),
```

In the `kartograph_knowledge` and `kartograph_features` descriptions replace "an intent file exists under intents/" with "an intent under kartograph/ has been mapped". Update the file's header comment: "The plan and deliver tools also name the `stacks/` directory, since those two skills read it; migrate names the plugin root, since it runs `scripts/` and reads `migrations/`."

- [ ] **Step 4: README** — in `README.md`:
  - "with eight skills" → "with twelve skills"; the table's first row becomes three rows and a migrate row is added last:

```markdown
| **`kartograph-converse`** | a conversation with you, the features and the git log | `kartograph/<date>-<slug>.conversation.md` |
| **`kartograph-intent`** | one conversation | `kartograph/<date>-<slug>.intent.md` |
| **`kartograph-map`** | one intent, the features and the git log | `kartograph/<date>-<slug>.mapping.md`: done, partly done, new, contradicts |
| **`kartograph-knowledge`** | one intent and its mapping | `knowledge/`, an Open Knowledge Format bundle |
| **`kartograph-features`** | one intent and its mapping | `features/`, capabilities and Gherkin features |
```

```markdown
| **`kartograph-migrate`** | the project and `migrations/` | the project moved onto the plugin's current layout, one commit |
```

  - Replace the `## \`kartograph-explore\` — one conversation, one intent file` section with three sections — `kartograph-converse — talk, and only record`, `kartograph-intent — the intent, derived from what you said`, `kartograph-map — what exists, held against what you want` — each two short paragraphs drawn from the corresponding SKILL.md's opening and rules, and add a `kartograph-migrate — after every update` section before the usage example.
  - Usage example: replace `/kartograph:kartograph-explore I want the app to work without a network connection` with three lines `/kartograph:kartograph-converse I want the app to work without a network connection`, `/kartograph:kartograph-intent`, `/kartograph:kartograph-map`.
  - Validator lines: replace `node skills/kartograph-explore/validate-intent.js intents/<file>.md` with the four lines
    `node skills/kartograph-converse/validate-conversation.js kartograph/<file>.conversation.md`,
    `node skills/kartograph-intent/validate-intent.js kartograph/<file>.intent.md`,
    `node skills/kartograph-map/validate-mapping.js kartograph/<file>.mapping.md`,
    `node skills/kartograph-migrate/validate-kartograph.js kartograph`.
  - Every remaining `intents/` mention: check with `grep -n "intents/\|explore" README.md` and rewrite each for the new layout.

- [ ] **Step 5: CLAUDE.md** — update:
  - "**nine skills**" → "**twelve skills**"; replace the `kartograph-explore` bullet with three bullets (converse / intent / map, one sentence each, as in the README table) and add a `kartograph-migrate` bullet.
  - In the file-layout block: replace the explore template line with `skills/kartograph-converse/conversation-template.md`, `skills/kartograph-intent/intent-template.md`, `skills/kartograph-map/mapping-template.md`; add `migrations/<version>.md   what each layout change requires; the highest is the layout version` and `scripts/migrate-*.js   the mechanical part of the migrations`.
  - "The YAML-subset parser lives only in the knowledge validator; the other frontmatters are flat and need no parser." → append ", with `sources`/`related` as one-line `[a, b]` lists".
  - Validator list: replace the explore line with the four lines from Step 4.
  - "Plan and walk need an argument; the three ring skills fall back to the newest planned plan." → add "Intent and map fall back to the newest conversation or intent without a successor."
  - Add a section after "Rules the walk skill must keep":

```markdown
## Rules the conversation, intent and mapping skills must keep

- **Converse records, never interprets.** The person's words verbatim; an AI block holds
  only lookups, one line of reasoning, the question and the options. Lookups (git log,
  features from the top capability down) serve only to ask.
- **Intent derives only from the conversation** and cites the person's block for every
  goal, outcome, non-goal, constraint and decision; an AI recommendation is a decision only
  when the person chose it. Status `derived`.
- **Map treats features and the git log as the truth**; every outcome lands in exactly one
  of Done (commit and scenario), Partly done (cited, `Missing:`), New, Contradicts (`Open
  question:`). Knowledge and features refuse an intent without its mapping.
- **One flat `kartograph/`**, documents `<stamp>-<slug>.<type>.md`; the intent and mapping
  take the conversation's stamp and slug.

## Migrations

- A release that changes a project's layout adds `migrations/<version>.md` (Target state,
  Recognise, Do) and extends `scripts/migrate-kartograph.js`. Migration scripts always
  write the newest layout; when a later version changes it, the earlier scripts are
  updated, never chained through an intermediate layout.
- Every skill but migrate starts with the byte-identical `## 0. Version gate`;
  `test/skills.test.js` enforces it.
```

  - In "Rules the knowledge skill must keep": `(`../intents/<file>.md`)` → `(`../kartograph/<file>.intent.md`)`.
  - Check with `grep -n "intents/\|explore" CLAUDE.md` and fix every remaining hit.

- [ ] **Step 6: Diagram** — in `docs/phases.svg`: line 76 text `kartograph-explore` → `converse · intent · map`; line 285 chip text `intents/&lt;date-time&gt;-&lt;slug&gt;.md` → `kartograph/&lt;stamp&gt;-&lt;slug&gt;.&lt;type&gt;.md` (widen that `rect`'s `width` from 162 to 220); line 420 footer: `explore (interactive)` → `converse (interactive) · intent · map` and append ` · migrate` after `adapters`. Open the SVG in a browser to check nothing overlaps.

- [ ] **Step 7: Run everything**

Run: `npm test && node -e "import('./opencode/index.js').catch(e => { if (!/@opencode-ai\/plugin/.test(e.message)) throw e; console.log('opencode: only the peer dependency is missing') })"`
Expected: all suites PASS; then either the module loads or the message that only the peer dependency is missing.

- [ ] **Step 8: Commit**

```bash
git add .claude-plugin .codex-plugin package.json opencode README.md CLAUDE.md docs/phases.svg test/skills.test.js
git commit -m "docs: twelve skills, kartograph/ bundle, migrate — manifests, OpenCode, README, CLAUDE.md"
```

---

### Task 11: Release 3.0.0

**Files:**
- Modify: `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `package.json` (`version`)

- [ ] **Step 1: Bump**

```bash
for f in .claude-plugin/plugin.json .codex-plugin/plugin.json package.json; do sed -i '' 's/"version": "2.3.0"/"version": "3.0.0"/' "$f"; done
grep -n '"version"' .claude-plugin/plugin.json .codex-plugin/plugin.json package.json
```

Expected: `3.0.0` three times.

- [ ] **Step 2: Test and commit**

Run: `npm test` — Expected: PASS

```bash
git add .claude-plugin/plugin.json .codex-plugin/plugin.json package.json
git commit -m "release: v3.0.0 — conversation, intent and mapping in kartograph/; kartograph-migrate"
git tag -a v3.0.0 -m "v3.0.0 — conversation, intent and mapping in kartograph/; kartograph-migrate"
```

- [ ] **Step 3: Ask the person, then push** — only after they say yes in chat:

```bash
git push origin main && git push origin v3.0.0
```

`npm publish` is the person's own step (it needs their npm login); name it in the report.

- [ ] **Step 4: Update memory** — rewrite `kartograph-v1-reset.md`'s skill list to the twelve skills and add a memory `kartograph-3-layout.md` (converse → intent → map in one flat `kartograph/`; `migrations/` + `kartograph-migrate`; layout version = highest migration document), with its line in `MEMORY.md`.

---

### Task 12: Migrate the five projects

**Files:** in each of `~/projects/{hyperid,beatrep,mokuso,longpath,aida}` — `intents/`, `kartograph/`, `features/`, `knowledge/`.

- [ ] **Step 1: Check each**

```bash
for p in hyperid beatrep mokuso longpath aida; do echo "== $p"; (cd ~/projects/$p && git status --short | head -5; node ~/projects/kartograph/scripts/migrate-kartograph.js . --check); done
```

Expected: each prints `project: 2.3.0` (or `2.0.0`), `layout: 3.0.0`, `pending: migrations/3.0.0.md` (plus `2.1.0` for a v0 tree). A project with uncommitted changes is reported to the person and skipped.

- [ ] **Step 2: Migrate each** — per project, following `skills/kartograph-migrate/SKILL.md` steps 3–4 by hand: run the script, fix any validator error it reports (e.g. a free-text `related` moved to `## Notes`), confirm `--check` prints `pending: none` and `git status` shows only `intents/`, `kartograph/`, `features/`, `knowledge/` changes, then commit `chore: migrate to kartograph 3.0.0` in that repository.

- [ ] **Step 3: Ask the person, then push** — list the five commits; push each repository only after the person says yes.
