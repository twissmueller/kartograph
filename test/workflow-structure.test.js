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
for (const wf of ['workflows/internal/discovery.js', 'workflows/internal/init.js', 'workflows/internal/chart.js', 'workflows/internal/sync.js']) {
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

test('plugin.json registers all commands and skills', async () => {
  const p = JSON.parse(await read('.claude-plugin/plugin.json'));
  for (const c of [
    './commands/karto-explore.md', './commands/karto-chart.md', './commands/karto-build.md',
    './commands/karto-sync.md', './commands/karto-init.md', './commands/karto-show.md',
  ]) assert.ok(p.commands.includes(c), `commands includes ${c}`);
  for (const s of [
    './skills/karto-grill', './skills/karto-analyze-repo',
    './skills/karto-groom-glossary', './skills/karto-groom-adr',
  ]) assert.ok(p.skills.includes(s), `skills includes ${s}`);
});
