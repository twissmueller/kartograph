// The Kartograph knowledge bundle: one OKF v0.2 bundle at `knowledge/` holding the project
// glossary as one markdown concept per term. This is the SINGLE SOURCE OF TRUTH for what the
// project's words mean — `.kartograph/kartograph.json` holds pointers into it and never a copy.
//
// Layout (one bundle, Kontext subdirectories, so every cross-link stays in-bundle):
//
//   knowledge/
//     index.md              bundle root index, carries `okf_version`
//     log.md                chronological update history
//     <kontext>/
//       index.md
//       <kontext>.md        the Kontext's own concept (type: Kontext)
//       <slug>.md           a term belonging to that Kontext
//     shared/
//       <slug>.md           a term used across more than one Kontext
//
// Everything here is pure and operates on pre-read concepts; `readBundle` is the only
// function that touches the filesystem.

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import {
  OKF_VERSION, RESERVED_FILENAMES, parseConcept, serializeConcept,
  conceptId, conceptPath, conceptLink, conceptStatus, trustTier,
} from './okf.js';
import { KNOWLEDGE_DIR } from './paths.js';

// Where cross-Kontext terms live, so a word shared by two Kontexte is still defined once.
export const SHARED_DIR = 'shared';

// OKF `type` values, in the meta-glossary's canonical German (reference/glossary.md).
// OKF does not register types centrally (§4.1); this is Kartograph's vocabulary. The keys are
// the slugs a discovery survey emits — note the catch-all is `term`, written out as `Begriff`.
export const CONCEPT_TYPES = {
  subjekt: 'Subjekt',
  akteur: 'Akteur',
  ereignis: 'Ereignis',
  regel: 'Regel',
  kontext: 'Kontext',
  capability: 'Capability',
  term: 'Begriff',
};

export const TYPE_SLUGS = Object.fromEntries(Object.entries(CONCEPT_TYPES).map(([k, v]) => [v, k]));

export const STATUSES = ['draft', 'stable', 'deprecated'];

// The concept ID for a term: `<kontext>/<slug>`, or `shared/<slug>` when it spans Kontexte.
export const termConceptId = (kontext, slug) => `${kontext || SHARED_DIR}/${slug}`;

// The slug (last path segment) of a concept ID — the key the map's collections use.
export const termSlug = (id) => conceptId(id).split('/').pop();

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

async function walk(dir, base, out) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, e.name);
    if (e.isDirectory()) { await walk(full, base, out); continue; }
    if (!e.name.endsWith('.md')) continue;
    const rel = relative(base, full).split(sep).join('/');
    out.push({ path: rel, text: await readFile(full, 'utf8') });
  }
  return out;
}

// Read the whole bundle from disk. Returns { concepts, reserved } where `concepts` are the
// parsed non-reserved documents and `reserved` are the raw index.md / log.md files.
// A missing bundle is not an error — a project may not have charted any terms yet.
export async function readBundle(projectRoot, dir = KNOWLEDGE_DIR) {
  const base = join(projectRoot, dir);
  const files = await walk(base, base, []);
  const concepts = [];
  const reserved = [];
  for (const f of files) {
    const name = f.path.split('/').pop();
    if (RESERVED_FILENAMES.includes(name)) { reserved.push(f); continue; }
    const { frontmatter, body } = parseConcept(f.text);
    concepts.push({ id: conceptId(f.path), path: f.path, frontmatter, body });
  }
  return { concepts, reserved };
}

// ---------------------------------------------------------------------------
// Index over pre-read concepts
// ---------------------------------------------------------------------------

// Pure: a lookup of the bundle's terms, keyed by concept ID, with the derived OKF signals
// (trust tier, status) resolved. Nothing here is stored — it is all recomputed on read.
export function buildIndex(concepts) {
  const byId = new Map();
  for (const c of concepts) {
    const fm = c.frontmatter || {};
    byId.set(c.id, {
      id: c.id,
      slug: termSlug(c.id),
      kontext: c.id.includes('/') ? c.id.split('/')[0] : null,
      title: fm.title || termSlug(c.id),
      description: fm.description || '',
      type: fm.type || null,
      typeSlug: TYPE_SLUGS[fm.type] || null,
      status: conceptStatus(fm),
      trust: trustTier(fm),
      aliasesToAvoid: fm.aliases_to_avoid || [],
      sources: fm.sources || [],
    });
  }
  return byId;
}

