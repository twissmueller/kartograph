#!/usr/bin/env node
// Validates the knowledge/ bundle written by kartograph-knowledge: every concept file
// has the structure of `concept-template.md`, the directories are the six types, and
// index.md / log.md have the shape the skill writes. OKF v0.2 itself requires only
// `type`; everything stricter here is Kartograph's own convention, enforced so the
// bundle never drifts.
//
//   node validate-knowledge.js [knowledge]      validate a bundle directory
//   node validate-knowledge.js <concept.md>     validate one concept file on its own
//
// Exit code 1 when there are errors. Pure functions are exported for tests.
// Self-contained on purpose: a skill directory must work when copied on its own.
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const OKF_VERSION = "0.2";
export const TYPE_DIRS = {
  Concept: "concepts", Actor: "actors", Subject: "subjects",
  Event: "events", Command: "commands", Policy: "policies",
};
export const DIR_TYPES = Object.fromEntries(Object.entries(TYPE_DIRS).map(([t, d]) => [d, t]));
export const STATUSES = ["draft", "stable", "deprecated"];
export const TEMPLATE_KEYS = ["type", "title", "description", "status", "aliases_to_avoid", "tags", "generated", "sources"];
export const SPEC_KEYS = ["resource", "stale_after", "verified", "usage_window"];
export const BODY_SECTIONS = ["Definition", "Relations", "From the intent"];
export const OPTIONAL_SECTIONS = ["Collision"];
export const STUB_DESCRIPTION = "TODO — define this term.";
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ACTOR = /^(?:[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+|human:\S+|process:\S+)$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const PLACEHOLDER = /<[A-Za-z][^>\n]*>/;
const LINK = /\]\(([^)\s]+)\)/g;

// ---------------------------------------------------------------------------
// YAML subset: scalars, flow [a, b] / { k: v }, block sequences and mappings.
// ---------------------------------------------------------------------------
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}
function plain(raw) {
  const s = raw.trim();
  if (s === "" ) return "";
  if (s === "~" || s === "null") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  return s;
}
function scalar(raw) {
  const s = raw.trim();
  if (s.startsWith("[") || s.startsWith("{")) return flow(s);
  if (s.length > 1 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) return s.slice(1, -1);
  return plain(s);
}
function flow(text) {
  let i = 0;
  const s = text;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const quoted = () => { const q = s[i++]; const st = i; while (i < s.length && s[i] !== q) i++; return s.slice(st, i++); };
  function value() {
    ws();
    if (s[i] === "[") return seq();
    if (s[i] === "{") return map();
    if (s[i] === '"' || s[i] === "'") return quoted();
    const st = i; while (i < s.length && !",]}".includes(s[i])) i++;
    return plain(s.slice(st, i));
  }
  function seq() { const out = []; i++; ws(); if (s[i] === "]") { i++; return out; }
    for (;;) { out.push(value()); ws(); if (s[i] === ",") { i++; continue; } if (s[i] === "]") i++; break; } return out; }
  function map() { const out = {}; i++; ws(); if (s[i] === "}") { i++; return out; }
    for (;;) { ws(); let key; if (s[i] === '"' || s[i] === "'") key = quoted(); else { const st = i; while (i < s.length && s[i] !== ":" && !",}".includes(s[i])) i++; key = s.slice(st, i).trim(); }
      ws(); if (s[i] === ":") i++; out[key] = value(); ws(); if (s[i] === ",") { i++; continue; } if (s[i] === "}") i++; break; } return out; }
  return value();
}
const indentOf = (l) => l.length - l.replace(/^ +/, "").length;
function block(lines, start, min) {
  let i = start; while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length || indentOf(lines[i]) < min) return [null, i];
  const ind = indentOf(lines[i]);
  return lines[i].trim().startsWith("-") ? seqBlock(lines, i, ind) : mapBlock(lines, i, ind);
}
function seqBlock(lines, start, ind) {
  const out = []; let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }
    if (indentOf(line) !== ind || !line.trim().startsWith("-")) break;
    const rest = line.trim().replace(/^-\s*/, "");
    if (rest === "") { const [v, n] = block(lines, i + 1, ind + 2); out.push(v); i = n; }
    else if (/^[A-Za-z_][\w .-]*:(\s|$)/.test(rest) && !rest.startsWith("{")) {
      const itemInd = indentOf(line) + 2;
      const sub = [" ".repeat(itemInd) + rest, ...lines.slice(i + 1)];
      const [v, consumed] = mapBlock(sub, 0, itemInd); out.push(v); i += consumed;
    } else { out.push(scalar(rest)); i++; }
  }
  return [out, i];
}
function mapBlock(lines, start, ind) {
  const out = {}; let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }
    if (indentOf(line) < ind) break;
    if (indentOf(line) > ind) { i++; continue; }
    const m = /^([^:]+):(.*)$/.exec(line.trim());
    if (!m) { i++; continue; }
    const key = m[1].trim().replace(/^["']|["']$/g, "");
    const rest = stripComment(m[2]).trim();
    if (rest === "") { const [v, n] = block(lines, i + 1, ind + 1); out[key] = v === null ? "" : v; i = n; }
    else { out[key] = scalar(rest); i++; }
  }
  return [out, i];
}
export function parseFrontmatter(text) {
  const lines = String(text).split(/\r?\n/).map((l) => stripComment(l).replace(/\s+$/, ""));
  return mapBlock(lines, 0, 0)[0];
}
export function splitDocument(text) {
  const src = String(text).replace(/^﻿/, "");
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { raw: null, frontmatter: null, body: src };
  return { raw: m[1], frontmatter: parseFrontmatter(m[1]), body: src.slice(m[0].length) };
}
const topKeys = (raw) => raw.split(/\r?\n/).filter((l) => /^[A-Za-z_]/.test(l)).map((l) => l.split(":")[0].trim());

