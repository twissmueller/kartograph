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

const a = args || {};
const root = a.root || '.';
const where = a.scope ? `${root} (focus on the subtree "${a.scope}")` : root;

const SCAN_SCHEMA = {
  type: 'object', additionalProperties: true,
  properties: { notes: { type: 'string' } },
};

// Permissive: forces an OBJECT (not free text) with the core top-level keys.
// Deep validation is done by scripts/validate-kartograph.js in the command.
const ASSEMBLE_SCHEMA = {
  type: 'object', additionalProperties: true,
  required: ['version', 'meta', 'contexts', 'capabilities'],
  properties: {
    version: { const: '1' },
    meta: { type: 'object' },
    contexts: { type: 'object' }, capabilities: { type: 'object' },
    subjects: { type: 'object' }, actors: { type: 'object' }, events: { type: 'object' },
    rules: { type: 'object' }, glossary: { type: 'object' }, adrs: { type: 'object' },
    dependencies: { type: 'array' },
  },
};

phase('Scan');
const [structure, domain, links] = await parallel([
  () => agent(
    `Analyze the codebase at ${where}. Identify the top-level CONTEXTS (bounded areas/modules) and, within each, the CAPABILITIES (cohesive units of behavior). For each capability infer maturity from REAL test coverage: tests/.feature present -> building/usable/stable per how thorough; code only -> sketched; named/stub only -> vision. Do NOT invent scenario tags. Return contexts and capabilities with lowercase-hyphen slugs, names, one-line definitions, the owning context slug, and a derived maturity.`,
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

Produce an object with these top-level keys: version ("1"), meta {name}, and slug-keyed objects contexts, capabilities, subjects, actors, events, rules, glossary, adrs, plus a dependencies array of {from,to}. Each capability must reference an existing context slug and carry a "derived" block {maturity, featureCount, scenarioCount}; capabilities with nothing built use declaredStage "vision". Every dependency and reference must point at a slug that exists in the draft (no dangling references). Keep it conservative — under-claim maturity rather than over-claim. Return ONLY the kartograph object.`,
  { schema: ASSEMBLE_SCHEMA, label: 'assemble', phase: 'Assemble' }
);

return draft;
