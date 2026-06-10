# Scenario Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cross-capability Kanban board to the Kartograph viewer that shows every scenario as a card in four progress columns (Open / In Progress / Test / Done), filterable by capability, with drag-and-drop that writes the progress back to the `.feature` files.

**Architecture:** Progress is stored as scenario tags in the `.feature` files (`@wip`/`@test`/`@done`; `@done` already exists). A canonical `scenarioProgress(tags)` and a pure `setScenarioProgress(source, name, progress)` live in `workflows/lib/gherkin.js`. The dev server gains `GET /board` (aggregate all scenarios) and `POST /board` (write one scenario's progress). The viewer gets a `Map | Board` header toggle; the board UI lives in `viewer/lib/board-view.js`, with the pure column grouping in `viewer/lib/board.js`.

**Tech Stack:** Vanilla Node.js (`node:http`, `node:fs`), vanilla browser JS (ES modules, native HTML5 drag & drop), `node --test`. No frameworks.

---

## File Structure

- **`workflows/lib/gherkin.js`** (modify) — add `scenarioProgress(tags)` and `setScenarioProgress(source, scenarioName, progress)`. Canonical, server-side, pure.
- **`viewer/lib/board.js`** (create) — `BOARD_COLUMNS` and `boardColumns(scenarios)`; groups server-provided scenarios by their `progress` field. Pure, no DOM.
- **`viewer/lib/board-view.js`** (create) — DOM wiring: render columns + cards + capability filter, drag & drop, POST write-back, card-click navigation. No unit test (DOM), verified by running the viewer.
- **`server/serve.js`** (modify) — `GET /board` and `POST /board`.
- **`viewer/index.html`** (modify) — header `Map | Board` toggle, `#board` container in `#main`.
- **`viewer/kartograph.js`** (modify) — view switching, board init/refresh, scenario→detail navigation.
- **`viewer/styles.css`** (modify) — board, column, card, chip styles.
- **Tests:** `test/board.test.js` (create), `test/gherkin.test.js` (modify), `test/server.test.js` (modify).

---

## Task 1: Pure column grouping — `viewer/lib/board.js`

**Files:**
- Create: `viewer/lib/board.js`
- Test: `test/board.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/board.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_COLUMNS, boardColumns } from '../viewer/lib/board.js';

test('BOARD_COLUMNS is the four ordered progress states', () => {
  assert.deepEqual(BOARD_COLUMNS, ['open', 'wip', 'test', 'done']);
});

test('boardColumns groups scenarios by their server-provided progress', () => {
  const scenarios = [
    { name: 'a', progress: 'open' },
    { name: 'b', progress: 'wip' },
    { name: 'c', progress: 'done' },
    { name: 'd', progress: 'wip' },
  ];
  const cols = boardColumns(scenarios);
  assert.deepEqual(cols.open.map((s) => s.name), ['a']);
  assert.deepEqual(cols.wip.map((s) => s.name), ['b', 'd']);
  assert.deepEqual(cols.test.map((s) => s.name), []);
  assert.deepEqual(cols.done.map((s) => s.name), ['c']);
});

test('a scenario with an unknown/missing progress falls into open', () => {
  const cols = boardColumns([{ name: 'x' }, { name: 'y', progress: 'bogus' }]);
  assert.deepEqual(cols.open.map((s) => s.name), ['x', 'y']);
});

test('boardColumns on empty/undefined input yields four empty columns', () => {
  for (const input of [[], undefined]) {
    const cols = boardColumns(input);
    assert.deepEqual(Object.keys(cols), ['open', 'wip', 'test', 'done']);
    assert.equal(cols.open.length + cols.wip.length + cols.test.length + cols.done.length, 0);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/board.test.js`
Expected: FAIL — cannot find module `../viewer/lib/board.js`.

- [ ] **Step 3: Write minimal implementation**

Create `viewer/lib/board.js`:

```js
// Pure helpers for the scenario board. No DOM access — unit-tested in test/board.test.js;
// the DOM wiring lives in viewer/lib/board-view.js.

// The four progress columns, in display order.
export const BOARD_COLUMNS = ['open', 'wip', 'test', 'done'];

// Group scenarios into ordered columns keyed by their `progress` field (provided by the
// server's GET /board). An unknown or missing progress falls into 'open'.
export function boardColumns(scenarios) {
  const cols = { open: [], wip: [], test: [], done: [] };
  for (const s of scenarios || []) {
    (cols[s.progress] || cols.open).push(s);
  }
  return cols;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/board.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add viewer/lib/board.js test/board.test.js
git commit -m "feat(board): pure column grouping helper"
```

---

## Task 2: Tag helpers — `scenarioProgress` + `setScenarioProgress`

**Files:**
- Modify: `workflows/lib/gherkin.js`
- Test: `test/gherkin.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/gherkin.test.js`:

```js
import { scenarioProgress, setScenarioProgress } from '../workflows/lib/gherkin.js';

test('scenarioProgress maps tags with precedence done > test > wip, else open', () => {
  assert.equal(scenarioProgress([]), 'open');
  assert.equal(scenarioProgress(['@happy']), 'open');
  assert.equal(scenarioProgress(['@wip']), 'wip');
  assert.equal(scenarioProgress(['@test']), 'test');
  assert.equal(scenarioProgress(['@done']), 'done');
  assert.equal(scenarioProgress(['@wip', '@test', '@done']), 'done');
  assert.equal(scenarioProgress(['@wip', '@test']), 'test');
});

const FEATURE = `Feature: Watering

  @happy @wip
  Scenario: Water the bed
    Given a bed
    When I water it
    Then it is wet

  Scenario: Skip on rain
    Given rain
    Then watering is skipped
`;

test('setScenarioProgress swaps the progress tag and preserves class tags', () => {
  const out = setScenarioProgress(FEATURE, 'Water the bed', 'test');
  assert.match(out, /@happy @test\n {2}Scenario: Water the bed/);
  assert.doesNotMatch(out, /@wip/);
});

test('setScenarioProgress to open removes the progress tag, keeping class tags', () => {
  const out = setScenarioProgress(FEATURE, 'Water the bed', 'open');
  assert.match(out, /@happy\n {2}Scenario: Water the bed/);
  assert.doesNotMatch(out, /@wip/);
});

test('setScenarioProgress adds a tag line to a scenario that had none', () => {
  const out = setScenarioProgress(FEATURE, 'Skip on rain', 'wip');
  assert.match(out, /@wip\n {2}Scenario: Skip on rain/);
  // the other scenario is untouched
  assert.match(out, /@happy @wip\n {2}Scenario: Water the bed/);
});

test('setScenarioProgress drops the tag line entirely when only a progress tag remains', () => {
  const src = `Feature: F\n\n  @wip\n  Scenario: Solo\n    Given x\n`;
  const out = setScenarioProgress(src, 'Solo', 'open');
  assert.equal(out, `Feature: F\n\n  Scenario: Solo\n    Given x\n`);
});

test('setScenarioProgress throws on an unknown scenario or invalid progress', () => {
  assert.throws(() => setScenarioProgress(FEATURE, 'Nope', 'wip'), /not found/);
  assert.throws(() => setScenarioProgress(FEATURE, 'Water the bed', 'bogus'), /invalid progress/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/gherkin.test.js`
Expected: FAIL — `scenarioProgress`/`setScenarioProgress` are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `workflows/lib/gherkin.js`:

```js
const PROGRESS_TAGS = ['@wip', '@test', '@done'];
const PROGRESS_TAG = { open: null, wip: '@wip', test: '@test', done: '@done' };

// Progress state of a scenario from its tags. Precedence: done > test > wip, else open.
// Canonical, server-side; the GET /board endpoint stamps each scenario with this.
export function scenarioProgress(tags) {
  const t = tags || [];
  if (t.includes('@done')) return 'done';
  if (t.includes('@test')) return 'test';
  if (t.includes('@wip')) return 'wip';
  return 'open';
}

// Rewrite the tag line(s) of the FIRST scenario named `scenarioName` so its progress tag
// becomes `progress` ('open'|'wip'|'test'|'done'). Existing progress tags are removed; class
// tags (@happy/@edge/@error) and every other line are preserved. A scenario with no tag line
// gains one (unless progress is 'open'). Returns the new file text. Pure — no IO.
export function setScenarioProgress(source, scenarioName, progress) {
  if (!(progress in PROGRESS_TAG)) throw new Error(`invalid progress: ${progress}`);
  const newTag = PROGRESS_TAG[progress];
  const lines = String(source).split('\n');
  const scenRe = /^(\s*)Scenario(?:\s+Outline)?:\s*(.*)$/i;
  const isTagLine = (l) => l.trim().startsWith('@');

  let scenIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = scenRe.exec(lines[i]);
    if (m && m[2].trim() === scenarioName) { scenIdx = i; break; }
  }
  if (scenIdx === -1) throw new Error(`scenario not found: ${scenarioName}`);

  let start = scenIdx;
  while (start > 0 && isTagLine(lines[start - 1])) start--;

  const tags = lines.slice(start, scenIdx).join(' ').split(/\s+/).filter((t) => t.startsWith('@'));
  const kept = tags.filter((t) => !PROGRESS_TAGS.includes(t));
  if (newTag) kept.push(newTag);

  const indent = scenRe.exec(lines[scenIdx])[1] || '';
  const replacement = kept.length ? [indent + kept.join(' ')] : [];
  lines.splice(start, scenIdx - start, ...replacement);
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/gherkin.test.js`
Expected: PASS (all gherkin tests, including the new ones).

- [ ] **Step 5: Commit**

```bash
git add workflows/lib/gherkin.js test/gherkin.test.js
git commit -m "feat(gherkin): scenarioProgress + setScenarioProgress tag helpers"
```

---

## Task 3: Server `GET /board`

**Files:**
- Modify: `server/serve.js` (import line 4; new handler before the `GET /features/...` block, ~line 66)
- Test: `test/server.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/server.test.js` (reuses the file's existing `tmpProject`/`listen` helpers):

```js
test('GET /board aggregates scenarios across all capabilities with progress + class', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'karto-'));
  await writeFile(join(projectRoot, 'kartograph.json'), JSON.stringify({
    version: '1', meta: { name: 'T' },
    contexts: { care: { name: 'Care', definition: 'd' } },
    capabilities: { watering: { name: 'Watering', context: 'care', definition: 'd' } },
  }));
  const dir = join(projectRoot, 'features', 'care', 'watering');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'water.feature'),
    `Feature: Watering\n\n  @happy @wip\n  Scenario: Water\n    Given a bed\n\n  @edge @done\n  Scenario: Rain\n    Given rain\n`);

  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/board`);
    assert.equal(res.status, 200);
    const { scenarios } = await res.json();
    assert.equal(scenarios.length, 2);
    const water = scenarios.find((s) => s.name === 'Water');
    assert.deepEqual(
      { cap: water.capability, ctx: water.context, file: water.feature, cls: water.class, prog: water.progress },
      { cap: 'watering', ctx: 'care', file: 'water.feature', cls: 'happy', prog: 'wip' });
    assert.equal(scenarios.find((s) => s.name === 'Rain').progress, 'done');
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server.test.js`
Expected: FAIL — `/board` returns 404, so `res.status` is not 200.

- [ ] **Step 3: Update the import and add the handler**

In `server/serve.js`, change the gherkin import (line 4) to add `scenarioProgress`:

```js
import { parseFeature, scenarioClass, scenarioProgress } from '../workflows/lib/gherkin.js';
```

Then add this block immediately **before** the `// GET /features/<context>/<slug>` comment (~line 66):

```js
    // GET /board — every scenario across every capability, with its progress + class.
    if (url.pathname === '/board' && req.method === 'GET') {
      let map;
      try { map = JSON.parse(await readFile(join(projectRoot, 'kartograph.json'), 'utf8')); }
      catch { map = { capabilities: {} }; }
      const scenarios = [];
      for (const [slug, cap] of Object.entries(map.capabilities || {})) {
        const context = cap.context;
        if (!context) continue;
        const dir = join(projectRoot, 'features', context, slug);
        let names = [];
        try { names = (await readdir(dir)).filter((n) => n.endsWith('.feature')).sort(); }
        catch { continue; }
        for (const name of names) {
          let parsed;
          try { parsed = parseFeature(await readFile(join(dir, name), 'utf8')); }
          catch { continue; }
          for (const s of parsed.scenarios) {
            scenarios.push({
              capability: slug, capabilityName: cap.name || slug, context,
              feature: name, name: s.name,
              class: scenarioClass(s.tags), progress: scenarioProgress(s.tags),
            });
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ scenarios }));
      return;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/serve.js test/server.test.js
git commit -m "feat(server): GET /board aggregates scenarios across capabilities"
```

---

## Task 4: Server `POST /board`

**Files:**
- Modify: `server/serve.js` (import line 4; new handler after the `POST /layout` block)
- Test: `test/server.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/server.test.js`:

```js
test('POST /board writes the progress tag to the scenario and nothing else', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'karto-'));
  await writeFile(join(projectRoot, 'kartograph.json'), JSON.stringify({ version: '1', meta: { name: 'T' } }));
  const dir = join(projectRoot, 'features', 'care', 'watering');
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'water.feature');
  await writeFile(file, `Feature: Watering\n\n  @happy\n  Scenario: Water\n    Given a bed\n`);

  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/board`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: 'care', capability: 'watering', feature: 'water.feature', scenario: 'Water', progress: 'done' }),
    });
    assert.equal(res.status, 200);
    const saved = await readFile(file, 'utf8');
    assert.match(saved, /@happy @done\n {2}Scenario: Water/);

    // invalid progress -> 400
    const bad = await fetch(`http://127.0.0.1:${port}/board`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: 'care', capability: 'watering', feature: 'water.feature', scenario: 'Water', progress: 'nope' }),
    });
    assert.equal(bad.status, 400);

    // unknown scenario -> 404
    const missing = await fetch(`http://127.0.0.1:${port}/board`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: 'care', capability: 'watering', feature: 'water.feature', scenario: 'Ghost', progress: 'wip' }),
    });
    assert.equal(missing.status, 404);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server.test.js`
Expected: FAIL — `POST /board` falls through to 404 for the valid case (expected 200).

- [ ] **Step 3: Update the import and add the handler**

In `server/serve.js`, extend the gherkin import (line 4) to also import `setScenarioProgress`:

```js
import { parseFeature, scenarioClass, scenarioProgress, setScenarioProgress } from '../workflows/lib/gherkin.js';
```

Add this block immediately **after** the existing `POST /layout` handler's closing `}` (the `return;` then `}` around line 64):

```js
    // POST /board { context, capability, feature, scenario, progress } — set one scenario's
    // progress tag in its .feature file. Mirrors POST /layout's write pattern.
    if (url.pathname === '/board' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let p;
      try { p = JSON.parse(body || '{}'); }
      catch { res.writeHead(400); res.end('bad json'); return; }
      const isSlug = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(s);
      const isFeature = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]*\.feature$/.test(s);
      const VALID = ['open', 'wip', 'test', 'done'];
      if (!isSlug(p.context) || !isSlug(p.capability) || !isFeature(p.feature) || !p.scenario || !VALID.includes(p.progress)) {
        res.writeHead(400); res.end('bad request'); return;
      }
      const filePath = join(projectRoot, 'features', p.context, p.capability, p.feature);
      let src;
      try { src = await readFile(filePath, 'utf8'); }
      catch { res.writeHead(404); res.end('feature not found'); return; }
      let updated;
      try { updated = setScenarioProgress(src, p.scenario, p.progress); }
      catch (e) { res.writeHead(404); res.end(String(e.message)); return; }
      try {
        await writeFile(filePath, updated);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(500); res.end(String(e.message));
      }
      return;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/serve.js test/server.test.js
