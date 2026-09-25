# Revise and Release — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `kartograph-revise` (a change the person asks for after seeing the product, carried through a revision record, the features, the knowledge, a superseding plan and the rings already built, one commit per step) and `kartograph-release` (the tested build from TestFlight and Play internal into the stores, with release notes, store texts and screenshots of what changed, asked once); release as 3.2.0.

**Architecture:** Two skill directories under `skills/`, stack-neutral and tool-neutral like the others. Revise gets a template and a self-contained validator (pure function + guarded CLI, Node built-ins only); the bundle, features and plan validators learn the new `Revision` type, the `# Changed by` mark and the superseding-plan rules. Release adds one read-only delivery entry script, `release-check.sh`, to the contract first and ships it byte-identical in the four store stacks; each store stack documents its screenshot renderer in `stacks/<stack>/screenshots.md`, which release reads once. No migration document: the change is additive, so the layout version stays 3.0.0.

**Tech Stack:** Node ≥ 18 ES modules and `node:test`; bash 3.2 and stdlib Python for the delivery script; markdown skills; no dependencies.

**Spec:** `docs/superpowers/specs/2026-09-25-revise-and-release-design.md`

## Global Constraints

- Validators: one file each, Node built-ins only; a pure function returning `{ errors, warnings }` plus a CLI guarded by `fileURLToPath(import.meta.url) === realpathSync(process.argv[1])`.
- A revision is `kartograph/<YYYY-MM-DD-HHMM>-<slug>.revision.md`, slug at most five words, flat frontmatter `type, title, description, status, date, role, language, sources, related`, `status` `recorded` or `applied`, `sources` a non-empty list of `.intent.md` file names; sections exactly `Conversation`, `Affected`, `Changes`, `Open questions`.
- The mark above a changed or added scenario is exactly `# Changed by kartograph/<file>.revision.md`; the capability's source line is exactly ``- Revision: `kartograph/<file>.revision.md` ``.
- A superseding plan carries the optional last frontmatter key `revision:` and marks tasks with `**Revised:** changed` or `**Revised:** added`; no other value.
- No `migrations/3.2.0.md`; `kartograph_version` stays 3.0.0.
- The release notes live only in `distribution/release-notes/v<X.Y.Z>.md`; the delivery contract changes in `stacks/common/DISTRIBUTION.md` before any script; `release-check.sh` is byte-identical in kmp, kmp-toolchain, apple-swift and android-compose and calls only `asc_get` and `play_track_versions` from the library.
- Skills are tool-neutral (no runtime tool, variable or slash command) and the two new ones stack-neutral (no Koin, Gradle, gradlew, xcodebuild, SwiftUI, Compose, Room, SwiftData, ViewModel, AppEnvironment); the plugin root is "two levels above this file's directory".
- The `## 0. Version gate` is byte-identical in both new skills and follows *Hard rules*.
- Angle-bracket placeholders are errors in every artifact.
- Release 3.2.0 in `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` and `package.json`; `generated.by` actor `kartograph-knowledge/3.2.0`.
- Pushing, tagging and `npm publish` happen only after the owner says yes in chat. Never stage `opencode/.index.js.swp`.

## Review Focus

- A `# Changed by` line with a tag between it and the scenario, or above a `Rule:` → passes; above a step, or at the end of the file → rejected (Task 3).
- A superseding plan whose unrevised task was built under the old plan but is unticked now → rejected; the same task ticked later by a ring skill in a ring that was not built → still passes, because ticks may be gained, never lost (Task 4).
- A revision citing an AI block, or a block its own conversation does not have → rejected; an added feature file that does not exist yet → only a warning (Task 1).
- `release-check.sh` copied alone into a project whose `distribution/lib/` predates it → works, since it uses only `asc_get` and `play_track_versions` (Task 5).
- `1.10.0` against `1.9.0` → newer; an empty "on sale" → older than anything (Task 5).
- The stack-neutral test on the two new skills catches a stack word slipping in (Task 7).

---
### Task 1: Revision template and validator

**Files:**
- Create: `skills/kartograph-revise/revision-template.md`
- Create: `skills/kartograph-revise/validate-revision.js`
- Test: `test/validate-revision.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `validateRevision(text: string, { filename?: string }) → { errors: string[], warnings: string[], sources: string[], affected: { kind, path }[] }`; `validateRevisionFile(path: string) → same`; `capabilityOf(path: string) → string`; `outlineOf(body)`, `parseList(value)`; constants `TYPE`, `FILENAME`, `DOC_NAME`, `INTENT`, `FRONTMATTER_KEYS`, `STATUSES`, `SECTIONS`, `CHANGE_KINDS`, `AFFECTED`, `CHANGE`, `BLOCK`.

- [ ] **Step 1: Write the failing test**

Create `test/validate-revision.test.js` with exactly this content:

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/validate-revision.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND: Cannot find module '…/skills/kartograph-revise/validate-revision.js'`

- [ ] **Step 3: Write the template**

Create `skills/kartograph-revise/revision-template.md` with exactly this content:

```markdown
---
type: Revision
title: <short name for what changes>
description: <one sentence: what the person wants changed>
status: recorded
date: <YYYY-MM-DD>
role: <the role the person spoke from>
language: <language of the revision>
sources: [<the intent file of every affected capability: YYYY-MM-DD-HHMM-slug.intent.md>]
related: [<earlier kartograph/ documents this revision follows up — or an empty list>]
---

# <title>

<!-- The person's words verbatim in numbered blocks, starting and ending with the person.
     An AI block only when the words were genuinely ambiguous: one question and its
     options. Every change cites the person's block it comes from. validate-revision.js
     checks all of that. -->

## Conversation

### 1 — Person

<what the person said, verbatim>

## Affected

- Capability: `features/<capability>/capability.md`
- Feature: `features/<capability>/<feature>.feature`
- Scenario: `features/<capability>/<feature>.feature › <scenario>`
- Screen: `<ScreenName>` in `plans/<YYYY-MM-DD-HHMM>-<capability>.md`

## Changes

- **Changed:** `features/<capability>/<feature>.feature › <scenario>` — <what changes, in the person's words where possible> [turn 1]
- **Added:** `features/<capability>/<feature>.feature` — <the new behaviour> [turn 1]
- **Removed:** `features/<capability>/<feature>.feature › <scenario>` — <what the person said to drop> [turn 1]

## Open questions

<One bullet per thing the words leave open, naming the change it blocks. Or: None identified.>
```

- [ ] **Step 4: Write the validator**

Create `skills/kartograph-revise/validate-revision.js` with exactly this content:

````js
#!/usr/bin/env node
// Validates a revision recorded by kartograph-revise, so every revision has the shape of
// `revision-template.md`: flat frontmatter naming the intents behind the affected
// capabilities, the person's words in numbered blocks, what the words affect, and every
// change citing the person's block it comes from.
//
//   node validate-revision.js <kartograph/file.revision.md> [...]
//   node validate-revision.js        validate every *.revision.md in ./kartograph
//
// Inside a project the CLI also checks that every intent in `sources` sits beside the
// revision, and warns about affected paths that do not exist (a removed scenario is gone
// once the revision is applied). Exit code 1 when any file has errors.
// Self-contained on purpose: a skill directory must work when copied on its own.
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const TYPE = "Revision";
export const FILENAME = /^(\d{4}-\d{2}-\d{2})-(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.revision\.md$/;
export const DOC_NAME = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:conversation|intent|mapping|revision)\.md$/;
export const INTENT = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.intent\.md$/;
export const MAX_SLUG_WORDS = 5;
export const FRONTMATTER_KEYS = ["type", "title", "description", "status", "date", "role", "language", "sources", "related"];
export const STATUSES = ["recorded", "applied"];
export const SECTIONS = ["Conversation", "Affected", "Changes", "Open questions"];
export const CHANGE_KINDS = ["Changed", "Added", "Removed"];
export const EMPTY_MARKER = "None identified.";
export const BLOCK = /^### (\d+) — (AI|Person)[ \t]*$/;
const SEG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const CAPABILITY = `features/(?:${SEG}/)+capability\\.md`;
const FEATURE = `features/(?:${SEG}/)+${SEG}\\.feature`;
export const AFFECTED = [
  ["Capability", new RegExp(`^- Capability: \`(${CAPABILITY})\`$`)],
  ["Feature", new RegExp(`^- Feature: \`(${FEATURE})\`$`)],
  ["Scenario", new RegExp(`^- Scenario: \`(${FEATURE}) › [^\`]+\`$`)],
  ["Screen", /^- Screen: `[^`]+` in `(plans\/\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md)`$/],
];
export const CHANGE = new RegExp(`^- \\*\\*(${CHANGE_KINDS.join("|")}):\\*\\* \`(${CAPABILITY}|${FEATURE}(?: › [^\`]+)?)\` — \\S`);
const CITATION = /\[turns? (\d+(?:, ?\d+)*)\]/g;
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

// Code spans may quote angle brackets verbatim; they are never template placeholders.
const withoutCode = (s) => s.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
const content = (lines) => lines.filter((l) => l.trim() !== "");

