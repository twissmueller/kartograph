// Kartograph init workflow (Phase B of /karto-init).
//
// Runs as a Claude Code dynamic workflow. The runtime provides the globals
// `agent`, `parallel`, `phase`, and `args`. The script cannot import modules or
// touch the filesystem; the agents read the repository themselves via their tools.
//
// The returned object is a DRAFT kartograph.json. The /karto-init command
// validates it with scripts/validate-kartograph.js before writing it.
//
// args: { root?, scope? }   root defaults to ".", scope is an optional subtree.

export const meta = {
  name: 'karto-init',
  description: 'Reverse-engineer a draft kartograph.json from an existing codebase.',
  phases: [
    { title: 'Scan', detail: 'survey the codebase for contexts, capabilities, subjects, dependencies and ADRs' },
    { title: 'Assemble', detail: 'merge the scan into one schema-valid draft map' },
    { title: 'Knowledge', detail: 'write the glossary seed as an OKF bundle at knowledge/' },
  ],
};

// Tolerate a JSON-stringified args object (a common Workflow mis-call), not just an object.
let a = args || {};
if (typeof a === 'string') { try { a = JSON.parse(a) || {}; } catch { a = {}; } }
const root = a.root || '.';
const where = a.scope ? `${root} (focus on the subtree "${a.scope}")` : root;

const SCAN_SCHEMA = {
  type: 'object', additionalProperties: true,
  properties: { notes: { type: 'string' } },
};

// Forces an OBJECT (not free text) with the core top-level keys, and pins the inner
// shapes of the collections an LLM most often gets wrong by inventing German field
// names (rules, subjects, actors, events) so the structured-output layer rejects e.g.
// `definition`/`appliesToSubjects` on a rule and the agent must retry. Mirrors schemas/v1 — keep in sync. Deep cross-reference
// validation still runs via scripts/validate-kartograph.js in the command.
const SLUG = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' };
// A pointer into the knowledge bundle: an OKF concept ID, `<kontext>/<slug>`.
const CONCEPT_REF = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*(?:/[a-z0-9][a-z0-9-]*)*$' };
const slugMapOf = (item) => ({ type: 'object', additionalProperties: item });
const NAMED = {
  type: 'object', additionalProperties: false,
  required: ['name'],
  properties: { name: { type: 'string' }, glossaryRef: CONCEPT_REF },
};
const ASSEMBLE_SCHEMA = {
  type: 'object', additionalProperties: true,
  required: ['version', 'meta', 'contexts', 'capabilities'],
  properties: {
    version: { const: '1' },
    meta: { type: 'object' },
    // Contexts, capabilities and rules carry NO definition text — it lives in the knowledge
    // bundle. Pin `glossaryRef` as required so the assembler always emits the pointer.
    contexts: slugMapOf({
      type: 'object', additionalProperties: true,
      required: ['name', 'glossaryRef'],
      properties: { name: { type: 'string' }, color: { type: 'string' }, glossaryRef: CONCEPT_REF },
    }),
    capabilities: slugMapOf({
      type: 'object', additionalProperties: true,
      required: ['name', 'context', 'glossaryRef'],
      properties: {
        name: { type: 'string' }, context: SLUG, glossaryRef: CONCEPT_REF,
        declaredStage: { enum: ['vision', null] },
        derived: { type: 'object', additionalProperties: true },
      },
    }),
    adrs: { type: 'object' },
    subjects: slugMapOf({
      type: 'object', additionalProperties: false,
      required: ['name'],
      properties: {
        name: { type: 'string' }, glossaryRef: CONCEPT_REF,
        properties: { type: 'array', items: { type: 'string' } },
        rules: { type: 'array', items: SLUG },
      },
    }),
    actors: slugMapOf(NAMED),
    events: slugMapOf(NAMED),
    rules: slugMapOf({
      type: 'object', additionalProperties: false,
      required: ['name', 'glossaryRef'],
      properties: { name: { type: 'string' }, subject: SLUG, glossaryRef: CONCEPT_REF },
    }),
    // The glossary is NOT part of the map — it is the OKF bundle on disk. All the map
    // carries is where that bundle lives; definitions are written as concept files in the
    // Knowledge phase below and referenced by `glossaryRef`.
    knowledge: {
      type: 'object', additionalProperties: false,
      required: ['bundle'],
      properties: { bundle: { type: 'string' }, okfVersion: { type: 'string' } },
    },
    dependencies: { type: 'array' },
  },
};