git commit -m "feat(server): POST /board writes a scenario's progress tag"
```

---

## Task 5: Header toggle, board container, and styles

**Files:**
- Modify: `viewer/index.html`
- Modify: `viewer/styles.css`

- [ ] **Step 1: Add the toggle button and board container to `viewer/index.html`**

In the `<div class="header-right">`, add the view toggle as the FIRST child (before `#maturity`):

```html
      <button type="button" id="viewToggle" class="reset">Board</button>
```

In `#main`, add a board container as a sibling AFTER `#canvas` and BEFORE `<aside id="sidebar">`:

```html
    <div id="board" hidden></div>
```

- [ ] **Step 2: Add board styles to `viewer/styles.css`**

Append:

```css
/* Scenario board (Map | Board view) */
#board { flex: 1; min-width: 0; display: none; flex-direction: column; overflow: hidden;
  border-radius: 10px; background: var(--panel); padding: 12px; gap: 10px; }
#board.show { display: flex; }
.board-filter { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.board-filter .flbl { color: var(--muted); font-size: 12px; margin-right: 4px; }
.board-chip { background: #ffffff10; color: var(--ink); border: 1px solid #ffffff1f;
  border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12px; cursor: pointer; }
.board-chip.on { background: #ffffff2e; border-color: #ffffff52; }
.board-cols { flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; min-height: 0; }
.board-col { display: flex; flex-direction: column; background: #00000026; border-radius: 8px;
  min-height: 0; }
.board-col-head { font-size: 12px; text-transform: uppercase; color: var(--muted);
  padding: 8px 10px; border-bottom: 1px solid #ffffff14; display: flex; justify-content: space-between; }
.board-col-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
.board-col.drop { outline: 2px dashed #6ea8ff80; outline-offset: -2px; }
.board-card { background: var(--bg); border: 1px solid #ffffff1f; border-left-width: 4px;
  border-radius: 6px; padding: 8px; cursor: grab; font-size: 13px; }
.board-card:hover { border-color: #ffffff3d; }
.board-card.dragging { opacity: 0.4; }
.board-card .bc-name { color: var(--ink); }
.board-card .bc-meta { display: flex; gap: 6px; margin-top: 5px; align-items: center; }
.board-card .bc-cap { color: var(--muted); font-size: 11px; }
.board-card .bc-cls { font-size: 10px; text-transform: uppercase; padding: 1px 5px; border-radius: 3px;
  background: #ffffff1c; color: var(--muted); }
.board-empty { color: var(--muted); font-size: 12px; padding: 8px; }
```

