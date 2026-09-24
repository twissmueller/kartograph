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
