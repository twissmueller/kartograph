// Kartograph sync workflow (the code-drift half of /karto-sync).
//
// Dynamic Claude Code workflow: the runtime provides the globals `agent`, `phase`,
// and `args`; the script cannot import modules or touch the filesystem, so the agent
// reads the existing map and the code itself via its tools.
//
// Returns a discovery-style `findings` object describing what the CODE currently
// contains. /karto-sync folds the additions into the map via applyDiscovery and
// computes the missing-entry report via mapDrift. Maturity is never decided here.
//
// Returns the findings object directly (not wrapped in a discovery document). Callers
// must wrap it as { findings: <return value> } before passing it to applyDiscovery.
//
// args: { root, scope?, mapPath? }

export const meta = {
  name: 'karto-sync',
  description: 'Analyze the codebase and report what it contains as Kartograph findings, for /karto-sync to diff against the map.',
  phases: [
    { title: 'Scan', detail: 'read the code for contexts, capabilities, subjects, dependencies and ADRs' },
    { title: 'Cross-check', detail: 'reconcile findings against the existing map' },
  ],
};

const SLUG = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' };
const NAMED = {
  type: 'object', additionalProperties: false,
  required: ['slug', 'name'],
  properties: { slug: SLUG, name: { type: 'string' }, definition: { type: 'string' } },
};
// FINDINGS_SCHEMA — kept identical to the one in workflows/internal/discovery.js.
// Workflow files cannot import, so the definition is duplicated; change both together.
const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['subjects', 'events', 'actors', 'rules', 'affectedCapabilities', 'capabilityCandidates', 'glossaryAdditions', 'adrCandidates', 'placement'],
  properties: {
    subjects: { type: 'array', items: NAMED },
    events: { type: 'array', items: NAMED },
    actors: { type: 'array', items: NAMED },
    rules: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'statement'],
        properties: { slug: SLUG, name: { type: 'string' }, statement: { type: 'string' }, subject: SLUG },
      },
    },
    affectedCapabilities: { type: 'array', items: SLUG },
    capabilityCandidates: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['slug', 'name', 'context', 'definition'],
        properties: { slug: SLUG, name: { type: 'string' }, context: SLUG, definition: { type: 'string' } },
      },
    },
    glossaryAdditions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['slug', 'term', 'definition', 'type'],
        properties: {
          slug: SLUG, term: { type: 'string' }, definition: { type: 'string' },
          type: { enum: ['subjekt', 'capability', 'kontext', 'akteur', 'ereignis', 'regel', 'term'] },
          aliasesToAvoid: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    adrCandidates: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'rationale'],
        properties: {
          title: { type: 'string' }, rationale: { type: 'string' },
          contexts: { type: 'array', items: SLUG }, capabilities: { type: 'array', items: SLUG },
        },
      },
    },
    placement: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['kind', 'slug'],
        properties: { kind: { enum: ['affectedCapability', 'capabilityCandidate'] }, slug: SLUG, context: SLUG },
      },
    },
    dependencies: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['from', 'to'],
        properties: { from: SLUG, to: SLUG, reason: { type: 'string' }, features: { type: 'array', items: { type: 'string' } } },
      },
    },
  },
};

const a = args || {};
const root = a.root || '.';
const where = a.scope ? `${root} (focus on the subtree: ${a.scope})` : root;
const mapPath = a.mapPath || 'kartograph.json';

phase('Scan');
const extracted = await agent(
  `You are re-surveying an EXISTING codebase to keep a Kartograph map in sync with the code.

First read the existing map at "${mapPath}" to learn the contexts, capability slugs, and glossary terms already in use. Reuse existing slugs wherever the thing already exists.

Then analyze the code at ${where} and extract Kartograph findings describing what the code CURRENTLY contains:
- subjects, events, actors: the domain things/things-that-happened/triggers in the code.
- rules: invariants enforced in the code (each tied to a subject when possible).
- affectedCapabilities: slugs of EXISTING map capabilities that the code still implements.
- capabilityCandidates: capabilities present in the code but NOT yet on the map (each with its context slug). They are born "vision".
- dependencies: capability→capability data dependencies inferred from imports/call graphs, as { from, to } (add a one-line "reason" describing how from uses to when clear).
- glossaryAdditions: recurring domain terms worth defining, one canonical term each.
- adrCandidates: only genuinely hard-to-reverse, surprising, trade-off decisions evident in the code.
- placement: where each affected/candidate capability lands (its context).

Do NOT decide maturity — that is derived from Kartograph scenarios elsewhere. Use lowercase-hyphen slugs. Return the findings object.`,
  { schema: FINDINGS_SCHEMA, label: 'scan', phase: 'Scan' }
);

phase('Cross-check');
const checked = await agent(
  `Reconcile these findings against the existing map at "${mapPath}" (read it again to be sure).

Findings:
${JSON.stringify(extracted, null, 2)}

Tasks:
- Move any capabilityCandidate that ALREADY exists in the map into affectedCapabilities instead (it is not new).
- Merge near-duplicate glossaryAdditions into a single canonical term; record the rejected wordings under aliasesToAvoid. Do not duplicate glossary terms already in the map.
- Ensure every remaining capabilityCandidate has a valid context slug and a matching placement entry.
- Keep dependencies as { from, to } (optionally with a one-line reason). Use only capability slugs that exist in the map or appear in capabilityCandidates.

Return the corrected findings object in exactly the same shape.`,
  { schema: FINDINGS_SCHEMA, label: 'cross-check', phase: 'Cross-check' }
);

return checked;