- [ ] **Step 3: Verify the files parse**

Run: `node --check server/serve.js` (sanity that nothing else broke) and visually confirm the HTML/CSS edits.
Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add viewer/index.html viewer/styles.css
git commit -m "feat(viewer): Map|Board toggle scaffolding and board styles"
```

---

## Task 6: Board view module + wire into the viewer

**Files:**
- Create: `viewer/lib/board-view.js`
- Modify: `viewer/kartograph.js` (import near line 5; `boot()` near line 525; SSE handler near line 537; add toggle wiring near the `toggleEdges` block ~line 470)

- [ ] **Step 1: Create `viewer/lib/board-view.js`**

```js
// DOM wiring for the scenario board. Pure grouping lives in board.js; this module fetches
// /board, renders four columns of draggable cards with a capability filter, and writes a
// card's new progress back via POST /board. No unit test (DOM) — verified by running the viewer.
import { BOARD_COLUMNS, boardColumns } from '/lib/board.js';

const COL_LABEL = { open: 'Open', wip: 'In Progress', test: 'Test', done: 'Done' };

let container = null;
let getContextColor = () => ({});
let onOpenScenario = () => {};
let scenarios = [];
const capFilter = new Set();   // empty = show all
let dragging = null;           // the scenario object being dragged

export function initBoard(opts) {
  container = opts.container;
  getContextColor = opts.getContextColor || getContextColor;
  onOpenScenario = opts.onOpenScenario || onOpenScenario;
}

