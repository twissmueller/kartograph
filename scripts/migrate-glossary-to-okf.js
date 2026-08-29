#!/usr/bin/env node
// Migrate a pre-v0.18 map to the OKF knowledge bundle.
//
// Two things move out of `.kartograph/kartograph.json` and onto disk as OKF concepts, because
// a definition must exist in exactly one place:
//
//   1. the old `glossary` object — term, definition, type, aliasesToAvoid, related;
//   2. the definitions the map itself carried — `context.definition`,
//      `capability.definition` and `rule.statement`.
//
// What stays in the map is the display `name`, the structure (context, dependencies, derived
// counts), and a `glossaryRef` pointing at the concept that now holds the meaning.
//
// The transform is deterministic and idempotent: running it twice changes nothing, and a map
// that is already migrated is reported as such. Concept files are written first and the map is
// swapped in atomically at the end, so a failure never leaves a half-migrated map.

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTermConcept, renderRootIndex, appendLog, readBundle, SHARED_DIR } from '../workflows/lib/knowledge.js';
import { KNOWLEDGE_DIR, mapPath as defaultMapPath } from '../workflows/lib/paths.js';
import { OKF_VERSION } from '../workflows/lib/okf.js';

// Marker for a node that had a name but never a definition (subjects, actors, events, and
// rules whose statement was empty). We refuse to invent meaning: the concept is written as a
// clearly-labelled stub that `checkBundle` warns about until a human writes the real sentence.
export const TODO_DESCRIPTION = 'TODO — define this term.';

// True when the map still holds anything the bundle should own.
export function needsMigration(map) {
  if (!map || typeof map !== 'object') return false;
  if (map.glossary) return true;
  for (const c of Object.values(map.contexts || {})) if (c.definition !== undefined) return true;
  for (const c of Object.values(map.capabilities || {})) if (c.definition !== undefined) return true;
  for (const r of Object.values(map.rules || {})) if (r.statement !== undefined) return true;
  return false;
}

// Where a term's concept file goes. A capability sits in its own context's directory and a
// context in its own; everything else lands in `shared/`, which grooming can move later.
export function placementFor(map, slug, kind) {
  if (kind === 'kontext') return slug;
  if (kind === 'capability') {
    const cap = (map.capabilities || {})[slug];
    if (cap && cap.context) return cap.context;
    return SHARED_DIR;
  }
  // A glossary entry named after a real capability or context inherits that placement.
  const cap = (map.capabilities || {})[slug];
  if (cap && cap.context) return cap.context;
  if ((map.contexts || {})[slug]) return slug;
  return SHARED_DIR;
}

