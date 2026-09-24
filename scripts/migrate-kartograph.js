#!/usr/bin/env node
// Migrates a project onto the newest Kartograph layout in one run. It composes every
// mechanical step the documents in migrations/ describe and always writes the newest
// layout directly, never an intermediate one:
//   2.1.0  a v0 features/ tree gets capability.md files and headers (migrate-features.js,
//          which writes its provenance intent into kartograph/ already)
//   3.0.0  what a pre-3.0 kartograph/ held that is not a flat document moves to
//          docs/kartograph-v0/, intents/<stamp>-<slug>.md become
//          kartograph/<stamp>-<slug>.intent.md, the provenance lines in features/ and
//          knowledge/ follow, kartograph/index.md and log.md are written, and the empty
//          intents/ is removed.
//
//   node scripts/migrate-kartograph.js <project-root> --check   versions and pending documents
//   node scripts/migrate-kartograph.js <project-root> [--date YYYY-MM-DD] [--time HHMM]
//
// Node built-ins only. Pure functions are exported for tests; the CLI is at the bottom.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync, rmSync, rmdirSync, renameSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { hasHeader, migrateProject as migrateFeatures } from "./migrate-features.js";
import { validateTree } from "../skills/kartograph-features/validate-features.js";
import { validateBundle } from "../skills/kartograph-knowledge/validate-knowledge.js";
import { validateKartograph, DOC } from "../skills/kartograph-migrate/validate-kartograph.js";
import { validateIntent } from "../skills/kartograph-intent/validate-intent.js";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const LEGACY = "legacy-no-conversation";
const OLD_INTENT = /^(\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const V0_DIR = "docs/kartograph-v0";

export function compareVersions(a, b) {
  const pa = a.split(".").map(Number); const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

export function migrationVersions(pluginRoot = PLUGIN_ROOT) {
  const dir = join(pluginRoot, "migrations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((f) => /^(\d+\.\d+\.\d+)\.md$/.exec(f)?.[1]).filter(Boolean).sort(compareVersions);
}

export function layoutVersion(pluginRoot = PLUGIN_ROOT) {
  const v = migrationVersions(pluginRoot);
  return v.length ? v[v.length - 1] : null;
}

function listFiles(dir, keep) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir).sort()) {
    if (e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, keep));
    else if (keep(e)) out.push(p);
  }
  return out;
}

export function featuresAreV0(root) {
  return listFiles(join(root, "features"), (f) => f.endsWith(".feature")).some((p) => !hasHeader(readFileSync(p, "utf8")));
}

// Files only Kartograph writes. A directory name alone is no evidence: a Cucumber repo has
// features/*.feature, many code bases have features/ or knowledge/ folders of their own.
export function hasLegacyEvidence(root) {
  if (existsSync(join(root, ".kartograph"))) return true;
  const idir = join(root, "intents");
  if (existsSync(idir) && statSync(idir).isDirectory() && readdirSync(idir).some((f) => OLD_INTENT.test(f))) return true;
  const kindex = join(root, "knowledge", "index.md");
  if (existsSync(kindex) && /^okf_version:/m.test(readFileSync(kindex, "utf8"))) return true;
  const fdir = join(root, "features");
  if (listFiles(fdir, (f) => f === "capability.md").length) return true;
  return listFiles(fdir, (f) => f.endsWith(".feature")).some((p) => hasHeader(readFileSync(p, "utf8")));
}

// The layout a project is on: kartograph/index.md says so (without kartograph_version it is
// older than every migration); before 3.0.0 there was no such file, so Kartograph's own
// files tell. null is a new project with no Kartograph files at all.
export function projectVersion(root) {
  const index = join(root, "kartograph", "index.md");
  if (existsSync(index)) return /^kartograph_version:\s*"?(\d+\.\d+\.\d+)"?\s*$/m.exec(readFileSync(index, "utf8"))?.[1] ?? "0.0.0";
  if (!hasLegacyEvidence(root)) return null;
  return featuresAreV0(root) ? "2.0.0" : "2.3.0";
}

function firstSentence(s) { const m = /^(.*?[.!?])(\s|$)/.exec(s); return m ? m[1] : s; }

// Old flat values: 'none' (optionally followed by more text), one item, or a comma-
// separated list of paths, URLs or backticked values — none of which has a space once its
// backticks are stripped. Anything else is free text: splitting it on commas would invent
// items that were never there, so it stays one item; a comma inside that item would still
// break the flat list it goes into, so it becomes ' —' instead.
function listOf(v) {
  if (!v || /^none\b/i.test(v.trim())) return [];
  const parts = v.split(/,\s*/);
  const looksLikeValue = (s) => !/\s/.test(s.replace(/`/g, "").trim());
  if (parts.every(looksLikeValue)) return parts.map((s) => s.replace(/[`[\]]/g, "").trim()).filter(Boolean);
  return [v.replace(/[[\]]/g, "").replace(/,/g, " —").trim()];
}