export function outlineOf(body) {
  const h1 = []; const sections = []; const lead = [];
  let section = null; let block = null;
  for (const line of body.replace(COMMENT, "").split(/\r?\n/)) {
    if (/^# /.test(line)) { h1.push(line.slice(2).trim()); section = null; block = null; continue; }
    const h2 = /^## (.*)$/.exec(line);
    if (h2) { section = { name: h2[1].trim(), lines: [], blocks: [], stray: [] }; sections.push(section); block = null; continue; }
    const b = BLOCK.exec(line);
    if (b && section) { block = { n: Number(b[1]), speaker: b[2], lines: [] }; section.blocks.push(block); continue; }
    if (!section) { if (line.trim() !== "") lead.push(line.trim()); continue; }
    if (block) block.lines.push(line);
    else section.lines.push(line);
  }
  return { h1, lead, sections };
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

// The capability directory a features/ path belongs to, as its capability.md path.
export function capabilityOf(path) {
  const p = path.replace(/ › .*$/, "");
  return p.endsWith("/capability.md") ? p : `${p.slice(0, p.lastIndexOf("/"))}/capability.md`;
}

export function validateRevision(text, { filename } = {}) {
  const errors = []; const warnings = [];
  const err = (m) => errors.push(m);

  let fileDate = null;
  if (filename !== undefined) {
    const m = FILENAME.exec(basename(filename));
    if (!m) err(`filename must be YYYY-MM-DD-HHMM-<slug>.revision.md with a lowercase hyphenated slug, got '${basename(filename)}'`);
    else {
      fileDate = m[1];
      const words = m[3].split("-").length;
      if (words > MAX_SLUG_WORDS) err(`slug has ${words} words, at most ${MAX_SLUG_WORDS} allowed`);
    }
  }

  const { frontmatter, body } = splitFrontmatter(text);
  if (!frontmatter) { err("no frontmatter block at the top of the file"); return { errors, warnings, sources: [], affected: [] }; }
  const fm = checkFrontmatter(frontmatter, FRONTMATTER_KEYS, err);
  if (fm.type !== undefined && fm.type !== TYPE) err(`type must be ${TYPE}, got '${fm.type}'`);
  if (fm.status !== undefined && !STATUSES.includes(fm.status)) err(`status must be ${STATUSES.join(" | ")}, got '${fm.status}'`);
  if (fm.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) err(`date must be YYYY-MM-DD, got '${fm.date}'`);
  if (fileDate && fm.date && fm.date !== fileDate) err(`date '${fm.date}' does not match the filename date '${fileDate}'`);
  let sources = [];
  if (fm.sources !== undefined) {
    const list = parseList(fm.sources);
    if (list === null) err(`sources must be a list like [a, b], got '${fm.sources}'`);
    else if (!list.length) err("sources must name the intent of every affected capability; it is empty");
    else for (const s of list) { if (!INTENT.test(s)) err(`sources entry '${s}' must be the file name of an intent: YYYY-MM-DD-HHMM-slug.intent.md`); else sources.push(s); }
  }
  if (fm.related !== undefined) {
    const related = parseList(fm.related);
    if (related === null) err(`related must be a list like [a, b] or [], got '${fm.related}'`);
    else for (const r of related) if (!DOC_NAME.test(r)) err(`related entry '${r}' must be the file name of a kartograph/ document`);
  }

  const { h1, lead, sections } = outlineOf(body);
  if (h1.length !== 1) err(`exactly one '# title' heading expected, found ${h1.length}`);
  else if (fm.title && h1[0] !== fm.title) err(`'# ${h1[0]}' does not match the frontmatter title '${fm.title}'`);
  for (const l of lead) err(`nothing but the title belongs before '## Conversation'; got: ${l}`);
  const names = sections.map((s) => s.name);
  if (names.join("\n") !== SECTIONS.join("\n")) {
    const missing = SECTIONS.filter((s) => !names.includes(s));
    const extra = names.filter((s) => !SECTIONS.includes(s));
    if (missing.length) err(`missing section(s): ${missing.map((s) => `## ${s}`).join(", ")}`);
    if (extra.length) err(`unknown section(s): ${extra.map((s) => `## ${s}`).join(", ")}`);
    if (!missing.length && !extra.length) err(`sections must be in the order: ${SECTIONS.join(", ")}`);
  }
  const sec = (n) => sections.find((s) => s.name === n);
  for (const s of sections) if (s.name !== "Conversation" && s.blocks.length) err(`'### n — …' blocks belong only under '## Conversation', found one under '## ${s.name}'`);

  const turns = new Map();
  const conv = sec("Conversation");
  if (conv) {
    for (const l of content(conv.lines)) err(`'## Conversation' holds only numbered '### n — AI' and '### n — Person' blocks; got: ${l.trim()}`);
    const blocks = conv.blocks;
    if (!blocks.length) err("'## Conversation' needs at least the person's block");
    blocks.forEach((b, i) => {
      turns.set(b.n, b.speaker);
      if (b.n !== i + 1) err(`block ${b.n} is out of sequence; expected ${i + 1}`);
      if (i > 0 && b.speaker === blocks[i - 1].speaker) err(`block ${b.n} (${b.speaker}) follows another ${b.speaker} block; blocks alternate`);
      if (b.speaker === "Person" && !content(b.lines).length) err(`block ${b.n} (Person) is empty`);
      if (b.speaker === "AI") checkAi(b, err);
    });
    if (blocks.length && blocks[0].speaker !== "Person") err("the first block must be the person's: a revision starts with what they want changed");
    if (blocks.length && blocks[blocks.length - 1].speaker !== "Person") err("the last block must be the person's");
  }

  const affected = [];
  const aff = sec("Affected");
  if (aff) {
    for (const l of content(aff.lines)) {
      const hit = AFFECTED.find(([, re]) => re.test(l));
      if (!hit) { err(`'## Affected' lines are '- Capability: \`features/…/capability.md\`', '- Feature: \`features/….feature\`', '- Scenario: \`features/….feature › name\`' or '- Screen: \`Name\` in \`plans/….md\`'; got: ${l.trim()}`); continue; }
      affected.push({ kind: hit[0], path: hit[1].exec(l)[1] });
    }
    if (!affected.some((a) => a.kind === "Capability")) err("'## Affected' names at least one '- Capability:'");
  }
  const capabilities = new Set(affected.filter((a) => a.kind === "Capability").map((a) => a.path));
  for (const a of affected) if ((a.kind === "Feature" || a.kind === "Scenario") && !capabilities.has(capabilityOf(a.path))) err(`'## Affected' names '${a.path}' but not its capability '${capabilityOf(a.path)}'`);

  const changes = sec("Changes");
  if (changes) {
    const lines = content(changes.lines);
    if (!lines.length) err("'## Changes' needs at least one change");
    for (const l of lines) {
      if (/^\s{2,}\S/.test(l)) continue;
      const m = CHANGE.exec(l);
      if (!m) { err(`'## Changes' lines are '- **Changed|Added|Removed:** \`features/…\` — what [turn n]'; got: ${l.trim()}`); continue; }
      if (!capabilities.has(capabilityOf(m[2]))) err(`'## Changes': '${m[2]}' lies in a capability '## Affected' does not name`);
      const nums = [...l.matchAll(CITATION)].flatMap((c) => c[1].split(/,\s*/).map(Number));
      if (!nums.length) { err(`'## Changes': every change cites the person's block it comes from, like [turn 1]; missing in: ${l.trim()}`); continue; }
      for (const n of nums) {
        if (!turns.has(n)) err(`'## Changes': cites turn ${n}, which '## Conversation' does not have`);
        else if (turns.get(n) !== "Person") err(`'## Changes': cites turn ${n}, which is the AI's, not the person's`);
      }
    }
  }

  const open = sec("Open questions");
  if (open) {
    const lines = content(open.lines);
    const isMarker = lines.length === 1 && lines[0].trim() === EMPTY_MARKER;
    const bad = lines.filter((l) => !/^(?:- |\s{2,}\S)/.test(l));
    if (!lines.length) err(`'## Open questions' is empty (write '${EMPTY_MARKER}' when nothing is open)`);
    else if (!isMarker && bad.length) err(`'## Open questions' must be a bullet list or exactly '${EMPTY_MARKER}'; offending line: ${bad[0].trim()}`);
  }

  const ph = PLACEHOLDER.exec(withoutCode(body.replace(COMMENT, "")));
  if (ph) err(`body still holds a template placeholder: ${ph[0]}`);
  return { errors, warnings, sources, affected };
}

// Validates the file and, since it sits in a project's kartograph/, what it names there.
export function validateRevisionFile(path) {
  const r = validateRevision(readFileSync(path, "utf8"), { filename: path });
  const dir = dirname(path);
  const root = dirname(dir);
  for (const s of r.sources) if (!existsSync(join(dir, s))) r.errors.push(`sources names '${s}', which does not exist beside the revision`);
  if (basename(dir) === "kartograph") {
    for (const a of r.affected) if (!existsSync(join(root, a.path))) r.warnings.push(`'## Affected' names '${a.path}', which does not exist (yet, or any more)`);
  }
  return r;
}

function main(argv) {
  let files = argv;
  if (files.length === 0) {
    if (!existsSync("kartograph")) { console.error("usage: validate-revision.js <file.revision.md> [...]  (or run where ./kartograph exists)"); return 2; }
    files = readdirSync("kartograph").filter((f) => f.endsWith(".revision.md")).sort().map((f) => join("kartograph", f));
  }
  let failed = 0;
  for (const f of files) {
    if (!existsSync(f) || !statSync(f).isFile()) { console.error(`error: ${f}: no such file`); failed++; continue; }
    const { errors, warnings } = validateRevisionFile(f);
    for (const w of warnings) console.log(`warning: ${f}: ${w}`);
    for (const e of errors) console.log(`error: ${f}: ${e}`);
    if (errors.length) failed++; else console.log(`ok ${f}`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
````

Then make it executable: `chmod +x skills/kartograph-revise/validate-revision.js`.

- [ ] **Step 5: Run it to verify it passes**

Run: `node --test test/validate-revision.test.js`
Expected: PASS — `ℹ tests 9`, `ℹ pass 9`, `ℹ fail 0`

- [ ] **Step 6: Commit**

```bash
git add skills/kartograph-revise/revision-template.md skills/kartograph-revise/validate-revision.js test/validate-revision.test.js
git commit -m "feat(revise): revision template and validator"
```

### Task 2: The bundle accepts revisions

**Files:**
- Modify: `skills/kartograph-migrate/validate-kartograph.js`
- Modify: `skills/kartograph-converse/validate-conversation.js`, `skills/kartograph-intent/validate-intent.js`, `skills/kartograph-map/validate-mapping.js`
- Test: `test/validate-kartograph.test.js`, `test/validate-conversation.test.js`, `test/validate-intent.test.js`, `test/validate-mapping.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `DOC` and `TYPES` in `validate-kartograph.js` know `revision` → `Revision` (and so does `scripts/migrate-kartograph.js`, which imports `DOC`); `DOC_NAME` in the three document validators accepts `.revision.md` in `related`.

- [ ] **Step 1: Write the failing tests**

Append to `test/validate-kartograph.test.js`:

```js
test("a revision is a typed document of the bundle", (t) => {
  const R = "2026-09-25-1000-archive-undo.revision.md";
  const line = `* [Archive undo](${R}) - x. _(Revision, recorded)_`;
  assert.deepEqual(validateKartograph(bundle(t, { files: { [R]: doc("Revision", `[${I}]`) }, idx: [line, ...LINES] })).errors, []);
  assert.ok(has(validateKartograph(bundle(t, { files: { [R]: doc("Intent", `[${I}]`) }, idx: [line, ...LINES] })).errors, /type must be Revision for a \.revision\.md file/));
  assert.ok(has(validateKartograph(bundle(t, { files: { [R]: doc("Revision", "[2026-01-01-0000-gone.intent.md]") }, idx: [line, ...LINES] })).errors, /sources names '2026-01-01-0000-gone\.intent\.md', which does not exist/));
});
```

Append the same test to each of `test/validate-conversation.test.js`, `test/validate-intent.test.js` and `test/validate-mapping.test.js` (each file already defines `errs` and `swap` over a fixture holding `related: []`):

```js
test("related may name a revision", () => {
  assert.deepEqual(errs(swap("related: []", "related: [2026-09-25-1000-archive-undo.revision.md]")), []);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/validate-kartograph.test.js test/validate-conversation.test.js test/validate-intent.test.js test/validate-mapping.test.js`
Expected: FAIL — `✖ a revision is a typed document of the bundle` and three times `✖ related may name a revision`; everything else passes.

- [ ] **Step 3: Implement**

In `skills/kartograph-migrate/validate-kartograph.js`, replace:

```js
export const DOC = /^(\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*)\.(conversation|intent|mapping)\.md$/;
export const TYPES = { conversation: "Conversation", intent: "Intent", mapping: "Mapping" };
```

with:

```js
export const DOC = /^(\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*)\.(conversation|intent|mapping|revision)\.md$/;
export const TYPES = { conversation: "Conversation", intent: "Intent", mapping: "Mapping", revision: "Revision" };
```

In `skills/kartograph-migrate/validate-kartograph.js`, replace:

```js
YYYY-MM-DD-HHMM-slug.(conversation|intent|mapping).md belong in kartograph/
```

with:

```js
YYYY-MM-DD-HHMM-slug.(conversation|intent|mapping|revision).md belong in kartograph/
```

In `skills/kartograph-converse/validate-conversation.js`, replace:

```js
export const DOC_NAME = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:conversation|intent|mapping)\.md$/;
```

with:

```js
export const DOC_NAME = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:conversation|intent|mapping|revision)\.md$/;
```

In `skills/kartograph-intent/validate-intent.js`, replace:

```js
export const DOC_NAME = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:conversation|intent|mapping)\.md$/;
```

with:

```js
export const DOC_NAME = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:conversation|intent|mapping|revision)\.md$/;
```

In `skills/kartograph-map/validate-mapping.js`, replace:

```js
export const DOC_NAME = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:conversation|intent|mapping)\.md$/;
```

with:

```js
export const DOC_NAME = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:conversation|intent|mapping|revision)\.md$/;
```

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test test/validate-kartograph.test.js test/validate-conversation.test.js test/validate-intent.test.js test/validate-mapping.test.js && node --test test/migrate-kartograph.test.js`
Expected: PASS — `ℹ fail 0` for both runs.

- [ ] **Step 5: Commit**

```bash
git add skills/kartograph-migrate/validate-kartograph.js skills/kartograph-converse/validate-conversation.js skills/kartograph-intent/validate-intent.js skills/kartograph-map/validate-mapping.js test/validate-kartograph.test.js test/validate-conversation.test.js test/validate-intent.test.js test/validate-mapping.test.js
git commit -m "feat(kartograph): Revision is the bundle's fourth document type"
```

### Task 3: Features validator — `# Changed by` and `- Revision:`

**Files:**
- Modify: `skills/kartograph-features/validate-features.js`
- Modify: `skills/kartograph-features/capability-template.md`
- Test: `test/validate-features.test.js`

**Interfaces:**
- Consumes: the revision path shape from Task 1.
- Produces: `REVISION_PATH`; `validateCapability(…)` also returns `revisions: string[]`; `validateFeature(…)` also returns `revisions: string[]`; `validateCapabilityDir` checks that every revision a feature names is listed in `capability.md` and exists.

- [ ] **Step 1: Write the failing tests**

Append to `test/validate-features.test.js` (it already defines `capability`, `feature`, `OPTS`, `INTENT` and `tree`):

```js
// --- revisions ----------------------------------------------------------------

const REVISION = "kartograph/2026-09-25-1000-archive-undo.revision.md";
const revisedCapability = capability.replace(`- Intent: \`${INTENT}\``, `- Intent: \`${INTENT}\`\n- Revision: \`${REVISION}\``);
const revisedFeature = feature.replace("    Scenario: An owner archives an active project", `    # Changed by ${REVISION}\n    Scenario: An owner archives an active project`);

test("a '# Changed by' revision comment above a scenario or rule passes and is reported", () => {
  const r = validateFeature(revisedFeature, { path: "features/project-archiving/archive-project.feature", capabilityDir: "project-archiving" });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.revisions, [REVISION]);
  const aboveRule = feature.replace("  Rule: Non-owners cannot archive a project", `  # Changed by ${REVISION}\n  @revised\n  Rule: Non-owners cannot archive a project`);
  assert.deepEqual(validateFeature(aboveRule, { capabilityDir: "project-archiving" }).errors, []);
  assert.deepEqual(validateCapability(revisedCapability, OPTS).revisions, [REVISION]);
});

test("a '# Changed by' comment names a revision and stands above a scenario or rule", () => {
  const badPath = revisedFeature.replace(`# Changed by ${REVISION}`, "# Changed by the owner");
  assert.ok(validateFeature(badPath, { capabilityDir: "project-archiving" }).errors.some((e) => /must name kartograph\/YYYY-MM-DD-HHMM-<slug>\.revision\.md/.test(e)));
  const aboveStep = feature.replace("      When Alice archives \"Atlas\"", `      # Changed by ${REVISION}\n      When Alice archives "Atlas"`);
  assert.ok(validateFeature(aboveStep, { capabilityDir: "project-archiving" }).errors.some((e) => /must stand directly above a scenario, scenario outline or rule; it stands above: When Alice archives/.test(e)));
  assert.ok(validateFeature(feature + `\n  # Changed by ${REVISION}\n`, { capabilityDir: "project-archiving" }).errors.some((e) => /nothing follows it/.test(e)));
  assert.ok(validateCapability(revisedCapability.replace(REVISION, "kartograph/undo.md"), OPTS).errors.some((e) => /source revision path must look like/.test(e)));
});

test("a feature's revision must be listed in capability.md and must exist", (t) => {
  const unlisted = tree(t, { files: { "capability.md": capability, "archive-project.feature": revisedFeature } });
  const r1 = validateTree(join(unlisted, "features"));
  assert.ok(r1.errors.some((e) => /'# Changed by kartograph\/2026-09-25-1000-archive-undo\.revision\.md' is not listed as '- Revision:'/.test(e)));
  assert.ok(r1.errors.some((e) => /revision 'kartograph\/2026-09-25-1000-archive-undo\.revision\.md' does not exist/.test(e)));
  const listed = tree(t, { files: { "capability.md": revisedCapability, "archive-project.feature": revisedFeature } });
  writeFileSync(join(listed, REVISION), "# x\n");
  assert.deepEqual(validateTree(join(listed, "features")).errors, []);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/validate-features.test.js`
Expected: FAIL — `✖ a '# Changed by' revision comment above a scenario or rule passes and is reported`, `✖ a '# Changed by' comment names a revision and stands above a scenario or rule`, `✖ a feature's revision must be listed in capability.md and must exist`; the 18 existing tests pass.

- [ ] **Step 3: Implement**

In `skills/kartograph-features/validate-features.js`, replace:

```js
// files are plain Gherkin; checked are only Kartograph's additions: the header comments,
// one Feature:, unique scenario names, a Then per scenario. Enforced so no
// capability or feature drifts.
```

with:

```js
// files are plain Gherkin; checked are only Kartograph's additions: the header comments,
// the '# Changed by <revision>' comments kartograph-revise puts above a changed scenario or
// rule, one Feature:, unique scenario names, a Then per scenario. Enforced so no
// capability or feature drifts.
```

In `skills/kartograph-features/validate-features.js`, replace:

```js
export const INTENT_PATH = /^kartograph\/\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.intent\.md$/;
```

with:

```js
export const INTENT_PATH = /^kartograph\/\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.intent\.md$/;
export const REVISION_PATH = /^kartograph\/\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.revision\.md$/;
const CHANGED_BY = /^# Changed by (.*)$/;
```

In `skills/kartograph-features/validate-features.js`, replace:

```js
  const intents = [];
  const sources = sections.find((s) => s.name === "Sources");
```

with:

```js
  const intents = []; const revisions = [];
  const sources = sections.find((s) => s.name === "Sources");
```

In `skills/kartograph-features/validate-features.js`, replace:

```js
      if (m) { if (!INTENT_PATH.test(m[1])) err(`source intent path must look like kartograph/YYYY-MM-DD-HHMM-<slug>.intent.md, got '${m[1]}'`); intents.push(m[1]); }
```

with:

```js
      if (m) { if (!INTENT_PATH.test(m[1])) err(`source intent path must look like kartograph/YYYY-MM-DD-HHMM-<slug>.intent.md, got '${m[1]}'`); intents.push(m[1]); }
      const r = /^- Revision: `([^`]+)`$/.exec(b);
      if (r) { if (!REVISION_PATH.test(r[1])) err(`source revision path must look like kartograph/YYYY-MM-DD-HHMM-<slug>.revision.md, got '${r[1]}'`); revisions.push(r[1]); }
```

In `skills/kartograph-features/validate-features.js`, replace:

```js
  return { errors, intents, listed, listedCapabilities };
```

with:

```js
  return { errors, intents, revisions, listed, listedCapabilities };
```

In `skills/kartograph-features/validate-features.js`, replace:

```js
  const lines = text.split(/\r?\n/);
  const intents = [];
  let d = DIALECTS.en;
```

with:

```js
  const lines = text.split(/\r?\n/);
  const intents = []; const revisions = [];
  let d = DIALECTS.en;
```

In `skills/kartograph-features/validate-features.js`, replace:

```js
  let inDocString = null; let expectHeader = false; const headerCells = new Set();
```

with:

```js
  let inDocString = null; let expectHeader = false; const headerCells = new Set();
  // A '# Changed by <revision>' comment marks the scenario or rule directly below it.
  let changedBy = null;
```

In `skills/kartograph-features/validate-features.js`, replace:

```js
    if (inDocString !== null) { if (t.startsWith(inDocString)) inDocString = null; continue; }
    if (t === "" || t.startsWith("#") || t.startsWith("@")) continue;
```

with:

```js
    if (inDocString !== null) { if (t.startsWith(inDocString)) inDocString = null; continue; }
    const cb = CHANGED_BY.exec(t);
    if (cb) {
      const p = cb[1].trim();
      if (!REVISION_PATH.test(p)) err(`'# Changed by' must name kartograph/YYYY-MM-DD-HHMM-<slug>.revision.md, got '${p}'`);
      revisions.push(p); changedBy = p; continue;
    }
    if (t === "" || t.startsWith("#") || t.startsWith("@")) continue;
    if (changedBy !== null) {
      if (block(t, d.rule) === null && block(t, d.outline) === null && block(t, d.scenario) === null) err(`'# Changed by ${changedBy}' must stand directly above a scenario, scenario outline or rule; it stands above: ${t}`);
      changedBy = null;
    }
```

In `skills/kartograph-features/validate-features.js`, replace:

```js
  closeRule(); closeBlock();
  if (!scenarios) err("at least one scenario is required");
```

with:

```js
  closeRule(); closeBlock();
  if (changedBy !== null) err(`'# Changed by ${changedBy}' must stand directly above a scenario, scenario outline or rule; nothing follows it`);
  if (!scenarios) err("at least one scenario is required");
```

In `skills/kartograph-features/validate-features.js`, replace:

```js
  return { errors, intents };
}
```

with:

```js
  return { errors, intents, revisions };
}
```

In `skills/kartograph-features/validate-features.js`, replace:

```js
  let capIntents = [];
  if (!entries.includes("capability.md")) errors.push(`${rel("capability.md")}: missing`);
  else {
    const r = validateCapability(readFileSync(join(dir, "capability.md"), "utf8"), { path: rel("capability.md"), featureFiles, subCapabilities });
    errors.push(...r.errors); capIntents = r.intents;
  }
  const allIntents = new Set(capIntents);
```

with:

```js
  let capIntents = []; let capRevisions = [];
  if (!entries.includes("capability.md")) errors.push(`${rel("capability.md")}: missing`);
  else {
    const r = validateCapability(readFileSync(join(dir, "capability.md"), "utf8"), { path: rel("capability.md"), featureFiles, subCapabilities });
    errors.push(...r.errors); capIntents = r.intents; capRevisions = r.revisions;
  }
  const allIntents = new Set(capIntents);
  const allRevisions = new Set(capRevisions);
```

In `skills/kartograph-features/validate-features.js`, replace:

```js
    for (const p of r.intents) { allIntents.add(p); if (!capIntents.includes(p)) errors.push(`${rel(f)}: source intent '${p}' is not listed under '## Sources' in capability.md`); }
  }
```

with:

```js
    for (const p of r.intents) { allIntents.add(p); if (!capIntents.includes(p)) errors.push(`${rel(f)}: source intent '${p}' is not listed under '## Sources' in capability.md`); }
    for (const p of new Set(r.revisions)) { allRevisions.add(p); if (!capRevisions.includes(p)) errors.push(`${rel(f)}: '# Changed by ${p}' is not listed as '- Revision:' under '## Sources' in capability.md`); }
  }
```

In `skills/kartograph-features/validate-features.js`, replace:

```js
        (existsSync(intentsDir) ? errors : warnings).push(`${rel("capability.md")}: source intent '${p}' does not exist`);
      }
    }
