#!/usr/bin/env node
// Validates a three-ring implementation plan written by kartograph-plan, so every plan has
// the structure of `plan-template.md`, carries no placeholders, and — inside a project —
// names only scenarios that exist in features/ and a stack declared in docs/code-design/.
// A plan kartograph-revise writes names its revision, marks each task the revision changed
// or added, and keeps the ticks of every other task the superseded plan had built.
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
// A capability name: its leaf slug, or the slash-joined path when the slug occurs twice under features/.
const CAP_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
export const FRONTMATTER_KEYS = ["capability", "features", "stack", "status", "date", "supersedes", "revision"];
// Only a plan written by kartograph-revise carries `revision`.
export const OPTIONAL_KEYS = new Set(["revision"]);
export const REVISED = ["changed", "added"];
const REVISION_PATH = /^kartograph\/\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.revision\.md$/;
export const STATUSES = ["planned", "superseded"];
export const SECTIONS = ["Screens", "Layer map", "Reuse and new", "Ports and adapters", "Files", "Global constraints", "Ring 1: Screens", "Ring 2: Domain", "Ring 3: Adapters", "Friction", "Gaps"];
export const RINGS = { "Ring 1: Screens": 1, "Ring 2: Domain": 2, "Ring 3: Adapters": 3 };
export const PLACEHOLDER_PATTERNS = [
  /\bTBD\b/, /\bTODO\b/, /implement later/i, /fill in (the )?details/i,
  /add (appropriate )?error handling/i, /add validation/i, /handle edge cases/i,
  /write tests for the above/i, /similar to task [\d.]+/i,
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
const tableRows = (lines) => content(lines).filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l)).slice(1).map((r) => r.split("|").map((c) => c.trim()).slice(1, -1));
const bulletNames = (lines) => content(lines).map((l) => /^- \*\*([^*]+)\*\*/.exec(l)?.[1]?.trim()).filter(Boolean);

