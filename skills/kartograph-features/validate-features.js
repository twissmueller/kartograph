#!/usr/bin/env node
// Validates the features/ tree written by kartograph-features: one directory per
// capability, at any depth, holding `capability.md` (the structure of
// `capability-template.md`), `.feature` files and sub-capability directories. Feature
// files are plain Gherkin; checked are only Kartograph's additions: the header comments,
// one Feature:, unique scenario names, a When and a Then per scenario. Enforced so no
// capability or feature drifts.
//
//   node validate-features.js [features]              validate the whole tree
//   node validate-features.js features/<capability>   validate one capability directory
//
// Exit code 1 when there are errors. Pure functions are exported for tests.
// Self-contained on purpose: a skill directory must work when copied on its own.
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CAPABILITY_SECTIONS = ["Sources", "Purpose and outcome", "Scope and exclusions", "Constraints", "Features", "Open questions"];
export const OPTIONAL_SECTIONS = new Set(["Constraints"]);
export const INTENT_PATH = /^intents\/\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const PLACEHOLDER = /<[A-Za-z][^>\n]*>/;

// Gherkin keywords per dialect. A file starts with `# language: <code>` on line 1 to use
// anything but English; the validator knows the dialects the projects actually use.
export const DIALECTS = {
  en: {
    feature: ["Feature", "Business Need", "Ability"], rule: ["Rule"], background: ["Background"],
    scenario: ["Scenario", "Example"], outline: ["Scenario Outline", "Scenario Template"], examples: ["Examples", "Scenarios"],
    given: ["Given"], when: ["When"], then: ["Then"], and: ["And"], but: ["But"],
  },
  de: {
    feature: ["Funktionalität", "Funktion"], rule: ["Regel"], background: ["Grundlage", "Hintergrund", "Voraussetzungen", "Vorbedingungen"],
    scenario: ["Szenario", "Beispiel"], outline: ["Szenariogrundriss", "Szenariogrundrisse"], examples: ["Beispiele"],
    given: ["Angenommen", "Gegeben sei", "Gegeben seien"], when: ["Wenn"], then: ["Dann"], and: ["Und"], but: ["Aber"],
  },
};
const LANGUAGE = /^#\s*language\s*:\s*([\w-]+)\s*$/;

// "Rule: x" → "x"; null when the line does not start with one of the keywords followed by a colon.
function block(line, words) {
  for (const w of words) if (line.startsWith(w + ":")) return line.slice(w.length + 1).trim();
  return null;
}
// The kind of step a line is: given | when | then | and | but | any (for "* "), or null.
function stepKind(line, d) {
  if (line.startsWith("* ")) return "any";
  for (const k of ["given", "when", "then", "and", "but"]) for (const w of d[k]) if (line.startsWith(w + " ")) return k;
  return null;
}

function h2Sections(text) {
  const lines = text.split(/\r?\n/);
  const h1 = []; const lead = []; const sections = []; let cur = null;
  for (const line of lines) {
    const m1 = /^# (.*)$/.exec(line);
    if (m1) { h1.push(m1[1].trim()); continue; }
    const m2 = /^## (.*)$/.exec(line);
    if (m2) { cur = { name: m2[1].trim(), lines: [] }; sections.push(cur); continue; }
    (cur ? cur.lines : lead).push(line);
  }
  return { h1, lead, sections };
}
const content = (lines) => lines.filter((l) => l.trim() !== "");
const bullets = (lines) => content(lines).filter((l) => /^- /.test(l));