export function newName(oldFile) {
  const m = OLD_INTENT.exec(basename(oldFile));
  return m ? `${m[1]}.intent.md` : null;
}

export function convertIntent(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!m) throw new Error("intent has no frontmatter");
  const old = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) old[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, "$1");
  }
  const body = text.slice(m[0].length);
  const summary = /^## Summary[ \t]*\r?\n([\s\S]*?)(?=^## )/m.exec(body)?.[1] ?? "";
  const description = firstSentence(summary.replace(/\s+/g, " ").trim()) || old.title;
  const renamed = (r) => (r.startsWith("intents/") && newName(r)) || r;
  // 'none (verbal feedback from users)' names a source that is not a file; its text stays.
  const said = /^none\s*\((.+)\)\s*$/i.exec(old.sources?.trim() ?? "")?.[1];
  const sources = [LEGACY, ...(said ? [said.replace(/[[\]]/g, "").replace(/,/g, " —").trim()] : listOf(old.sources).map(renamed))];
  const related = listOf(old.related).map(renamed);
  return [
    "---", "type: Intent", `title: ${old.title}`, `description: ${description}`, `status: ${old.status}`,
    `date: ${old.date}`, `role: ${old.role}`, `language: ${old.language}`,
    `sources: [${sources.join(", ")}]`, `related: [${related.join(", ")}]`, "---", "",
  ].join("\n") + body;
}

