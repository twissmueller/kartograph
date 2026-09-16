#!/usr/bin/env node
// Validates an implementation plan written by kartograph-plan, so every plan has the
// structure of `plan-template.md`, carries no placeholders, and — inside a project —
// names only scenarios that exist in features/.
//
//   node validate-plan.js <plans/file.md> [...]     validate the given files
//   node validate-plan.js                           validate every file in ./plans
//
// Exit code 1 when any file has errors. Pure function `validatePlan` is exported for tests.
// Self-contained on purpose: a skill directory must work when copied on its own.
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FILENAME = /^(\d{4}-\d{2}-\d{2})-(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
export const FRONTMATTER_KEYS = ["capability", "features", "status", "date", "supersedes"];
export const STATUSES = ["planned", "superseded"];
export const SECTIONS = ["Layer map", "Reuse and new", "Ports and adapters", "Files", "Global constraints", "Tasks", "Friction", "Gaps"];
export const TASK_LINES = ["Scenario", "Layers"];
export const PLACEHOLDER_PATTERNS = [
  /\bTBD\b/, /\bTODO\b/, /implement later/i, /fill in (the )?details/i,
  /add (appropriate )?error handling/i, /add validation/i, /handle edge cases/i,
  /write tests for the above/i, /similar to task \d+/i,
];
const TEMPLATE_PLACEHOLDER = /<[A-Za-z][^>\n]* [^>\n]*>|<…>|^…$/m;

function splitFrontmatter(text) {
  const src = String(text).replace(/^﻿/, "");
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { frontmatter: null, body: src };
  const entries = [];
  for (const line of m[1].split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) { entries.push({ key: null, raw: line }); continue; }
    entries.push({ key: kv[1], value: kv[2].trim() });
  }
  return { frontmatter: entries, body: src.slice(m[0].length) };
}
const parseList = (v) => { const m = /^\[(.*)\]$/.exec(v); return m ? m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean) : null; };

