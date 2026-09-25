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
