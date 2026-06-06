# Feature Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user click a capability in the viewer and read its features and scenarios — full Gherkin steps, filterable by class (happy/edge/error), features sortable by scenario count, with per-feature coverage badges — inside the existing right-hand detail panel.

**Architecture:** A new server endpoint `GET /features/<context>/<slug>` parses the capability's `.feature` files (via the existing `parseFeature`, extended to capture steps) into JSON. The viewer fetches this on capability open and renders a Features section. Pure rendering logic (coverage, sort, filter) lives in a new testable module `viewer/lib/features.js`; the DOM wiring stays in `kartograph.js`.

**Tech Stack:** Vanilla ES modules, Node's built-in `node:http` server and `node:test` runner. No new dependencies.

---

## File Structure

- **Modify** `workflows/lib/gherkin.js` — `parseFeature` also captures `steps` per scenario and an optional feature `description`. Backwards compatible.
- **Modify** `server/serve.js` — add `GET /features/<context>/<slug>` route returning parsed feature JSON.
- **Create** `viewer/lib/features.js` — pure helpers: `coverage`, `sortByScenarioCount`, `filterScenarios`.
- **Modify** `viewer/kartograph.js` — render the Features section in `openDetail` (fetch + render + interactions).
- **Modify** `viewer/styles.css` — styles for the feature blocks, class toggles, coverage badges, expandable steps.
- **Modify** `test/gherkin.test.js` — assert `steps` and `description`.
- **Modify** `test/server.test.js` — assert the new endpoint.
- **Create** `test/features.test.js` — test the pure viewer helpers.
- **Modify** `package.json` — version bump to `0.5.0`.

---

## Task 1: Extend `parseFeature` to capture steps and description

**Files:**
- Modify: `workflows/lib/gherkin.js`
- Test: `test/gherkin.test.js`

- [ ] **Step 1: Add failing tests for steps and description**

Append these tests to `test/gherkin.test.js` (after the existing tests, before EOF):

```javascript
test('parseFeature captures the steps of each scenario', () => {
  const r = parseFeature(sample);
  assert.deepEqual(r.scenarios[0].steps, [
    'Given a plant due for watering',
    'When the day starts',
    'Then a reminder is shown',
  ]);
  assert.deepEqual(r.scenarios[2].steps, ['Given the moisture sensor is offline']);
});

test('parseFeature captures a feature description block', () => {
  const text = `Feature: Billing
  Money moves between accounts.
  Auditable at all times.

  @happy
  Scenario: charge a card
    Given a valid card
    Then the charge succeeds
`;
  const r = parseFeature(text);
  assert.equal(r.description, 'Money moves between accounts.\nAuditable at all times.');
  assert.deepEqual(r.scenarios[0].steps, ['Given a valid card', 'Then the charge succeeds']);
});

test('parseFeature with no description leaves description undefined', () => {
  const r = parseFeature(sample);
  assert.equal(r.description, undefined);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/gherkin.test.js`
Expected: FAIL — the new tests fail (`steps` is `undefined`, `description` is `undefined`); the four original tests still pass.

- [ ] **Step 3: Rewrite `parseFeature` to collect steps and description**