phase('Scan');
const [structure, domain, links] = await parallel([
  () => agent(
    `Analyze the codebase at ${where}. Identify the top-level CONTEXTS (bounded areas/modules) and, within each, the CAPABILITIES (cohesive units of behavior). For each capability count only the REAL Kartograph coverage it already has: featureCount = number of .feature files under features/<context>/<capability>/, scenarioCount = tagged scenarios in them (0/0 for reverse-engineered code that has none). Maturity follows STRICTLY from those counts: 0 features -> vision; features but no scenarios -> sketched; scenarios present -> building. NEVER usable or stable — those are earned later by charting real @happy/@edge/@error scenarios, never inferred from the project's own test suite. Do NOT invent scenario tags or counts. Return contexts and capabilities with lowercase-hyphen slugs, names, one-line definitions, the owning context slug, featureCount, scenarioCount, and the count-derived maturity.`,
    { schema: SCAN_SCHEMA, label: 'scan:structure', phase: 'Scan' }
  ),
  () => agent(
    `Analyze the codebase at ${where}. Identify the core SUBJECTS (domain data types / persisted entities with identity), the ACTORS (human roles and external systems), notable EVENTS, and a GLOSSARY SEED of recurring domain terms (one canonical term each, synonyms listed as aliasesToAvoid). Return them with lowercase-hyphen slugs and short definitions.`,
    { schema: SCAN_SCHEMA, label: 'scan:domain', phase: 'Scan' }
  ),
  () => agent(
    `Analyze the codebase at ${where}. Identify capability-to-capability DATA DEPENDENCIES (which capability relies on another's data), and any EXISTING ADRs (e.g. files under docs/adr/). Return dependencies as {from,to} capability slugs and ADRs with id/title/status/date.`,
    { schema: SCAN_SCHEMA, label: 'scan:links', phase: 'Scan' }
  ),
]);

phase('Assemble');
const draft = await agent(
  `Assemble a single DRAFT kartograph.json (version "1") from these three scans of the codebase at ${where}.

Structure (contexts + capabilities):
${JSON.stringify(structure, null, 2)}

Domain (subjects, actors, events, glossary seed):
${JSON.stringify(domain, null, 2)}

Links (dependencies + existing ADRs):
${JSON.stringify(links, null, 2)}

Produce an object with these top-level keys: version ("1"), meta {name}, knowledge { bundle: "knowledge", okfVersion: "0.2" }, and slug-keyed objects contexts, capabilities, subjects, actors, events, rules, adrs, plus a dependencies array of {from,to}.

The map has NO glossary object. Definitions live on disk in the OKF knowledge bundle; the map only points at them.

Use EXACTLY these English field names — never invent German equivalents:
- rules: each entry is { name, glossaryRef, subject? }. The invariant TEXT does not go in the map — it becomes the description of the rule's concept file, written in the next step. "subject" is a SINGLE subject slug (NOT "appliesToSubjects"; if a rule touches several subjects, pick the primary one).
- subjects: each { name, glossaryRef?, properties?, rules? }; actors and events: each { name, glossaryRef? }. A "glossaryRef" is a path into the knowledge bundle — "<context-slug>/<term-slug>" for a term belonging to one context, or "shared/<term-slug>" for one used across several. Set it only for a term that appears in the glossary seed above; the matching file is written straight after this step. Give EVERY context a distinct "color" (a #rrggbb hex string) so the map is readable — assign the colors in order from this palette, cycling if there are more than ten contexts: #33aa77, #7a6cff, #e2683c, #d9a521, #4f9dd6, #c0529b, #5bb26b, #b5573c, #8a7d4a, #6d6f78. Every context needs "glossaryRef": "<context-slug>/<context-slug>". Each capability MUST carry "glossaryRef": "<its context slug>/<its own slug>", reference an existing context slug, and carry a "derived" block {maturity, featureCount, scenarioCount}; set featureCount/scenarioCount to the REAL number of .feature files / tagged scenarios you found (0 when none exist — do not use 1 as a placeholder). Maturity MUST be consistent with those counts: featureCount 0 -> "vision"; features but scenarioCount 0 -> "sketched"; scenarioCount > 0 -> "building". NEVER "usable" or "stable" — those require charted @edge/@error scenarios and are earned later via /karto-chart, not declared here (a map that claims them with zero coverage is rejected by validation). Capabilities with nothing built use declaredStage "vision". Every dependency and reference must point at a slug that exists in the draft (no dangling references). Return ONLY the kartograph object.`,
  { schema: ASSEMBLE_SCHEMA, label: 'assemble', phase: 'Assemble' }
);