export async function loadBoard() {
  try {
    const res = await fetch('/board', { cache: 'no-store' });
    scenarios = res.ok ? (await res.json()).scenarios || [] : [];
  } catch { scenarios = []; }
  render();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function visibleScenarios() {
  return capFilter.size ? scenarios.filter((s) => capFilter.has(s.capability)) : scenarios;
}

function render() {
  if (!container) return;
  const colors = getContextColor() || {};
  const caps = [...new Map(scenarios.map((s) => [s.capability, s.capabilityName])).entries()];
  const cols = boardColumns(visibleScenarios());

  const chips = caps.map(([slug, name]) =>
    `<button type="button" class="board-chip${capFilter.has(slug) ? ' on' : ''}" data-cap="${esc(slug)}">${esc(name)}</button>`).join('');

  const colHtml = BOARD_COLUMNS.map((key) => {
    const cards = cols[key].map((s) => {
      const color = colors[s.context] || '#666666';
      const cls = s.class ? `<span class="bc-cls">${esc(s.class)}</span>` : '';
      return `<div class="board-card" draggable="true" style="border-left-color:${color}"
        data-context="${esc(s.context)}" data-cap="${esc(s.capability)}"
        data-feature="${esc(s.feature)}" data-scn="${esc(s.name)}">
        <div class="bc-name">${esc(s.name)}</div>
        <div class="bc-meta"><span class="bc-cap">${esc(s.capabilityName)}</span>${cls}</div>
      </div>`;
    }).join('') || '<div class="board-empty">—</div>';
    return `<div class="board-col" data-col="${key}">
      <div class="board-col-head"><span>${COL_LABEL[key]}</span><span>${cols[key].length}</span></div>
      <div class="board-col-body">${cards}</div>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div class="board-filter"><span class="flbl">Capability:</span>${chips || '<span class="board-empty">no capabilities</span>'}</div>
    <div class="board-cols">${colHtml}</div>`;
  wireEvents();
}

function wireEvents() {
  // capability filter chips
  for (const chip of container.querySelectorAll('.board-chip')) {
    chip.addEventListener('click', () => {
      const cap = chip.dataset.cap;
      if (capFilter.has(cap)) capFilter.delete(cap); else capFilter.add(cap);
      render();
    });
  }
  // cards: drag + click-to-open
  for (const card of container.querySelectorAll('.board-card')) {
    card.addEventListener('dragstart', () => {
      dragging = {
        context: card.dataset.context, capability: card.dataset.cap,
        feature: card.dataset.feature, scenario: card.dataset.scn,
      };
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); dragging = null; });
    card.addEventListener('click', () => {
      onOpenScenario({ capability: card.dataset.cap, feature: card.dataset.feature });
    });
  }
  // columns: drop targets
  for (const col of container.querySelectorAll('.board-col')) {
    col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.classList.add('drop'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop'));
    col.addEventListener('drop', (ev) => {
      ev.preventDefault();
      col.classList.remove('drop');
      if (dragging) moveScenario(dragging, col.dataset.col);
    });
  }
}

async function moveScenario(card, progress) {
  const s = scenarios.find((x) =>
    x.capability === card.capability && x.feature === card.feature && x.name === card.scenario);
  if (!s || s.progress === progress) return;
  const prev = s.progress;
  s.progress = progress;     // optimistic
  render();
  try {
    const res = await fetch('/board', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...card, progress }),
    });
    if (!res.ok) throw new Error(await res.text());
  } catch {
    s.progress = prev;       // roll back
    render();
  }
}
```

- [ ] **Step 2: Wire it into `viewer/kartograph.js` — import**

After the existing `import { groupQuestionsByFeature, countQuestions } from '/lib/questions.js';` line, add:

```js
import { initBoard, loadBoard } from '/lib/board-view.js';
```

And add module state next to `let showEdges = true;`:

```js
let boardMode = false;
```

- [ ] **Step 3: Add the view-toggle wiring**

Immediately after the existing `toggleEdges` click handler block (the one ending `if (current) drawEdges(current.pos); });`), add:

```js
// Switch the main area between the graph (Map) and the scenario board (Board). View-only
// module state; survives live reloads. Edge/reset controls are map-only, hidden on the board.
const viewToggle = document.getElementById('viewToggle');
const boardEl = document.getElementById('board');
viewToggle.addEventListener('click', () => {
  boardMode = !boardMode;
  viewToggle.textContent = boardMode ? 'Map' : 'Board';
  boardEl.hidden = !boardMode;
  boardEl.classList.toggle('show', boardMode);
  canvas.style.display = boardMode ? 'none' : '';
  document.getElementById('toggleEdges').hidden = boardMode;
  document.getElementById('reset').hidden = boardMode;
  if (boardMode) loadBoard();
});
```

- [ ] **Step 4: Initialise the board in `boot()` and refresh it on live reload**

In `boot()`, after `wireZoomPan();`, add:

```js
  initBoard({
    container: document.getElementById('board'),
    getContextColor: () => (current ? current.contextColor : {}),
    onOpenScenario: ({ capability, feature }) => {
      if (boardMode) document.getElementById('viewToggle').click(); // back to Map
      openDetail(capability, feature);
    },
  });
