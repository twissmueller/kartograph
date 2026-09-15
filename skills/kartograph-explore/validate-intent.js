#!/usr/bin/env node
// Validates the structure of an intent file written by kartograph-explore, so every
// intent looks the same and none drifts from `intent-template.md`.
//
//   node validate-intent.js <intents/file.md> [...]     validate the given files
//   node validate-intent.js                             validate every file in ./intents
//
// Exit code 1 when any file has errors. Pure function `validateIntent` is exported for tests.
// Self-contained on purpose: a skill directory must work when copied on its own.
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FILENAME = /^(\d{4}-\d{2}-\d{2})-(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
export const MAX_SLUG_WORDS = 5;
export const FRONTMATTER_KEYS = ["title", "date", "status", "role", "language", "sources", "related"];
export const STATUSES = ["draft", "confirmed"];
export const SECTIONS = [
  "Summary", "Who", "Goals", "Intended outcomes", "Non-goals", "Constraints",
  "Assumptions", "Decisions", "Open questions", "Terms", "Notes",
];
export const LIST_SECTIONS = new Set([
  "Goals", "Intended outcomes", "Non-goals", "Constraints", "Assumptions", "Decisions",
  "Open questions", "Terms",
]);
export const EMPTY_MARKER = "None identified.";
export const WHO_LABELS = ["**Speaking:**", "**Benefits:**", "**Affected:**"];
const PLACEHOLDER = /<[A-Za-z][^>\n]*>/;

// The intent frontmatter is flat `key: value` lines; nothing more is needed.
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

function sectionsOf(body) {
  const lines = body.split(/\r?\n/);
  const h1 = [];
  const sections = [];
  let current = null;
  for (const line of lines) {
    if (/^# /.test(line)) { h1.push(line.slice(2).trim()); current = null; continue; }
    const h2 = /^## (.*)$/.exec(line);
    if (h2) { current = { name: h2[1].trim(), lines: [] }; sections.push(current); continue; }
    if (current) current.lines.push(line);
  }
  return { h1, sections };
}

const hasContent = (lines) => lines.some((l) => l.trim() !== "");

export function validateIntent(text, { filename } = {}) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);

  let fileDate = null;
  if (filename !== undefined) {
    const m = FILENAME.exec(basename(filename));
    if (!m) err(`filename must be YYYY-MM-DD-HHMM-<slug>.md with a lowercase hyphenated slug, got '${basename(filename)}'`);
    else {
      fileDate = m[1];
      const words = m[3].split("-").length;
      if (words > MAX_SLUG_WORDS) err(`slug has ${words} words, at most ${MAX_SLUG_WORDS} allowed`);
    }
  }

  const { frontmatter, body } = splitFrontmatter(text);
  if (!frontmatter) { err("no YAML frontmatter block at the top of the file"); return { errors, warnings }; }

  const fm = {};
  for (const e of frontmatter) {
    if (e.key === null) { err(`frontmatter line is not 'key: value': ${e.raw.trim()}`); continue; }
    if (e.key in fm) err(`frontmatter key '${e.key}' appears twice`);
    fm[e.key] = e.value;
  }
  const keys = frontmatter.filter((e) => e.key).map((e) => e.key);
  for (const k of FRONTMATTER_KEYS) if (!(k in fm)) err(`frontmatter is missing '${k}'`);
  for (const k of keys) if (!FRONTMATTER_KEYS.includes(k)) err(`frontmatter has unknown key '${k}'`);
  const known = keys.filter((k) => FRONTMATTER_KEYS.includes(k));
  if (known.join() !== FRONTMATTER_KEYS.filter((k) => known.includes(k)).join()) {
    err(`frontmatter keys must be in the order ${FRONTMATTER_KEYS.join(", ")}`);
  }
  for (const [k, v] of Object.entries(fm)) {
    if (v === "") err(`frontmatter '${k}' is empty (write 'none' where nothing applies)`);
    if (PLACEHOLDER.test(v)) err(`frontmatter '${k}' still holds a template placeholder: ${v}`);
  }
  if (fm.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) err(`date must be YYYY-MM-DD, got '${fm.date}'`);
  if (fileDate && fm.date && fm.date !== fileDate) err(`date '${fm.date}' does not match the filename date '${fileDate}'`);
  if (fm.status !== undefined && !STATUSES.includes(fm.status)) err(`status must be ${STATUSES.join(" | ")}, got '${fm.status}'`);

  const { h1, sections } = sectionsOf(body);
  if (h1.length !== 1) err(`exactly one '# <title>' heading expected, found ${h1.length}`);
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
  }

  const ph = PLACEHOLDER.exec(body);
  if (ph) err(`body still holds a template placeholder: ${ph[0]}`);

  return { errors, warnings };
}

export function validateIntentFile(path) {
  return validateIntent(readFileSync(path, "utf8"), { filename: path });
}

function main(argv) {
  let files = argv;
  if (files.length === 0) {
    if (!existsSync("intents")) { console.error("usage: validate-intent.js <file.md> [...]  (or run where ./intents exists)"); return 2; }
    files = readdirSync("intents").filter((f) => f.endsWith(".md")).sort().map((f) => join("intents", f));
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
