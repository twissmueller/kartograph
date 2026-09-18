#!/usr/bin/env node
// Migrates a project's features/ tree from the Kartograph v0 layout
// (features/<context>/<capability>/<topic>.feature, no capability.md, no source intent)
// onto the v2 contract: every directory is a capability with a capability.md, every
// feature starts with '# Source intent:' and '# Capability:' comments, and German files
// declare '# language: de'. It never changes a scenario, a step, a tag or a comment; the
// only body edit is making a German file's block keywords German too, because the v0
// files mixed 'Feature:'/'Scenario:' with German steps and were valid in no dialect.
//
//   node scripts/migrate-features.js <project-root> [--date YYYY-MM-DD] [--time HHMM]
//
// Node built-ins only. Pure functions are exported for tests; the CLI is at the bottom.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync, renameSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateTree } from "../skills/kartograph-features/validate-features.js";

export const GERMAN_STEP = /^\s*(Angenommen|Gegeben sei|Gegeben seien|Wenn|Dann|Und|Aber) /m;
const LANGUAGE = /^#\s*language\s*:/;
const BLOCKS_DE = [["Scenario Outline:", "Szenariogrundriss:"], ["Scenario:", "Szenario:"], ["Feature:", "Funktionalität:"], ["Examples:", "Beispiele:"], ["Background:", "Grundlage:"], ["Rule:", "Regel:"]];

// A migrated file names its source intent within its first three lines.
export function hasHeader(text) {
  return text.split(/\r?\n/, 3).some((l) => l.startsWith("# Source intent: "));
}

// English block keywords at line start become their German counterparts; nothing else moves.
export function germanise(text) {
  return text.split("\n").map((line) => {
    const t = line.trimStart(); const indent = line.slice(0, line.length - t.length);
    for (const [en, de] of BLOCKS_DE) if (t.startsWith(en)) return indent + de + t.slice(en.length);
    return line;
  }).join("\n");
}

export function addHeader(text, { intent, capabilityPath }) {
  const lines = text.split(/\r?\n/);
  let language = ""; let body = text;
  if (LANGUAGE.test(lines[0])) { language = lines[0] + "\n"; body = lines.slice(1).join("\n"); }
  else if (GERMAN_STEP.test(text)) { language = "# language: de\n"; body = germanise(text); }
  return `${language}# Source intent: ${intent}\n# Capability: features/${capabilityPath}/capability.md\n${body}`;
}

const TITLE = /^\s*(?:Feature|Funktionalität|Funktion|Business Need|Ability):\s*(.*)$/;
const KEYWORD = /^\s*(?:Rule|Regel|Background|Grundlage|Hintergrund|Scenario Outline|Szenariogrundriss|Scenario|Szenario|Example|Beispiel|Examples|Beispiele):/;
// The feature's title and the first line of its description ("" when it has none).
export function featureInfo(text) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => TITLE.test(l));
  if (at === -1) return { title: "", description: "" };
  const title = TITLE.exec(lines[at])[1].trim();
  let description = "";
  for (const l of lines.slice(at + 1)) {
    const t = l.trim();
    if (t === "" || t.startsWith("#")) continue;
    if (t.startsWith("@") || KEYWORD.test(t)) break;
    description = t; break;
  }
  return { title, description };
}

// features: [{ file, title, text }], capabilities: [{ slug, name, text }].
export function capabilityMarkdown({ name, lead, intent, features, capabilities }) {
  const out = [`# Capability: ${name}`, "", lead, "", "## Sources", `- Intent: \`${intent}\``, "",
    "## Purpose and outcome",
    "The sources this capability was migrated from did not record its purpose; the scenarios of its features are the observable outcome it stands for today.", "",
    "## Scope and exclusions",
    "Included is what the features and sub-capabilities listed below specify. Nothing was recorded as excluded.", ""];
  if (features.length) { out.push("## Features"); for (const f of features) out.push(`- [${f.title}](${f.file}): ${f.text}`); out.push(""); }
  if (capabilities.length) { out.push("## Capabilities"); for (const c of capabilities) out.push(`- [${c.name}](${c.slug}/capability.md): ${c.text}`); out.push(""); }
  out.push("## Open questions",
    "- Purpose, scope and constraints of this capability were never written down; the migrated features are its only description. Blocks: judging whether a later intent extends or contradicts it.", "");
  return out.join("\n");
}