Replace the `parseFeature` function in `workflows/lib/gherkin.js` (keep the file's top comment and `scenarioClass` unchanged) with:

```javascript
export function parseFeature(text) {
  const scenarios = [];
  let pending = [];
  let feature = null;
  const descriptionLines = [];
  let current = null;        // scenario currently collecting steps
  let inDescription = false; // between the Feature: line and the first tag/scenario
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('@')) {
      pending.push(...line.split(/\s+/).filter((t) => t.startsWith('@')));
      current = null;
      inDescription = false;
    } else if (/^Feature:/i.test(line)) {
      feature = line.replace(/^Feature:\s*/i, '').trim();
      pending = [];
      current = null;
      inDescription = true;
    } else if (/^Scenario(\s+Outline)?:/i.test(line)) {
      current = { name: line.replace(/^Scenario(\s+Outline)?:\s*/i, '').trim(), tags: pending, steps: [] };
      scenarios.push(current);
      pending = [];
      inDescription = false;
    } else if (line && !line.startsWith('#')) {
      if (current) current.steps.push(line);
      else if (inDescription) descriptionLines.push(line);
    }
  }
  return { feature, description: descriptionLines.join('\n') || undefined, scenarios };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/gherkin.test.js`
Expected: PASS — all tests green, including the original four.

- [ ] **Step 5: Confirm `reconcile` is unaffected**

Run: `node --test test/reconcile.test.js`
Expected: PASS — `reconcile` reads only `tags`, so adding `steps`/`description` does not change counts.

- [ ] **Step 6: Commit**

```bash
git add workflows/lib/gherkin.js test/gherkin.test.js
git commit -m "feat(gherkin): parseFeature captures scenario steps and feature description"
```

---

## Task 2: Add the `GET /features/<context>/<slug>` endpoint

**Files:**
- Modify: `server/serve.js`
- Test: `test/server.test.js`

- [ ] **Step 1: Add failing tests for the endpoint**

Append to `test/server.test.js` (before EOF). It reuses the `tmpProject`/`listen` helpers already in the file:

```javascript
test('GET /features/<context>/<slug> returns parsed features', async () => {
  const projectRoot = await tmpProject();
  const dir = join(projectRoot, 'features', 'admin-console', 'licenses-and-access');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'grant.feature'), `Feature: Grant a license
  @happy
  Scenario: grant a seat
    Given an admin
    When they grant a seat
    Then the user gains access

  @error
  Scenario: license expired
    Given an expired license
    Then the grant is rejected
`);
  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/features/admin-console/licenses-and-access`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.files.length, 1);
    const f = body.files[0];
    assert.equal(f.file, 'grant.feature');
    assert.equal(f.feature, 'Grant a license');
    assert.equal(f.scenarios.length, 2);
    assert.equal(f.scenarios[0].class, 'happy');
    assert.deepEqual(f.scenarios[0].steps, ['Given an admin', 'When they grant a seat', 'Then the user gains access']);
    assert.equal(f.scenarios[1].class, 'error');
  } finally {
    server.close();
  }
});