```

with:

```js
        (existsSync(intentsDir) ? errors : warnings).push(`${rel("capability.md")}: source intent '${p}' does not exist`);
      }
    }
    for (const p of allRevisions) {
      if (!existsSync(join(projectRoot, p))) {
        (existsSync(intentsDir) ? errors : warnings).push(`${rel("capability.md")}: revision '${p}' does not exist`);
      }
    }
```

In `skills/kartograph-features/capability-template.md`, replace:

```markdown
<!-- one line per intent that shaped this capability, oldest first; never remove one.
     Add links to existing definitions or decisions where the capability relies on them. -->
```

with:

```markdown
<!-- one line per intent that shaped this capability, oldest first; never remove one.
     A revision that changed it adds a line - Revision: `kartograph/YYYY-MM-DD-HHMM-slug.revision.md`
     after them (kartograph-revise writes it). Add links to existing definitions or
     decisions where the capability relies on them. -->
```

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test test/validate-features.test.js test/migrate-features.test.js test/migrate-kartograph.test.js`
Expected: PASS — `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add skills/kartograph-features/validate-features.js skills/kartograph-features/capability-template.md test/validate-features.test.js
git commit -m "feat(features): the '# Changed by' revision mark and '- Revision:' sources"
```

### Task 4: Plan validator — plans that supersede for a revision

**Files:**
- Modify: `skills/kartograph-plan/validate-plan.js`
- Modify: `skills/kartograph-plan/plan-template.md`
- Test: `test/validate-plan.test.js`

**Interfaces:**
- Consumes: the revision path shape from Task 1.
- Produces: `FRONTMATTER_KEYS` ends with the optional `revision`; `OPTIONAL_KEYS`, `REVISED`; the task field `**Revised:** changed|added`; `tasksOf(text: string) → { ring: 1|2|3, name: string, done: boolean }[]`; inside a project, `validatePlanFile` compares a revision plan with the plan it supersedes.

- [ ] **Step 1: Write the failing tests**

In `test/validate-plan.test.js`, replace:

```js
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
```

with:

```js
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
```

Then append to `test/validate-plan.test.js` (it already defines `valid`, `screenTask`, `domainTask`, `S1`, `S2`, `FILE`):

```js
// --- plans written by kartograph-revise ------------------------------------------

const REVISION = "kartograph/2026-09-25-1000-archive-undo.revision.md";
const OLD = "plans/2026-09-18-1100-project-archiving.md";
const NEW_FILE = "plans/2026-09-25-1000-project-archiving.md";
const tick = (text) => text.replace(/- \[ \] \*\*Step/g, "- [x] **Step");
// The revision changed the screen; the two domain tasks and the adapter are untouched.
const revisedPlan = valid
  .replace("date: 2026-09-18\nsupersedes: none", `date: 2026-09-25\nsupersedes: ${OLD}\nrevision: ${REVISION}`)
  .replace(`**Scenarios:** ${S1}; ${S2}\n`, `**Scenarios:** ${S1}; ${S2}\n**Revised:** changed\n`);

test("a revision plan names its revision, supersedes a plan, and marks what it revised", () => {
  assert.deepEqual(validatePlan(revisedPlan, { filename: NEW_FILE }).errors, []);
  assert.ok(validatePlan(revisedPlan.replace(`supersedes: ${OLD}`, "supersedes: none"), { filename: NEW_FILE }).errors.some((e) => /supersedes cannot be 'none'/.test(e)));
  assert.ok(validatePlan(revisedPlan.replace(REVISION, "kartograph/undo.md"), { filename: NEW_FILE }).errors.some((e) => /revision must be a kartograph\//.test(e)));
  assert.ok(validatePlan(revisedPlan.replace("**Revised:** changed", "**Revised:** yes"), { filename: NEW_FILE }).errors.some((e) => /'\*\*Revised:\*\*' is changed or added, got 'yes'/.test(e)));
  assert.ok(validatePlan(revisedPlan.replace("**Revised:** changed\n", ""), { filename: NEW_FILE }).errors.some((e) => /names a revision but marks no task/.test(e)));
  assert.ok(validatePlan(revisedPlan.replace(`revision: ${REVISION}\n`, ""), { filename: NEW_FILE }).errors.some((e) => /the frontmatter names no revision/.test(e)));
  assert.deepEqual(validatePlan(valid, { filename: FILE }).errors, [], "a plan without revision needs no revision key");
});

test("against the superseded plan, an unrevised task keeps its ticks and a new task is marked added", (t) => {
  const root = mkdtempSync(join(tmpdir(), "karto-plan-revision-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "plans")); mkdirSync(join(root, "kartograph"));
  // Rings 1 and 2 were built under the old plan.
  const built = valid.replace(screenTask, tick(screenTask)).replace(domainTask(1, S1), tick(domainTask(1, S1))).replace(domainTask(2, S2), tick(domainTask(2, S2))).replace("status: planned", "status: superseded");
  writeFileSync(join(root, OLD), built);
  const path = join(root, NEW_FILE);
  // The revised screen task is unticked, the untouched domain tasks keep their ticks.
  const good = revisedPlan.replace(domainTask(1, S1), tick(domainTask(1, S1))).replace(domainTask(2, S2), tick(domainTask(2, S2)));
  writeFileSync(path, good);
  assert.ok(validatePlanFile(path).errors.some((e) => /revision 'kartograph\/2026-09-25-1000-archive-undo\.revision\.md' does not exist/.test(e)));
  writeFileSync(join(root, REVISION), "---\ntype: Revision\n---\n");
  assert.deepEqual(validatePlanFile(path).errors, []);
  writeFileSync(path, revisedPlan);
  assert.ok(validatePlanFile(path).errors.some((e) => new RegExp(`task '${S1}' \\(ring 2\\) was built under the superseded plan`).test(e)));
  writeFileSync(path, good.replace(`### Task 3.1: ProjectRepository over Room`, "### Task 3.1: ProjectRepository over SQLite"));
  assert.ok(validatePlanFile(path).errors.some((e) => /task 'ProjectRepository over SQLite' \(ring 3\) is not in the superseded plan; mark it '\*\*Revised:\*\* added'/.test(e)));
  writeFileSync(path, good.replace(`supersedes: ${OLD}`, "supersedes: plans/2026-09-01-0900-project-archiving.md"));
  assert.ok(validatePlanFile(path).errors.some((e) => /supersedes 'plans\/2026-09-01-0900-project-archiving\.md', which does not exist/.test(e)));
});

test("the template's note on revision plans leaves a filled plan valid", () => {
  const tpl = readFileSync(new URL("../skills/kartograph-plan/plan-template.md", import.meta.url), "utf8");
  const note = /<!-- A plan kartograph-revise writes[\s\S]*?-->/.exec(tpl)?.[0];
  assert.ok(note, "plan-template.md explains the revision line and the Revised marks");
  assert.deepEqual(validatePlan(valid.replace("---\n\n# Plan:", `---\n\n${note}\n\n# Plan:`), { filename: FILE }).errors, []);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/validate-plan.test.js`
Expected: FAIL — `✖ a revision plan names its revision, supersedes a plan, and marks what it revised`, `✖ against the superseded plan, an unrevised task keeps its ticks and a new task is marked added`, `✖ the template's note on revision plans leaves a filled plan valid`; the 11 existing tests pass.

- [ ] **Step 3: Implement the validator**

In `skills/kartograph-plan/validate-plan.js`, replace:

```js
// the structure of `plan-template.md`, carries no placeholders, and — inside a project —
// names only scenarios that exist in features/ and a stack declared in docs/code-design/.
```

with:

```js
// the structure of `plan-template.md`, carries no placeholders, and — inside a project —
// names only scenarios that exist in features/ and a stack declared in docs/code-design/.
// A plan kartograph-revise writes names its revision, marks each task the revision changed
// or added, and keeps the ticks of every other task the superseded plan had built.
```

In `skills/kartograph-plan/validate-plan.js`, replace:

```js
export const FRONTMATTER_KEYS = ["capability", "features", "stack", "status", "date", "supersedes"];
```

with:

```js
export const FRONTMATTER_KEYS = ["capability", "features", "stack", "status", "date", "supersedes", "revision"];
// Only a plan written by kartograph-revise carries `revision`.
export const OPTIONAL_KEYS = new Set(["revision"]);
export const REVISED = ["changed", "added"];
const REVISION_PATH = /^kartograph\/\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.revision\.md$/;
```

In `skills/kartograph-plan/validate-plan.js`, replace:

```js
  for (const k of FRONTMATTER_KEYS) if (!(k in fm)) err(`frontmatter is missing '${k}'`);
```

with:

```js
  for (const k of FRONTMATTER_KEYS) if (!OPTIONAL_KEYS.has(k) && !(k in fm)) err(`frontmatter is missing '${k}'`);
```

In `skills/kartograph-plan/validate-plan.js`, replace:

```js
  if (fm.supersedes !== undefined && fm.supersedes !== "none" && !/^plans\/\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9-]+\.md$/.test(fm.supersedes)) err(`supersedes must be 'none' or a plans/<file>.md path, got '${fm.supersedes}'`);
```

with:

```js
  if (fm.supersedes !== undefined && fm.supersedes !== "none" && !/^plans\/\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9-]+\.md$/.test(fm.supersedes)) err(`supersedes must be 'none' or a plans/<file>.md path, got '${fm.supersedes}'`);
  if (fm.revision !== undefined) {
    if (!REVISION_PATH.test(fm.revision)) err(`revision must be a kartograph/YYYY-MM-DD-HHMM-<slug>.revision.md path, got '${fm.revision}'`);
    if (fm.supersedes === "none") err("a plan written for a revision supersedes the plan it revises; supersedes cannot be 'none'");
  }
```

In `skills/kartograph-plan/validate-plan.js`, replace:

```js
  return { name, fields, done: steps.length > 0 && steps.every((s) => /^- \[x\]/.test(s[0])), steps: steps.length };
```

with:

```js
  if (fields.Revised !== undefined && !REVISED.includes(fields.Revised)) err(`${label}: '**Revised:**' is ${REVISED.join(" or ")}, got '${fields.Revised}'`);
  return { name, fields, done: steps.length > 0 && steps.every((s) => /^- \[x\]/.test(s[0])), steps: steps.length };
```

In `skills/kartograph-plan/validate-plan.js`, replace:

```js
  // ring 3 ↔ ports table
```

with:

```js
  // a revision plan marks what it revised, and only a revision plan does
  const revised = [1, 2, 3].flatMap((n) => rings[n].filter((r) => r.fields.Revised !== undefined));
  if (fm.revision !== undefined && !revised.length) err("the plan names a revision but marks no task '**Revised:** changed' or '**Revised:** added'");
  if (fm.revision === undefined && revised.length) err(`'**Revised:**' marks task '${revised[0].name}', but the frontmatter names no revision`);
  // ring 3 ↔ ports table
```

In `skills/kartograph-plan/validate-plan.js`, replace:

```js
  if (projectRoot) {
    const stackFile = join(projectRoot, "docs", "code-design", "stack.md");
```

with:

```js
  if (projectRoot && fm.revision !== undefined && REVISION_PATH.test(fm.revision)) {
    if (!existsSync(join(projectRoot, fm.revision))) err(`revision '${fm.revision}' does not exist`);
    const old = fm.supersedes && fm.supersedes !== "none" ? join(projectRoot, fm.supersedes) : null;
    if (old && !existsSync(old)) err(`supersedes '${fm.supersedes}', which does not exist`);
    else if (old) {
      const before = tasksOf(readFileSync(old, "utf8"));
      for (const n of [1, 2, 3]) for (const r of rings[n]) {
        if (r.fields.Revised !== undefined) continue;
        const was = before.find((b) => b.ring === n && b.name === r.name);
        if (!was) err(`task '${r.name}' (ring ${n}) is not in the superseded plan; mark it '**Revised:** added'`);
        else if (was.done && !r.done) err(`task '${r.name}' (ring ${n}) was built under the superseded plan and is not revised, so its checkboxes stay ticked`);
      }
    }
  }
  if (projectRoot) {
    const stackFile = join(projectRoot, "docs", "code-design", "stack.md");
```

In `skills/kartograph-plan/validate-plan.js`, replace:

```js
export function validatePlanFile(path, { projectRoot } = {}) {
```

with:

```js
// The tasks of a plan, per ring, with whether all their steps are ticked. Used to compare a
// revision plan with the plan it supersedes.
export function tasksOf(text) {
  const out = [];
  for (const s of outline(splitFrontmatter(text).body).sections) {
    const ring = RINGS[s.name]; if (!ring) continue;
    for (const t of s.tasks) {
      const m = /^Task \d+\.\d+: (.+)$/.exec(t.title); if (!m) continue;
      const steps = [...t.lines.join("\n").matchAll(/^- \[([ x])\] \*\*Step \d+:/gm)];
      out.push({ ring, name: m[1].trim(), done: steps.length > 0 && steps.every((x) => x[1] === "x") });
    }
  }
  return out;
}

export function validatePlanFile(path, { projectRoot } = {}) {
```

- [ ] **Step 4: Add the note to the template**

In `skills/kartograph-plan/plan-template.md`, replace:

```markdown
supersedes: <plans/<earlier file>.md, or none>
---
```

with:

```markdown
supersedes: <plans/<earlier file>.md, or none>
---

<!-- A plan kartograph-revise writes adds one last frontmatter line after supersedes,
     revision: kartograph/YYYY-MM-DD-HHMM-slug.revision.md, and marks every task the
     revision rewrote or added with a line **Revised:** changed or **Revised:** added
     below the task's first field lines, all its checkboxes unticked. Every other task
     keeps the checkboxes it had in the superseded plan. validate-plan.js checks that. -->
```

- [ ] **Step 5: Run them to verify they pass**

Run: `node --test test/validate-plan.test.js`
Expected: PASS — `ℹ tests 14`, `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add skills/kartograph-plan/validate-plan.js skills/kartograph-plan/plan-template.md test/validate-plan.test.js
git commit -m "feat(plan): revision plans keep the ticks of work already built"
```

### Task 5: `release-check.sh` — contract first, then the script

**Files:**
- Modify: `stacks/common/DISTRIBUTION.md`
- Create: `stacks/kmp/distribution/release-check.sh`, copied byte for byte to `stacks/kmp-toolchain/distribution/`, `stacks/apple-swift/distribution/`, `stacks/android-compose/distribution/`
- Modify: `stacks/kmp/STACK.md`, `stacks/kmp-toolchain/STACK.md`, `stacks/apple-swift/STACK.md`, `stacks/android-compose/STACK.md`
- Test: `test/distribution.test.js`

**Interfaces:**
- Consumes: `load_config`, `usage_exit`, `log`, `die`, `require_var` (`common.sh`); `asc_get` (`asc.sh`); `play_track_versions` (`play.sh`).
- Produces: `distribution/release-check.sh [--apple] [--play]` — one line per lane (`ios: tested 1.3.0 (42), on sale 1.2.0 — newer`, `android: internal versionCode 57, production 53 — newer`), then `release X.Y.Z` when an Apple lane named it; exit 0 every lane ahead, 1 not, 2 no store lane.

- [ ] **Step 1: The contract**

In `stacks/common/DISTRIBUTION.md`, replace:

```markdown
  release-notes/vX.Y.Z.md   one file per release, written by prepare-release.sh
```

with:

```markdown
  release-notes/vX.Y.Z.md   one file per release, the one place its notes live: written by prepare-release.sh
                            (or notes_write), its store slices filled by kartograph-release
```

In `stacks/common/DISTRIBUTION.md`, replace:

```markdown
| `release-stores.sh [--apple] [--play] [--rollout F] --notes FILE` |
```

with:

```markdown
| `release-check.sh [--apple] [--play]` | ✓ | ✓ | ✓ | play only | – | – | reads, never writes: the newest processed TestFlight build per Apple platform against the version on sale, the internal track's highest versionCode against production's; prints one line per lane and `release X.Y.Z`; exit 0 when every lane is ahead, 1 when a new build is needed first |
| `release-stores.sh [--apple] [--play] [--rollout F] --notes FILE` |
```

- [ ] **Step 2: Write the failing tests**

In `test/distribution.test.js`, replace:

```js
  kmp: ["run-local.sh", "run-device.sh", "prepare-release.sh", "deploy-testflight.sh", "deploy-play-internal.sh", "push-store-metadata.sh", "release-stores.sh"],
  "kmp-toolchain": ["run-local.sh", "run-device.sh", "prepare-release.sh", "deploy-testflight.sh", "deploy-play-internal.sh", "push-store-metadata.sh", "release-stores.sh"],
  "apple-swift": ["run-local.sh", "run-device.sh", "prepare-release.sh", "deploy-testflight.sh", "push-store-metadata.sh", "release-stores.sh"],
  "android-compose": ["run-local.sh", "prepare-release.sh", "deploy-play-internal.sh", "push-store-metadata.sh", "release-stores.sh"],
```

with:

```js
  kmp: ["run-local.sh", "run-device.sh", "prepare-release.sh", "deploy-testflight.sh", "deploy-play-internal.sh", "push-store-metadata.sh", "release-check.sh", "release-stores.sh"],
  "kmp-toolchain": ["run-local.sh", "run-device.sh", "prepare-release.sh", "deploy-testflight.sh", "deploy-play-internal.sh", "push-store-metadata.sh", "release-check.sh", "release-stores.sh"],
  "apple-swift": ["run-local.sh", "run-device.sh", "prepare-release.sh", "deploy-testflight.sh", "push-store-metadata.sh", "release-check.sh", "release-stores.sh"],
  "android-compose": ["run-local.sh", "prepare-release.sh", "deploy-play-internal.sh", "push-store-metadata.sh", "release-check.sh", "release-stores.sh"],
```

Then append to `test/distribution.test.js` (it already defines `root`, `tmp`, `stacks` and imports `execFileSync`, `spawnSync`, `mkdirSync`, `writeFileSync`, `existsSync`, `readFileSync`, `join`):

```js
// --- release-check.sh and the screenshot documents kartograph-release reads -------

test("release-check.sh prints its usage, and exits 2 with a sentence when no store lane ships", () => {
  const dir = tmp("release-check-");
  mkdirSync(join(dir, "distribution"));
  execFileSync("cp", ["-R", join(root, "stacks/common/distribution/lib"), join(dir, "distribution/lib")]);
  execFileSync("cp", [join(root, "stacks/kmp/distribution/release-check.sh"), join(dir, "distribution/")]);
  writeFileSync(join(dir, "distribution/config.sh"), 'LANES="docker"\n');
  const help = spawnSync("bash", [join(dir, "distribution/release-check.sh"), "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stderr, /release-check\.sh \[--apple\] \[--play\]/);
  const none = spawnSync("bash", [join(dir, "distribution/release-check.sh")], { encoding: "utf8" });
  assert.equal(none.status, 2);
  assert.match(none.stderr, /ships neither an Apple nor a Play lane/);
});

test("release-check.sh compares versions numerically; nothing on sale is older than any version", () => {
  const script = join(root, "stacks/kmp/distribution/release-check.sh");
  const newer = (a, b) => spawnSync("bash", ["-c", `eval "$(sed -n '/^newer() {/,/^}/p' '${script}')"; newer '${a}' '${b}'`]).status === 0;
  assert.ok(newer("1.10.0", "1.9.0"));
  assert.ok(newer("2.0.0", "1.99.99"));
  assert.ok(newer("1.0.0", ""));
  assert.ok(!newer("1.2.0", "1.2.0"));
  assert.ok(!newer("1.2.0", "1.3.0"));
  assert.ok(!newer("", "1.0.0"));
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `node --test test/distribution.test.js`
Expected: FAIL — `✖ every stack ships its entry scripts and a config template` (`kmp lacks release-check.sh`), `✖ release-check.sh prints its usage, and exits 2 …`, `✖ release-check.sh compares versions numerically …`.

- [ ] **Step 4: Write the script**

Create `stacks/kmp/distribution/release-check.sh` with exactly this content:

```bash
#!/usr/bin/env bash
# release-check.sh [--apple] [--play]
#
# Reads, never writes: is the build that was tested newer than what the stores sell?
#   apple  per Apple platform in LANES, the newest processed build (its marketing version
#          and build number) against the version on sale; every platform must carry the
#          same tested version, since one release ships one version.
#   play   the highest versionCode on the internal track against the highest on production.
# Prints one line per lane, then `release X.Y.Z` when an Apple lane named the version.
# Exit 0: every lane is ahead of the store. Exit 1: a lane is not; a new build is needed
# first and there is nothing to release. Exit 2: the project ships no store lane.
# A build attaches only to the App Store version whose versionString equals the build's
# marketing version, so a release ships the tested build's number; it never renames it.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/lib/common.sh"
case "${1:-}" in --help|-h) usage_exit "${BASH_SOURCE[0]}" ;; esac
load_config
apple=0; play=0
while [ $# -gt 0 ]; do
  case "$1" in
    --apple) apple=1 ;; --play) play=1 ;;
    *) die "unknown option $1" 2 ;;
  esac; shift