// Only provenance moves: the '# Source intent:' comments (header or per scenario, with any
// text after the path), capability.md's '- Intent:' and '- <Words> intent:' lines, the
// per-scenario '# Added by'/'# Changed by' comments, and the knowledge bundle's relative
// links. A step or other line that merely mentions a path is left alone.
export function rewriteProvenance(text) {
  return text
    .replace(/^(\s*# Source intent: )intents\/([^\s`]+)\.md/gm, "$1kartograph/$2.intent.md")
    .replace(/^(\s*# (?:Added|Changed) by )intents\/([^\s`]+)\.md/gm, "$1kartograph/$2.intent.md")
    .replace(/^(\s*- (?:[A-Z][\w-]*(?: [\w-]+)* )?[Ii]ntent: `)intents\/([^`]+)\.md`/gm, "$1kartograph/$2.intent.md`")
    .replace(/^(\s*resource: )\.\.\/intents\/([^\s]+)\.md[ \t]*$/gm, "$1../kartograph/$2.intent.md")
    .replace(/\]\(\.\.\/intents\/([^)\s]+)\.md\)/g, "](../kartograph/$1.intent.md)");
}

function docInfo(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const get = (k) => new RegExp(`^${k}:\\s*(.*)$`, "m").exec(fm)?.[1].trim() ?? "";
  return { type: get("type"), title: get("title"), description: get("description"), status: get("status") };
}

export function indexMarkdown(docs, version) {
  const lines = ["---", 'okf_version: "0.2"', `kartograph_version: ${version}`, "---", "", "# Kartograph", ""];
  for (const d of [...docs].sort((a, b) => b.file.localeCompare(a.file))) lines.push(`* [${d.title}](${d.file}) - ${d.description} _(${d.type}, ${d.status})_`);
  return lines.join("\n") + "\n";
}

export function logEntry(log, date, line) {
  const head = "# Kartograph Log";
  const text = log && log.startsWith(head) ? log : `${head}\n`;
  const heading = `## ${date}`;
  if (text.includes(`\n${heading}\n`)) return text.replace(`\n${heading}\n`, `\n${heading}\n${line}\n`);
  const rest = text.slice(head.length).replace(/^\n+/, "");
  return `${head}\n\n${heading}\n${line}\n${rest ? `\n${rest}` : ""}`;
}

// Runs the same validators a finished migration checks itself with, so a rerun on a
// project already at the newest layout still reports what is wrong instead of going quiet.
function runValidators(root) {
  const errors = [];
  const kdir = join(root, "kartograph");
  if (existsSync(kdir)) {
    errors.push(...validateKartograph(kdir).errors.map((e) => `kartograph/${e}`));
    for (const f of readdirSync(kdir).filter((e) => DOC.test(e) && e.endsWith(".intent.md")).sort()) {
      errors.push(...validateIntent(readFileSync(join(kdir, f), "utf8"), { filename: f }).errors.map((e) => `kartograph/${f}: ${e}`));
    }
  }
  if (existsSync(join(root, "features"))) errors.push(...validateTree(join(root, "features")).errors);
  if (existsSync(join(root, "knowledge"))) errors.push(...validateBundle(join(root, "knowledge")).errors);
  return errors;
}

export function migrateProject(root, { date, time, pluginRoot = PLUGIN_ROOT } = {}) {
  const now = new Date();
  date = date || now.toISOString().slice(0, 10);
  time = time || `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const to = layoutVersion(pluginRoot);
  const from = projectVersion(root);
  const written = []; const removed = [];
  // A new project has nothing to check. A project already on the newest layout has nothing
  // to write, but a rerun still revalidates it — silently returning no errors would hide
  // whatever is still wrong.
  if (from === null) return { from, to, written, removed, errors: [] };
  if (compareVersions(from, to) >= 0) return { from, to, written, removed, errors: runValidators(root) };

  const errors = [];
  const kdir = join(root, "kartograph");
  // Before 3.0.0 a kartograph/ directory could hold anything (decisions/, surveys/, …). What
  // is not a flat document of this layout moves aside, never overwriting what is there.
  const aside = [];
  if (existsSync(kdir) && !existsSync(join(kdir, "index.md"))) {
    for (const e of readdirSync(kdir).sort()) {
      if (e.startsWith(".") || DOC.test(e)) continue;
      if (e === "log.md" && readFileSync(join(kdir, e), "utf8").startsWith("# Kartograph Log")) continue;
      const target = join(root, V0_DIR, e);
      if (existsSync(target)) { errors.push(`kartograph/${e}: ${V0_DIR}/${e} already exists; left in place`); continue; }
      mkdirSync(join(root, V0_DIR), { recursive: true });
      renameSync(join(kdir, e), target);
      removed.push(`kartograph/${e}`); written.push(`${V0_DIR}/${e}`); aside.push(e);
    }
  }

  // 2.1.0 — a v0 features tree; migrate-features.js writes its intent into kartograph/ already.
  if (featuresAreV0(root)) {
    const r = migrateFeatures(root, { date, time });
    written.push(...r.written); removed.push(...r.removed.map((d) => `features${d}`));
  }

  // 3.0.0 — intents/ into kartograph/, provenance follows.
  mkdirSync(kdir, { recursive: true });
  const idir = join(root, "intents");
  let moved = 0;
  if (existsSync(idir)) {
    for (const f of readdirSync(idir).filter((e) => OLD_INTENT.test(e)).sort()) {
      const name = newName(f);
      try {
        writeFileSync(join(kdir, name), convertIntent(readFileSync(join(idir, f), "utf8")));
        rmSync(join(idir, f));
        written.push(`kartograph/${name}`); moved++;
      } catch (e) {
        // Left in intents/ for hand fixing; the rest of the migration still runs.
        errors.push(`intents/${f}: ${e.message}`);
      }
    }
    if (!readdirSync(idir).length) { rmdirSync(idir); removed.push("intents"); }
  }
  for (const d of ["features", "knowledge"]) {
    for (const p of listFiles(join(root, d), (f) => f.endsWith(".feature") || f.endsWith(".md"))) {
      const text = readFileSync(p, "utf8");
      const next = rewriteProvenance(text);
      if (next !== text) { writeFileSync(p, next); written.push(relative(root, p)); }
    }
  }

  const docs = readdirSync(kdir).filter((f) => DOC.test(f)).map((f) => ({ file: f, ...docInfo(readFileSync(join(kdir, f), "utf8")) }));
  writeFileSync(join(kdir, "index.md"), indexMarkdown(docs, to));
  const logPath = join(kdir, "log.md");
  writeFileSync(logPath, logEntry(existsSync(logPath) ? readFileSync(logPath, "utf8") : "", date, `* **Migration**: ${from} → ${to} — ${moved} intents moved into kartograph/${aside.length ? `; ${aside.join(", ")} moved to ${V0_DIR}/` : ""}.`));
  written.push("kartograph/index.md", "kartograph/log.md");

  errors.push(...runValidators(root));
  return { from, to, written: [...new Set(written)], removed, errors };
}

function main(argv) {
  const root = argv.find((a) => !a.startsWith("--") && !/^\d/.test(a));
  if (!root || !existsSync(root)) { console.error("usage: migrate-kartograph.js <project-root> [--check] [--date YYYY-MM-DD] [--time HHMM]"); return 2; }
  const opt = (k) => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i + 1]; };
  if (argv.includes("--check")) {
    const from = projectVersion(root);
    const pending = from === null ? [] : migrationVersions().filter((v) => compareVersions(v, from) > 0);
    console.log(`project: ${from ?? "new"}`);
    console.log(`layout: ${layoutVersion()}`);
    console.log(`pending: ${pending.length ? pending.map((v) => `migrations/${v}.md`).join(", ") : "none"}`);
    return 0;
  }
  const r = migrateProject(root, { date: opt("--date"), time: opt("--time") });
  if (r.from === null) { console.log("new project: nothing to migrate"); return 0; }
  if (!r.written.length) {
    console.log(`up to date: ${r.to}`);
    for (const e of r.errors) console.log(`error: ${e}`);
    return r.errors.length ? 1 : 0;
  }
  for (const w of r.written) console.log(`wrote ${w}`);
  for (const d of r.removed) console.log(`removed ${d}`);
  for (const e of r.errors) console.log(`error: ${e}`);
  console.log(r.errors.length ? `${r.errors.length} error(s) left for hand fixing` : `ok ${r.from} → ${r.to}`);
  return r.errors.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exit(main(process.argv.slice(2)));