function outline(body) {
  const lines = body.split(/\r?\n/);
  const h1 = []; const lead = []; const sections = []; let sec = null; let task = null; let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) { inFence = !inFence; (task ? task.lines : sec ? sec.lines : lead).push(line); continue; }
    if (inFence) { (task ? task.lines : sec ? sec.lines : lead).push(line); continue; }
    let m;
    if ((m = /^# (.*)$/.exec(line))) { h1.push(m[1].trim()); continue; }
    if ((m = /^## (.*)$/.exec(line))) { sec = { name: m[1].trim(), lines: [], tasks: [] }; sections.push(sec); task = null; continue; }
    if ((m = /^### (.*)$/.exec(line))) { if (sec) { task = { title: m[1].trim(), lines: [] }; sec.tasks.push(task); } else lead.push(line); continue; }
    (task ? task.lines : sec ? sec.lines : lead).push(line);
  }
  return { h1, lead, sections };
}
const content = (lines) => lines.filter((l) => l.trim() !== "");

export function validatePlan(text, { filename, projectRoot } = {}) {
  const errors = []; const warnings = [];
  const err = (m) => errors.push(m);

  let fileDate = null; let fileCap = null;
  if (filename !== undefined) {
    const m = FILENAME.exec(basename(filename));
    if (!m) err(`filename must be YYYY-MM-DD-HHMM-<capability>.md, got '${basename(filename)}'`);
    else { fileDate = m[1]; fileCap = m[3]; }
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
  if (known.join() !== FRONTMATTER_KEYS.filter((k) => known.includes(k)).join()) err(`frontmatter keys must be in the order ${FRONTMATTER_KEYS.join(", ")}`);
  for (const [k, v] of Object.entries(fm)) {
    if (v === "") err(`frontmatter '${k}' is empty`);
    if (TEMPLATE_PLACEHOLDER.test(v)) err(`frontmatter '${k}' still holds a template placeholder: ${v}`);
  }
  if (fm.capability !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fm.capability)) err(`capability must be a lowercase hyphenated slug, got '${fm.capability}'`);
  if (fileCap && fm.capability && fm.capability !== fileCap) err(`capability '${fm.capability}' does not match the filename's '${fileCap}'`);
  const features = fm.features !== undefined ? parseList(fm.features) : null;
  if (fm.features !== undefined) {
    if (!features || !features.length) err("features must be a non-empty list like [a.feature, b.feature]");
    else for (const f of features) if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.feature$/.test(f)) err(`features entry '${f}' must be a slug ending in .feature`);
  }
  if (fm.status !== undefined && !STATUSES.includes(fm.status)) err(`status must be ${STATUSES.join(" | ")}, got '${fm.status}'`);
  if (fm.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) err(`date must be YYYY-MM-DD, got '${fm.date}'`);
  if (fileDate && fm.date && fm.date !== fileDate) err(`date '${fm.date}' does not match the filename date '${fileDate}'`);
  if (fm.supersedes !== undefined && fm.supersedes !== "none" && !/^plans\/\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9-]+\.md$/.test(fm.supersedes)) err(`supersedes must be 'none' or a plans/<file>.md path, got '${fm.supersedes}'`);

  const o = outline(body);
  if (o.h1.length !== 1) err(`exactly one '# Plan: <title>' heading expected, found ${o.h1.length}`);
  else if (!/^Plan: \S/.test(o.h1[0])) err(`first heading must be '# Plan: <capability title>', got '# ${o.h1[0]}'`);
  const lead = content(o.lead);
  if (!lead.some((l) => /^\*\*Goal:\*\* \S/.test(l))) err("a '**Goal:** <one sentence>' line is required before the first section");
  if (!lead.some((l) => /^\*\*Follows:\*\*/.test(l))) err("a '**Follows:**' line naming mvvm.md and build-design.md is required before the first section");

  const names = o.sections.map((s) => s.name);
  for (const s of SECTIONS) if (!names.includes(s)) err(`missing section '## ${s}'`);
  for (const n of names) if (!SECTIONS.includes(n)) err(`unknown section '## ${n}'`);
  const knownSecs = names.filter((n) => SECTIONS.includes(n));
  if (knownSecs.join() !== SECTIONS.filter((s) => knownSecs.includes(s)).join()) err(`sections must be in the order ${SECTIONS.join(", ")}`);
  for (const s of o.sections) if (s.name !== "Tasks" && !content(s.lines).length && !s.tasks.length) err(`'## ${s.name}' is empty`);

  const layerMap = o.sections.find((s) => s.name === "Layer map");
  const mapped = new Set();
  if (layerMap) {
    const rows = content(layerMap.lines).filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l) && !/^\|\s*scenario\s*\|/i.test(l));
    if (!rows.length) err("'## Layer map' needs a table with one row per scenario");
    for (const r of rows) { const cells = r.split("|").map((c) => c.trim()); if (cells[1]) mapped.add(cells[1]); }
  }
  const files = o.sections.find((s) => s.name === "Files");
  if (files) {
    const bad = content(files.lines).filter((l) => !/^- (Create|Modify|Test): `[^`]+`/.test(l) && !/^\s{2,}\S/.test(l));
    if (bad.length) err(`'## Files' lines must be '- Create|Modify|Test: \`path\` — …'; got: ${bad[0].trim()}`);
  }
  for (const name of ["Friction", "Gaps"]) {
    const s = o.sections.find((x) => x.name === name);
    if (!s) continue;
    const lines = content(s.lines);
    const isNone = lines.length === 1 && lines[0].trim() === "None";
    const bad = lines.filter((l) => !/^- /.test(l) && !/^\s{2,}\S/.test(l));
    if (!isNone && bad.length) err(`'## ${name}' must be a bullet list or exactly 'None'; offending line: ${bad[0].trim()}`);
  }

  const tasks = o.sections.find((s) => s.name === "Tasks");
  const friction = o.sections.find((s) => s.name === "Friction");
  const frictionNames = friction ? content(friction.lines).map((l) => /^- \*\*([^*]+)\*\*/.exec(l)?.[1]?.trim()).filter(Boolean) : [];
  const taskScenarios = [];
  if (tasks) {
    if (!tasks.tasks.length && !frictionNames.length) err("'## Tasks' has no '### Task N: <scenario>' and '## Friction' names nothing — a plan must plan something");
    tasks.tasks.forEach((t, i) => {
      const m = /^Task (\d+): (.+)$/.exec(t.title);
      if (!m) { err(`task heading must be '### Task N: <scenario name>', got '### ${t.title}'`); return; }
      if (Number(m[1]) !== i + 1) err(`'### ${t.title}' is out of order; expected Task ${i + 1}`);
      const scenario = m[2].trim(); taskScenarios.push(scenario);
      const txt = t.lines.join("\n");
      for (const k of TASK_LINES) if (!new RegExp(`^\\*\\*${k}:\\*\\* \\S`, "m").test(txt)) err(`'### ${t.title}': missing '**${k}:**' line`);
      if (!/^\*\*Interfaces:\*\*/m.test(txt)) err(`'### ${t.title}': missing '**Interfaces:**' block`);
      if (!/^- Consumes: \S/m.test(txt) || !/^- Produces: \S/m.test(txt)) err(`'### ${t.title}': Interfaces needs '- Consumes:' and '- Produces:' lines`);
      const steps = [...txt.matchAll(/^- \[ \] \*\*Step (\d+): (.*)\*\*/gm)];
      if (steps.length < 6) err(`'### ${t.title}': needs at least six steps (outer test, its failure, a layer's red/green, Koin, on-screen check, commit); found ${steps.length}`);
      steps.forEach((s, j) => { if (Number(s[1]) !== j + 1) err(`'### ${t.title}': step numbering breaks at Step ${s[1]}`); });
      if (steps.length && !/outer test/i.test(steps[0][2])) err(`'### ${t.title}': Step 1 must be the outer test`);
      if (steps.length && !/commit/i.test(steps[steps.length - 1][2])) err(`'### ${t.title}': the last step must be the commit`);
      const fences = (txt.match(/^```/gm) || []).length;
      if (fences < 6) err(`'### ${t.title}': every code step shows its code; found only ${fences / 2} fenced blocks`);
      const runs = (txt.match(/^Run: /gm) || []).length; const expects = (txt.match(/^Expected: /gm) || []).length;
      if (runs < 2 || expects < 2) err(`'### ${t.title}': each test run needs a 'Run:' and an 'Expected:' line`);
      if (!/^Expected: FAIL/m.test(txt)) err(`'### ${t.title}': the outer test must be expected to FAIL first`);
      if (!/^Expected: PASS/m.test(txt)) err(`'### ${t.title}': at least one run must be expected to PASS`);
      if (!/koin/i.test(txt)) err(`'### ${t.title}': no Koin binding step`);
      if (mapped.size && !mapped.has(scenario)) err(`'### ${t.title}': scenario is not in the layer map`);
    });
  }
  for (const s of mapped) if (!taskScenarios.includes(s) && !frictionNames.includes(s)) err(`layer map row '${s}' has neither a task nor a friction entry`);
  const dup = taskScenarios.filter((s, i) => taskScenarios.indexOf(s) !== i);
  if (dup.length) err(`scenario '${dup[0]}' has more than one task`);

  for (const p of PLACEHOLDER_PATTERNS) { const m = p.exec(body); if (m) err(`placeholder found: '${m[0]}' — plans carry the actual content`); }
  const tp = TEMPLATE_PLACEHOLDER.exec(body.replace(/`[^`\n]*`/g, ""));
  if (tp) err(`template placeholder left in the body: ${tp[0].trim()}`);

  if (projectRoot && fm.capability) {
    const capDir = join(projectRoot, "features", fm.capability);
    if (!existsSync(capDir)) warnings.push(`features/${fm.capability}/ does not exist in the project`);
    else {
      const known = new Set();
      for (const f of features || []) {
        const fp = join(capDir, f);
        if (!existsSync(fp)) { err(`features/${fm.capability}/${f} does not exist`); continue; }
        for (const m of readFileSync(fp, "utf8").matchAll(/^\s*(?:Scenario Outline|Scenario): (.*)$/gm)) known.add(m[1].trim());
      }
      if (known.size) {
        for (const s of taskScenarios) if (!known.has(s)) err(`task scenario '${s}' is not in the listed feature files`);
        for (const s of known) if (!taskScenarios.includes(s) && !frictionNames.includes(s)) err(`scenario '${s}' from the feature files has neither a task nor a friction entry`);
      }
    }
  }
  return { errors, warnings };
}

export function validatePlanFile(path, { projectRoot } = {}) {
  const root = projectRoot ?? (basename(dirname(resolve(path))) === "plans" ? dirname(dirname(resolve(path))) : undefined);
  return validatePlan(readFileSync(path, "utf8"), { filename: path, projectRoot: root });
}

function main(argv) {
  let files = argv;
  if (files.length === 0) {
    if (!existsSync("plans")) { console.error("usage: validate-plan.js <file.md> [...]  (or run where ./plans exists)"); return 2; }
    files = readdirSync("plans").filter((f) => f.endsWith(".md")).sort().map((f) => join("plans", f));
  }
  let failed = 0;
  for (const f of files) {
    if (!existsSync(f) || !statSync(f).isFile()) { console.error(`error: ${f}: no such file`); failed++; continue; }
    const { errors, warnings } = validatePlanFile(f);
    for (const w of warnings) console.log(`warning: ${f}: ${w}`);
    for (const e of errors) console.log(`error: ${f}: ${e}`);
    if (errors.length) failed++; else console.log(`ok ${f}`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