test('GET /features for a capability with no feature directory returns an empty list', async () => {
  const projectRoot = await tmpProject();
  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/features/platform/rate-limiting`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { files: [] });
  } finally {
    server.close();
  }
});

test('GET /features rejects a non-slug path segment with 400', async () => {
  const projectRoot = await tmpProject();
  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  const server = createServer({ projectRoot, viewerDir });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/features/..%2Fetc/passwd`);
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Add the needed imports to `test/server.test.js`**

The current import line is:

```javascript
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
```

Change it to add `mkdir`:

```javascript
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/server.test.js`
Expected: FAIL — the three new tests fail (endpoint returns 404 today); the three original tests still pass.

- [ ] **Step 4: Add imports to `server/serve.js`**

The current imports are:

```javascript
import { createReadStream, watch } from 'node:fs';
import { stat, readFile, writeFile } from 'node:fs/promises';
```

Change them to add `readdir` and the gherkin helpers:

```javascript
import { createReadStream, watch } from 'node:fs';
import { stat, readFile, writeFile, readdir } from 'node:fs/promises';
import { parseFeature, scenarioClass } from '../workflows/lib/gherkin.js';
```

- [ ] **Step 5: Add the route handler in `server/serve.js`**

Insert this block immediately **after** the `if (path === '/layout' && req.method === 'POST') { ... }` block and **before** the `// viewer assets first ...` comment:

```javascript
    // GET /features/<context>/<slug> — parse the capability's .feature files to JSON.
    const fm = /^\/features\/([^/]+)\/([^/]+)\/?$/.exec(path);
    if (fm && req.method === 'GET') {
      const [, context, slug] = fm;
      const isSlug = (s) => /^[a-z0-9][a-z0-9-]*$/.test(s);
      if (!isSlug(context) || !isSlug(slug)) {
        res.writeHead(400);
        res.end('bad request');
        return;
      }
      const dir = join(projectRoot, 'features', context, slug);
      let names = [];
      try { names = (await readdir(dir)).filter((n) => n.endsWith('.feature')).sort(); }
      catch { names = []; }
      const files = [];
      for (const name of names) {
        const parsed = parseFeature(await readFile(join(dir, name), 'utf8'));
        files.push({
          file: name,
          feature: parsed.feature,
          description: parsed.description,
          scenarios: parsed.scenarios.map((s) => ({
            name: s.name, tags: s.tags, class: scenarioClass(s.tags), steps: s.steps,
          })),
        });
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ files }));
      return;
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test test/server.test.js`
Expected: PASS — all six tests green.

- [ ] **Step 7: Commit**

```bash
git add server/serve.js test/server.test.js
git commit -m "feat(server): GET /features/<context>/<slug> endpoint parsing .feature files"
```

---

## Task 3: Pure viewer helpers in `viewer/lib/features.js`

**Files:**
- Create: `viewer/lib/features.js`
- Test: `test/features.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/features.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverage, sortByScenarioCount, filterScenarios } from '../viewer/lib/features.js';

test('coverage reports which classes a feature has at least one scenario for', () => {
  const scenarios = [
    { class: 'happy' }, { class: 'happy' }, { class: 'edge' }, { class: null },
  ];
  assert.deepEqual(coverage(scenarios), { happy: true, edge: true, error: false });
});

test('coverage on no scenarios is all false', () => {
  assert.deepEqual(coverage([]), { happy: false, edge: false, error: false });
});

test('sortByScenarioCount orders features by scenario count, most first, stably', () => {
  const files = [
    { file: 'a', scenarios: [{}] },
    { file: 'b', scenarios: [{}, {}, {}] },
    { file: 'c', scenarios: [{}, {}] },
    { file: 'd', scenarios: [{}, {}, {}] },
  ];
  assert.deepEqual(sortByScenarioCount(files).map((f) => f.file), ['b', 'd', 'c', 'a']);
});

test('sortByScenarioCount does not mutate its input', () => {
  const files = [{ file: 'a', scenarios: [] }, { file: 'b', scenarios: [{}] }];
  sortByScenarioCount(files);
  assert.deepEqual(files.map((f) => f.file), ['a', 'b']);
});

test('filterScenarios keeps active classes and always keeps untagged', () => {
  const scenarios = [
    { name: 'h', class: 'happy' },
    { name: 'e', class: 'edge' },
    { name: 'x', class: 'error' },
    { name: 'u', class: null },
  ];
  const kept = filterScenarios(scenarios, { happy: true, edge: false, error: false });
  assert.deepEqual(kept.map((s) => s.name), ['h', 'u']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/features.test.js`
Expected: FAIL — `Cannot find module '../viewer/lib/features.js'`.

- [ ] **Step 3: Write `viewer/lib/features.js`**

Create `viewer/lib/features.js`:

```javascript
// Pure helpers for the feature browser. No DOM access — unit-tested in
// test/features.test.js; the DOM wiring lives in kartograph.js.

// Which scenario classes a feature covers (true when >= 1 scenario of that class).
export function coverage(scenarios) {
  const has = (c) => scenarios.some((s) => s.class === c);
  return { happy: has('happy'), edge: has('edge'), error: has('error') };
}

// Features sorted by scenario count, most first. Stable for equal counts
// (preserves input order). Does not mutate the input array.
export function sortByScenarioCount(files) {
  return files
    .map((f, i) => [f, i])
    .sort((a, b) => (b[0].scenarios.length - a[0].scenarios.length) || (a[1] - b[1]))
    .map(([f]) => f);
}

// Keep scenarios whose class is active; untagged scenarios (class null/undefined)
// are always kept. `active` is { happy, edge, error } of booleans.
export function filterScenarios(scenarios, active) {
  return scenarios.filter((s) => s.class == null || active[s.class]);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/features.test.js`
Expected: PASS — all five tests green.

- [ ] **Step 5: Commit**

```bash
git add viewer/lib/features.js test/features.test.js
git commit -m "feat(viewer): pure helpers for feature coverage, sort, and class filter"
```

---

## Task 4: Render the Features section in the detail panel

**Files:**
- Modify: `viewer/kartograph.js`
- Modify: `viewer/styles.css`

No unit test: this is DOM wiring, consistent with `kartograph.js` having no unit tests (the logic it depends on is covered by Task 3). It is verified manually in the live viewer at the end.

- [ ] **Step 1: Import the helpers in `viewer/kartograph.js`**

The current top imports are:

```javascript
import { buildGraph } from '/lib/graph.js';
import { aggregateMaturity, nodeBrightness, WEIGHTS, maturityLabel } from '/lib/maturity.js';
import { autoPlaceGrouped, boundsForGroups, separateBoxes } from '/lib/layout.js';
```

Add a fourth import line after them:

```javascript
import { coverage, sortByScenarioCount, filterScenarios } from '/lib/features.js';
```

- [ ] **Step 2: Add module-level feature state**

After the `let selected = null;` line near the top of `viewer/kartograph.js`, add:

```javascript
let featureFiles = [];                                          // parsed files for the open capability
const featureFilters = { happy: true, edge: true, error: true, sortByCount: true };
```

- [ ] **Step 3: Add the Features container to the detail markup and kick off the load**

In `openDetail`, the template string currently ends with the two `<div class="rel">…</div>` lines:

```javascript
    <div class="rel"><h3>depends on</h3>${chips(deps)}</div>
    <div class="rel"><h3>required by</h3>${chips(rev)}</div>`;
```

Change it to add a Features container as the last element:

```javascript
    <div class="rel"><h3>depends on</h3>${chips(deps)}</div>
    <div class="rel"><h3>required by</h3>${chips(rev)}</div>
    <div class="features" id="featuresSection"></div>`;
```

Then, in the same function, the lines that currently follow are:

```javascript
  document.getElementById('detailBack').addEventListener('click', closeDetail);
  detail.hidden = false;
  panels.hidden = true;
```

Change them to show a loading state and start the fetch:

```javascript
  document.getElementById('detailBack').addEventListener('click', closeDetail);
  detail.hidden = false;
  panels.hidden = true;
  document.getElementById('featuresSection').innerHTML =
    '<h3 class="feat-h">Features</h3><p class="feat-empty">Loading…</p>';
  loadFeatures(slug, c.context);
```

- [ ] **Step 4: Add `loadFeatures` and `renderFeatures`**

Insert these two functions in `viewer/kartograph.js` immediately after the `closeDetail` function:

```javascript
async function loadFeatures(slug, context) {
  const data = await loadJSON(`/features/${encodeURIComponent(context)}/${encodeURIComponent(slug)}`, { files: [] });
  if (selected !== slug) return; // a live reload switched capability mid-fetch
  featureFiles = data.files || [];
  renderFeatures();
}

function renderFeatures() {
  const root = document.getElementById('featuresSection');
  if (!root) return;
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
  if (!featureFiles.length) {
    root.innerHTML = '<h3 class="feat-h">Features</h3><p class="feat-empty">No features yet</p>';
    return;
  }
  const f = featureFilters;
  const classToggle = (c) =>
    `<button type="button" class="cls-toggle cls-${c}${f[c] ? '' : ' off'}" data-cls="${c}">${c}</button>`;
  const covBadge = (cov, c) =>
    `<span class="cov-badge cls-${c} ${cov[c] ? 'on' : 'off'}">${cov[c] ? '✓' : '✗'}${c}</span>`;
  const ordered = f.sortByCount ? sortByScenarioCount(featureFiles) : featureFiles;

  const blocks = ordered.map((file) => {
    const cov = coverage(file.scenarios);
    const shown = filterScenarios(file.scenarios, f);
    const scns = shown.map((s) => {
      const cls = s.class || 'none';
      const tag = s.class ? `<span class="scn-tag cls-${s.class}">${s.class}</span>` : '';
      const steps = (s.steps || []).map((st) => esc(st)).join('\n');
      return `<div class="scn cls-${cls}">
        <div class="scn-head"><span class="scn-name">${esc(s.name)}</span>${tag}</div>
        <pre class="scn-steps">${steps}</pre>
      </div>`;
    }).join('') || '<p class="feat-empty">No scenarios match the filter</p>';
    const desc = file.description ? `<p class="feat-desc">${esc(file.description)}</p>` : '';
    return `<div class="feat">
      <div class="feat-title">${esc(file.feature || file.file)}</div>
      <div class="cov">${covBadge(cov, 'happy')}${covBadge(cov, 'edge')}${covBadge(cov, 'error')}</div>
      ${desc}${scns}
    </div>`;
  }).join('');

  root.innerHTML = `
    <h3 class="feat-h">Features</h3>
    <div class="feat-bar">
      ${classToggle('happy')}${classToggle('edge')}${classToggle('error')}
      <button type="button" class="sort-toggle${f.sortByCount ? ' on' : ''}">sort: ${f.sortByCount ? 'scenarios' : 'name'}</button>
    </div>
    ${blocks}`;

  root.onclick = (ev) => {
    const t = ev.target.closest('[data-cls], .sort-toggle, .scn-head');
    if (!t) return;
    if (t.dataset.cls) { featureFilters[t.dataset.cls] = !featureFilters[t.dataset.cls]; renderFeatures(); }
    else if (t.classList.contains('sort-toggle')) { featureFilters.sortByCount = !featureFilters.sortByCount; renderFeatures(); }
    else if (t.classList.contains('scn-head')) { t.closest('.scn').classList.toggle('open'); }
  };
}
```

- [ ] **Step 5: Add the styles**

Append to `viewer/styles.css`:

```css
/* Feature browser inside the capability detail panel */
.features { margin-top: 16px; }
.feat-h { font-size: 12px; text-transform: uppercase; color: var(--muted); margin: 0 0 8px; font-weight: 600; }
.feat-empty { color: var(--muted); font-size: 13px; margin: 4px 0; }
.feat-bar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.cls-toggle, .sort-toggle { background: #ffffff10; color: var(--ink); border: 1px solid #ffffff1f;
  border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12px; cursor: pointer; }
.cls-toggle.off { opacity: 0.4; }
.cls-toggle.cls-happy { border-color: #5bb26b80; }
.cls-toggle.cls-edge { border-color: #4f9dd680; }
.cls-toggle.cls-error { border-color: #e2683c80; }
.sort-toggle:hover, .cls-toggle:hover { border-color: #ffffff3a; }
.feat { background: #ffffff08; border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; }
.feat-title { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
.feat-desc { color: var(--ink); opacity: 0.8; font-size: 13px; margin: 0 0 8px; }
.cov { display: flex; gap: 6px; margin-bottom: 8px; }
.cov-badge { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 999px; }
.cov-badge.on.cls-happy { background: #5bb26b; color: #fff; }
.cov-badge.on.cls-edge { background: #4f9dd6; color: #fff; }
.cov-badge.on.cls-error { background: #e2683c; color: #fff; }
.cov-badge.off { background: #ffffff10; color: var(--muted); }
.scn { border-top: 1px solid #ffffff10; }
.scn-head { display: flex; align-items: center; gap: 8px; padding: 6px 2px; cursor: pointer; }
.scn-head::before { content: '▸'; color: var(--muted); font-size: 11px; transition: transform 0.15s; }
.scn.open .scn-head::before { transform: rotate(90deg); }
.scn-name { flex: 1; }
.scn-tag { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 999px; color: #fff; }
.scn-tag.cls-happy { background: #5bb26b; }
.scn-tag.cls-edge { background: #4f9dd6; }
.scn-tag.cls-error { background: #e2683c; }
.scn-steps { display: none; margin: 0 0 8px; padding: 8px 10px; background: #00000033; border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; white-space: pre-wrap; color: var(--ink); }
.scn.open .scn-steps { display: block; }
```

- [ ] **Step 6: Verify the full test suite still passes**

Run: `npm test`
Expected: PASS — all test files green (gherkin, server, features, and the rest).

- [ ] **Step 7: Manual verification in the live viewer**

Run the viewer against the demo map and a project that has `.feature` files (or create a throwaway `features/<context>/<slug>/x.feature`):

```bash
node server/serve.js 4123
```

Open http://127.0.0.1:4123 and confirm:
- Clicking a capability with features shows the Features section with feature blocks.
- Each feature shows coverage badges (✓/✗ for happy/edge/error).
- Clicking a scenario row expands its Gherkin steps; clicking again collapses.
- The happy/edge/error toggles hide/show scenarios; untagged scenarios always stay.
- The sort toggle flips features between scenario-count and name order.
- A vision capability (no features) shows "No features yet".
- Editing a `.feature` file triggers a live reload and the panel updates.

- [ ] **Step 8: Bump the version**

In `package.json`, change `"version": "0.4.1"` to `"version": "0.5.0"`.

- [ ] **Step 9: Commit**

```bash
git add viewer/kartograph.js viewer/styles.css package.json
git commit -m "feat(viewer): feature browser in capability panel — read scenarios, filter by class, coverage badges (v0.5.0)"
```

---

## Self-Review

- **Spec coverage:**
  - Read features + scenarios per capability → Task 4 (render), fed by Task 2 (endpoint) + Task 1 (steps). ✓
  - Full Gherkin steps, expandable → Task 1 (`steps`), Task 4 (`.scn-steps`, expand handler). ✓
  - Filter scenarios by class (happy/edge/error), untagged always shown → Task 3 (`filterScenarios`), Task 4 (toggles). ✓
  - Sort features by scenario count → Task 3 (`sortByScenarioCount`), Task 4 (sort toggle). ✓
  - Per-feature coverage badges → Task 3 (`coverage`), Task 4 (`covBadge`). ✓
  - Empty state for vision capabilities → Task 4 (`No features yet`). ✓
  - Server parse endpoint, schema unchanged, live via SSE → Task 2; live reload reuses existing `openDetail(selected)` re-invocation. ✓
  - Tests for parser and endpoint → Tasks 1, 2; plus helper tests in Task 3. ✓
- **Placeholder scan:** none — every code/command step is concrete.
- **Type consistency:** the endpoint emits `{ files: [{ file, feature, description, scenarios: [{ name, tags, class, steps }] }] }`; `coverage`/`filterScenarios` read `s.class`, `sortByScenarioCount` reads `f.scenarios.length`, and `renderFeatures` reads exactly these fields. `featureFilters` keys (`happy`/`edge`/`error`/`sortByCount`) are consistent across Steps 2, 4. ✓
