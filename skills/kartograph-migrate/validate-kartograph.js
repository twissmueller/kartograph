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

export const DOC = /^(\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*)\.(conversation|intent|mapping|revision)\.md$/;
export const TYPES = { conversation: "Conversation", intent: "Intent", mapping: "Mapping", revision: "Revision" };
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
    if (!m) { errors.push(`${e}: only index.md, log.md and YYYY-MM-DD-HHMM-slug.(conversation|intent|mapping|revision).md belong in kartograph/`); continue; }
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