done
has_lane() { case " ${LANES:-} " in *" $1 "*) return 0 ;; esac; return 1; }
if [ "$apple" = 0 ] && [ "$play" = 0 ]; then
  { has_lane ios || has_lane mac; } && apple=1
  has_lane android && play=1
fi
if [ "$apple" = 0 ] && [ "$play" = 0 ]; then
  printf '%s\n' "This project ships neither an Apple nor a Play lane (LANES=\"${LANES:-}\" in ${CONFIG_FILE}). Nothing to release." >&2
  exit 2
fi

# newer A B: 0 when version A is strictly greater than B; an empty B (nothing on sale yet)
# is older than anything. Both are X.Y.Z.
newer() {
  [ -n "$1" ] || return 1
  [ -n "$2" ] || return 0
  [ "$1" != "$2" ] || return 1
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)" = "$1" ]
}

ahead=1; release=""
if [ "$apple" = 1 ]; then
  . "$HERE/lib/asc.sh"
  require_var ASC_APP_ID ASC_KEY_ID ASC_ISSUER_ID
  for platform in IOS MAC_OS; do
    case "$platform" in IOS) has_lane ios || continue; lane=ios ;; MAC_OS) has_lane mac || continue; lane=mac ;; esac
    # The build's attributes.version is its build number; the marketing version lives on
    # the related preReleaseVersion, so it is included and read from there.
    builds="$(asc_get /builds "filter[app]=$ASC_APP_ID&filter[processingState]=VALID&filter[preReleaseVersion.platform]=$platform&sort=-uploadedDate&limit=1&include=preReleaseVersion")"
    read -r tested build <<<"$(printf '%s' "$builds" | python3 -c '
import json, sys
d = json.load(sys.stdin)
if not d.get("data"):
    print("- -"); sys.exit(0)
b = d["data"][0]
rel = ((b.get("relationships") or {}).get("preReleaseVersion") or {}).get("data") or {}
pre = {i["id"]: i for i in d.get("included", []) if i.get("type") == "preReleaseVersions"}
v = pre.get(rel.get("id"), {}).get("attributes", {}).get("version", "")
parts = (v.split(".") + ["0", "0"])[:3] if v else []
print((".".join(parts) if parts else "-"), b["attributes"].get("version") or "-")
')"
    versions="$(asc_get "/apps/$ASC_APP_ID/appStoreVersions" "filter[platform]=$platform&limit=50")"
    # Older responses call the state appStoreState, newer ones appVersionState.
    live="$(printf '%s' "$versions" | python3 -c '
import json, sys
d = json.load(sys.stdin)
on_sale = {"READY_FOR_SALE", "READY_FOR_DISTRIBUTION"}
found = []
for v in d.get("data", []):
    a = v["attributes"]
    if (a.get("appStoreState") or a.get("appVersionState")) not in on_sale:
        continue
    parts = (a.get("versionString", "").split(".") + ["0", "0"])[:3]
    if all(p.isdigit() for p in parts):
        found.append(tuple(int(p) for p in parts))
print(".".join(map(str, max(found))) if found else "")
')"
    if [ "$tested" = "-" ]; then
      printf '%s: no processed build on TestFlight — not newer\n' "$lane"; ahead=0; continue
    fi
    if newer "$tested" "$live"; then
      printf '%s: tested %s (%s), on sale %s — newer\n' "$lane" "$tested" "$build" "${live:-none}"
    else
      printf '%s: tested %s (%s), on sale %s — not newer\n' "$lane" "$tested" "$build" "${live:-none}"; ahead=0
    fi
    if [ -n "$release" ] && [ "$release" != "$tested" ]; then
      printf '%s: tests %s, but another Apple platform tests %s — one release ships one version\n' "$lane" "$tested" "$release"; ahead=0
    fi
    release="$tested"
  done
fi

if [ "$play" = 1 ]; then
  . "$HERE/lib/play.sh"
  require_var PLAY_PACKAGE_NAME
  internal="$(play_track_versions internal | head -1)"
  production="$(play_track_versions production | head -1)"
  if [ -z "$internal" ]; then
    printf 'android: nothing on the internal track — not newer\n'; ahead=0
  elif [ -n "$production" ] && [ "$internal" -le "$production" ]; then
    printf 'android: internal versionCode %s, production %s — not newer\n' "$internal" "$production"; ahead=0
  else
    printf 'android: internal versionCode %s, production %s — newer\n' "$internal" "${production:-none}"
  fi
fi