// ---------------------------------------------------------------------------
// One concept file
// ---------------------------------------------------------------------------
function h1Sections(body) {
  const out = []; let cur = null;
  for (const line of body.split(/\r?\n/)) {
    const h = /^# (.*)$/.exec(line);
    if (h) { cur = { name: h[1].trim(), lines: [] }; out.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  return out;
}
const hasContent = (lines) => lines.some((l) => l.trim() !== "");
const isList = (v) => Array.isArray(v);
const isStrList = (v) => isList(v) && v.every((x) => typeof x === "string" && x.trim() !== "");

export function validateConcept(text, { path = "concept.md" } = {}) {
  const errors = []; const warnings = [];
  const err = (m) => errors.push(`${path}: ${m}`);
  const warn = (m) => warnings.push(`${path}: ${m}`);

  const file = basename(path);
  const dir = basename(path.slice(0, -file.length - 1) || "");
  if (!SLUG.test(file.replace(/\.md$/, ""))) err(`filename must be a lowercase hyphenated slug, got '${file}'`);

  const { raw, frontmatter: fm, body } = splitDocument(text);
  if (!fm) { err("no YAML frontmatter block"); return { errors, warnings, fm: null }; }

  const keys = topKeys(raw);
  for (const k of TEMPLATE_KEYS) if (!(k in fm)) err(`frontmatter is missing '${k}'`);
  for (const k of keys) if (!TEMPLATE_KEYS.includes(k) && !SPEC_KEYS.includes(k)) err(`frontmatter has unknown key '${k}'`);
  const known = keys.filter((k) => TEMPLATE_KEYS.includes(k));
  if (known.join() !== TEMPLATE_KEYS.filter((k) => known.includes(k)).join()) err(`frontmatter keys must be in the order ${TEMPLATE_KEYS.join(", ")}`);
  if (raw && PLACEHOLDER.test(raw)) err(`frontmatter still holds a template placeholder`);

  if (fm.type !== undefined) {
    if (!(fm.type in TYPE_DIRS)) err(`type must be one of ${Object.keys(TYPE_DIRS).join(", ")}, got '${fm.type}'`);
    else if (dir && DIR_TYPES[dir] && DIR_TYPES[dir] !== fm.type) err(`type '${fm.type}' belongs in ${TYPE_DIRS[fm.type]}/, not ${dir}/`);
  }
  if (typeof fm.title !== "string" || fm.title.trim() === "") err("title must be a non-empty string");
  if (typeof fm.description !== "string" || fm.description.trim() === "") err("description must be a non-empty one-sentence string");
  else {
    if (/\n/.test(fm.description)) err("description must be a single line");
    if (fm.description === STUB_DESCRIPTION) warn(`'${fm.title}' is still a stub — a person has to define it`);
  }
  if (fm.status !== undefined && !STATUSES.includes(fm.status)) err(`status must be ${STATUSES.join(" | ")}, got '${fm.status}'`);
  if (fm.aliases_to_avoid !== undefined && !isStrList(fm.aliases_to_avoid)) err("aliases_to_avoid must be a list of non-empty strings");
  if (fm.tags !== undefined && !isStrList(fm.tags)) err("tags must be a list of non-empty strings");
  if (fm.generated !== undefined) {
    const g = fm.generated;
    if (!g || typeof g !== "object" || isList(g)) err("generated must be a mapping { by, at }");
    else {
      if (!ACTOR.test(String(g.by || ""))) err(`generated.by must follow the actor convention (<producer>/<version>, human:<id>, process:<id>), got '${g.by}'`);
      if (!ISO.test(String(g.at || ""))) err(`generated.at must be an ISO 8601 datetime, got '${g.at}'`);
    }
  }
  const sourceIds = new Set();
  if (fm.sources !== undefined) {
    if (!isList(fm.sources) || fm.sources.length === 0) err("sources must be a non-empty list");
    else fm.sources.forEach((s, i) => {
      if (!s || typeof s !== "object") { err(`sources[${i}] must be a mapping`); return; }
      if (typeof s.resource !== "string" || s.resource === "") err(`sources[${i}] needs a 'resource'`);
      if (typeof s.id !== "string" || s.id === "") err(`sources[${i}] needs an 'id' (used by the body's footnotes)`);
      else sourceIds.add(s.id);
    });
  }
  if (fm.verified !== undefined) {
    const list = isList(fm.verified) ? fm.verified : [fm.verified];
    list.forEach((v, i) => { if (!v || !ACTOR.test(String(v.by || ""))) err(`verified[${i}].by must follow the actor convention`); });
  }

  const sections = h1Sections(body);
  const names = sections.map((s) => s.name);
  const required = BODY_SECTIONS.filter((s) => names.includes(s));
  for (const s of BODY_SECTIONS) if (!names.includes(s)) err(`body is missing '# ${s}'`);
  for (const n of names) if (!BODY_SECTIONS.includes(n) && !OPTIONAL_SECTIONS.includes(n)) err(`body has unknown section '# ${n}'`);
  if (required.join() !== BODY_SECTIONS.filter((s) => names.includes(s)).join() ||
      names.filter((n) => BODY_SECTIONS.includes(n)).join() !== required.join()) {
    err(`body sections must be in the order ${BODY_SECTIONS.join(", ")}${OPTIONAL_SECTIONS.map((s) => `, then optionally ${s}`).join("")}`);
  }
  const before = body.split(/\r?\n/).findIndex((l) => /^# /.test(l));
  if (before > 0 && hasContent(body.split(/\r?\n/).slice(0, before))) err("body has content before '# Definition'");
  for (const s of sections) if (!hasContent(s.lines)) err(`'# ${s.name}' is empty`);

  const fromIntent = sections.find((s) => s.name === "From the intent");
  if (fromIntent) {
    const txt = fromIntent.lines.join("\n");
    const defs = [...txt.matchAll(/^\[\^([^\]]+)\]:/gm)].map((m) => m[1]);
    const refs = [...txt.matchAll(/\[\^([^\]]+)\](?!:)/g)].map((m) => m[1]);
    if (refs.length === 0) err("'# From the intent' must quote at least one footnoted line");
    for (const r of new Set(refs)) if (!defs.includes(r)) err(`footnote [^${r}] is used but never defined`);
    for (const d of new Set(defs)) if (!sourceIds.has(d)) err(`footnote [^${d}] does not match any sources[].id`);
  }
  const links = [];
  for (const s of sections) for (const m of s.lines.join("\n").matchAll(LINK)) {
    const target = m[1];
    if (/^https?:\/\//.test(target) || target.startsWith("#")) continue;
    if (!target.startsWith("/")) { err(`link '${target}' must be bundle-relative and start with '/'`); continue; }
    const parts = target.slice(1).split("/");
    if (parts.length !== 2 || !(parts[0] in DIR_TYPES) || !parts[1].endsWith(".md")) { err(`link '${target}' must be /<type-dir>/<slug>.md`); continue; }
    links.push(target);
  }
  if (PLACEHOLDER.test(body)) err(`body still holds a template placeholder: ${PLACEHOLDER.exec(body)[0]}`);

  return { errors, warnings, fm, links };
}

// ---------------------------------------------------------------------------
// The whole bundle
// ---------------------------------------------------------------------------
export function validateIndex(text, conceptPaths) {
  const errors = [];
  const { raw, frontmatter: fm, body } = splitDocument(text);
  if (!fm) errors.push("index.md: must start with frontmatter holding only okf_version");
  else {
    const keys = topKeys(raw);
    if (keys.join() !== "okf_version") errors.push(`index.md: frontmatter may hold only okf_version, found: ${keys.join(", ") || "nothing"}`);
    if (String(fm.okf_version) !== OKF_VERSION) errors.push(`index.md: okf_version must be "${OKF_VERSION}", got '${fm.okf_version}'`);
  }
  const linked = [...body.matchAll(LINK)].map((m) => m[1]).filter((t) => !/^https?:/.test(t));
  const counts = new Map();
  for (const l of linked) counts.set(l, (counts.get(l) || 0) + 1);
  for (const p of conceptPaths) {
    const n = counts.get(p) || 0;
    if (n === 0) errors.push(`index.md: does not list ${p}`);
    if (n > 1) errors.push(`index.md: lists ${p} ${n} times`);
  }
  for (const l of counts.keys()) if (!conceptPaths.includes(l)) errors.push(`index.md: links to '${l}', which is not in the bundle`);
  return errors;
}

export function validateLog(text) {
  const errors = [];
  const lines = text.split(/\r?\n/);
  if (!/^# \S/.test(lines[0] || "")) errors.push("log.md: first line must be a '# ' heading");
  let prev = null; let inDate = false;
  for (const line of lines.slice(1)) {
    if (line.trim() === "") continue;
    const h = /^## (.*)$/.exec(line);
    if (h) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(h[1])) errors.push(`log.md: date heading must be '## YYYY-MM-DD', got '## ${h[1]}'`);
      else if (prev && h[1] > prev) errors.push(`log.md: entries must be newest first; ${h[1]} comes after ${prev}`);
      prev = h[1]; inDate = true; continue;
    }
    if (/^#/.test(line)) { errors.push(`log.md: unexpected heading '${line}'`); continue; }
    if (!inDate) { errors.push(`log.md: line outside any date heading: ${line.trim()}`); continue; }
    if (!/^\* \*\*[^*]+\*\*:/.test(line) && !/^\s{2,}\S/.test(line)) errors.push(`log.md: entries must look like '* **Kind**: text'; got: ${line.trim()}`);
  }
  return errors;
}

export function validateBundle(dir) {
  const errors = []; const warnings = [];
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return { errors: [`${dir}: no such directory`], warnings };
  const rootEntries = readdirSync(dir);
  const conceptPaths = []; const concepts = [];
  for (const e of rootEntries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (!(e in DIR_TYPES)) { errors.push(`${p}: unknown directory; only ${Object.values(TYPE_DIRS).join(", ")} are allowed`); continue; }
      for (const f of readdirSync(p)) {
        const fp = join(p, f);
        if (statSync(fp).isDirectory()) { errors.push(`${fp}: nested directories are not allowed`); continue; }
        if (!f.endsWith(".md")) { errors.push(`${fp}: only .md concept files belong here`); continue; }
        if (f === "index.md" || f === "log.md") { errors.push(`${fp}: reserved filename; only the bundle root has index.md and log.md`); continue; }
        const rel = `${e}/${f}`;
        const r = validateConcept(readFileSync(fp, "utf8"), { path: rel });
        errors.push(...r.errors); warnings.push(...r.warnings);
        conceptPaths.push(rel); concepts.push({ path: rel, fm: r.fm, links: r.links || [] });
      }
    } else if (e !== "index.md" && e !== "log.md") {
      errors.push(`${p}: only index.md, log.md and the type directories belong at the bundle root`);
    }
  }
  // one canonical title per concept; no title may be another concept's alias
  const byTitle = new Map(); const aliasOwner = new Map();
  for (const c of concepts) {
    if (!c.fm || typeof c.fm.title !== "string") continue;
    const t = c.fm.title.trim().toLowerCase();
    if (byTitle.has(t)) errors.push(`${c.path}: title '${c.fm.title}' is already used by ${byTitle.get(t)} — one canonical title per concept`);
    else byTitle.set(t, c.path);
    for (const a of c.fm.aliases_to_avoid || []) if (typeof a === "string") aliasOwner.set(a.trim().toLowerCase(), c);
  }
  for (const [t, p] of byTitle) {
    const o = aliasOwner.get(t);
    if (o && o.path !== p) errors.push(`${p}: title '${t}' is listed in aliases_to_avoid of ${o.path} (canonical: '${o.fm.title}')`);
  }
  const ids = new Set(conceptPaths.map((p) => `/${p}`));
  for (const c of concepts) for (const l of c.links) if (!ids.has(l)) warnings.push(`${c.path}: links to '${l}', which is not in the bundle yet`);

  if (!rootEntries.includes("index.md")) errors.push(`${join(dir, "index.md")}: missing`);
  else errors.push(...validateIndex(readFileSync(join(dir, "index.md"), "utf8"), conceptPaths).map((m) => `${dir}/${m}`));
  if (!rootEntries.includes("log.md")) errors.push(`${join(dir, "log.md")}: missing`);
  else errors.push(...validateLog(readFileSync(join(dir, "log.md"), "utf8")).map((m) => `${dir}/${m}`));
  return { errors, warnings };
}

function main(argv) {
  const target = argv[0] || "knowledge";
  if (!existsSync(target)) { console.error(`error: ${target}: no such file or directory`); return 2; }
  const res = statSync(target).isDirectory()
    ? validateBundle(target)
    : validateConcept(readFileSync(target, "utf8"), { path: relative(process.cwd(), target).split(sep).join("/") });
  for (const w of res.warnings) console.log(`warning: ${w}`);
  for (const e of res.errors) console.log(`error: ${e}`);
  if (res.errors.length) return 1;
  console.log(`ok ${target}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