export function migrationIntent({ project, date, time, sources, contexts }) {
  const src = sources.length ? sources.map((s) => `\`${s}\``).join(", ") : "none";
  const grouping = contexts.length ? contexts.join(", ") : "none";
  return `---
title: Migrated feature tree
date: ${date}
status: confirmed
role: maintainer
language: en
sources: ${src}
related: none
---

# Migrated feature tree

## Summary

The ${project} feature tree predates Kartograph v2. It was written by the v0 Kartograph as one directory per context holding one directory per capability holding topic files, plain Gherkin with \`@happy\`, \`@edge\` and \`@error\` tags and no capability descriptions. On ${date} it was migrated onto the v2 contract without changing a single scenario: every directory became a capability with a \`capability.md\`, every feature file received its source and capability header, and German files declared their dialect. This intent is the provenance every migrated file points at.

## Who

- **Speaking:** the maintainer of ${project}, responsible for keeping the specification and the code in step
- **Benefits:** the Kartograph skills, which can now read, extend and validate the tree
- **Affected:** anyone reading the feature files; the layout is the same, only headers and capability descriptions were added

## Goals

- Keep every existing scenario word for word.
- Give every capability a place for its description and its open questions.
- Let the features skill commit again in this project.

## Intended outcomes

- The features validator prints ok for the whole tree.
- Every feature file names this intent and its capability in its first comment lines.
- Every directory under \`features/\` holds a \`capability.md\`.

## Non-goals

- Rewriting scenarios, steps or tags, because they may be bound to tests and to accepted walks.
- Writing the purpose and scope of each capability, because the migration has no source for them.

## Constraints

- The former grouping (${grouping}) stays as parent capabilities so tools that group by directory keep working.

## Assumptions

- The old feature files were the accepted specification at the time of migration.

## Decisions

- **Every directory is a capability** — because the tools group by directory and nesting keeps that grouping. Rejected: flattening, which would lose the grouping.
- **One migration intent for the whole tree** — because no exploring conversation produced these files. Rejected: pointing at surveys or issues, which do not follow the intent contract.

## Open questions

- **What is each capability's purpose, scope and constraints?** — who can answer: the product owner. Why it matters: without it a later intent cannot be judged as extending or contradicting the capability.

## Terms

- **capability** — a directory under \`features/\` with its own \`capability.md\`.
- **sub-capability** — a capability directory inside another one.

## Notes

Generated by the migration script of the Kartograph plugin at ${time} on ${date}.
`;
}

