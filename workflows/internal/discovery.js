// Kartograph discovery workflow (Phase B of /karto-explore).
//
// Runs as a Claude Code dynamic workflow. The runtime provides the globals
// `agent`, `phase`, and `args`; the script body cannot import modules or touch
// the filesystem, so the agent reads the existing map itself via its tools.
//
// The returned object is the survey: the /karto-explore command validates it
// against schemas/v1/discovery.schema.json and writes it to
// kartograph/surveys/<date>-<slug>.discovery.json.
//
// args: { date, slug, description, conversationSummary, issue?, mapPath? }

export const meta = {
  name: 'karto-discovery',
  description: 'Extract structured Kartograph findings from a surveyed feature and cross-check them against the existing map.',
  phases: [
    { title: 'Extract', detail: 'pull subjects, events, actors, rules, capabilities, dependencies, glossary additions and ADR candidates' },
    { title: 'Cross-check', detail: 'dedupe candidates and terms against the existing map' },
  ],
};

const SLUG = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' };
const NAMED = {
  type: 'object', additionalProperties: false,
  required: ['slug', 'name'],
  properties: { slug: SLUG, name: { type: 'string' }, definition: { type: 'string' } },
};
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
    openQuestions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['question'],
        properties: { question: { type: 'string' }, context: SLUG },
      },
    },
  },
};

// `args` should arrive as an object. Tolerate a JSON-stringified object too — a common
// mis-call of the Workflow tool that would otherwise yield empty args and a survey with
// nothing in it (description/summary read as "(none provided)").
let a = args || {};
if (typeof a === 'string') { try { a = JSON.parse(a) || {}; } catch { a = {}; } }
const mapPath = a.mapPath || 'kartograph.json';

phase('Extract');
const extracted = await agent(
  `You are surveying a software feature for a Kartograph map (a living model of a system).

Feature description:
${a.description || '(none provided)'}

Conversation summary from the survey with the user:
${a.conversationSummary || '(none)'}

First, read the existing map at "${mapPath}" if it exists, plus any existing .feature files, to learn the contexts, capability slugs, and glossary terms already in use. Reuse existing slugs wherever the thing already exists; only propose new slugs for genuinely new things.

Then extract Kartograph findings:
- subjects, events, actors: the domain things/things-that-happened/triggers this feature touches.
- rules: invariants that must always hold (each tied to a subject when possible).
- affectedCapabilities: slugs of EXISTING capabilities this feature changes.
- capabilityCandidates: NEW capabilities (each with the context slug it belongs to). They are born in "vision".
- glossaryAdditions: domain terms worth defining, ONE canonical term each (list synonyms under aliasesToAvoid). Do not duplicate existing glossary terms.
- adrCandidates: architecture decisions, but ONLY when the decision is hard to reverse AND surprising without context AND the result of a real trade-off. Otherwise it is a plain feature, not an ADR.
- placement: where each affected/candidate capability lands (its context).
- openQuestions: valid questions the survey raised that the user could NOT answer yet (look for an "Offene Fragen / Open questions" section in the conversation summary, or anything the user explicitly deferred). Record each verbatim as { question }, with an optional "context" slug when it clearly relates to one capability/context. Do not invent questions; only capture genuinely unresolved ones.
- dependencies: capability→capability links this feature introduces. When a feature of one capability needs another capability, record { from, to } (both capability slugs, from = the capability that needs the other). Add a one-line "reason" describing HOW from uses to (e.g. "reads canonical plant records to validate a bed"). Under "features", list the .feature filename(s) you expect the chart phase to write for the "from" capability that justify the link (e.g. ["grant-license.feature"]) — these are declared up-front and chart will write those exact files. Omit "features" only if you genuinely cannot name the feature yet. Do not invent dependencies the feature does not actually require.

Use lowercase-hyphen slugs. Return the findings object.`,
  { schema: FINDINGS_SCHEMA, label: 'extract', phase: 'Extract' }
);

phase('Cross-check');
const checked = await agent(
  `Reconcile these extracted Kartograph findings against the existing map at "${mapPath}" (read it again to be sure).

Findings:
${JSON.stringify(extracted, null, 2)}

Tasks:
- Remove any finding that already exists in the map (a capability/subject/term already present): move duplicated capabilities into affectedCapabilities instead of capabilityCandidates.
- Merge near-duplicate glossary terms into a single canonical term; record the rejected wordings under aliasesToAvoid. No synonyms.
- Ensure every capabilityCandidate has a valid context slug (an existing context, or one you clearly intend to create) and a matching placement entry.

Return the corrected findings object in exactly the same shape.`,
  { schema: FINDINGS_SCHEMA, label: 'cross-check', phase: 'Cross-check' }
);

return {
  date: a.date,
  slug: a.slug,
  conversationSummary: a.conversationSummary || '',
  sources: a.issue ? { description: a.description || '', issue: a.issue } : { description: a.description || '' },
  findings: checked,
};