// ---------------------------------------------------------------------------
// capability.md
// ---------------------------------------------------------------------------
export function validateCapability(text, { path = "capability.md", featureFiles = [] } = {}) {
  const errors = []; const err = (m) => errors.push(`${path}: ${m}`);
  const { h1, lead, sections } = h2Sections(text);

  if (h1.length !== 1) err(`exactly one '# Capability: <name>' heading expected, found ${h1.length}`);
  else if (!/^Capability: \S/.test(h1[0])) err(`first heading must be '# Capability: <name>', got '# ${h1[0]}'`);
  if (!content(lead).length) err("a one- or two-sentence lead paragraph is required between the heading and '## Sources'");

  const names = sections.map((s) => s.name);
  for (const s of CAPABILITY_SECTIONS) if (!OPTIONAL_SECTIONS.has(s) && !names.includes(s)) err(`missing section '## ${s}'`);
  for (const n of names) if (!CAPABILITY_SECTIONS.includes(n)) err(`unknown section '## ${n}'`);
  const known = names.filter((n) => CAPABILITY_SECTIONS.includes(n));
  if (known.join() !== CAPABILITY_SECTIONS.filter((s) => known.includes(s)).join()) err(`sections must be in the order ${CAPABILITY_SECTIONS.join(", ")}`);
  for (const s of sections) if (!content(s.lines).length) err(`'## ${s.name}' is empty`);

  const intents = [];
  const sources = sections.find((s) => s.name === "Sources");
  if (sources) {
    const bad = content(sources.lines).filter((l) => !/^- /.test(l) && !/^\s{2,}\S/.test(l));
    if (bad.length) err(`'## Sources' must be a bullet list; offending line: ${bad[0].trim()}`);
    for (const b of bullets(sources.lines)) {
      const m = /^- Intent: `([^`]+)`$/.exec(b);
      if (m) { if (!INTENT_PATH.test(m[1])) err(`source intent path must look like intents/YYYY-MM-DD-HHMM-<slug>.md, got '${m[1]}'`); intents.push(m[1]); }
    }
    if (!intents.length) err("'## Sources' needs at least one '- Intent: `intents/<file>.md`' line");
  }

  const listed = [];
  const features = sections.find((s) => s.name === "Features");
  if (features) {
    const lines = content(features.lines);
    for (const l of lines) {
      const m = /^- \[([^\]]+)\]\(([^)]+)\): \S/.exec(l);
      if (!m) { if (!/^\s{2,}\S/.test(l)) err(`'## Features' lines must be '- [Title](<name>.feature): text'; got: ${l.trim()}`); continue; }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.feature$/.test(m[2])) err(`feature link '${m[2]}' must be a slug ending in .feature in this directory`);
      listed.push(m[2]);
    }
    for (const f of listed) if (featureFiles.length && !featureFiles.includes(f)) err(`'## Features' links to '${f}', which does not exist`);
    for (const f of featureFiles) if (!listed.includes(f)) err(`'## Features' does not list ${f}`);
    const dup = listed.filter((f, i) => listed.indexOf(f) !== i);
    if (dup.length) err(`'## Features' lists ${dup[0]} more than once`);
  }

  const open = sections.find((s) => s.name === "Open questions");
  if (open) {
    const lines = content(open.lines);
    const isNone = lines.length === 1 && lines[0].trim() === "None";
    const bad = lines.filter((l) => !/^- /.test(l) && !/^\s{2,}\S/.test(l));
    if (!isNone && bad.length) err(`'## Open questions' must be a bullet list or exactly 'None'; offending line: ${bad[0].trim()}`);
  }
  const ph = PLACEHOLDER.exec(text);
  if (ph) err(`still holds a template placeholder: ${ph[0]}`);
  return { errors, intents, listed };
}

// ---------------------------------------------------------------------------
// One .feature file
// ---------------------------------------------------------------------------
export function validateFeature(text, { path = "x.feature", capabilityDir } = {}) {
  const errors = []; const err = (m) => errors.push(`${path}: ${m}`);
  const lines = text.split(/\r?\n/);
  const intents = [];
  let d = DIALECTS.en;
  let i = 0;
  const lang = LANGUAGE.exec(lines[0] || "");
  if (lang) {
    if (!DIALECTS[lang[1]]) err(`line 1: unknown language '${lang[1]}'; known: ${Object.keys(DIALECTS).join(", ")}`);
    else d = DIALECTS[lang[1]];
    i = 1;
  }

  while (i < lines.length && /^# Source intent: /.test(lines[i])) {
    const p = lines[i].slice("# Source intent: ".length).trim();
    if (!INTENT_PATH.test(p)) err(`line ${i + 1}: source intent path must look like intents/YYYY-MM-DD-HHMM-<slug>.md, got '${p}'`);
    intents.push(p); i++;
  }
  if (!intents.length) err(`line ${i + 1} must be '# Source intent: intents/<file>.md'`);
  const cap = /^# Capability: (.*)$/.exec(lines[i] || "");
  if (!cap) err(`line ${i + 1} must be '# Capability: features/<capability>/capability.md'`);
  else {
    const expected = capabilityDir ? `features/${capabilityDir}/capability.md` : null;
    if (expected && cap[1].trim() !== expected) err(`'# Capability:' must point at ${expected}, got '${cap[1].trim()}'`);
    i++;
  }

  const rest = lines.slice(i);
  // Comments and tag lines may precede the Feature: line; the first real line must be it.
  const firstCode = rest.map((l) => l.trim()).find((t) => t !== "" && !t.startsWith("#") && !t.startsWith("@"));
  if (!firstCode || !block(firstCode, d.feature)) err(`the first line after the header comments must be '${d.feature[0]}: <title>'`);
  const featureCount = rest.filter((l) => block(l.trim(), d.feature) !== null).length;
  if (featureCount > 1) err(`exactly one '${d.feature[0]}:' per file, found ${featureCount}`);

  // Plain Gherkin from here: Rule: optional, free text allowed under Feature:, Rule:, and before a
  // block's first step; Background: at feature and rule level; tags wherever Gherkin allows them.
  let scenarios = 0;
  let rule = null; let cur = null; const names = new Set();
  let inDocString = null; let expectHeader = false; const headerCells = new Set();
  const closeBlock = () => {
    if (!cur) return;
    if (cur.type === "scenario") {
      if (!cur.steps.includes("when") || !cur.steps.includes("then")) err(`scenario '${cur.name}' needs at least a When and a Then step`);
      if (!cur.steps.includes("then")) err(`scenario '${cur.name}' has no Then step`);
      if (cur.outline && !cur.examples) err(`scenario outline '${cur.name}' has no 'Examples:'`);
    }
    cur = null;
  };
  const closeRule = () => {
    if (!rule) return;
    closeBlock();
    if (!rule.scenarios) err(`rule '${rule.name}' has no scenario`);
    rule = null;
  };
  for (const line of rest) {
    const t = line.trim();
    if (inDocString !== null) { if (t.startsWith(inDocString)) inDocString = null; continue; }
    if (t === "" || t.startsWith("#") || t.startsWith("@")) continue;
    if (block(t, d.feature) !== null) continue;
    let m;
    if ((m = block(t, d.rule)) !== null) { closeRule(); closeBlock(); rule = { name: m, scenarios: 0 }; continue; }
    if (block(t, d.background) !== null) { closeBlock(); cur = { type: "background", steps: [] }; continue; }
    const outline = block(t, d.outline); const scenario = outline === null ? block(t, d.scenario) : null;
    if (outline !== null || scenario !== null) {
      closeBlock();
      const name = outline ?? scenario;
      if (rule) rule.scenarios++;
      if (names.has(name)) err(`scenario name '${name}' is used twice`); names.add(name);
      scenarios++; cur = { type: "scenario", name, outline: outline !== null, steps: [], examples: false };
      continue;
    }
    if (block(t, d.examples) !== null) { if (cur && cur.type === "scenario") cur.examples = true; expectHeader = true; continue; }
    if (t.startsWith("|")) { if (expectHeader) { for (const c of t.split("|").slice(1, -1)) headerCells.add(c.trim()); expectHeader = false; } continue; }
    if (t.startsWith('"""') || t.startsWith("```")) { inDocString = t.slice(0, 3); continue; }
    const kind = stepKind(t, d);
    if (kind) { if (!cur) err(`step outside any scenario: ${t}`); else cur.steps.push(kind); continue; }
    if (!cur || cur.steps.length === 0) continue; // feature, rule, background or scenario description
    err(`unexpected line: ${t}`);
  }
  closeRule(); closeBlock();
  if (!scenarios) err("at least one scenario is required");
  // `<name>` is a legitimate Scenario Outline parameter; template placeholders are multi-word,
  // unless an Examples header declares that multi-word parameter.
  for (const ph of text.matchAll(/<([A-Za-z][^>\n]* [^>\n]*)>/g)) {
    if (!headerCells.has(ph[1])) { err(`still holds a template placeholder: ${ph[0]}`); break; }
  }
  return { errors, intents };
}

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------
export function validateCapabilityDir(dir, { projectRoot } = {}) {
  const errors = []; const warnings = [];
  const name = basename(dir);
  const rel = (f) => `features/${name}/${f}`;
  if (!SLUG.test(name)) errors.push(`${dir}: capability directory must be a lowercase hyphenated slug`);
  const entries = readdirSync(dir);
  const featureFiles = entries.filter((f) => f.endsWith(".feature")).sort();
  for (const e of entries) {
    if (statSync(join(dir, e)).isDirectory()) errors.push(`${rel(e)}: no subdirectories inside a capability`);
    else if (e !== "capability.md" && !e.endsWith(".feature")) errors.push(`${rel(e)}: only capability.md and .feature files belong here`);
  }
  if (!featureFiles.length) errors.push(`${dir}: needs at least one .feature file`);
  let capIntents = [];
  if (!entries.includes("capability.md")) errors.push(`${rel("capability.md")}: missing`);
  else {
    const r = validateCapability(readFileSync(join(dir, "capability.md"), "utf8"), { path: rel("capability.md"), featureFiles });
    errors.push(...r.errors); capIntents = r.intents;
  }
  const allIntents = new Set(capIntents);
  for (const f of featureFiles) {
    if (!SLUG.test(f.replace(/\.feature$/, ""))) errors.push(`${rel(f)}: feature filename must be a lowercase hyphenated slug`);
    const r = validateFeature(readFileSync(join(dir, f), "utf8"), { path: rel(f), capabilityDir: name });
    errors.push(...r.errors);
    for (const p of r.intents) { allIntents.add(p); if (!capIntents.includes(p)) errors.push(`${rel(f)}: source intent '${p}' is not listed under '## Sources' in capability.md`); }
  }
  if (projectRoot) {
    const intentsDir = join(projectRoot, "intents");
    for (const p of allIntents) {
      if (!existsSync(join(projectRoot, p))) {
        (existsSync(intentsDir) ? errors : warnings).push(`${rel("capability.md")}: source intent '${p}' does not exist`);
      }
    }
  }
  return { errors, warnings };
}