function checkTask(t, ring, err) {
  const m = /^Task (\d+)\.(\d+): (.+)$/.exec(t.title);
  if (!m) { err(`task heading must be '### Task ${ring}.N: <name>', got '### ${t.title}'`); return null; }
  if (Number(m[1]) !== ring) err(`'### ${t.title}' sits in ring ${ring} but is numbered ${m[1]}.x`);
  const name = m[3].trim(); const txt = t.lines.join("\n"); const label = `'### ${t.title}'`;
  if (!/^\*\*Interfaces:\*\*/m.test(txt)) err(`${label}: missing '**Interfaces:**' block`);
  if (!/^- Consumes: \S/m.test(txt) || !/^- Produces: \S/m.test(txt)) err(`${label}: Interfaces needs '- Consumes:' and '- Produces:' lines`);
  const steps = [...txt.matchAll(/^- \[[ x]\] \*\*Step (\d+): (.*)\*\*/gm)];
  steps.forEach((s, j) => { if (Number(s[1]) !== j + 1) err(`${label}: step numbering breaks at Step ${s[1]}`); });
  if (steps.length && !/commit/i.test(steps[steps.length - 1][2])) err(`${label}: the last step must be the commit`);
  const fences = (txt.match(/^```/gm) || []).length / 2;
  const runs = (txt.match(/^Run: /gm) || []).length; const expects = (txt.match(/^Expected: /gm) || []).length;
  if (runs !== expects) err(`${label}: every 'Run:' needs an 'Expected:' line and vice versa`);
  if (!/\b(bind|binds|binding|rebind|wire|wires|wiring|wired)\b/i.test(txt)) err(`${label}: no composition-root binding or wiring step`);
  const fields = {};
  for (const mm of txt.matchAll(/^\*\*([A-Za-z]+):\*\* (.+)$/gm)) fields[mm[1]] = mm[2].trim();
  if (ring === 1) {
    if (!fields.Screen) err(`${label}: missing '**Screen:**' line`);
    if (!fields.Scenarios) err(`${label}: missing '**Scenarios:**' line`);
    if (steps.length < 6) err(`${label}: a screen task needs at least six steps (state contract, ports, presentation model, fakes, screen, wiring and navigation, compile, commit); found ${steps.length}`);
    if (!steps.some((s) => /fake|sample data/i.test(s[2]))) err(`${label}: no fakes-and-sample-data step`);
    if (!steps.some((s) => /compile|build|see/i.test(s[2]))) err(`${label}: no compile-and-see step`);
    if (fences < 4) err(`${label}: every code step shows its code; found only ${fences} fenced blocks`);
    if (/Expected: FAIL/.test(txt)) err(`${label}: ring 1 has no tests, so nothing is expected to FAIL`);
  }
  if (ring === 2) {
    if (!fields.Scenario) err(`${label}: missing '**Scenario:**' line`);
    if (!fields.Layers) err(`${label}: missing '**Layers:**' line`);
    if (steps.length < 6) err(`${label}: a domain task needs at least six steps (outer test, its failure, a layer's red/green, the rebind, on-screen check, commit); found ${steps.length}`);
    if (steps.length && !/outer test/i.test(steps[0][2])) err(`${label}: Step 1 must be the outer test`);
    if (!/^Expected: FAIL/m.test(txt)) err(`${label}: the outer test must be expected to FAIL first`);
    if (!/^Expected: PASS/m.test(txt)) err(`${label}: at least one run must be expected to PASS`);
    if (fences < 4) err(`${label}: every code step shows its code; found only ${fences} fenced blocks`);
  }
  if (ring === 3) {
    if (!fields.Adapter) err(`${label}: missing '**Adapter:**' line`);
    if (!fields.Port) err(`${label}: missing '**Port:**' line`);
    if (steps.length < 5) err(`${label}: an adapter task needs at least five steps (failing test, its failure, implementation, passing run, the rebind, commit); found ${steps.length}`);
    if (!/^Expected: FAIL/m.test(txt)) err(`${label}: the adapter test must be expected to FAIL first`);
    if (!/^Expected: PASS/m.test(txt)) err(`${label}: at least one run must be expected to PASS`);
    if (fences < 3) err(`${label}: every code step shows its code; found only ${fences} fenced blocks`);
  }
  if (fields.Revised !== undefined && !REVISED.includes(fields.Revised)) err(`${label}: '**Revised:**' is ${REVISED.join(" or ")}, got '${fields.Revised}'`);
  return { name, fields, done: steps.length > 0 && steps.every((s) => /^- \[x\]/.test(s[0])), steps: steps.length };
}

// Finds a capability directory by leaf slug (anywhere under features/) or by slash-joined path.
// Returns { dir, rel } | { missing: true } | { ambiguous: [rel, ...] }. Copied from
// validate-features.js on purpose: each skill directory works on its own.
function resolveCapabilityDir(featuresDir, name) {
  if (name.includes("/")) {
    const p = join(featuresDir, name);
    return existsSync(p) && statSync(p).isDirectory() ? { dir: p, rel: name } : { missing: true };
  }
  const hits = [];
  const walk = (d, rel) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d).sort()) {
      const p = join(d, e); if (e.startsWith(".") || !statSync(p).isDirectory()) continue;
      const r = rel ? `${rel}/${e}` : e;
      if (e === name) hits.push(r);
      walk(p, r);
    }
  };
  walk(featuresDir, "");
  if (!hits.length) return { missing: true };
  if (hits.length > 1) return { ambiguous: hits };
  return { dir: join(featuresDir, hits[0]), rel: hits[0] };
}

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
  for (const k of FRONTMATTER_KEYS) if (!OPTIONAL_KEYS.has(k) && !(k in fm)) err(`frontmatter is missing '${k}'`);
  for (const k of keys) if (!FRONTMATTER_KEYS.includes(k)) err(`frontmatter has unknown key '${k}'`);
  const known = keys.filter((k) => FRONTMATTER_KEYS.includes(k));
  if (known.join() !== FRONTMATTER_KEYS.filter((k) => known.includes(k)).join()) err(`frontmatter keys must be in the order ${FRONTMATTER_KEYS.join(", ")}`);
  for (const [k, v] of Object.entries(fm)) {
    if (v === "") err(`frontmatter '${k}' is empty`);
    if (TEMPLATE_PLACEHOLDER.test(v)) err(`frontmatter '${k}' still holds a template placeholder: ${v}`);
  }
  if (fm.capability !== undefined && !CAP_NAME.test(fm.capability)) err(`capability must be a lowercase hyphenated slug or a slash-joined path of slugs, got '${fm.capability}'`);
  if (fileCap && fm.capability && fm.capability.split("/").pop() !== fileCap) err(`capability '${fm.capability}' does not match the filename's '${fileCap}'`);
  const features = fm.features !== undefined ? parseList(fm.features) : null;
  if (fm.features !== undefined) {
    if (!features || !features.length) err("features must be a non-empty list like [a.feature, b.feature]");
    else for (const f of features) if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.feature$/.test(f)) err(`features entry '${f}' must be a slug ending in .feature`);
  }
  if (fm.stack !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fm.stack)) err(`stack must be a lowercase hyphenated name, got '${fm.stack}'`);
  if (fm.status !== undefined && !STATUSES.includes(fm.status)) err(`status must be ${STATUSES.join(" | ")}, got '${fm.status}'`);
  if (fm.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) err(`date must be YYYY-MM-DD, got '${fm.date}'`);
  if (fileDate && fm.date && fm.date !== fileDate) err(`date '${fm.date}' does not match the filename date '${fileDate}'`);
  if (fm.supersedes !== undefined && fm.supersedes !== "none" && !/^plans\/\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9-]+\.md$/.test(fm.supersedes)) err(`supersedes must be 'none' or a plans/<file>.md path, got '${fm.supersedes}'`);
  if (fm.revision !== undefined) {
    if (!REVISION_PATH.test(fm.revision)) err(`revision must be a kartograph/YYYY-MM-DD-HHMM-<slug>.revision.md path, got '${fm.revision}'`);
    if (fm.supersedes === "none") err("a plan written for a revision supersedes the plan it revises; supersedes cannot be 'none'");
  }

  const o = outline(body);
  if (o.h1.length !== 1) err(`exactly one '# Plan: <title>' heading expected, found ${o.h1.length}`);
  else if (!/^Plan: \S/.test(o.h1[0])) err(`first heading must be '# Plan: <capability title>', got '# ${o.h1[0]}'`);
  const lead = content(o.lead);
  if (!lead.some((l) => /^\*\*Goal:\*\* \S/.test(l))) err("a '**Goal:** <one sentence>' line is required before the first section");
  if (!lead.some((l) => /^\*\*Follows:\*\*/.test(l))) err("a '**Follows:**' line naming the docs/code-design documents is required before the first section");

  const names = o.sections.map((s) => s.name);
  for (const s of SECTIONS) if (!names.includes(s)) err(`missing section '## ${s}'`);
  for (const n of names) if (!SECTIONS.includes(n)) err(`unknown section '## ${n}'`);
  const knownSecs = names.filter((n) => SECTIONS.includes(n));
  if (knownSecs.join() !== SECTIONS.filter((s) => knownSecs.includes(s)).join()) err(`sections must be in the order ${SECTIONS.join(", ")}`);
  for (const s of o.sections) if (!(s.name in RINGS) && !content(s.lines).length) err(`'## ${s.name}' is empty`);
  const sec = (n) => o.sections.find((s) => s.name === n);

  const screenRows = sec("Screens") ? tableRows(sec("Screens").lines) : [];
  if (sec("Screens") && !screenRows.length) err("'## Screens' needs a table with one row per screen");
  const screens = new Map(); const screenScenarios = new Set();
  for (const r of screenRows) { if (r[0]) { screens.set(r[0], r); for (const s of (r[2] || "").split(";").map((x) => x.trim()).filter(Boolean)) screenScenarios.add(s); } }

  const mapRows = sec("Layer map") ? tableRows(sec("Layer map").lines) : [];
  if (sec("Layer map") && !mapRows.length) err("'## Layer map' needs a table with one row per scenario");
  const mapped = new Set(mapRows.map((r) => r[0]).filter(Boolean));

  const portRows = sec("Ports and adapters") ? tableRows(sec("Ports and adapters").lines) : [];
  const ring3Ports = portRows.filter((r) => /3/.test(r[3] || "")).map((r) => r[0].replace(/`/g, ""));

  const files = sec("Files");
  if (files) { const bad = content(files.lines).filter((l) => !/^- (Create|Modify|Test): `[^`]+`/.test(l) && !/^\s{2,}\S/.test(l)); if (bad.length) err(`'## Files' lines must be '- Create|Modify|Test: \`path\` — …'; got: ${bad[0].trim()}`); }
  for (const name of ["Friction", "Gaps"]) {
    const s = sec(name); if (!s) continue;
    const lines = content(s.lines); const isNone = lines.length === 1 && lines[0].trim() === "None";
    const bad = lines.filter((l) => !/^- /.test(l) && !/^\s{2,}\S/.test(l));
    if (!isNone && bad.length) err(`'## ${name}' must be a bullet list or exactly 'None'; offending line: ${bad[0].trim()}`);
  }
  const frictionNames = sec("Friction") ? bulletNames(sec("Friction").lines) : [];

  const rings = { 1: [], 2: [], 3: [] };
  for (const [secName, ring] of Object.entries(RINGS)) {
    const s = sec(secName); if (!s) continue;
    if (content(s.lines).length) err(`'## ${secName}' has text outside its task sections: ${content(s.lines)[0].trim()}`);
    s.tasks.forEach((t, i) => {
      const r = checkTask(t, ring, err); if (!r) return;
      const n = /^Task \d+\.(\d+):/.exec(t.title); if (n && Number(n[1]) !== i + 1) err(`'### ${t.title}' is out of order; expected Task ${ring}.${i + 1}`);
      rings[ring].push(r);
    });
  }
  if (!rings[1].length) err("'## Ring 1: Screens' has no task");
  if (!rings[2].length && !frictionNames.length) err("'## Ring 2: Domain' has no task and '## Friction' names nothing — a plan must plan something");

  // ring 1 ↔ screens table
  const taskScreens = rings[1].map((r) => r.name);
  for (const s of screens.keys()) if (!taskScreens.includes(s)) err(`screen '${s}' from '## Screens' has no ring-1 task`);
  for (const s of taskScreens) if (!screens.has(s)) err(`ring-1 task '${s}' is not in '## Screens'`);
  for (const r of rings[1]) for (const sc of (r.fields.Scenarios || "").split(";").map((x) => x.trim()).filter(Boolean)) if (mapped.size && !mapped.has(sc)) err(`ring-1 task '${r.name}' lists scenario '${sc}', which is not in the layer map`);
  // ring 2 ↔ layer map ↔ screens
  const domainScenarios = rings[2].map((r) => r.name);
  for (const s of domainScenarios) { if (mapped.size && !mapped.has(s)) err(`ring-2 task '${s}' is not in the layer map`); if (screenScenarios.size && !screenScenarios.has(s)) err(`scenario '${s}' is served by no screen in '## Screens'`); }
  for (const s of mapped) if (!domainScenarios.includes(s) && !frictionNames.includes(s)) err(`layer map row '${s}' has neither a ring-2 task nor a friction entry`);
  const dup = domainScenarios.filter((s, i) => domainScenarios.indexOf(s) !== i); if (dup.length) err(`scenario '${dup[0]}' has more than one ring-2 task`);
  // a revision plan marks what it revised, and only a revision plan does
  const revised = [1, 2, 3].flatMap((n) => rings[n].filter((r) => r.fields.Revised !== undefined));
  if (fm.revision !== undefined && !revised.length) err("the plan names a revision but marks no task '**Revised:** changed' or '**Revised:** added'");
  if (fm.revision === undefined && revised.length) err(`'**Revised:**' marks task '${revised[0].name}', but the frontmatter names no revision`);
  // ring 3 ↔ ports table
  const adapterPorts = rings[3].map((r) => (r.fields.Port || "").replace(/`/g, "").split(/\s/)[0]);
  for (const p of ring3Ports) if (!adapterPorts.some((a) => a === p) && !frictionNames.some((f) => f.includes(p))) warnings.push(`port '${p}' is marked ring 3 in '## Ports and adapters' but has no ring-3 task`);

  for (const p of PLACEHOLDER_PATTERNS) { const m = p.exec(body); if (m) err(`placeholder found: '${m[0]}' — plans carry the actual content`); }
  // Prose only: a fenced block holds real code, where `<div class="row">` or `List<String>` is
  // content, not a template placeholder; the placeholder patterns above still scan the fences.
  const prose = body.replace(/^```[\s\S]*?^```[ \t]*$/gm, "").replace(/`[^`\n]*`/g, "");
  const tp = TEMPLATE_PLACEHOLDER.exec(prose);
  if (tp) err(`template placeholder left in the body: ${tp[0].trim()}`);

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
    if (!existsSync(stackFile)) warnings.push("docs/code-design/stack.md does not exist in the project");
    else if (fm.stack) { const declared = /^stack:\s*(\S+)/m.exec(readFileSync(stackFile, "utf8"))?.[1]; if (declared && declared !== fm.stack) err(`plan stack '${fm.stack}' differs from docs/code-design/stack.md ('${declared}')`); }
    if (fm.capability) {
      const found = resolveCapabilityDir(join(projectRoot, "features"), fm.capability);
      if (found.ambiguous) err(`capability '${fm.capability}' is ambiguous (${found.ambiguous.join(", ")}); use the slash-joined path`);
      else if (found.missing) warnings.push(`features/${fm.capability}/ does not exist in the project`);
      else {
        const capDir = found.dir; const capRel = found.rel;
        const knownScen = new Set();
        for (const f of features || []) {
          const fp = join(capDir, f);
          if (!existsSync(fp)) { err(`features/${capRel}/${f} does not exist`); continue; }
          for (const m of readFileSync(fp, "utf8").matchAll(/^\s*(?:Scenario Outline|Scenario): (.*)$/gm)) knownScen.add(m[1].trim());
        }
        if (knownScen.size) {
          for (const s of domainScenarios) if (!knownScen.has(s)) err(`ring-2 task scenario '${s}' is not in the listed feature files`);
          for (const s of knownScen) if (!domainScenarios.includes(s) && !frictionNames.includes(s)) err(`scenario '${s}' from the feature files has neither a ring-2 task nor a friction entry`);
        }
      }
    }
  }
  return { errors, warnings, rings: { 1: rings[1].every((r) => r.done) && rings[1].length > 0, 2: rings[2].every((r) => r.done) && rings[2].length > 0, 3: rings[3].every((r) => r.done) && rings[3].length > 0 } };
}

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
    const { errors, warnings, rings } = validatePlanFile(f);
    for (const w of warnings) console.log(`warning: ${f}: ${w}`);
    for (const e of errors) console.log(`error: ${f}: ${e}`);
    if (errors.length) failed++; else console.log(`ok ${f} (rings done: 1=${rings[1]} 2=${rings[2]} 3=${rings[3]})`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