[ -n "$release" ] && printf 'release %s\n' "$release"
if [ "$ahead" = 1 ]; then exit 0; fi
log "not every lane is ahead of the store: a new build is needed first; nothing to release"
exit 1
```

Then copy it and keep it executable:

```bash
chmod +x stacks/kmp/distribution/release-check.sh
for s in kmp-toolchain apple-swift android-compose; do cp -p stacks/kmp/distribution/release-check.sh stacks/$s/distribution/; done
```

- [ ] **Step 5: Name it in each stack's Delivery section**

In `stacks/kmp/STACK.md`, replace:

```markdown
push-store-metadata.sh, release-stores.sh
```

with:

```markdown
push-store-metadata.sh, release-check.sh, release-stores.sh
```

In `stacks/kmp-toolchain/STACK.md`, replace:

```markdown
push-store-metadata.sh, release-stores.sh
```

with:

```markdown
push-store-metadata.sh, release-check.sh, release-stores.sh
```

In `stacks/apple-swift/STACK.md`, replace:

```markdown
push-store-metadata.sh, release-stores.sh
```

with:

```markdown
push-store-metadata.sh, release-check.sh, release-stores.sh
```

In `stacks/android-compose/STACK.md`, replace:

```markdown
push-store-metadata.sh, release-stores.sh
```

with:

```markdown
push-store-metadata.sh, release-check.sh, release-stores.sh
```

- [ ] **Step 6: Run them to verify they pass**

Run: `node --test test/distribution.test.js`
Expected: PASS — `ℹ fail 0` (the byte-identity, strict-mode, `bash -n`, no-literal and library-only tests cover the new script too).

- [ ] **Step 7: Commit**

```bash
git add stacks/common/DISTRIBUTION.md stacks/*/distribution/release-check.sh stacks/kmp/STACK.md stacks/kmp-toolchain/STACK.md stacks/apple-swift/STACK.md stacks/android-compose/STACK.md test/distribution.test.js
git commit -m "feat(deliver): release-check.sh reads whether the tested build is newer than the store"
```

### Task 6: `screenshots.md` for every store stack

**Files:**
- Create: `stacks/kmp/screenshots.md`, `stacks/kmp-toolchain/screenshots.md`, `stacks/apple-swift/screenshots.md`, `stacks/android-compose/screenshots.md`
- Modify: the same four `STACK.md` files
- Test: `test/distribution.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: per store stack a document with exactly the sections `## 1. Where the renderer lives`, `## 2. Devices and sizes`, `## 3. Seed`, `## 4. Run`, `## 5. Output`; `UNFILLED` in each section of a scaffold, nowhere in a ready stack. Release reads section 1–4 to build and run a renderer and section 5 for the output layout `distribution/build/screenshots/<locale>/<displayType>/<NN>-<screen>.png`.

- [ ] **Step 1: Write the failing test**

Append to `test/distribution.test.js`:

```js
const SCREENSHOT_SECTIONS = ["1. Where the renderer lives", "2. Devices and sizes", "3. Seed", "4. Run", "5. Output"];

test("every stack that releases to a store documents its screenshot renderer in screenshots.md", () => {
  for (const stack of stacks) {
    if (!existsSync(join(root, "stacks", stack, "distribution/release-stores.sh"))) continue;
    const file = join(root, "stacks", stack, "screenshots.md");
    assert.ok(existsSync(file), `${stack} lacks screenshots.md`);
    const text = readFileSync(file, "utf8");
    assert.deepEqual([...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]), SCREENSHOT_SECTIONS, `${stack}/screenshots.md sections`);
    const status = /^status: (\w+)$/m.exec(readFileSync(join(root, "stacks", stack, "STACK.md"), "utf8"))[1];
    text.split(/^## .+$/m).slice(1).forEach((body, i) => {
      if (status === "scaffold") assert.match(body, /UNFILLED/, `${stack}: '${SCREENSHOT_SECTIONS[i]}' needs an UNFILLED marker`);
      else assert.doesNotMatch(body, /UNFILLED/, `${stack}: '${SCREENSHOT_SECTIONS[i]}' is unfilled in a ready stack`);
    });
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/distribution.test.js`
Expected: FAIL — `✖ every stack that releases to a store documents its screenshot renderer in screenshots.md` (`kmp lacks screenshots.md`).

- [ ] **Step 3: Write the four documents**

Create `stacks/kmp/screenshots.md` with exactly this content:

````markdown
# Store screenshots — Kotlin Multiplatform

`kartograph-release` reads this file once, when a project has no screenshot renderer yet,
and builds the renderer from it; from then on the renderer in the project's test code is
the truth. The rules are the owner's (knowledge repo ASC13, ASC14, GP5); the shape is the
renderer shipped in the owner's Longpath app. Lines neither says anything about are marked
*stack default*.

## 1. Where the renderer lives

`StoreScreenshotRenderer` in the JVM test source set of the module that holds the app's
root composable (`shared/src/jvmTest/kotlin/<package>/`, or `desktopTest` where the project
names the JVM target that way), with `implementation(compose.uiTest)` in that source set's
dependencies. It is not a test but a generator that needs the Compose test harness
(`runDesktopComposeUiTest`), the only way to drive the whole app headless. It renders the
shared Compose UI, never the running app and never a simulator (ASC13): a pixel-accurate
render of the same UI code, not a photograph.

It stays inert unless `-Dstore.screenshots=true` is given, so a normal test run neither
renders nor writes. Gradle does not forward `-D` from the daemon to the test JVM, so the
module's `build.gradle.kts` passes the three properties through:

```kotlin
// StoreScreenshotRenderer renders the store screenshots from the shared UI (ASC13).
tasks.withType<Test>().configureEach {
    listOf("store.screenshots", "store.screenshots.out", "store.screenshots.locale").forEach { key ->
        System.getProperty(key)?.let { systemProperty(key, it) }
    }
}
```

A project whose iOS app is native SwiftUI over the shared framework renders its iPhone and
iPad shots the way `stacks/apple-swift/screenshots.md` describes; this renderer then covers
only the Compose targets.

## 2. Devices and sizes

Each device renders at its true pixel size with the matching `LocalDensity`, so the
composition sees the logical size the device reports and nothing is upscaled (ASC13):

| display type | pixels | density | logical size | lane |
|---|---|---|---|---|
| `APP_IPHONE_67` | 1320 × 2868 | 3 | 440 × 956 dp | ios |
| `APP_IPAD_PRO_3GEN_129` | 2064 × 2752 | 2 | 1032 × 1376 dp | ios |
| `APP_DESKTOP` | 2880 × 1800 | 2 | 1440 × 900 dp | mac |

There is no `APP_IPHONE_69`: the 6.9-inch iPhone files under `APP_IPHONE_67`. Render only
the rows whose lane is in `LANES`. Play reuses these images (GP5): the release copies the
iPhone set to `phoneScreenshots` and the iPad set to `tenInchScreenshots`, and renders
nothing for Play.

## 3. Seed

The renderer composes the app's root composable with the same composition the demo flag
uses: the in-memory repositories ring 2 left behind the flag, constructed directly and
seeded with a history whose dates are computed from today (`Clock.System.todayIn(…)`),
never fixed dates. A history that stops yesterday renders "nothing today" nudges and zeroed
headers, which do not belong in a store screenshot (ASC14). Onboarding and first-run hints
are marked seen in the seed. One `Shot` per store screenshot: a slug, the destination to
open, and the state that makes the screen worth showing.

```kotlin
@OptIn(ExperimentalTestApi::class)
class StoreScreenshotRenderer {
    private data class Device(val displayType: String, val widthPx: Int, val heightPx: Int, val density: Float)
    private data class Shot(val slug: String, val destination: Destination)

    private val devices = listOf(
        Device("APP_IPHONE_67", 1320, 2868, 3f),
        Device("APP_IPAD_PRO_3GEN_129", 2064, 2752, 2f),
    )
    private val shots = listOf(
        Shot("01-overview", Destination.Overview),
    )

    @Test
    fun renderStoreScreenshots() {
        if (System.getProperty("store.screenshots") != "true") return
        val out = File(System.getProperty("store.screenshots.out") ?: "distribution/build/screenshots")
        val locale = System.getProperty("store.screenshots.locale") ?: "en-US"
        Locale.setDefault(Locale.forLanguageTag(locale))
        for (device in devices) for (shot in shots) {
            runDesktopComposeUiTest(width = device.widthPx, height = device.heightPx) {
                setContent {
                    CompositionLocalProvider(LocalDensity provides Density(device.density)) {
                        App(start = shot.destination, repositories = seededToToday())
                    }
                }
                waitForIdle()
                val png = SkiaImage.makeFromBitmap(onRoot().captureToImage().asSkiaBitmap()).encodeToData()
                    ?: error("could not encode ${device.displayType}/${shot.slug}")
                val file = File(out, "$locale/${device.displayType}/${shot.slug}.png")
                file.parentFile.mkdirs()
                file.writeBytes(png.bytes)
                println("rendered ${file.path} (${device.widthPx}×${device.heightPx})")
            }
        }
    }
}
```

`App(start = …, repositories = …)` stands for the project's root composable and whatever
it takes to start on a destination over given repositories; where it takes neither, the
renderer adds that seam to the composable's parameters with defaults, so the app itself is
unchanged. Setting the default `Locale` per run is a *stack default*: Compose resources
resolve strings from it.

## 4. Run

One run per locale in `LOCALES`, from the directory holding `gradlew`:

```bash
./gradlew :shared:jvmTest --tests '*StoreScreenshotRenderer*' \
  -Dstore.screenshots=true \
  -Dstore.screenshots.out="$PWD/distribution/build/screenshots" \
  -Dstore.screenshots.locale=en-US
```

The module path is the one holding the renderer. A red run is a failed render, never a
reason to weaken the renderer.

## 5. Output

`distribution/build/screenshots/<locale>/<displayType>/<NN>-<screen>.png` (gitignored with
the rest of `distribution/build/`). The two-digit prefix is the order in the store. The
release copies the shots of the screens that changed into
`distribution/store/apple/screenshots/<locale>/<displayType>/` and, for Play, into
`distribution/store/play/screenshots/<locale>/phoneScreenshots/` and `tenInchScreenshots/`,
where `push-store-metadata.sh --screenshots` uploads them.
````

Create `stacks/kmp-toolchain/screenshots.md` with exactly this content:

````markdown
# Store screenshots — Kotlin Multiplatform on the Kotlin Toolchain

`kartograph-release` reads this file once, when a project has no screenshot renderer yet,
and builds the renderer from it; from then on the renderer in the project's test code is
the truth. The renderer is the `kmp` stack's (`stacks/kmp/screenshots.md`, from the owner's
knowledge repo ASC13, ASC14, GP5 and the Longpath app); what the Kotlin Toolchain forces
is marked *Toolchain departure*. **None of this was exercised hands-on on the Toolchain**:
run the renderer once by hand before relying on it.

## 1. Where the renderer lives

`StoreScreenshotRenderer` in the JVM test folder of the module that holds the app's root
composable (`shared/test@jvm/…`), with the Compose UI test artifact of the project's Compose
version (`org.jetbrains.compose.ui:ui-test`) under that module's `test-dependencies@jvm:` in
`module.yaml`. It is a generator that needs the Compose test harness
(`runDesktopComposeUiTest`), not a test; it renders the shared Compose UI, which is also
what the Compose-UI iOS app shows, never the running app and never a simulator (ASC13).

*Toolchain departure:* there is no build script to forward `-D` properties to the test
JVM, so the renderer reads environment variables instead: it stays inert unless
`STORE_SCREENSHOTS_OUT` is set, and takes the locale from `STORE_SCREENSHOTS_LOCALE`.

## 2. Devices and sizes

Each device renders at its true pixel size with the matching `LocalDensity` (ASC13):

| display type | pixels | density | logical size | lane |
|---|---|---|---|---|
| `APP_IPHONE_67` | 1320 × 2868 | 3 | 440 × 956 dp | ios |
| `APP_IPAD_PRO_3GEN_129` | 2064 × 2752 | 2 | 1032 × 1376 dp | ios |
| `APP_DESKTOP` | 2880 × 1800 | 2 | 1440 × 900 dp | mac |

There is no `APP_IPHONE_69`. Render only the rows whose lane is in `LANES`. Play reuses
these images (GP5): the iPhone set becomes `phoneScreenshots`, the iPad set
`tenInchScreenshots`.

## 3. Seed

As in `kmp`: the app's root composable over the in-memory repositories the demo flag
selects, constructed directly and seeded with a history whose dates are computed from
today, onboarding marked seen (ASC14). One `Shot` per store screenshot.

```kotlin
@OptIn(ExperimentalTestApi::class)
class StoreScreenshotRenderer {
    private data class Device(val displayType: String, val widthPx: Int, val heightPx: Int, val density: Float)
    private data class Shot(val slug: String, val destination: Destination)

    private val devices = listOf(
        Device("APP_IPHONE_67", 1320, 2868, 3f),
        Device("APP_IPAD_PRO_3GEN_129", 2064, 2752, 2f),
    )
    private val shots = listOf(
        Shot("01-overview", Destination.Overview),
    )

    @Test
    fun renderStoreScreenshots() {
        val outDir = System.getenv("STORE_SCREENSHOTS_OUT") ?: return
        val locale = System.getenv("STORE_SCREENSHOTS_LOCALE") ?: "en-US"
        Locale.setDefault(Locale.forLanguageTag(locale))
        for (device in devices) for (shot in shots) {
            runDesktopComposeUiTest(width = device.widthPx, height = device.heightPx) {
                setContent {
                    CompositionLocalProvider(LocalDensity provides Density(device.density)) {
                        App(start = shot.destination, repositories = seededToToday())
                    }
                }
                waitForIdle()
                val png = SkiaImage.makeFromBitmap(onRoot().captureToImage().asSkiaBitmap()).encodeToData()
                    ?: error("could not encode ${device.displayType}/${shot.slug}")
                val file = File(outDir, "$locale/${device.displayType}/${shot.slug}.png")
                file.parentFile.mkdirs()
                file.writeBytes(png.bytes)
                println("rendered ${file.path} (${device.widthPx}×${device.heightPx})")
            }
        }
    }
}
```

`App(start = …, repositories = …)` stands for the project's root composable and the seam
that starts it on a destination over given repositories; the renderer adds that seam with
defaults where it is missing, so the app itself is unchanged.

## 4. Run

One run per locale in `LOCALES`, from the directory holding `project.yaml`:

```bash
STORE_SCREENSHOTS_OUT="$PWD/distribution/build/screenshots" STORE_SCREENSHOTS_LOCALE=en-US \
  ./kotlin test -m shared -p jvm --include-classes '<package>.StoreScreenshotRenderer'
```

The module is the one holding the renderer. *Toolchain departure:* the test JVM inheriting
the environment of `./kotlin` is assumed, not checked.

## 5. Output

`distribution/build/screenshots/<locale>/<displayType>/<NN>-<screen>.png`, gitignored with
the rest of `distribution/build/`; the two-digit prefix is the store order. The release
copies the changed screens into `distribution/store/apple/screenshots/<locale>/<displayType>/`
and, for Play, into `distribution/store/play/screenshots/<locale>/phoneScreenshots/` and
`tenInchScreenshots/`.
````

Create `stacks/apple-swift/screenshots.md` with exactly this content:

````markdown
# Store screenshots — native Apple with Swift and SwiftUI

`kartograph-release` reads this file once, when a project has no screenshot renderer yet,
and builds the renderer from it; from then on the renderer in the project's test code is
the truth. The rule is the owner's (knowledge repo MAS10, the native lane of ASC13, with
ASC14 and GP5); the shape is the renderer shipped in the owner's Kikitori app. Lines those
sources are silent on are marked *stack default*.

## 1. Where the renderer lives

`StoreScreenshotRenderer.swift` in the macOS model-test bundle that compiles `App/Shared`
directly (`App/Tests/StoreScreenshots/`, `build-design.md` § 8). It renders the real
SwiftUI views headless (MAS10): an `NSHostingView` in an offscreen borderless `NSWindow`,
because materials need the window backing, captured with `cacheDisplay` into an
`NSBitmapImageRep` whose pixel dimensions are the logical size times the scale, because the
headless window itself is 1x. Never the running app, never a simulator or XCUITest (ASC13):
a pixel-accurate render of the same UI code, not a photograph.

It stays inert unless `RENDER_SCREENSHOTS` names an output directory. Swift Testing
expresses that as a trait (*project dial*: Kikitori used an `XCTestCase` with `XCTSkip`):

```swift
@MainActor
@Suite struct StoreScreenshotRenderer {
    static let outDir = ProcessInfo.processInfo.environment["RENDER_SCREENSHOTS"]

    @Test(.enabled(if: outDir != nil)) func renderStoreScreenshots() async throws { … }
}
```

The iPhone and iPad shots render the shared views on macOS at the iOS point size
(*stack default*): a view behind `#if os(iOS)` renders its macOS branch there, so a screen
that differs per platform is listed in the report as rendered from the shared code only.

## 2. Devices and sizes

| display type | pixels | scale | logical size | lane |
|---|---|---|---|---|
| `APP_IPHONE_67` | 1320 × 2868 | 3 | 440 × 956 pt | ios |
| `APP_IPAD_PRO_3GEN_129` | 2064 × 2752 | 2 | 1032 × 1376 pt | ios |
| `APP_DESKTOP` | 2880 × 1800 | 2 | 1440 × 900 pt | mac |

There is no `APP_IPHONE_69`. Render only the rows whose lane is in `LANES`. Play reuses
these images (GP5).

## 3. Seed

The renderer builds each screen's model over the doubles `AppEnvironment` binds under
`isUITest` and an in-memory `ModelContainer`, seeded with a history whose dates are
computed from `Date.now`, never fixed dates (ASC14). Presentation state (the destination,
a selection, a sheet) is set **after** any work the model's initialiser starts has run,
or it overwrites the staged values mid-render (MAS10): await the model's load, then stage.

```swift
private func render<V: View>(_ view: V, size: NSSize, scale: CGFloat, to url: URL) throws {
    let hosting = NSHostingView(rootView: view)
    hosting.frame = NSRect(origin: .zero, size: size)
    let window = NSWindow(contentRect: hosting.frame, styleMask: [.borderless], backing: .buffered, defer: false)
    window.contentView = hosting
    window.colorSpace = .sRGB
    window.orderBack(nil)
    defer { window.orderOut(nil) }
    hosting.layoutSubtreeIfNeeded()
    RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.3))
    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: Int(size.width * scale), pixelsHigh: Int(size.height * scale),
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .calibratedRGB, bytesPerRow: 0, bitsPerPixel: 0
    ) else { throw RenderError.noBitmap }
    rep.size = size
    hosting.cacheDisplay(in: hosting.bounds, to: rep)
    guard let png = rep.representation(using: .png, properties: [:]) else { throw RenderError.noPNG }
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try png.write(to: url)
}
```

## 4. Run

One run per locale in `LOCALES`; the locale reaches the views through
`.environment(\.locale, Locale(identifier: …))` on the rendered root, read from
`RENDER_SCREENSHOTS_LOCALE` (*stack default*). `xcodebuild` hands a test process only the
variables prefixed `TEST_RUNNER_` (*stack default*; Kikitori ran under `swift test`):

```bash
TEST_RUNNER_RENDER_SCREENSHOTS="$PWD/distribution/build/screenshots" \
TEST_RUNNER_RENDER_SCREENSHOTS_LOCALE=en-US \
xcodebuild -project <App>.xcodeproj -scheme <App>ModelTests -destination 'platform=macOS' \
  -only-testing:<App>ModelTests/StoreScreenshotRenderer test
```

A project generated by XcodeGen runs `xcodegen generate` first; never two `xcodebuild` runs
against the same derived data.

## 5. Output

`distribution/build/screenshots/<locale>/<displayType>/<NN>-<screen>.png`, gitignored with
the rest of `distribution/build/`; the two-digit prefix is the store order. The release
copies the changed screens into `distribution/store/apple/screenshots/<locale>/<displayType>/`
and, when the project also ships an Android lane, into
`distribution/store/play/screenshots/<locale>/phoneScreenshots/` and `tenInchScreenshots/`.
````

Create `stacks/android-compose/screenshots.md` with exactly this content:

```markdown
# Store screenshots — native Android with Jetpack Compose

UNFILLED — this stack is a scaffold. `kartograph-release` renders no screenshots for it
and says so; the store keeps the screenshots it has. Every section below must be written
from the owner's own conventions before the stack becomes `ready`, never from general
practice. The owner's rule GP5 (Play reuses the App Store screenshots) has nothing to reuse
in a project without an Apple lane, so this stack needs its own renderer.

## 1. Where the renderer lives

UNFILLED.

## 2. Devices and sizes

UNFILLED.

## 3. Seed

UNFILLED.

## 4. Run

UNFILLED.

## 5. Output

UNFILLED.
```

- [ ] **Step 4: Point each STACK.md at it**

In `stacks/kmp/STACK.md`, replace:

```markdown
Their contract is `stacks/common/DISTRIBUTION.md`.
```

with:

```markdown
Their contract is `stacks/common/DISTRIBUTION.md`.
`screenshots.md` beside this file is how `kartograph-release` builds the project's
store-screenshot renderer the first time.
```

In `stacks/kmp-toolchain/STACK.md`, replace:

```markdown
Their contract is `stacks/common/DISTRIBUTION.md`.
```

with:

```markdown
Their contract is `stacks/common/DISTRIBUTION.md`.
`screenshots.md` beside this file is how `kartograph-release` builds the project's
store-screenshot renderer the first time.
```

In `stacks/apple-swift/STACK.md`, replace:

```markdown
Their contract is `stacks/common/DISTRIBUTION.md`.
```

with:

```markdown
Their contract is `stacks/common/DISTRIBUTION.md`.
`screenshots.md` beside this file is how `kartograph-release` builds the project's
store-screenshot renderer the first time.
```

In `stacks/android-compose/STACK.md`, replace:

```markdown
Their contract is `stacks/common/DISTRIBUTION.md`.
```

with:

```markdown
Their contract is `stacks/common/DISTRIBUTION.md`.
`screenshots.md` beside this file is how `kartograph-release` builds the project's
store-screenshot renderer the first time.
```

- [ ] **Step 5: Run it to verify it passes**

Run: `node --test test/distribution.test.js`
Expected: PASS — `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add stacks/kmp/screenshots.md stacks/kmp-toolchain/screenshots.md stacks/apple-swift/screenshots.md stacks/android-compose/screenshots.md stacks/kmp/STACK.md stacks/kmp-toolchain/STACK.md stacks/apple-swift/STACK.md stacks/android-compose/STACK.md test/distribution.test.js
git commit -m "docs(stacks): screenshots.md — how each store stack renders its store screenshots"
```

### Task 7: Skill tests first — fourteen skills, two of them stack-neutral

**Files:**
- Test: `test/skills.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: the expectations Tasks 8, 9 and 11 satisfy.

- [ ] **Step 1: Write the failing tests**

In `test/skills.test.js`, replace:

```js
test("twelve skills, explore retired", () => {
  assert.deepEqual(skills, [
    "kartograph-adapters", "kartograph-converse", "kartograph-deliver", "kartograph-domain",
    "kartograph-features", "kartograph-intent", "kartograph-knowledge", "kartograph-map",
    "kartograph-migrate", "kartograph-plan", "kartograph-screens", "kartograph-walk",
  ]);
```

with:

```js
test("fourteen skills, explore retired", () => {
  assert.deepEqual(skills, [
    "kartograph-adapters", "kartograph-converse", "kartograph-deliver", "kartograph-domain",
    "kartograph-features", "kartograph-intent", "kartograph-knowledge", "kartograph-map",
    "kartograph-migrate", "kartograph-plan", "kartograph-release", "kartograph-revise",
    "kartograph-screens", "kartograph-walk",
  ]);
```

Then append to `test/skills.test.js`:

```js
test("revise and release are stack-neutral: every stack word comes from the project's files", () => {
  const stackWord = /\b(Koin|Gradle|gradlew|xcodebuild|SwiftUI|Compose|Room|SwiftData|ViewModel|AppEnvironment)\b/;
  for (const s of ["kartograph-revise", "kartograph-release"]) {
    const m = stackWord.exec(read(`skills/${s}/SKILL.md`));
    assert.equal(m, null, `${s} names '${m?.[0]}'`);
  }
});

```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/skills.test.js`
Expected: FAIL — `✖ fourteen skills, explore retired` (the list lacks `kartograph-release` and `kartograph-revise`) and `✖ revise and release are stack-neutral …` (`ENOENT … skills/kartograph-revise/SKILL.md`). They pass once Tasks 8, 9 and 11 are done; the rest of `npm test` stays green meanwhile.

- [ ] **Step 3: Commit**

```bash
git add test/skills.test.js
git commit -m "test(skills): fourteen skills; revise and release stay stack-neutral"
```

### Task 8: `kartograph-revise`

**Files:**
- Create: `skills/kartograph-revise/SKILL.md`

**Interfaces:**
- Consumes: `revision-template.md` and `validate-revision.js` (Task 1); `validate-features.js` (Task 3); `validate-knowledge.js`; `validate-plan.js` with `revision`, `**Revised:**` and the `rings done:` line (Task 4); the ring skills' `SKILL.md` (Task 10 makes them skip ticked tasks).
- Produces: the skill `kartograph-revise`; commits `revision: <title>`, `features: <revision title>`, `knowledge: <revision title>`, `plan: <capability> (revision)`, `screens|domain|adapters: <capability> (revision)`, `revision: <title> applied`.

- [ ] **Step 1: Write the skill**

Create `skills/kartograph-revise/SKILL.md` with exactly this content:

```markdown
---
name: kartograph-revise
description: Use when a person has looked at what was built — in a walk, in the running app, or anywhere else — and says what should be different, and that change has not been recorded under kartograph/ yet. Also use when a walk recorded failed scenarios whose behaviour the person now wants changed. Works on capabilities already specified under features/.
---

# Kartograph Revise

The person looked at what was built and says "change this and that". Record their words,
then carry the change through everything that describes the product and through the code
already built, in one run: the revision record, the scenarios, the concepts, the plan, the
rings. One commit per step, in that order, so the plan and the documents never drift from
the code. The screens are built first precisely so that such changes turn up early; this
skill is where they land.

## Hard rules

- **The person's words first, verbatim.** They are recorded before anything else changes,
  and every change cites the block it comes from.
- **Ask only when the words are genuinely ambiguous**: when they can be read two ways and
  the readings lead to different scenarios. Then one question per message, with your
  recommended answer and lettered options, recorded as a block. Otherwise ask nothing:
  no review, no confirmation, never whether to go on.
- **Change exactly what the words change.** A scenario the words do not touch keeps its
  title and steps byte for byte. New behaviour is a new scenario. A scenario is removed
  only when the person said to drop it.
- **Never invent a requirement.** What the words leave open is an open question in the
  revision and in `capability.md`, never a scenario with a guessed outcome.
- **This skill deliberately writes more than one phase's output**: the revision,
  `kartograph/index.md` and `kartograph/log.md`; `features/`; `knowledge/`; `plans/`; and
  the code of the rings already built for the affected capabilities. Nothing else: never
  `walks/`, `distribution/`, `docs/code-design/`, a ring that was not built, or another
  capability's code.
- **Code follows the ring skills' rules exactly**: test first, fakes over mocks, never a
  weakened test, never an edited `.feature` while building, each ring's own scope. Never
  launch, reload, restart or reset the app the person is watching; look through a live
  window only.
- **Every step validates before it commits.** A step that cannot pass its validator is not
  committed: stop there, keep the commits that passed, and report where it stopped and why.
- Write in the language of the person's words.

## 0. Version gate

Before anything else, check that the project is on this plugin's layout. The plugin's
layout version is the highest version among the files named like `3.0.0.md` in the
`migrations/` directory at the plugin root, two levels above this file's directory; if
that directory is not there, skip this step. The project is behind when
`kartograph/index.md` names a lower `kartograph_version` or names none, or when
`kartograph/index.md` does not exist but the project holds Kartograph files from before:
stamp-named files in `intents/`, a `capability.md` or a `# Source intent:` line under
`features/`, a `knowledge/index.md` with `okf_version`, or a `.kartograph/` directory.
Then stop and say only: "This project is on an older Kartograph layout; run
kartograph-migrate first." A project with none of these is new and passes; a directory
name alone, such as `features/` in a Cucumber project, is not a Kartograph file.

## 1. Record the revision

The plugin root is two levels above this file's directory; the other skills' files named
below are under its `skills/`.

Read `kartograph/index.md`, the walk the person refers to (else the newest file under
`walks/`), every `capability.md` from the top level down, the `.feature` files of every
capability the words touch, the newest `planned` plan of each such capability under
`plans/` (its screens table names the screens), and the `knowledge/` bundle. Resolve every
thing the person names to a capability, a feature, a scenario or a screen, in the bundle's
canonical titles. When nothing under `features/` matches what they describe, say that
`kartograph-converse` is the place for new ground and stop.

Record in the shape of `revision-template.md` in this file's directory:

- **Conversation.** Block 1 is the person's words verbatim: everything they said about
  what to change, two messages in a row being one block. A question you had to ask is an
  AI block holding only `> Looked up: …` lines, at most one `Reasoning (shortened): …`
  line, the `**Question:** …` and its options, one line each; the answer is the next
  person block, verbatim.
- **Affected.** One `- Capability:` line per capability touched, then its features,
  scenarios and screens in the template's shapes.
- **Changes.** One line per change, each citing the person's block: `**Changed:**` an
  existing scenario whose behaviour changes (its path and ` › ` name), `**Added:**` new
  behaviour (the feature file that gets the scenario, or the `capability.md` that gets a
  new feature), `**Removed:**` a scenario or feature the person said to drop.
- **Open questions.** What the words leave open, naming the change it blocks, or
  `None identified.`

Write it to `kartograph/<YYYY-MM-DD-HHMM>-<slug>.revision.md` (the stamp is now; slug: what
changes, lowercase, hyphenated, at most five words). Frontmatter as in the template:
`status: recorded`; `sources` holds the file name of every intent listed under
`## Sources` of an affected capability, without the `kartograph/` prefix; `related` the
earlier revisions of the same capabilities, else `[]`. Add
`* [title](file) - description _(Revision, recorded)_` as the first line under
`# Kartograph` in `kartograph/index.md`, and under today's `## YYYY-MM-DD` in
`kartograph/log.md`: `* **Revision**: recorded [title](file) — n changed, n added, n removed.`

Run `node validate-revision.js kartograph/<file>` with the script from this file's
directory until it prints `ok`. Stage the revision, `kartograph/index.md` and
`kartograph/log.md`; commit as `revision: <title>`.

## 2. Features

Apply every change under `features/` by the rules of
`skills/kartograph-features/SKILL.md` at the plugin root (plain Gherkin, the bundle's
vocabulary, extend before create, never invent), with these marks:

- **Changed:** rewrite exactly the steps (and the title, if the words rename it) of that
  scenario. Put `# Changed by kartograph/<file>.revision.md` on its own line directly above
  the scenario, above its tags. An earlier `# Changed by` line stays.
- **Added:** a new scenario in the feature file the change names, under the rule it
  belongs to, with the same `# Changed by` line above it. A new feature file starts with
  the two header comments, `# Source intent:` naming the first intent of the revision's
  `sources`.
- **Removed:** delete the scenario, and a rule or feature file left empty.

In every affected `capability.md`, add ``- Revision: `kartograph/<file>.revision.md` ``
under `## Sources`, after the lines already there (none is ever removed), and add the
revision's open questions under `## Open questions`. Run
`node <plugin root>/skills/kartograph-features/validate-features.js features` until it
prints `ok`. Stage `features/`; commit as `features: <revision title>`.

## 3. Knowledge

Only when a change gives a term a new meaning, introduces a term, or retires one; else
skip this step and say so. Reconcile and write by the rules of
`skills/kartograph-knowledge/SKILL.md` at the plugin root (§ 3 and § 4), with the revision
as an extra source of every concept it touches: a `sources` entry with `id` the revision's
slug, `resource: ../kartograph/<file>.revision.md` and `title` the revision's title, and
the person's words quoted under `# From the intent`, footnoted to that id. An existing
definition is never rewritten: a changed meaning is recorded under `# Collision`. Prepend
to `knowledge/log.md` under today's date: `* **Revision**: processed
[title](../kartograph/<file>.revision.md) — n new, n extended, n aliased, n deprecated,
n stubs, n collisions.` Run
`node <plugin root>/skills/kartograph-knowledge/validate-knowledge.js knowledge` until it
prints `ok`. Stage `knowledge/`; commit as `knowledge: <revision title>`.

## 4. Plan

For each affected capability that has a `planned` plan, write the plan that supersedes it,
by the rules of `skills/kartograph-plan/SKILL.md` and its `plan-template.md` at the plugin
root. A capability without a plan has nothing built yet: write no plan for it, and report
that `kartograph-plan` covers it from the changed scenarios.

Start from the old plan, as it stands with its ticks, in
`plans/<YYYY-MM-DD-HHMM>-<capability>.md` with the revision's stamp. In the frontmatter,
`date` is today, `supersedes` names the old plan, and a last line
`revision: kartograph/<file>.revision.md` follows it; `features` lists the feature files
as they are now. Then, change by change:

- **Changed scenario:** its ring-2 task is rewritten for the new steps. The ring-1 task
  of the screen serving it is rewritten when what the screen shows or offers changes, and
  a ring-3 task only when a port's signature changes.
- **Added scenario:** a new ring-2 task; a new ring-1 task for a new screen, or the
  serving screen's task rewritten for a new control; a new ring-3 task for a new port.
- **Removed scenario:** its ring-2 task, its layer-map row and its place in the screens
  table go; the serving screen's task is rewritten when a control goes with it.

Every rewritten task carries `**Revised:** changed`, every new one `**Revised:** added`,
on its own line below the task's first field lines, and all its checkboxes are unticked.
Every other task stays byte for byte with its ticks. Renumber tasks so each ring counts
from 1; update the screens table, the layer map, ports and adapters and the files list to
match. Set the old plan's `status` to `superseded`. Run
`node <plugin root>/skills/kartograph-plan/validate-plan.js plans/<new file>` until it
prints `ok`; it also checks that no task built under the old plan lost its ticks. Stage
both plans; commit as `plan: <capability> (revision)`.

## 5. Code

A ring is **built** when every task of that ring was ticked in the superseded plan: run
`node <plugin root>/skills/kartograph-plan/validate-plan.js plans/<old file>`, whose
`rings done` line says which. For each capability, in ring order, for each built ring
only: execute the new plan's unticked tasks of that ring by the ring's own skill,
`skills/kartograph-screens/SKILL.md` for ring 1, `skills/kartograph-domain/SKILL.md` for
ring 2, `skills/kartograph-adapters/SKILL.md` for ring 3, all at the plugin root: its
hard rules and its sections 1 to 3 for this plan, ticking each step, with three
differences. Look through a live window when one is connected, but never launch, reload,
restart or reset the app. A removed scenario's test and the code only it used are deleted
in the ring where they live, in that ring's commit, and reported as a deviation from the
plan. Commit as the ring skill does, with ` (revision)` after the capability; do not push
and do not report yet.

A ring that was only partly built, and every ring not built, keeps its unticked tasks for
its ring skill; say so in the report.

## 6. Applied, push, report

Set the revision's `status` to `applied`, its index line to `_(Revision, applied)_`, and
add under today's date in `kartograph/log.md`: `* **Revision**: applied [title](file) —
features, knowledge, plan, rings n.` (the rings you rebuilt). Run
`node validate-revision.js kartograph/<file>` again; stage those three files; commit as
`revision: <title> applied`. Push every commit of this run to the branch's upstream; no
git or no upstream, skip and say so.

Report, per step, what changed where and its commit: the revision; the scenarios changed,
added and removed; the concepts; the plan written and the one it superseded; the rings
rebuilt, each deviation from the plan, and the rings left for their skills. Then the open
questions a person has to settle, and one line on whether a walk makes sense: yes when a
built ring changed, naming `kartograph-walk` and the capability. Then you are done.
```

- [ ] **Step 2: Check the gate and the words**

Run: `node --test test/skills.test.js`
Expected: FAIL only in `✖ fourteen skills, explore retired` (release is missing), `✖ revise and release are stack-neutral …` (`ENOENT … kartograph-release/SKILL.md`) and `✖ every skill is in the Claude Code manifest …`; `✔ every skill but migrate carries the same version gate, right after Hard rules` and `✔ outside the version gate, no skill but migrate mentions intents/` pass with revise included.

- [ ] **Step 3: Commit**

```bash
git add skills/kartograph-revise/SKILL.md
git commit -m "feat(revise): kartograph-revise — change something, everything follows"
```

### Task 9: `kartograph-release`

**Files:**
- Create: `skills/kartograph-release/SKILL.md`

**Interfaces:**
- Consumes: `release-check.sh` (Task 5); `stacks/<stack>/screenshots.md` (Task 6); `notes_write`, `load_config` (`common.sh`); `push-store-metadata.sh [--dry-run] [--screenshots]`; `release-stores.sh --notes FILE --version X.Y.Z [--rollout F] --yes`.
- Produces: the skill `kartograph-release`; the commit `release: v<X.Y.Z> notes, store texts, screenshots`; the tag `v<X.Y.Z>`.

- [ ] **Step 1: Write the skill**

Create `skills/kartograph-release/SKILL.md` with exactly this content:

```markdown
---
name: kartograph-release
description: Use when a build that was tested on TestFlight or on Play internal testing should go to the App Store and Google Play, and its release notes, store texts and screenshots have to say what is new. Not for building or uploading a new build.
---

# Kartograph Release

Ship the build that was tested, exactly that one, to the stores, and say once what is new:
in the release notes, in the store texts, in the screenshots of what changed. Check, write,
commit, ask once, release, tag, report.

## Hard rules

- **Ship the tested build.** Never bump a version or a build number, never build, never
  upload a binary. When the tested build is not newer than what the store sells, stop: a
  new build comes first, and that is `kartograph-deliver`'s.
- **Ask exactly once**, after everything is written and committed: one summary of the
  notes, the text changes and the screenshots, one question. Nothing leaves the machine
  before the person's yes; the scripts get `--yes` only after it.
- **Write only** `distribution/release-notes/v<X.Y.Z>.md`, `distribution/store/` (texts and
  screenshots), `distribution/release-check.sh` when it is missing, the screenshot renderer
  in the app's test code together with the one seam and the build-file lines the stack's
  `screenshots.md` names, and the tag `v<X.Y.Z>`. Never `kartograph/`, `features/`,
  `knowledge/`, `plans/`, `walks/`, `distribution/config.sh` or another delivery script.
- **Positive and factual.** Say what is new and what works better, as the person using the
  app notices it. A fix is what now works ("Syncing resumes after the connection returns"),
  never "a bad bug has been fixed". No superlatives, nothing the commits and features do not
  show.
- **Never name another platform** in any store text: no Android, Google Play, Play Store,
  Windows or Linux in anything Apple reads; no iOS, iPhone, iPad, Mac or App Store in
  anything Play shows. The notes are written platform-neutral, once, for both.
- **Existing store wording and structure stay.** Only what is new is added.
- **Screenshots are renders of the real UI** by the project's renderer, never captures of
  the running app, and only the screens that changed get new ones.
- **Never print a secret.** The store APIs need the network; if the runtime's sandbox
  blocks it, say so and hand the person the command.

## 0. Version gate

Before anything else, check that the project is on this plugin's layout. The plugin's
layout version is the highest version among the files named like `3.0.0.md` in the
`migrations/` directory at the plugin root, two levels above this file's directory; if
that directory is not there, skip this step. The project is behind when
`kartograph/index.md` names a lower `kartograph_version` or names none, or when
`kartograph/index.md` does not exist but the project holds Kartograph files from before:
stamp-named files in `intents/`, a `capability.md` or a `# Source intent:` line under
`features/`, a `knowledge/index.md` with `okf_version`, or a `.kartograph/` directory.
Then stop and say only: "This project is on an older Kartograph layout; run
kartograph-migrate first." A project with none of these is new and passes; a directory
name alone, such as `features/` in a Cucumber project, is not a Kartograph file.

## 1. Check the tested build

The plugin root is two levels above this file's directory. No `distribution/config.sh`:
say that `kartograph-deliver` sets up delivery first, and stop. If
`distribution/release-check.sh` is missing, copy it from
`stacks/<STACK>/distribution/release-check.sh` at the plugin root (`STACK` from
`distribution/config.sh`), keeping it executable; it needs only library functions every
project's `distribution/lib/` already has.

Run `distribution/release-check.sh` from the project root. Exit 2: the project ships no
store lane; say so and stop. Exit 1: show its lines and stop with "The tested build is not
newer than the store; a new build on TestFlight or Play internal comes first." Exit 0: the
version to release is the `release X.Y.Z` line; a project with only a Play lane takes it
from `versionName` in the file `ANDROID_BUILD_FILE` names. A lane whose line says `on sale
none` is a first release: its app record, App Privacy and review details are web-only and
What's New is refused on a first release, so stop and say so.

The bump tier is the first part that differs between `X.Y.Z` and the version on sale:
major, minor or patch.

## 2. What changed

The previous release is the newest `vA.B.C` tag below `vX.Y.Z` (`git tag --list 'v*.*.*'
--sort=-v:refname`); a `vX.Y.Z` tag that `prepare-release.sh --tag` already set is not it.
The range ends at the last commit that changed the build number's file (`VERSION_FILE`,
else `ANDROID_BUILD_FILE`): every upload writes its number there first, so later commits
are not in the tested build. When that file has uncommitted changes, the range ends at
`HEAD`.

Read the range: `git log --no-merges --format='%h %s' <previous>..<end>`, and
`git diff --name-status <previous>..<end> -- kartograph/ features/` for the intents,
revisions and feature files added or changed, reading each of those files. What a person
using the app notices counts: new and changed scenarios, fixes whose subject names a
behaviour. Chores, refactors, tests, documentation and build changes do not.

## 3. Release notes

The one place for them is `distribution/release-notes/v<X.Y.Z>.md`, where
`prepare-release.sh` writes them and `release-stores.sh` reads them. If it is missing,
create it with the delivery library:
`bash -c '. distribution/lib/common.sh && load_config && notes_write <X.Y.Z> <previous tag>'`.

Rewrite its `## New`, `## Fixed` and `## Changed` lists from step 2 as sentences a person
using the app understands, one per change; a list with nothing in it keeps its single `-`.
By tier: a major release adds a `## Migration` section after `## Changed` saying what a
person has to do or will find moved; a minor release has at least one line under
`## New`; a patch release may have only `## Fixed`. Then fill `### play_short` (at most 500
characters) and `### asc_short` (at most 4000) under `## Store text`: plain text, no
headings, the most noticeable change first, in the language of the first locale in
`LOCALES`, since `release-stores.sh` sets the same text for every locale.

## 4. Store texts

Per locale, in `distribution/store/apple/<locale>.json` and in the locale's entry of
`distribution/store/play/listing.json`: add each new feature from step 3 to the
description (`description`, `fullDescription`) where the existing text lists features, in
its style and in that locale's language; the rest of the text stays as it is. Apple's
`promotionalText` (at most 170 characters) leads with the release's most noticeable
change and keeps as much of its current wording as still fits. Never write `whatsNew`:
`release-stores.sh` sets it from the notes. Keywords, names and subtitles stay.

Then run `distribution/push-store-metadata.sh --dry-run`. It checks every length and
refuses other-platform words and dead URLs before any upload; fix the texts until it
passes.

## 5. Screenshots

A screen changed when a commit in the range touched its files, or a revision or feature in
the range changed a scenario it serves (the plans' screens tables name each screen, its
scenarios and its files); a new screen counts as changed. No screen changed: skip this
step and say so.

Find the project's renderer (`StoreScreenshotRenderer` in its test code). None: build it
once from `stacks/<STACK>/screenshots.md` at the plugin root, sections 1 to 3, with one
shot per screen the store's current screenshots show plus the new screens, at most ten.
When that file is missing or still `UNFILLED`, render nothing, keep the store's
screenshots, and say so in the report.

Render each locale in `LOCALES` as the file's section 4 says, into
`distribution/build/screenshots/`. Look at every image you are about to ship: an error, an
empty state, a "nothing today" banner or a first-run hint means the seed is wrong; fix the
seed and render again. Copy the images of the changed screens into
`distribution/store/apple/screenshots/<locale>/<displayType>/`, replacing the file of the
same name; remove the image of a screen the app no longer has. When `LANES` includes
`android`, copy the same files into `distribution/store/play/screenshots/<locale>/`: the
`APP_IPHONE_67` set as `phoneScreenshots`, the `APP_IPAD_PRO_3GEN_129` set as
`tenInchScreenshots`.

## 6. Commit, ask once, release

Stage the release notes, `distribution/store/`, `distribution/release-check.sh` if you
copied it, and the renderer's files; commit as `release: v<X.Y.Z> notes, store texts,
screenshots`; push to the branch's upstream (no git or no upstream: skip and say so).

Then show one summary: per lane the version and build from step 1 and where it goes (App
Store review, Play production, full rollout unless the person named a fraction); the
`play_short` and `asc_short` texts verbatim; per locale the sentences added to the
descriptions and the new promotional text; the screenshot files replaced, added and
removed. Ask once: "Release v<X.Y.Z> to the stores now?" — **A (recommended):** yes,
**B:** not yet.

On yes, run from the project root, in this order, stopping at the first failure:

1. `distribution/push-store-metadata.sh --screenshots`
2. `distribution/release-stores.sh --notes distribution/release-notes/v<X.Y.Z>.md --version <X.Y.Z> --yes`
   (with `--rollout <fraction>` when the person named one)

When both succeeded and no `v<X.Y.Z>` tag exists, tag the release commit
`git tag -a v<X.Y.Z> -m "v<X.Y.Z>"` and push the tag; an existing tag stays where it is.
A failure: show the script's last lines; nothing after it runs and nothing is tagged. On
"not yet", stop: the commit stays, and the next run reuses the written files.

## 7. Report

What is where: per Apple platform the version in review, on Play the versionCode in
production and its rollout, the tag. What the scripts said only the web UI can do (App
Privacy, Data safety, a subscription's first review). Every screen whose screenshot was
rendered from shared code only, or not rendered, and why. Then you are done.
```

- [ ] **Step 2: Check the gate and the words**

Run: `node --test test/skills.test.js`
Expected: FAIL only in `✖ every skill is in the Claude Code manifest and has an OpenCode tool …` (Task 11); `✔ fourteen skills, explore retired`, `✔ revise and release are stack-neutral …` and both version-gate tests pass.

- [ ] **Step 3: Commit**

```bash
git add skills/kartograph-release/SKILL.md
git commit -m "feat(release): kartograph-release — from TestFlight into the stores in one run"
```

### Task 10: The existing skills learn of revisions

**Files:**
- Modify: `skills/kartograph-features/SKILL.md`, `skills/kartograph-knowledge/SKILL.md`, `skills/kartograph-map/SKILL.md`, `skills/kartograph-walk/SKILL.md`, `skills/kartograph-plan/SKILL.md`, `skills/kartograph-screens/SKILL.md`, `skills/kartograph-domain/SKILL.md`, `skills/kartograph-adapters/SKILL.md`

**Interfaces:**
- Consumes: the marks of Tasks 3 and 4.
- Produces: features and knowledge keep revision provenance; map reads revisions as background; walk points to revise; plan never writes revision marks; the ring skills skip fully ticked tasks.

- [ ] **Step 1: Edit the skills**

In `skills/kartograph-features/SKILL.md`, replace:

```markdown
- Never remove a rule or scenario the intent merely omits; removal needs an explicit
  statement in the intent, and is reported.
```

with:

```markdown
- Never remove a rule or scenario the intent merely omits; removal needs an explicit
  statement in the intent, and is reported.
- Provenance stays. A `# Changed by kartograph/<file>.revision.md` line above a scenario
  or rule, and a ``- Revision: `kartograph/<file>.revision.md` `` line under a capability's
  *Sources*, were written by `kartograph-revise`; keep both, like the intent lines.
```

In `skills/kartograph-knowledge/SKILL.md`, replace:

```markdown
- Never delete a concept; retire it with `status: deprecated`.
```

with:

```markdown
- Never delete a concept; retire it with `status: deprecated`.
- Never drop a source. A `sources` entry pointing at `../kartograph/<file>.revision.md`
  was added by `kartograph-revise`; it stays beside the intents.
```

In `skills/kartograph-map/SKILL.md`, replace:

```markdown
3. **The bundle.** Earlier intents, mappings and conversations in `kartograph/`, for what
   was already asked for, decided, or found in conflict.
```

with:

```markdown
3. **The bundle.** Earlier intents, mappings, conversations and revisions in
   `kartograph/`, for what was already asked for, decided, changed, or found in conflict.
   An applied revision's changes are already in `features/` and the history; cite those,
   never the revision, as evidence.
```

In `skills/kartograph-walk/SKILL.md`, replace:

```markdown
it stopped. Then you are done.
```

with:

```markdown
it stopped. When the person wants something to be different, a failed scenario or a
change they named on the way, say in one line that `kartograph-revise` records the change
and carries it through the features, the plan and the code; never start it yourself. Then
you are done.
```

In `skills/kartograph-plan/SKILL.md`, replace:

```markdown
produces for later ones. If an earlier `planned` plan exists, set its `status` to
`superseded` in the same commit.
```

with:

```markdown
produces for later ones. If an earlier `planned` plan exists, set its `status` to
`superseded` in the same commit. A plan you write never carries a `revision:` line or a
`**Revised:**` mark; those belong to the plans `kartograph-revise` writes, which keep the
ticks of work already built.
```

In `skills/kartograph-screens/SKILL.md`, replace:

```markdown
Each ring-1 task is one screen. Follow its steps:
```

with:

```markdown
A task whose steps are all ticked is done and is skipped: a plan `kartograph-revise`
wrote keeps the ticks of work already built. Each ring-1 task is one screen. Follow its steps:
```

In `skills/kartograph-domain/SKILL.md`, replace:

```markdown
Each ring-2 task is one scenario. **Outer loop:**
```

with:

```markdown
A task whose steps are all ticked is done and is skipped: a plan `kartograph-revise`
wrote keeps the ticks of work already built. Each ring-2 task is one scenario. **Outer loop:**
```

In `skills/kartograph-adapters/SKILL.md`, replace:

```markdown
Each ring-3 task is one port or endpoint. The failing adapter test as given,
```

with:

```markdown
A task whose steps are all ticked is done and is skipped: a plan `kartograph-revise`
wrote keeps the ticks of work already built. Each ring-3 task is one port or endpoint. The failing adapter test as given,
```

- [ ] **Step 2: Check nothing else moved**

Run: `node --test test/skills.test.js`
Expected: the same single failure as after Task 9 (`✖ every skill is in the Claude Code manifest …`); the version-gate tests pass, so no gate was touched.

- [ ] **Step 3: Commit**

```bash
git add skills/kartograph-features/SKILL.md skills/kartograph-knowledge/SKILL.md skills/kartograph-map/SKILL.md skills/kartograph-walk/SKILL.md skills/kartograph-plan/SKILL.md skills/kartograph-screens/SKILL.md skills/kartograph-domain/SKILL.md skills/kartograph-adapters/SKILL.md
git commit -m "feat(skills): revisions as provenance; ring skills skip ticked tasks; walk points to revise"
```

### Task 11: Register both skills — Claude Code manifest and OpenCode

**Files:**
- Modify: `.claude-plugin/plugin.json`, `opencode/index.js`

**Interfaces:**
- Consumes: the two skill directories.
- Produces: OpenCode tools `kartograph_revise` (argument `change`, supporting file `revision-template.md`, the plugin root named) and `kartograph_release` (no argument, the plugin root and the `stacks/` directory named). Codex needs nothing: it scans `./skills/`.

- [ ] **Step 1: Edit**

In `.claude-plugin/plugin.json`, replace:

```json
    "./skills/kartograph-walk",
    "./skills/kartograph-deliver",
```

with:

```json
    "./skills/kartograph-walk",
    "./skills/kartograph-revise",
    "./skills/kartograph-deliver",
    "./skills/kartograph-release",
```

In `opencode/index.js`, replace:

```js
// this package at call time. The plan and deliver tools also name the `stacks/` directory,
// since those two skills read it; migrate names the plugin root, since it runs `scripts/`
// and reads `migrations/`.
```

with:

```js
// this package at call time. The plan, deliver and release tools also name the `stacks/`
// directory, since those skills read it; migrate, revise and release name the plugin root,
// since they run scripts or read other skills' files from it.
```

In `opencode/index.js`, replace:

```js
    kartograph_deliver: skillTool({
```

with:

```js
    kartograph_revise: skillTool({
      skill: "kartograph-revise",
      files: ["revision-template.md"],
      description:
        "Use when a person has looked at what was built — in a walk, in the running app, or " +
        "anywhere else — and says what should be different, and that change has not been recorded " +
        "under kartograph/ yet. Also use when a walk recorded failed scenarios whose behaviour the " +
        "person now wants changed. Returns the instructions to follow for the rest of the conversation.",
      args: { change: tool.schema.string().optional().describe("What the person wants changed, in their words, if already said.") },
      opening: (a) => (a.change ? `What the person wants changed, in their words: ${a.change}\n\n` : ""),
      extraNote: `\nThe plugin root the instructions refer to is: ${pluginRoot}`,
    }),
    kartograph_deliver: skillTool({
```

In `opencode/index.js`, replace:

```js
    kartograph_migrate: skillTool({
```

with:

```js
    kartograph_release: skillTool({
      skill: "kartograph-release",
      files: [],
      description:
        "Use when a build that was tested on TestFlight or on Play internal testing should go to " +
        "the App Store and Google Play, and its release notes, store texts and screenshots have to " +
        "say what is new. Not for building or uploading a new build. Returns the instructions to " +
        "follow for the rest of the conversation.",
      args: {},
      opening: () => "",
      extraNote: `\nThe plugin root the instructions refer to is: ${pluginRoot}\nThe stacks/ directory the instructions refer to is: ${stacksDir}`,
    }),
    kartograph_migrate: skillTool({
```

- [ ] **Step 2: Run the whole suite**

Run: `node --check opencode/index.js && npm test`
Expected: PASS —

```
ℹ tests 152
ℹ pass 152
ℹ fail 0
```

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json opencode/index.js
git commit -m "feat: register kartograph-revise and kartograph-release"
```

### Task 12: README and CLAUDE.md

**Files:**
- Modify: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the documentation of both skills, the revise exception to "each skill writes only its own output", the rule that an optional document type is no layout change, the new `stacks/<stack>/screenshots.md`, and `release-check.sh`.

- [ ] **Step 1: README**

In `README.md`, replace:

```markdown
[Codex](https://developers.openai.com/codex) and [OpenCode](https://opencode.ai) with twelve
skills that build on each other through plain files in your repository:
```

with:

```markdown
[Codex](https://developers.openai.com/codex) and [OpenCode](https://opencode.ai) with fourteen
skills that build on each other through plain files in your repository:
```

In `README.md`, replace:

```markdown
| **`kartograph-walk`** | any ring's result, and you watching | `walks/<date>-<capability>.md`, your verdicts |
| **`kartograph-deliver`** | the built app, the stack's delivery scripts | `distribution/` on first use; then a device, TestFlight, Play, the stores or a host |
```

with:

```markdown
| **`kartograph-walk`** | any ring's result, and you watching | `walks/<date>-<capability>.md`, your verdicts |
| **`kartograph-revise`** | what you want changed, after a walk or anytime | `kartograph/<date>-<slug>.revision.md`, then the features, the concepts, a superseding plan and the rings already built, one commit each |
| **`kartograph-deliver`** | the built app, the stack's delivery scripts | `distribution/` on first use; then a device, TestFlight, Play, the stores or a host |
| **`kartograph-release`** | the tested build on TestFlight and Play internal, what changed since the last release | release notes, store texts and screenshots under `distribution/`; the build in App Store review and on Play production; the tag |
```

In `README.md`, replace:

```markdown
with the verdict and your words on a failure, a summary, and one line saying what that
surface proves. Committed as `walk: <capability>`, pushed. Feature files stay untouched.
```

with:

```markdown
with the verdict and your words on a failure, a summary, and one line saying what that
surface proves. Committed as `walk: <capability>`, pushed. Feature files stay untouched.

## `kartograph-revise` — change it, and everything follows

Building the screens first is meant to make you say "change this and that". Say it, after
a walk or anytime, and this skill carries it through everything in one run, one commit per
step. It records your words verbatim in `kartograph/<date>-<slug>.revision.md`, with what
they affect and each change (changed, added, removed) citing the words it comes from; it
asks only when the words can honestly be read two ways. Then it changes exactly the
affected scenarios, each marked `# Changed by` the revision; updates the concepts whose
meaning moved; writes a new plan that supersedes the old one, keeping the ticks of work the
revision does not touch and unticking or adding what it does; and builds the change in the
rings already built, by the ring skills' own rules, without ever reloading the app you are
looking at. The report says what changed where, what is still open, and whether a walk is
worth it.
```

In `README.md`, replace:

```markdown
| `push-store-metadata.sh` | listing texts and screenshots from `distribution/store/`, templates created when missing |
| `release-stores.sh --notes …` |
```

with:

```markdown
| `push-store-metadata.sh` | listing texts and screenshots from `distribution/store/`, templates created when missing |
| `release-check.sh` | reads only: is the tested build on TestFlight and Play internal newer than what the stores sell? |
| `release-stores.sh --notes …` |
```

In `README.md`, replace:

```markdown
the listings and screenshot uploads. The contract every script keeps is in
`stacks/common/DISTRIBUTION.md`; a stack's own scripts live in `stacks/<stack>/distribution/`.
```

with:

```markdown
the listings and screenshot uploads. The contract every script keeps is in
`stacks/common/DISTRIBUTION.md`; a stack's own scripts live in `stacks/<stack>/distribution/`.

## `kartograph-release` — from TestFlight into the stores

For the build you tested on TestFlight and Play internal. It checks that this build is
newer than what the stores sell, and stops if not: it never bumps, builds or uploads a
binary. It reads what changed since the last release tag (the commits, and the intents,
revisions and features added since), writes the release notes in
`distribution/release-notes/v<version>.md` with a slice for each store, positive and
factual and never naming another platform, and adds the new features to each locale's
description and promotional text without rewording the rest. It renders new screenshots of
the screens that changed, from the real UI with data reaching today, never from the running
app; a project without a renderer gets one, built once from the stack's `screenshots.md`,
and Play reuses the Apple images. Then it commits, shows you the notes, the text changes
and the screenshots in one summary, and asks once. After your yes it pushes the listings
and screenshots, submits the App Store version for review and promotes Play internal to
production, tags the release, and says what is left for the web UI.
```

In `README.md`, replace:

```markdown
  directory, plan the plan and the stack declaration, screens the feature module and its
  wiring, domain the module and `core/`, adapters the module's data layer, `core/` and
  `server/`, walk one record under `walks/`, migrate the project's `kartograph/` layout.
```

with:

```markdown
  directory, plan the plan and the stack declaration, screens the feature module and its
  wiring, domain the module and `core/`, adapters the module's data layer, `core/` and
  `server/`, walk one record under `walks/`, migrate the project's `kartograph/` layout,
  release the notes, the store texts, the screenshots and their renderer. Revise is the one
  deliberate exception: it carries one change through the revision, the features, the
  knowledge, the plan and the rings already built.
```

In `README.md`, replace:

```markdown
- Each commits only what it wrote (`conversation:`, `intent:`, `mapping:`, `knowledge:`,
  `features:`, `plan:`, `screens:`, `domain:`, `adapters:`, `walk:`) and pushes to the
  branch's upstream. Without git or a remote it says so and moves on.
```

with:

```markdown
- Each commits only what it wrote (`conversation:`, `intent:`, `mapping:`, `knowledge:`,
  `features:`, `plan:`, `screens:`, `domain:`, `adapters:`, `walk:`, `revision:`,
  `release:`) and pushes to the branch's upstream. Without git or a remote it says so and
  moves on.
```

In `README.md`, replace:

```markdown
- All drive. Converse ends every message with the next question or the written file;
  intent, map, knowledge, features, plan, screens, domain and adapters ask nothing at all;
  walk asks once per scenario.
```

with:

```markdown
- All drive. Converse ends every message with the next question or the written file;
  intent, map, knowledge, features, plan, screens, domain and adapters ask nothing at all;
  walk asks once per scenario; revise asks only when your words are ambiguous; release asks
  once, before anything leaves the machine.
```

In `README.md`, replace:

````markdown
  node skills/kartograph-walk/validate-walk.js walks/<file>.md
  ```
````

with:

````markdown
  node skills/kartograph-walk/validate-walk.js walks/<file>.md
  node skills/kartograph-revise/validate-revision.js kartograph/<file>.revision.md
  ```
````

- [ ] **Step 2: CLAUDE.md**

In `CLAUDE.md`, replace:

```markdown
Kartograph is a plugin with **twelve skills**, a structure validator for each of the eight
that write a fixed-shape file,
```

with:

```markdown
Kartograph is a plugin with **fourteen skills**, a structure validator for each of the nine
that write a fixed-shape file,
```

In `CLAUDE.md`, replace:

```markdown
  and records the verdicts in `walks/<YYYY-MM-DD-HHMM>-<capability>.md`.
```

with:

```markdown
  and records the verdicts in `walks/<YYYY-MM-DD-HHMM>-<capability>.md`.
- `kartograph-revise` takes what the person wants changed after seeing it, records their
  words as `kartograph/<YYYY-MM-DD-HHMM>-<slug>.revision.md`, and in the same run changes
  the affected scenarios, the concepts, writes a plan superseding the capability's plan
  (ticks kept for untouched work), and builds the change in the rings already built.
```

In `CLAUDE.md`, replace:

```markdown
  `distribution/config.sh`, then runs the matching script; outward actions are confirmed
  by the person once.
```

with:

```markdown
  `distribution/config.sh`, then runs the matching script; outward actions are confirmed
  by the person once.
- `kartograph-release` ships the build tested on TestFlight and Play internal: checks it is
  newer than the store, writes the release notes, adds the new features to the store texts,
  renders the changed screens' screenshots (building the renderer once from the stack's
  `screenshots.md`), commits, asks once, then pushes the listings, releases and tags.
```

In `CLAUDE.md`, replace:

```markdown
skills/kartograph-walk/walk-template.md       skeleton of one walk record
```

with:

```markdown
skills/kartograph-walk/walk-template.md       skeleton of one walk record
skills/kartograph-revise/revision-template.md skeleton of one revision
```

In `CLAUDE.md`, replace:

```markdown
stacks/<stack>/build-design.md              ports and adapters in detail, tests, definition of done
```

with:

```markdown
stacks/<stack>/build-design.md              ports and adapters in detail, tests, definition of done
stacks/<stack>/screenshots.md               how kartograph-release builds the store-screenshot renderer
```

In `CLAUDE.md`, replace:

```markdown
- **Each skill writes only its own output** and commits only that. None names or starts
  a phase beyond itself; the next phase is a separate skill that *reads* the previous
  one's files.
```

with:

```markdown
- **Each skill writes only its own output** and commits only that. None names or starts
  a phase beyond itself; the next phase is a separate skill that *reads* the previous
  one's files. The one deliberate exception is `kartograph-revise`: a change the person
  asks for after seeing the product must reach the revision, `features/`, `knowledge/`,
  the plan and the built rings in one run, one commit per step, or plan and code drift.
```

In `CLAUDE.md`, replace:

```markdown
  argument; the three ring skills fall back to the newest planned plan. Intent and map
  fall back to the newest conversation or intent without a successor.
```

with:

```markdown
  argument; the three ring skills fall back to the newest planned plan. Intent and map
  fall back to the newest conversation or intent without a successor. Revise asks only
  when the person's words can be read two ways, one question per message, recorded as a
  block. Release asks exactly once, after it has written and committed everything, before
  anything leaves the machine.
```

In `CLAUDE.md`, replace:

```markdown
- **Only plan reads `stacks/`.** It detects the stack from the build files against each
  `STACK.md`'s *Detection* rules, stops on none, more than one, or `status: scaffold`,
  then copies the three documents into the project's `docs/code-design/` and writes
  `stack.md` there. Screens, domain and adapters read the project's copies only, so they
  stay self-contained and the user's edits to the copies steer every later run.
```

with:

```markdown
- **Only plan reads a stack's design documents.** It detects the stack from the build
  files against each `STACK.md`'s *Detection* rules, stops on none, more than one, or
  `status: scaffold`, then copies the three documents into the project's
  `docs/code-design/` and writes `stack.md` there. Screens, domain and adapters read the
  project's copies only, so they stay self-contained and the user's edits to the copies
  steer every later run. Deliver copies a stack's `distribution/`; release reads its
  `screenshots.md` once, to build a project's renderer, and copies `release-check.sh` into
  a project whose `distribution/` predates it. A store stack's `screenshots.md` has the
  five sections of `stacks/kmp/screenshots.md`; a scaffold's are `UNFILLED`.
```

In `CLAUDE.md`, replace:

```markdown
- **Outward actions confirm.** Upload, promote, submit and deploy call `confirm_typed`;
```

with:

```markdown
- **`release-check.sh` only reads**, and uses nothing but `asc_get` and
  `play_track_versions`, so it works when copied alone into a project whose library is
  older. Release ships the tested build; nothing bumps or rebuilds on the way to the stores.
- **Outward actions confirm.** Upload, promote, submit and deploy call `confirm_typed`;
```

In `CLAUDE.md`, replace:

```markdown
node skills/kartograph-walk/validate-walk.js walks/<file>.md            # or no arg: all of ./walks
```

with:

```markdown
node skills/kartograph-walk/validate-walk.js walks/<file>.md            # or no arg: all of ./walks
node skills/kartograph-revise/validate-revision.js kartograph/<file>.revision.md  # or no arg: all of ./kartograph
```

In `CLAUDE.md`, replace:

```markdown
  `validateCapability`/`validateFeature`/`validateTree`, `validatePlan`, `validateWalk` take
```

with:

```markdown
  `validateCapability`/`validateFeature`/`validateTree`, `validatePlan`, `validateWalk`,
  `validateRevision` take
```

In `CLAUDE.md`, replace:

```markdown
- **One flat `kartograph/`**, documents `<stamp>-<slug>.<type>.md`; the intent and mapping
  take the conversation's stamp and slug.
```

with:

```markdown
- **One flat `kartograph/`**, documents `<stamp>-<slug>.<type>.md`; the intent and mapping
  take the conversation's stamp and slug. A revision is the fourth type, with its own stamp.

## Rules the revise and release skills must keep

- **Revise records first.** The person's words verbatim in numbered blocks, the first and
  last the person's; every change cites a person block of the revision itself. `sources`
  names the intents of the affected capabilities; `status` goes `recorded` → `applied`.
- **Revise changes exactly what was said.** Untouched scenarios stay byte for byte; each
  changed or added one gets `# Changed by kartograph/<file>.revision.md` directly above it
  and the capability a `- Revision:` source line; removal only when said.
- **The superseding plan keeps the ticks** of every task the revision does not touch and
  marks the rest `**Revised:** changed|added`, unticked; `validate-plan.js` checks both
  against the superseded plan. Revise builds only rings that were fully built, by the ring
  skills' own `SKILL.md`, never reloading the app; the ring skills skip ticked tasks.
- **Release ships the tested build.** `release-check.sh` decides; a first release is out
  of scope. The notes live only in `distribution/release-notes/v<X.Y.Z>.md` (REL5, AV8),
  positive and factual, never naming another platform (ASC32); store texts gain only
  what is new; screenshots are renders from the project's renderer (ASC13, MAS10, ASC14,
  GP5), committed under `distribution/store/`, only for changed screens.
- **Release asks once**, then `push-store-metadata.sh --screenshots` and
  `release-stores.sh --yes`, then the tag `v<X.Y.Z>` unless it exists.
```

In `CLAUDE.md`, replace:

```markdown
- Every skill but migrate starts with the byte-identical `## 0. Version gate`;
  `test/skills.test.js` enforces it.
```

with:

```markdown
- Every skill but migrate starts with the byte-identical `## 0. Version gate`;
  `test/skills.test.js` enforces it.
- A new, optional document type or file is not a layout change: every project on the
  current layout stays valid, so it gets no migration document (the revision of 3.2.0).
  A migration document raises the layout version and stops every project at the gate.
```

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: PASS — `ℹ tests 152`, `ℹ fail 0`.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: kartograph-revise and kartograph-release in the README and CLAUDE.md"
```

### Task 13: Release v3.2.0

**Files:**
- Modify: `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `package.json`
- Modify: `skills/kartograph-knowledge/SKILL.md`, `skills/kartograph-knowledge/concept-template.md`

**Interfaces:**
- Consumes: Tasks 1–12 on the branch `feat/revise-and-release`.
- Produces: version 3.2.0 in all three manifests; the `generated.by` actor `kartograph-knowledge/3.2.0`; after the owner's yes, `main` and the tag `v3.2.0` on the remote.

- [ ] **Step 1: Bump the versions and the descriptions**

In `.claude-plugin/plugin.json`, replace:

```json
"description": "Record a conversation with a person, derive their intent from it, and map that intent against what the project already has, all in one kartograph/ bundle; extract its concepts into an Open Knowledge Format bundle at knowledge/, derive capabilities and Gherkin features under features/, plan the implementation in three hexagonal rings for the project's technology stack, build the screens on sample data, then the domain, then the adapters, walk the person through what was built, and deliver it: locally, to a device, to TestFlight and Play, to the stores, or to a host.",
  "version": "3.1.0",
```

with:

```json
"description": "Record a conversation with a person, derive their intent from it, and map that intent against what the project already has, all in one kartograph/ bundle; extract its concepts into an Open Knowledge Format bundle at knowledge/, derive capabilities and Gherkin features under features/, plan the implementation in three hexagonal rings for the project's technology stack, build the screens on sample data, then the domain, then the adapters, walk the person through what was built, carry every change they ask for through the features, the plan and the code, and deliver it: locally, to a device, to TestFlight and Play, or to a host, and release the tested build to the stores with its notes, store texts and screenshots.",
  "version": "3.2.0",
```

In `.codex-plugin/plugin.json`, replace:

```json
"version": "3.1.0",
  "description": "Record a conversation with a person, derive their intent from it, and map that intent against what the project already has, all in one kartograph/ bundle; extract its concepts into an Open Knowledge Format bundle at knowledge/, derive capabilities and Gherkin features under features/, plan the implementation in three hexagonal rings for the project's technology stack, build the screens on sample data, then the domain, then the adapters, and walk the person through what was built.",
```

with:

```json
"version": "3.2.0",
  "description": "Record a conversation with a person, derive their intent from it, and map that intent against what the project already has, all in one kartograph/ bundle; extract its concepts into an Open Knowledge Format bundle at knowledge/, derive capabilities and Gherkin features under features/, plan the implementation in three hexagonal rings for the project's technology stack, build the screens on sample data, then the domain, then the adapters, walk the person through what was built, carry every change they ask for through the features, the plan and the code, and release the tested build to the stores.",
```

In `.codex-plugin/plugin.json`, replace:

```json
Kartograph has twelve skills that build on each other through plain files.
```

with:

```json
Kartograph has fourteen skills that build on each other through plain files.
```

In `.codex-plugin/plugin.json`, replace:

```json
records your verdicts under walks/. kartograph-deliver gets what was built into a person's hands: locally, on a device, on the test tracks, or in the stores.
```

with:

```json
records your verdicts under walks/. kartograph-revise takes what you want changed after seeing it and carries it through a revision record, the features, the knowledge, a superseding plan and the code already built. kartograph-deliver gets what was built into a person's hands: locally, on a device, on the test tracks, or in the stores. kartograph-release ships the build you tested from TestFlight and Play internal to the stores, with release notes, store texts and screenshots of what changed.
```

In `package.json`, replace:

```json
"version": "3.1.0",
  "description": "OpenCode plugin: Record a conversation with a person, derive their intent from it, and map that intent against what the project already has, all in one kartograph/ bundle; extract its concepts into an Open Knowledge Format bundle at knowledge/, derive capabilities and Gherkin features under features/, plan the implementation in three hexagonal rings for the project's technology stack, build the screens on sample data, then the domain, then the adapters, and walk the person through what was built.",
```

with:

```json
"version": "3.2.0",
  "description": "OpenCode plugin: Record a conversation with a person, derive their intent from it, and map that intent against what the project already has, all in one kartograph/ bundle; extract its concepts into an Open Knowledge Format bundle at knowledge/, derive capabilities and Gherkin features under features/, plan the implementation in three hexagonal rings for the project's technology stack, build the screens on sample data, then the domain, then the adapters, walk the person through what was built, carry every change they ask for through the features, the plan and the code, and release the tested build to the stores.",
```

In `skills/kartograph-knowledge/SKILL.md`, replace:

```markdown
`generated: { by: kartograph-knowledge/3.0.0, at: <ISO 8601> }`
```

with:

```markdown
`generated: { by: kartograph-knowledge/3.2.0, at: <ISO 8601> }`
```

In `skills/kartograph-knowledge/concept-template.md`, replace:

```markdown
generated: { by: kartograph-knowledge/3.0.0, at: <YYYY-MM-DDTHH:MM:SSZ> }
```

with:

```markdown
generated: { by: kartograph-knowledge/3.2.0, at: <YYYY-MM-DDTHH:MM:SSZ> }
```

- [ ] **Step 2: Verify**

Run: `npm test && node -e 'for (const f of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", "package.json"]) console.log(f, require("./" + f).version)' && ls migrations`
Expected: `ℹ tests 152`, `ℹ fail 0`; `3.2.0` three times; `2.1.0.md  3.0.0.md` (no `3.2.0.md`: the layout version stays 3.0.0).

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json .codex-plugin/plugin.json package.json skills/kartograph-knowledge/SKILL.md skills/kartograph-knowledge/concept-template.md
git commit -m "release: v3.2.0 — kartograph-revise and kartograph-release"
```

- [ ] **Step 4: Ask the owner, then merge, tag and push**

Ask in chat, once: "Merge `feat/revise-and-release` into `main`, tag v3.2.0 and push?" Only after a yes:

```bash
git checkout main
git merge --ff-only feat/revise-and-release
git tag -a v3.2.0 -m "v3.2.0 — kartograph-revise and kartograph-release"
git push origin main && git push origin v3.2.0
```

Expected: both pushes succeed; `git tag --list 'v3.2.0'` prints `v3.2.0`. `npm publish` for OpenCode only on the owner's separate yes.