phase('Knowledge');
const conceptFiles = await agent(
  `Write an Open Knowledge Format (OKF v0.2) bundle at "${root}/knowledge/" — one markdown file per term. This bundle is the single source of truth for what this project's words mean; the draft map only points into it and never repeats a definition.

Write a concept for EVERY one of these, because the draft map points at each by "glossaryRef" and a pointer that does not resolve fails the write gate:

Draft map (every glossaryRef in it names a file you must write):
${JSON.stringify({ contexts: draft.contexts, capabilities: draft.capabilities, rules: draft.rules, subjects: draft.subjects, actors: draft.actors, events: draft.events }, null, 2)}

Glossary seed and domain scan (the definitions to use):
${JSON.stringify(domain, null, 2)}

Structure scan (the definitions for contexts and capabilities):
${JSON.stringify(structure, null, 2)}

The file path is exactly the node's "glossaryRef" plus ".md", under knowledge/. So a glossaryRef of "checkout/place-an-order" means knowledge/checkout/place-an-order.md. Create directories as needed. NEVER write index.md or log.md — those names are reserved.

Types: a context's concept is type Kontext, a capability's is Capability, a rule's is Regel, a subject's is Subjekt, an actor's is Akteur, an event's is Ereignis, and a plain domain word is Begriff. The "description" is ONE tight sentence: for a context, what area of the system it covers; for a capability, what it does; for a rule, the invariant itself; for a term, what the thing IS.

If you genuinely cannot determine what something means from the code, write the description as "TODO — define this term." and say so in the body rather than inventing a plausible-sounding definition. A labelled gap is useful; a confident invention is not.

Each file is YAML frontmatter, then a markdown body:

---
type: <Subjekt | Akteur | Ereignis | Regel | Kontext | Capability | Begriff>
title: <the canonical term>
description: <ONE tight sentence: what the thing IS, not what it does>
status: draft
aliases_to_avoid: [<synonym>, ...]      # omit when there are none
generated: { by: kartograph/karto-init, at: <this moment, ISO 8601 with a Z offset> }
sources:
  - id: code
    resource: <the file or directory in the codebase the term was read from>
---

# Definition

<The definition sentence, then any elaboration the code supports.>

Rules:
- Map the seed's type slug to the type name: subjekt→Subjekt, akteur→Akteur, ereignis→Ereignis, regel→Regel, kontext→Kontext, capability→Capability, term→Begriff. No other type value is valid.
- "status: draft" is mandatory. These terms were inferred from code and no human has confirmed them. Never write "stable", and never write a "verified" key.
- ONE CANONICAL TERM PER CONCEPT. Two files may never share a title, and no file's title may appear in another file's aliases_to_avoid. Synonyms go in aliases_to_avoid on the single canonical file.
- Every file records in "sources" where in the codebase the term came from — that provenance is the point.
- Every "glossaryRef" in the draft map must match a file you write, and every file you write should be referenced by the node it defines.

Return a plain list of the file paths you wrote.`,
  { label: 'knowledge', phase: 'Knowledge' }
);

// Return the map alone — the /karto-init command writes it verbatim, and an extra
// top-level key would be rejected by the schema. The written concept files ride along
// under `meta` for the command to report.
return { map: { ...draft, knowledge: draft.knowledge || { bundle: 'knowledge', okfVersion: '0.2' } }, conceptFiles };