// Pure: the bundle-relative links a concept body points at (§6.1), normalized to concept IDs.
// Both the recommended absolute form (`/garten/beet.md`) and relative forms are resolved.
export function bodyLinks(concept) {
  const out = [];
  const dir = concept.id.includes('/') ? concept.id.split('/').slice(0, -1).join('/') : '';
  for (const m of String(concept.body || '').matchAll(/\[[^\]]*\]\(([^)\s]+\.md)\)/g)) {
    const target = m[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // an absolute URL, not a bundle link
    if (target.startsWith('/')) { out.push(conceptId(target)); continue; }
    const parts = (dir ? dir.split('/') : []);
    for (const seg of target.replace(/\.md$/, '').split('/')) {
      if (seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    out.push(parts.join('/'));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

// Pure: check a bundle. Returns { errors, warnings }.
//
// `errors` are OKF v0.2 conformance failures (§11) plus the two rules Kartograph adds on
// top: a known `type`, and one canonical term per concept (no duplicate titles, no title
// that another concept lists as an alias to avoid).
//
// `warnings` are things OKF explicitly says a consumer MUST NOT reject a bundle for —
// broken cross-links (§6.1, they may be knowledge not yet written) and missing recommended
// frontmatter. They are surfaced, never fatal.
export function checkBundle(concepts) {
  const errors = [];
  const warnings = [];
  const ids = new Set(concepts.map((c) => c.id));
  const byTitle = new Map();
  const aliasOwners = new Map();

  for (const c of concepts) {
    const fm = c.frontmatter;
    // §11.1 / §11.2 — a parseable frontmatter block carrying a non-empty `type`.
    if (!fm) { errors.push(`${c.path}: no YAML frontmatter block (OKF §11)`); continue; }
    if (!fm.type || String(fm.type).trim() === '') { errors.push(`${c.path}: frontmatter has no 'type' (OKF §11)`); continue; }
    if (!TYPE_SLUGS[fm.type]) {
      errors.push(`${c.path}: unknown type '${fm.type}' — must be one of ${Object.values(CONCEPT_TYPES).join(', ')}`);
    }
    const status = conceptStatus(fm);
    if (!STATUSES.includes(status)) errors.push(`${c.path}: invalid status '${status}' — must be ${STATUSES.join(' | ')}`);

    const title = fm.title || '';
    if (!title) warnings.push(`${c.path}: no 'title' — consumers will fall back to the filename`);
    if (!fm.description) warnings.push(`${c.path}: no 'description' — the term has no one-line definition`);
    // Migration writes a labelled stub rather than inventing meaning; keep warning until a
    // human replaces it with a real sentence.
    else if (/^TODO\b/.test(String(fm.description).trim())) {
      warnings.push(`${c.path}: description is still a migration stub — write one sentence saying what '${fm.title || c.id}' is`);
    }

    // Kartograph's core glossary rule: one canonical term per concept. Two concepts may not
    // carry the same title, and no concept may claim a title another rejects as an alias.
    if (title && status !== 'deprecated') {
      const key = title.trim().toLowerCase();
      if (byTitle.has(key)) errors.push(`${c.path}: term '${title}' is already defined by '${byTitle.get(key)}' — one canonical term per concept`);
      else byTitle.set(key, c.path);
    }
    for (const alias of fm.aliases_to_avoid || []) {
      aliasOwners.set(String(alias).trim().toLowerCase(), { path: c.path, title });
    }
  }

  for (const [key, owner] of aliasOwners) {
    const clash = byTitle.get(key);
    if (clash && clash !== owner.path) {
      errors.push(`${clash}: term is listed as an alias to avoid by '${owner.path}' (canonical: '${owner.title}') — pick one`);
    }
  }

  // §6.1 — consumers MUST tolerate broken links; report them, never fail on them.
  for (const c of concepts) {
    for (const target of bodyLinks(c)) {
      if (!ids.has(target)) warnings.push(`${c.path}: links to '${conceptLink(target)}', which is not in the bundle`);
    }
  }

  return { errors, warnings };
}

// Pure: every `glossaryRef` in the map must point at a concept that exists in the bundle.
// This is the one direction that IS fatal — a pointer into the knowledge bundle that does
// not resolve means the map is lying about where a definition lives.
export function checkMapRefs(map, concepts) {
  const ids = new Set(concepts.map((c) => c.id));
  const errors = [];
  const groups = ['subjects', 'actors', 'events', 'rules', 'contexts', 'capabilities'];
  for (const group of groups) {
    for (const [slug, node] of Object.entries((map || {})[group] || {})) {
      const ref = node && node.glossaryRef;
      if (ref && !ids.has(conceptId(ref))) {
        errors.push(`${group} '${slug}' references missing knowledge concept '${ref}'`);
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

// Pure: build a concept document for a term. `sources` records where the term came from —
// the survey that discovered it, or the code `/karto-init` read — so provenance is never lost.
export function renderTermConcept({
  type, title, description, status = 'draft', aliasesToAvoid = [],
  generatedBy, generatedAt, verified, sources = [], related = [], body,
}) {
  const frontmatter = { type: CONCEPT_TYPES[type] || type, title, description };
  if (status && status !== 'stable') frontmatter.status = status;
  if (aliasesToAvoid.length) frontmatter.aliases_to_avoid = aliasesToAvoid;
  if (generatedBy) frontmatter.generated = { by: generatedBy, at: generatedAt };
  if (verified) frontmatter.verified = verified;
  if (sources.length) frontmatter.sources = sources;

  const parts = ['# Definition', '', body ? String(body).trim() : String(description || '').trim()];
  if (aliasesToAvoid.length) {
    parts.push('', '# Aliases to avoid', '');
    for (const a of aliasesToAvoid) parts.push(`- **${a}** — say **${title}** instead.`);
  }
  if (related.length) {
    parts.push('', '# Related', '');
    for (const r of related) parts.push(`- [${r.title}](${conceptLink(r.id)})`);
  }
  return serializeConcept({ frontmatter, body: parts.join('\n') });
}

// Pure: the bundle-root index.md (§8). Groups concepts by directory for progressive
// disclosure and carries `okf_version` — the only frontmatter an index.md may have (§12).
export function renderRootIndex(concepts, { title = 'Knowledge' } = {}) {
  const index = buildIndex(concepts);
  const groups = new Map();
  for (const entry of index.values()) {
    const dir = entry.kontext || '.';
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push(entry);
  }
  const lines = ['---', `okf_version: "${OKF_VERSION}"`, '---', '', `# ${title}`, ''];
  lines.push('The project glossary: one canonical term per concept, one markdown file per term.', '');
  for (const dir of [...groups.keys()].sort()) {
    lines.push(`# ${dir === '.' ? 'Bundle root' : dir}`, '');
    for (const e of groups.get(dir).sort((a, b) => a.title.localeCompare(b.title))) {
      const flags = [e.type, e.status !== 'stable' ? e.status : null].filter(Boolean).join(', ');
      lines.push(`* [${e.title}](${conceptPath(e.id)}) - ${e.description}${flags ? ` _(${flags})_` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

// Pure: prepend a dated group of entries to an existing log.md (§9), newest first.
export function appendLog(existing, date, entries) {
  const header = '# Knowledge Update Log';
  const body = String(existing || '').replace(/^# .*\n/, '').trim();
  const block = [`## ${date}`, ...entries.map((e) => `* ${e}`)].join('\n');
  return [header, '', block, body ? '\n' + body : ''].join('\n').trimEnd() + '\n';
}

export { conceptId, conceptPath, conceptLink, parseConcept, serializeConcept, OKF_VERSION, KNOWLEDGE_DIR };