```

Change the SSE handler at the end of `boot()` from:

```js
  const es = new EventSource('/events');
  es.onmessage = () => reload();
```

to:

```js
  const es = new EventSource('/events');
  es.onmessage = () => { reload(); if (boardMode) loadBoard(); };
```

- [ ] **Step 5: Manual verification (run the viewer)**

Run (outside the sandbox, background):

```bash
node server/serve.js 4123
```

Open `http://127.0.0.1:4123`. On a project that has `.feature` files (or copy `examples/demo.kartograph.json` to `kartograph.json` in a scratch dir with some feature files), verify:
- The header shows a `Board` button; clicking it swaps the graph for the board and the button reads `Map`; `Hide edges`/`Reset layout` disappear.
- Scenarios appear as cards in Open/In Progress/Test/Done by their tags.
- Capability chips filter the cards.
- Dragging a card to another column persists: the matching `.feature` file gains/loses the `@wip`/`@test`/`@done` tag (check with `git diff`), and after the live reload the card stays in the new column.
- Clicking a card returns to Map and opens that capability's detail, scrolled to the feature.

Stop the server when done.

- [ ] **Step 6: Commit**

```bash
git add viewer/lib/board-view.js viewer/kartograph.js
git commit -m "feat(viewer): scenario board view with drag-and-drop progress"
```

