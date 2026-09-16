#!/usr/bin/env node
// Validates a walk record written by kartograph-walk, so every walk has the structure of
// `walk-template.md` and none drifts. Optionally checks the record against the project's
// features/ tree: every feature listed exists and every scenario walked is in its file.
//
//   node validate-walk.js <walks/file.md> [...]     validate the given files
//   node validate-walk.js                           validate every file in ./walks
//
// Exit code 1 when any file has errors. Pure function `validateWalk` is exported for tests.
// Self-contained on purpose: a skill directory must work when copied on its own.
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FILENAME = /^(\d{4}-\d{2}-\d{2})-(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
export const FRONTMATTER_KEYS = ["capability", "features", "driver", "surface", "date", "walker"];
export const DRIVERS = ["compose-hot-reload", "chrome", "playwright", "screen-control", "person"];
export const SURFACES = ["desktop", "web", "ios-simulator", "macos", "iphone", "ipad", "android"];
export const VERDICTS = ["passed", "failed", "skipped", "not drivable"];
export const SUMMARY_LINES = ["Passed", "Failed", "Skipped", "Not drivable"];
export const SCENARIO_LINES = ["Verdict", "Observed", "Person said", "Stuck at"];
const PLACEHOLDER = /<[A-Za-z][^>\n]* [^>\n]*>|<n>|<[a-z-]+>\.feature/;

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

const parseList = (v) => {
  const m = /^\[(.*)\]$/.exec(v);
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
};

// body → { h1, summary: {lines, extra}, features: [{ name, scenarios: [{ name, fields }] }] }
function outline(body) {
  const lines = body.split(/\r?\n/);
  const h1 = []; let summary = null; const features = []; let feature = null; let scenario = null; let pre = [];
  for (const line of lines) {
    let m;
    if ((m = /^# (.*)$/.exec(line))) { h1.push(m[1].trim()); continue; }
    if ((m = /^## (.*)$/.exec(line))) {
      const name = m[1].trim();
      scenario = null;
      if (name === "Summary") { summary = { lines: [] }; feature = null; continue; }
      feature = { name, scenarios: [], lines: [] }; features.push(feature); continue;
    }
    if ((m = /^### (.*)$/.exec(line))) {
      if (!feature) { pre.push(line); continue; }
      scenario = { name: m[1].trim(), fields: {}, extra: [] }; feature.scenarios.push(scenario); continue;
    }
    if (line.trim() === "") continue;
    if (scenario) {
      const f = /^- \*\*([^*]+):\*\*\s*(.*)$/.exec(line);
      if (f) scenario.fields[f[1].trim()] = f[2].trim(); else scenario.extra.push(line);
    } else if (feature) feature.lines.push(line);
    else if (summary) summary.lines.push(line);
    else pre.push(line);
  }
  return { h1, summary, features, pre };
}

export function validateWalk(text, { filename, projectRoot } = {}) {
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
    if (PLACEHOLDER.test(v)) err(`frontmatter '${k}' still holds a template placeholder: ${v}`);
  }
  if (fm.capability !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fm.capability)) err(`capability must be a lowercase hyphenated slug, got '${fm.capability}'`);
  if (fileCap && fm.capability && fm.capability !== fileCap) err(`capability '${fm.capability}' does not match the filename's '${fileCap}'`);
  const features = fm.features !== undefined ? parseList(fm.features) : null;
  if (fm.features !== undefined) {
    if (!features || !features.length) err("features must be a non-empty list like [a.feature, b.feature]");
    else for (const f of features) if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.feature$/.test(f)) err(`features entry '${f}' must be a slug ending in .feature`);
  }
  if (fm.driver !== undefined && !DRIVERS.includes(fm.driver)) err(`driver must be ${DRIVERS.join(" | ")}, got '${fm.driver}'`);
  if (fm.surface !== undefined && !SURFACES.includes(fm.surface)) err(`surface must be ${SURFACES.join(" | ")}, got '${fm.surface}'`);
  if (fm.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) err(`date must be YYYY-MM-DD, got '${fm.date}'`);
  if (fileDate && fm.date && fm.date !== fileDate) err(`date '${fm.date}' does not match the filename date '${fileDate}'`);

  const o = outline(body);
  if (o.h1.length !== 1) err(`exactly one '# Walk: <title>' heading expected, found ${o.h1.length}`);
  else if (!/^Walk: \S/.test(o.h1[0])) err(`first heading must be '# Walk: <capability title>', got '# ${o.h1[0]}'`);
  if (o.pre.some((l) => l.trim() !== "")) err(`content before '## Summary' is not allowed: ${o.pre.find((l) => l.trim() !== "").trim()}`);

  const counts = {};
  if (!o.summary) err("missing '## Summary' section");
  else {
    const bullets = o.summary.lines.filter((l) => /^- /.test(l));
    for (const s of SUMMARY_LINES) {
      const b = bullets.find((l) => l.startsWith(`- **${s}:**`));
      if (!b) { err(`'## Summary' is missing the '- **${s}:** <n>' line`); continue; }
      const n = /^- \*\*[^*]+:\*\*\s*(\d+)\s*$/.exec(b);
      if (!n) err(`'## Summary' line for ${s} must end in a whole number: ${b}`); else counts[s] = Number(n[1]);
    }
    const prose = o.summary.lines.filter((l) => !/^- /.test(l));
    if (!prose.length) err("'## Summary' needs one line saying what this surface proves");
  }

  const listed = features || [];
  const walked = o.features.map((f) => f.name);
  for (const f of walked) if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.feature$/.test(f)) err(`section '## ${f}' must be named after a .feature file`);
  for (const f of listed) if (!walked.includes(f)) err(`frontmatter lists ${f} but there is no '## ${f}' section`);
  for (const f of walked) if (listed.length && !listed.includes(f)) err(`section '## ${f}' is not listed under frontmatter 'features'`);
  if (!o.features.length) err("at least one '## <feature>.feature' section is required");

  const tally = { Passed: 0, Failed: 0, Skipped: 0, "Not drivable": 0 };
  const scenarioNames = new Set();
  for (const f of o.features) {
    if (!f.scenarios.length) err(`'## ${f.name}' has no '### <scenario>' section`);
    if (f.lines.length) err(`'## ${f.name}' has text outside its scenario sections: ${f.lines[0].trim()}`);
    for (const s of f.scenarios) {
      const id = `${f.name}#${s.name}`;
      if (scenarioNames.has(id)) err(`scenario '${s.name}' appears twice under ${f.name}`); scenarioNames.add(id);
      for (const k of SCENARIO_LINES) if (!(k in s.fields)) err(`'### ${s.name}': missing '- **${k}:**' line`);
      for (const k of Object.keys(s.fields)) if (!SCENARIO_LINES.includes(k)) err(`'### ${s.name}': unknown line '- **${k}:**'`);
      if (Object.keys(s.fields).filter((k) => SCENARIO_LINES.includes(k)).join() !== SCENARIO_LINES.filter((k) => k in s.fields).join()) err(`'### ${s.name}': lines must be in the order ${SCENARIO_LINES.join(", ")}`);
      if (s.extra.length) err(`'### ${s.name}': unexpected line: ${s.extra[0].trim()}`);
      const v = s.fields.Verdict;
      if (v !== undefined) {
        if (!VERDICTS.includes(v)) err(`'### ${s.name}': verdict must be ${VERDICTS.join(" | ")}, got '${v}'`);
        else {
          tally[v === "not drivable" ? "Not drivable" : v[0].toUpperCase() + v.slice(1)]++;
          if (v === "failed" && (!s.fields["Person said"] || s.fields["Person said"] === "—")) err(`'### ${s.name}': a failed scenario needs the person's words under 'Person said'`);
          if (v === "not drivable" && (!s.fields["Stuck at"] || s.fields["Stuck at"] === "—")) err(`'### ${s.name}': a not-drivable scenario needs 'Stuck at'`);
          if (v !== "not drivable" && s.fields["Stuck at"] && s.fields["Stuck at"] !== "—") err(`'### ${s.name}': 'Stuck at' must be '—' unless the verdict is not drivable`);
          if (v === "skipped" && s.fields.Observed && s.fields.Observed !== "—") warnings.push(`'### ${s.name}': skipped, but 'Observed' is filled`);
        }
      }
      if (s.fields.Observed === "") err(`'### ${s.name}': 'Observed' is empty (write '—' if nothing was observed)`);
    }
  }
  for (const k of SUMMARY_LINES) if (k in counts && counts[k] !== tally[k]) err(`'## Summary' says ${k}: ${counts[k]} but the scenarios tally ${tally[k]}`);

  const ph = PLACEHOLDER.exec(body);
  if (ph) err(`body still holds a template placeholder: ${ph[0]}`);

  // Optional: check against the project's features/ tree.
  if (projectRoot && fm.capability) {
    const capDir = join(projectRoot, "features", fm.capability);
    if (!existsSync(capDir)) warnings.push(`features/${fm.capability}/ does not exist in the project`);
    else for (const f of o.features) {
      const fp = join(capDir, f.name);
      if (!existsSync(fp)) { err(`features/${fm.capability}/${f.name} does not exist`); continue; }
      const names = new Set([...readFileSync(fp, "utf8").matchAll(/^\s*(?:Scenario Outline|Scenario): (.*)$/gm)].map((m) => m[1].trim()));
      for (const s of f.scenarios) if (!names.has(s.name)) err(`'### ${s.name}' is not a scenario in features/${fm.capability}/${f.name}`);
    }
  }
  return { errors, warnings };
}

export function validateWalkFile(path, { projectRoot } = {}) {
  const root = projectRoot ?? (basename(dirname(resolve(path))) === "walks" ? dirname(dirname(resolve(path))) : undefined);
  return validateWalk(readFileSync(path, "utf8"), { filename: path, projectRoot: root });
}

function main(argv) {
  let files = argv;
  if (files.length === 0) {
    if (!existsSync("walks")) { console.error("usage: validate-walk.js <file.md> [...]  (or run where ./walks exists)"); return 2; }
    files = readdirSync("walks").filter((f) => f.endsWith(".md")).sort().map((f) => join("walks", f));
  }
  let failed = 0;
  for (const f of files) {
    if (!existsSync(f) || !statSync(f).isFile()) { console.error(`error: ${f}: no such file`); failed++; continue; }
    const { errors, warnings } = validateWalkFile(f);
    for (const w of warnings) console.log(`warning: ${f}: ${w}`);
    for (const e of errors) console.log(`error: ${f}: ${e}`);
    if (errors.length) failed++; else console.log(`ok ${f}`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
