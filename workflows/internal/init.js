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
// names (rules, glossary, subjects, actors, events) so the structured-output layer
// rejects e.g. `definition`/`appliesToSubjects` on a rule or a `begriff` glossary type
// and the agent must retry. Mirrors schemas/v1 — keep in sync. Deep cross-reference
// validation still runs via scripts/validate-kartograph.js in the command.
const SLUG = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' };
const slugMapOf = (item) => ({ type: 'object', additionalProperties: item });
const NAMED = {
  type: 'object', additionalProperties: false,
  required: ['name'],
  properties: { name: { type: 'string' }, glossaryRef: SLUG },
};
const ASSEMBLE_SCHEMA = {
  type: 'object', additionalProperties: true,
  required: ['version', 'meta', 'contexts', 'capabilities'],
  properties: {
    version: { const: '1' },
    meta: { type: 'object' },
    contexts: { type: 'object' }, capabilities: { type: 'object' }, adrs: { type: 'object' },
    subjects: slugMapOf({
      type: 'object', additionalProperties: false,
      required: ['name'],
      properties: {
        name: { type: 'string' }, glossaryRef: SLUG,
        properties: { type: 'array', items: { type: 'string' } },
        rules: { type: 'array', items: SLUG },
      },
    }),
    actors: slugMapOf(NAMED),
    events: slugMapOf(NAMED),
    rules: slugMapOf({
      type: 'object', additionalProperties: false,
      required: ['name', 'statement'],
      properties: { name: { type: 'string' }, statement: { type: 'string' }, subject: SLUG },
    }),
    glossary: slugMapOf({
      type: 'object', additionalProperties: false,
      required: ['term', 'definition', 'type'],
      properties: {
        term: { type: 'string' }, definition: { type: 'string' },
        type: { enum: ['subjekt', 'capability', 'kontext', 'akteur', 'ereignis', 'regel', 'term'] },
        aliasesToAvoid: { type: 'array', items: { type: 'string' } },
        related: { type: 'array', items: SLUG },
      },
    }),
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

Produce an object with these top-level keys: version ("1"), meta {name}, and slug-keyed objects contexts, capabilities, subjects, actors, events, rules, glossary, adrs, plus a dependencies array of {from,to}.

Use EXACTLY these English field names — never invent German equivalents:
- rules: each entry is { name, statement, subject? } — the invariant goes in "statement" (NOT "definition"), and "subject" is a SINGLE subject slug (NOT "appliesToSubjects"; if a rule touches several subjects, pick the primary one and mention the others in the statement text).
- glossary: each entry is { term, definition, type } where "type" is one of exactly: subjekt, capability, kontext, akteur, ereignis, regel, term (use "term" when unsure — never other words like "begriff").
- subjects: each { name, glossaryRef?, properties?, rules? }; actors and events: each { name, glossaryRef? }. Give EVERY context a distinct "color" (a #rrggbb hex string) so the map is readable — assign them in order from this palette, cycling if there are more than ten contexts: #33aa77, #7a6cff, #e2683c, #d9a521, #4f9dd6, #c0529b, #5bb26b, #b5573c, #8a7d4a, #6d6f78. Each capability must reference an existing context slug and carry a "derived" block {maturity, featureCount, scenarioCount}; set featureCount/scenarioCount to the REAL number of .feature files / tagged scenarios you found (0 when none exist — do not use 1 as a placeholder). Maturity MUST be consistent with those counts: featureCount 0 -> "vision"; features but scenarioCount 0 -> "sketched"; scenarioCount > 0 -> "building". NEVER "usable" or "stable" — those require charted @edge/@error scenarios and are earned later via /karto-chart, not declared here (a map that claims them with zero coverage is rejected by validation). Capabilities with nothing built use declaredStage "vision". Every dependency and reference must point at a slug that exists in the draft (no dangling references). Return ONLY the kartograph object.`,
  { schema: ASSEMBLE_SCHEMA, label: 'assemble', phase: 'Assemble' }
);

return draft;
