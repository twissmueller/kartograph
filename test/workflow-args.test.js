import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The workflow scripts run inside the runtime's async wrapper with injected globals. We run
// the real script body the same way (as an AsyncFunction) with stub globals, to verify the
// defensive args handling: a JSON-stringified args object must be parsed, not treated as one
// opaque string (which previously produced empty surveys with "(none provided)").
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const root = new URL('../', import.meta.url);

async function runWorkflow(relPath, args, agentImpl) {
  const src = await readFile(new URL(relPath, root), 'utf8');
  const body = src.replace(/export\s+const\s+meta/, 'const meta');
  const fn = new AsyncFunction('agent', 'phase', 'parallel', 'pipeline', 'log', 'args', body);
  const noop = () => {};
  const parallel = async (thunks) => Promise.all(thunks.map((t) => t()));
  return fn(agentImpl, noop, parallel, noop, noop, args);
}

const emptyFindings = {
  subjects: [], events: [], actors: [], rules: [], affectedCapabilities: [],
  capabilityCandidates: [], glossaryAdditions: [], adrCandidates: [], placement: [],
};

test('discovery.js parses a JSON-stringified args object instead of yielding empty args', async () => {
  const prompts = [];
  const agent = async (prompt) => { prompts.push(prompt); return emptyFindings; };
  const args = JSON.stringify({
    date: '2026-06-10', slug: 'watering',
    description: 'Water the beds', conversationSummary: 'We discussed watering.',
  });
  const survey = await runWorkflow('workflows/internal/discovery.js', args, agent);
  assert.equal(survey.date, '2026-06-10');
  assert.equal(survey.slug, 'watering');
  assert.equal(survey.sources.description, 'Water the beds');
  assert.equal(survey.conversationSummary, 'We discussed watering.');
  assert.match(prompts[0], /Water the beds/);
  assert.doesNotMatch(prompts[0], /none provided/);
});

test('discovery.js still works with a plain object args', async () => {
  const agent = async () => emptyFindings;
  const survey = await runWorkflow('workflows/internal/discovery.js',
    { date: '2026-06-10', slug: 's', description: 'd', conversationSummary: 'c' }, agent);
  assert.equal(survey.slug, 's');
  assert.equal(survey.sources.description, 'd');
});

test('discovery.js with a malformed args string degrades to empty, not a crash', async () => {
  const agent = async () => emptyFindings;
  const survey = await runWorkflow('workflows/internal/discovery.js', '{not json', agent);
  assert.equal(survey.slug, undefined);            // nothing to read, but no throw
  assert.equal(survey.sources.description, '');
});
