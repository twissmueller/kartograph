import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

// Workflow scripts use top-level await/return inside the runtime's async wrapper,
// so `node --check` (plain module) rejects them. Validate them the way the runtime
// does: as the body of an AsyncFunction. Constructing (not calling) parses without
// executing.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// The three workflow scripts live under workflows/internal/ (a non-scanned
// subdirectory) so they don't register as standalone `[dynamic workflow]` slash
// commands — commands invoke them by scriptPath instead.
for (const wf of ['workflows/internal/discovery.js', 'workflows/internal/init.js', 'workflows/internal/chart.js', 'workflows/internal/sync.js', 'workflows/internal/build-all.js']) {
  test(`${wf} parses as a workflow body`, async () => {
    const src = await read(wf);
    const body = src.replace(/export\s+const\s+meta/, 'const meta');
    assert.doesNotThrow(() =>
      new AsyncFunction('agent', 'phase', 'parallel', 'pipeline', 'log', 'args', body)
    );
  });

  test(`${wf} exports a meta literal with name/description/phases`, async () => {
    const src = await read(wf);
    assert.match(src, /export\s+const\s+meta\s*=/, 'has export const meta');
    assert.match(src, /name\s*:/);
    assert.match(src, /description\s*:/);
    assert.match(src, /phases\s*:/);
  });
}

function frontmatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  return m ? m[1] : null;
}

for (const skill of [
  'skills/karto-grill/SKILL.md',
  'skills/karto-analyze-repo/SKILL.md',
  'skills/karto-groom-glossary/SKILL.md',
  'skills/karto-groom-adr/SKILL.md',
]) {
  test(`${skill} has YAML frontmatter with name and description`, async () => {
    const fm = frontmatter(await read(skill));
    assert.ok(fm, 'has frontmatter block');
    assert.match(fm, /(^|\n)name:\s*\S+/, 'has name');
    assert.match(fm, /(^|\n)description:\s*\S+/, 'has description');
  });

  // These skills are internal building blocks invoked by the commands, not
  // user-facing entry points — they must stay out of the `/` slash menu so the
  // public surface is exactly the six commands.
  test(`${skill} is hidden from the slash menu (user-invocable: false)`, async () => {
    const fm = frontmatter(await read(skill));
    assert.match(fm, /(^|\n)user-invocable:\s*false\b/, 'has user-invocable: false');
  });
}

for (const cmd of [
  'commands/karto-explore.md', 'commands/karto-chart.md', 'commands/karto-build.md',
  'commands/karto-sync.md', 'commands/karto-init.md', 'commands/karto-show.md',
  'commands/karto-build-all.md', 'commands/karto-revise.md',
]) {
  test(`${cmd} has a description frontmatter`, async () => {
    const fm = frontmatter(await read(cmd));
    assert.ok(fm, 'has frontmatter block');
    assert.match(fm, /(^|\n)description:\s*\S+/);
  });
}

test('explore command wires the discovery workflow by scriptPath', async () => {
  const src = await read('commands/karto-explore.md');
  assert.match(src, /workflows\/internal\/discovery\.js/);
  assert.match(src, /CLAUDE_PLUGIN_ROOT/);
});

test('init command wires the init workflow by scriptPath', async () => {
  const src = await read('commands/karto-init.md');
  assert.match(src, /workflows\/internal\/init\.js/);
  assert.match(src, /CLAUDE_PLUGIN_ROOT/);
});

test('chart command wires the chart workflow by scriptPath', async () => {
  const src = await read('commands/karto-chart.md');
  assert.match(src, /workflows\/internal\/chart\.js/);
  assert.match(src, /CLAUDE_PLUGIN_ROOT/);
});

test('sync command wires the sync workflow by scriptPath', async () => {
  const src = await read('commands/karto-sync.md');
  assert.match(src, /workflows\/internal\/sync\.js/);
  assert.match(src, /CLAUDE_PLUGIN_ROOT/);
});

test('build command leans on superpowers TDD and works from the map, with no separate config', async () => {
  const src = await read('commands/karto-build.md');
  assert.match(src, /test-driven-development/);
  assert.match(src, /kartograph\.json/);
  // The only files Kartograph keeps are kartograph.json + kartograph.layout.json; build
  // must not depend on a separate config.json.
  assert.doesNotMatch(src, /config\.json/);
});

