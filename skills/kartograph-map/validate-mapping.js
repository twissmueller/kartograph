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
export const DOC_NAME = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:conversation|intent|mapping|revision)\.md$/;
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