function titleCase(slug) { return slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "); }

function readMap(root) {
  const p = join(root, ".kartograph", "kartograph.json");
  if (!existsSync(p)) return { contexts: {}, capabilities: {} };
  try { const j = JSON.parse(readFileSync(p, "utf8")); return { contexts: j.contexts || {}, capabilities: j.capabilities || {} }; }
  catch { return { contexts: {}, capabilities: {} }; }
}

// title → description of every knowledge concept whose frontmatter has type: Capability.
function readKnowledge(root) {
  const out = new Map();
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!e.endsWith(".md")) continue;
      const fm = /^---\n([\s\S]*?)\n---/.exec(readFileSync(p, "utf8")); if (!fm) continue;
      const type = /^type:\s*(\S+)/m.exec(fm[1])?.[1]; const title = /^title:\s*(.+)$/m.exec(fm[1])?.[1]?.trim(); const desc = /^description:\s*(.+)$/m.exec(fm[1])?.[1]?.trim();
      if (type === "Capability" && title && desc) out.set(title, desc.replace(/^["']|["']$/g, ""));
    }
  };
  walk(join(root, "knowledge")); return out;
}

function firstSentence(s) { const m = /^(.*?[.!?])(\s|$)/.exec(s); return m ? m[1] : s; }

// Adds the migration intent to an existing capability.md's Sources, after the last bullet there.
function ensureIntentListed(text, intent) {
  if (text.includes(`- Intent: \`${intent}\``)) return text;
  const lines = text.split("\n"); const at = lines.findIndex((l) => l.trim() === "## Sources");
  if (at === -1) return text;
  let end = at + 1; while (end < lines.length && !/^## /.test(lines[end])) end++;
  let last = end - 1; while (last > at && lines[last].trim() === "") last--;
  lines.splice(last + 1, 0, `- Intent: \`${intent}\``);
  return lines.join("\n");
}

export function migrateProject(root, { date, time } = {}) {
  const now = new Date();
  date = date || now.toISOString().slice(0, 10);
  time = time || `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const written = [];
  const featuresDir = join(root, "features");
  const intentsDir = join(root, "intents");
  let intent = existsSync(intentsDir) ? readdirSync(intentsDir).filter((f) => /^\d{4}-\d{2}-\d{2}-\d{4}-migrated-feature-tree\.md$/.test(f)).sort().pop() : null;
  intent = intent ? `intents/${intent}` : `intents/${date}-${time}-migrated-feature-tree.md`;
  const map = readMap(root); const knowledge = readKnowledge(root);
  const sources = [".kartograph/kartograph.json", "features/README.md"].filter((s) => existsSync(join(root, s)));
  const contexts = readdirSync(featuresDir).filter((e) => !e.startsWith(".") && statSync(join(featuresDir, e)).isDirectory()).sort();

  const readme = join(featuresDir, "README.md");
  if (existsSync(readme)) { mkdirSync(join(root, "docs"), { recursive: true }); renameSync(readme, join(root, "docs", "features-README.md")); written.push("docs/features-README.md"); }

  const visit = (dir, rel) => {
    const entries = readdirSync(dir).filter((e) => !e.startsWith(".")).sort();
    const featureFiles = entries.filter((f) => f.endsWith(".feature"));
    const subs = entries.filter((e) => statSync(join(dir, e)).isDirectory());
    const features = [];
    for (const f of featureFiles) {
      const p = join(dir, f); let text = readFileSync(p, "utf8");
      if (!hasHeader(text)) { text = addHeader(text, { intent, capabilityPath: rel }); writeFileSync(p, text); written.push(`features/${rel}/${f}`); }
      const info = featureInfo(text);
      features.push({ file: f, title: info.title || f.replace(/\.feature$/, ""), text: info.description || info.title || f });
    }
    const children = subs.map((s) => visit(join(dir, s), `${rel}/${s}`));
    const slug = basename(dir);
    const mapped = map.capabilities[slug]?.name || map.contexts[slug]?.name;
    const name = mapped || (featureFiles.length === 1 ? features[0].title : titleCase(slug));
    const lead = knowledge.get(name)
      || (featureFiles.length === 1 && features[0].text !== features[0].title ? firstSentence(features[0].text) : "Migrated from the Kartograph v0 feature tree; not yet described.");
    const capFile = join(dir, "capability.md");
    if (!existsSync(capFile)) {
      writeFileSync(capFile, capabilityMarkdown({ name, lead, intent, features, capabilities: children.map((c) => ({ slug: c.slug, name: c.name, text: c.lead })) }));
      written.push(`features/${rel}/capability.md`);
    } else if (featureFiles.some((f) => readFileSync(join(dir, f), "utf8").includes(`# Source intent: ${intent}`))) {
      const cur = readFileSync(capFile, "utf8"); const next = ensureIntentListed(cur, intent);
      if (next !== cur) { writeFileSync(capFile, next); written.push(`features/${rel}/capability.md`); }
    }
    return { slug, name, lead };
  };
  for (const c of contexts) visit(join(featuresDir, c), c);

  if (!existsSync(join(root, intent))) {
    mkdirSync(intentsDir, { recursive: true });
    writeFileSync(join(root, intent), migrationIntent({ project: basename(resolve(root)), date, time, sources, contexts }));
    written.push(intent);
  }
  const { errors } = validateTree(featuresDir);
  return { written, intent, errors };
}

function main(argv) {
  const root = argv.find((a) => !a.startsWith("--") && !/^\d/.test(a));
  if (!root || !existsSync(join(root, "features"))) { console.error("usage: migrate-features.js <project-root> [--date YYYY-MM-DD] [--time HHMM]"); return 2; }
  const opt = (k) => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i + 1]; };
  const r = migrateProject(root, { date: opt("--date"), time: opt("--time") });
  for (const w of r.written) console.log(`wrote ${w}`);
  for (const e of r.errors) console.log(`error: ${e}`);
  console.log(r.errors.length ? `${r.errors.length} error(s) left for hand fixing` : `ok ${root}`);
  return r.errors.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exit(main(process.argv.slice(2)));