test('build-all workflow declares meta and defensively parses args', async () => {
  const src = await read('workflows/internal/build-all.js');
  assert.match(src, /export const meta = \{/);
  assert.match(src, /name: 'karto-build-all'/);
  // standing Kartograph guard: tolerate a JSON-stringified args object
  assert.match(src, /typeof a === 'string'/);
  // never writes the map directly; advances state via set-tracking.js (run by subagents)
  assert.match(src, /set-tracking\.js/);
  assert.doesNotMatch(src, /writeMap|kartograph\.json'/);
});

test('karto-build-all command has a description and wires the build-all workflow by scriptPath', async () => {
  const src = await read('commands/karto-build-all.md');
  assert.match(src, /^---[\s\S]*description:[\s\S]*?---/);
  assert.match(src, /workflows\/internal\/build-all\.js/);
  assert.match(src, /scripts\/build-plan\.js/);
  assert.match(src, /scripts\/reconcile\.js/);
});

test('plugin.json registers all commands and skills', async () => {
  const p = JSON.parse(await read('.claude-plugin/plugin.json'));
  for (const c of [
    './commands/karto-explore.md', './commands/karto-chart.md', './commands/karto-build.md',
    './commands/karto-sync.md', './commands/karto-init.md', './commands/karto-show.md',
    './commands/karto-build-all.md', './commands/karto-revise.md',
  ]) assert.ok(p.commands.includes(c), `commands includes ${c}`);
  for (const s of [
    './skills/karto-grill', './skills/karto-analyze-repo',
    './skills/karto-groom-glossary', './skills/karto-groom-adr',
  ]) assert.ok(p.skills.includes(s), `skills includes ${s}`);
});

// --- automation policy wiring -----------------------------------------------------
// The commands are prose, so the only thing a test can hold them to is that they still
// name the step they are supposed to obey and still call the CLI that reads it. Actual
// behaviour is verified by running the commands in Claude Code.

test('explore and revise both end by asking the automation questionnaire and persisting it', async () => {
  for (const cmd of ['commands/karto-explore.md', 'commands/karto-revise.md']) {
    const src = await read(cmd);
    assert.match(src, /scripts\/automation\.js \. questions/, `${cmd} prints the questionnaire`);
    assert.match(src, /scripts\/automation\.js \. set/, `${cmd} persists the answers`);
    assert.match(src, /AskUserQuestion/, `${cmd} asks with AskUserQuestion`);
    assert.match(src, /chart-after-explore/, `${cmd} branches on chart-after-explore`);
    assert.match(src, /automation.*discovery\.json|discovery\.json.*automation/s, `${cmd} stamps the survey`);
  }
});

test('chart branches on build-after-chart, reading the survey stamp', async () => {
  const src = await read('commands/karto-chart.md');
  assert.match(src, /scripts\/automation\.js \. get build-after-chart --survey/);
  assert.doesNotMatch(src, /Do not build automatically\./, 'the unconditional pause is gone');
});

test('build obeys the acceptance-suite, commit, rewalk-check and walk-after-build steps', async () => {
  const src = await read('commands/karto-build.md');
  assert.match(src, /scripts\/automation\.js \. show/, 'build reads the policy first');
  for (const step of ['acceptance-suite', 'commit', 'rewalk-check', 'walk-after-build']) {
    assert.match(src, new RegExp(step), `build names the ${step} step`);
  }
});

test('build-all passes the policy into the workflow, since the workflow cannot read it', async () => {
  const cmd = await read('commands/karto-build-all.md');
  assert.match(cmd, /scripts\/automation\.js \. get/);
  assert.match(cmd, /"automation":/);
  const wf = await read('workflows/internal/build-all.js');
  assert.match(wf, /a\.automation/);
});

test('walk names both drivers, honours walk-driver, and still routes state through set-tracking', async () => {
  const src = await read('commands/karto-walk.md');
  assert.match(src, /scripts\/automation\.js" \. get walk-driver/);
  assert.match(src, /mcp__claude-in-chrome__/, 'names the Claude in Chrome tools');
  assert.match(src, /mcp__plugin_playwright_playwright__/, 'names the Playwright tools');
  assert.match(src, /scripts\/set-tracking\.js/, 'state still flows through the deterministic CLI');
  assert.match(src, /list-tracking\.js" \. developed/, 'still walks Developed scenarios only');
});

test('walk keeps the agent from accepting its own work', async () => {
  const src = await read('commands/karto-walk.md');
  // The whole point of automating the walk is that the agent PRESENTS and VERIFIES; the
  // person still decides. If these guardrails ever go missing the command becomes a way to
  // self-certify, and Accepted stops meaning anything.
  assert.match(src, /observation is never the verdict/i);
  assert.match(src, /Pass, Fail, or Skip/, 'asks after every scenario');
  assert.match(src, /never.{0,40}mark it Accepted/is);
  assert.match(src, /Stop rather than improvise/i, 'no retrying until something passes');
  assert.match(src, /destructive/i, 'confirms before destructive actions');
  assert.match(src, /alert.*confirm.*prompt/s, 'avoids blocking browser dialogs');
});

test('build and build-all both hand off to the walk', async () => {
  for (const cmd of ['commands/karto-build.md', 'commands/karto-build-all.md']) {
    const src = await read(cmd);
    assert.match(src, /walk-after-build/, `${cmd} reads the step`);
    assert.match(src, /\/karto-walk/, `${cmd} hands off to the walk`);
  }
});
