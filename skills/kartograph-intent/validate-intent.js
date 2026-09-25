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
export const DOC_NAME = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:conversation|intent|mapping|revision)\.md$/;
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