// Pure: plan the whole migration. Returns the concept files to write, the rewritten map, and
// the notes to report — including which concepts came out as undefined stubs.
// `existing` is the set of concept IDs already on disk. A concept already written — by an
// earlier migration, by /karto-chart, or by hand — is never overwritten: the node still gets
// its pointer and the map still loses its copy of the definition, but the file is left alone.
export function planMigration(map, { at = new Date().toISOString().replace(/\.\d+Z$/, 'Z'), existing = new Set() } = {}) {
  const next = structuredClone(map);
  const glossary = next.glossary || {};
  const concepts = [];
  const stubs = [];
  const seen = new Map();      // concept id -> id, so two nodes never claim one file
  const consumed = new Set();  // slugs already emitted for a map node, keyed by slug rather
                               // than by id: a node may sit anywhere, and the leftover-glossary
                               // pass must not emit a second file for it under a derived path

  const titleOf = (slug) => {
    const g = glossary[slug];
    if (g && g.term) return g.term;
    for (const group of ['capabilities', 'contexts', 'subjects', 'actors', 'events', 'rules']) {
      const node = (next[group] || {})[slug];
      if (node && node.name) return node.name;
    }
    return slug;
  };

  const add = ({ slug, kind, title, description, node }) => {
    // A node already pointing at a concept keeps that placement — re-deriving it would strand
    // the existing file and write a duplicate elsewhere. A pre-v0.18 `glossaryRef` was a bare
    // slug, not a path, so only honour one that already looks like a concept ID or is on disk.
    const ref = node && node.glossaryRef;
    const id = ref && (ref.includes('/') || existing.has(ref)) ? ref : `${placementFor(map, slug, kind)}/${slug}`;
    consumed.add(slug);
    if (seen.has(id)) {                      // already emitted (e.g. capability + glossary entry)
      if (node) node.glossaryRef = id;
      return seen.get(id);
    }
    if (existing.has(id)) {                  // already on disk — point at it, write nothing
      seen.set(id, id);
      if (node) node.glossaryRef = id;
      return id;
    }
    const g = glossary[slug] || {};
    const isStub = !description;
    if (isStub) stubs.push(id);
    concepts.push({
      id,
      path: `${id}.md`,
      text: renderTermConcept({
        type: kind,
        title: title || titleOf(slug),
        description: description || TODO_DESCRIPTION,
        // Nothing here was written by a human in this run, and nothing was confirmed —
        // migrated content is draft until someone reviews it.
        status: 'draft',
        aliasesToAvoid: g.aliasesToAvoid || [],
        generatedBy: 'process:kartograph-migrate',
        generatedAt: at,
        sources: [{ id: 'map', resource: '../.kartograph/kartograph.json', title: 'Pre-v0.18 Kartograph map' }],
        related: (g.related || [])
          .filter((r) => glossary[r] || (next.capabilities || {})[r] || (next.contexts || {})[r])
          .map((r) => ({ id: `${placementFor(map, r, (glossary[r] || {}).type || 'term')}/${r}`, title: titleOf(r) })),
        body: isStub
          ? `${TODO_DESCRIPTION}\n\nThis term was migrated from a map node that carried a name but no definition. Replace this line with one tight sentence saying what it *is*.`
          : undefined,
      }),
    });
    seen.set(id, id);
    if (node) node.glossaryRef = id;
    return id;
  };

  // 1. Contexts and capabilities: their `definition` becomes the concept's description.
  for (const [slug, ctx] of Object.entries(next.contexts || {})) {
    add({ slug, kind: 'kontext', title: ctx.name, description: ctx.definition, node: ctx });
    delete ctx.definition;
  }
  for (const [slug, cap] of Object.entries(next.capabilities || {})) {
    add({ slug, kind: 'capability', title: cap.name, description: cap.definition, node: cap });
    delete cap.definition;
  }
  // 2. Rules: the invariant text IS the rule's meaning.
  for (const [slug, rule] of Object.entries(next.rules || {})) {
    add({ slug, kind: 'regel', title: rule.name, description: rule.statement, node: rule });
    delete rule.statement;
  }
  // 3. Subjects, actors and events carry only a name — they become stubs unless the old
  //    glossary already defined them.
  const KIND = { subjects: 'subjekt', actors: 'akteur', events: 'ereignis' };
  for (const [group, kind] of Object.entries(KIND)) {
    for (const [slug, node] of Object.entries(next[group] || {})) {
      const g = glossary[slug];
      add({ slug, kind: (g && g.type) || kind, title: (g && g.term) || node.name, description: g && g.definition, node });
    }
  }
  // 4. Whatever is left in the old glossary defined no map node of its own.
  for (const [slug, g] of Object.entries(glossary)) {
    if (consumed.has(slug)) continue;
    add({ slug, kind: g.type || 'term', title: g.term, description: g.definition });
  }

  delete next.glossary;
  next.knowledge = next.knowledge || { bundle: KNOWLEDGE_DIR, okfVersion: OKF_VERSION };
  return { concepts, map: next, stubs };
}

// Write the plan: concept files first, then the map, atomically.
export async function migrateProject(projectRoot, { mapFile } = {}) {
  const file = mapFile || defaultMapPath(projectRoot);
  const map = JSON.parse(await readFile(file, 'utf8'));
  if (!needsMigration(map)) return { migrated: false, concepts: [], stubs: [] };

  const bundle = (map.knowledge && map.knowledge.bundle) || KNOWLEDGE_DIR;
  const { concepts: alreadyThere } = await readBundle(projectRoot, bundle);
  const { concepts, map: nextMap, stubs } = planMigration(map, {
    existing: new Set(alreadyThere.map((c) => c.id)),
  });
  const base = join(projectRoot, bundle);

  for (const c of concepts) {
    const target = join(base, c.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, c.text);
  }

  // Regenerate the bundle's index and log from what is now on disk (which may include
  // concepts written before this run).
  const { concepts: onDisk } = await readBundle(projectRoot, bundle);
  await writeFile(join(base, 'index.md'), renderRootIndex(onDisk, { title: `${(nextMap.meta && nextMap.meta.name) || 'Project'} Knowledge` }));
  let log = '';
  try { log = await readFile(join(base, 'log.md'), 'utf8'); } catch { log = ''; }
  await writeFile(join(base, 'log.md'), appendLog(log, new Date().toISOString().slice(0, 10), [
    `**Migration**: moved ${concepts.length} definitions out of the map into this bundle (OKF v${OKF_VERSION}).`,
  ]));

  const tmp = file + '.migrate.tmp';
  await writeFile(tmp, JSON.stringify(nextMap, null, 2) + '\n');
  await rename(tmp, file);
  return { migrated: true, concepts: concepts.map((c) => c.path), stubs, bundle };
}

// CLI: node scripts/migrate-glossary-to-okf.js [projectRoot] [mapFile]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || process.cwd();
  const result = await migrateProject(root, { mapFile: process.argv[3] });
  if (!result.migrated) { console.log('Nothing to migrate: the map holds no glossary or definitions.'); process.exit(0); }
  console.log(`Migrated ${result.concepts.length} concepts into ${result.bundle}/`);
  for (const p of result.concepts) console.log('  + ' + p);
  if (result.stubs.length) {
    console.error(`\n${result.stubs.length} concept(s) had no definition in the map and were written as stubs.`);
    console.error('Write a real one-sentence definition for each, or run /karto-sync glossary:');
    for (const s of result.stubs) console.error('  ! ' + s);
  }
}