---

## Task 7: Docs, version bump, full test run

**Files:**
- Modify: `README.md`
- Modify: `package.json`, `.claude-plugin/plugin.json`

- [ ] **Step 1: Update the README viewer section**

In `README.md`, in the "What lives in your repo" / viewer description area, add a sentence describing the board. Find the viewer bullet around line 78-79 (the `/karto-show` description) and append after it:

```markdown
The viewer has two views, switched from the header: the **Map** (the capability graph) and
the **Board** — a cross-capability Kanban of every scenario by progress (Open / In Progress /
Test / Done). Drag a card between columns to set its `@wip`/`@test`/`@done` tag in the
`.feature` file; click a card to jump to that capability. Progress is tracking-only and does
not change derived maturity.
```

- [ ] **Step 2: Bump both version manifests**

In `package.json` change `"version": "0.14.0"` to `"version": "0.15.0"`.
In `.claude-plugin/plugin.json` change `"version": "0.14.0"` to `"version": "0.15.0"`.

- [ ] **Step 3: Run the full test suite**

Run: `node --test`
Expected: PASS, with the new `board.test.js`, `gherkin.test.js`, and `server.test.js` cases included; zero failures.

- [ ] **Step 4: Commit**

```bash
git add README.md package.json .claude-plugin/plugin.json
git commit -m "docs+release: document the scenario board (v0.15.0)"
```

---

## Self-Review notes (resolved)

- **Spec coverage:** view toggle (Task 5/6), four columns + tags (Task 2/6), GET aggregate (Task 3), POST write-back (Task 4), capability filter (Task 6), card click → detail (Task 6), pure helpers + tests (Tasks 1–4), `@done` reuse + maturity untouched (Task 2 uses existing `@done`; no maturity code touched), two-file principle (no new persisted file). Covered.
- **Type consistency:** `scenarioProgress`/`setScenarioProgress` exported from `gherkin.js` and imported in `serve.js` (Tasks 2–4); `boardColumns`/`BOARD_COLUMNS` exported from `board.js`, imported in `board-view.js` (Tasks 1, 6); POST body shape `{ context, capability, feature, scenario, progress }` matches between the server handler (Task 4) and the client `moveScenario` (Task 6, `{ ...card, progress }` where `card = { context, capability, feature, scenario }`).
- **Placeholders:** none — all steps carry full code.
```