export function validateTree(dir) {
  const errors = []; const warnings = [];
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return { errors: [`${dir}: no such directory`], warnings };
  const projectRoot = dirname(resolve(dir));
  const entries = readdirSync(dir);
  if (!entries.length) warnings.push(`${dir}: no capabilities yet`);
  for (const e of entries) {
    const p = join(dir, e);
    if (!statSync(p).isDirectory()) { errors.push(`${p}: only capability directories belong under features/`); continue; }
    const r = validateCapabilityDir(p, { projectRoot });
    errors.push(...r.errors); warnings.push(...r.warnings);
  }
  return { errors, warnings };
}

function main(argv) {
  const target = argv[0] || "features";
  if (!existsSync(target) || !statSync(target).isDirectory()) { console.error(`error: ${target}: no such directory`); return 2; }
  const isCapability = existsSync(join(target, "capability.md")) || readdirSync(target).some((f) => f.endsWith(".feature"));
  const res = isCapability
    ? validateCapabilityDir(resolve(target), { projectRoot: dirname(dirname(resolve(target))) })
    : validateTree(target);
  for (const w of res.warnings) console.log(`warning: ${w}`);
  for (const e of res.errors) console.log(`error: ${e}`);
  if (res.errors.length) return 1;
  console.log(`ok ${target}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
