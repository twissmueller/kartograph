# Kartograph Desktop (Electron) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated Electron desktop app that opens a project's `kartograph.json` directly, with one tab per project and several projects open at once.

**Architecture:** Three layers mirroring Electron's security model. The **main process** (Node ESM) owns the filesystem, watchers, dialogs, menu, and session persistence, and imports the repo's pure libs directly. A **preload** `contextBridge` exposes a small named API. The **renderer** is a fresh vanilla-JS UI (no bundler). The board/feature logic now inline in `server/serve.js` is first extracted into shared, tested pure libs in `workflows/lib/` that both `serve.js` and the Electron main call.

**Tech Stack:** Electron (≥ 28, ESM main), Node built-ins, vanilla JS/HTML/CSS (no framework, no build step), `node:test` for the pure layer. Reuses existing pure libs: `workflows/lib/gherkin.js`, `viewer/lib/{board,features,layout,maturity,questions}.js`.

## Global Constraints

- **No build step, no framework.** Vanilla ESM JavaScript only; Node built-ins plus existing deps. (CLAUDE.md)
- **ESM everywhere.** Repo is `"type": "module"`; Electron main and preload are ESM. (CLAUDE.md)
- **Pure-function + thin-caller split.** New deterministic logic is a pure exported function (unit-tested), with thin callers (serve.js handler, IPC handler) on top. (CLAUDE.md)
- **Slugs are the key space.** `^[a-z0-9][a-z0-9-]*$`; feature files match `^[a-z0-9][a-z0-9-]*\.feature$`. Validate every path segment before filesystem access. (CLAUDE.md)
- **Tests gate the pure layer only.** Pure libs get `node:test` coverage; renderer/main wiring is verified by running the app. (CLAUDE.md)
- **Scenario tags.** Progress edits change only the progress tag (`@wip`/`@test`/`@done`); never touch path tags (`@happy`/`@edge`/`@error`) or maturity. (CLAUDE.md)
- **Tests run with** `npm test` (alias for `node --test`) from the repo root. Place tests in `test/*.test.js`.
- **The desktop app does NOT change** `server/serve.js` behavior, `/karto-show`, the root `package.json` version, or the plugin manifest. The serve.js refactor must be behavior-preserving (the existing `test/server.test.js` must keep passing).

---

## File Structure

**New shared libs (tested):**
- `workflows/lib/board-data.js` — `buildBoard(projectRoot)` → `{ scenarios, capabilities, contexts }` (the IO-driven builder extracted from serve.js `GET /board`).
- `workflows/lib/feature-read.js` — `readCapabilityFeatures(projectRoot, context, slug)` → `{ files }`; `listFeatureTree(projectRoot)` → tree; `isSlug`, `isFeatureName` validators.

**Modified:**
- `server/serve.js` — `GET /board` and `GET /features/...` handlers call the new libs.

**New desktop app:**
- `desktop/package.json` — electron devDep; `"start": "electron ."`; `"main": "main/main.js"`.
- `desktop/main/main.js` — app lifecycle, single `BrowserWindow`, menu, quit/close confirmation.
- `desktop/main/ipc.js` — registers `ipcMain.handle` handlers; calls shared libs + fs.
- `desktop/main/project.js` — pure helpers: `resolveProjectFromPicked(filePath)`, re-exported validators.
- `desktop/main/session.js` — `loadSession(file)` / `saveSession(file, state)`; recent-list helpers.
- `desktop/main/watcher.js` — `watchProject(root, onChange)` → returns `{ close() }`.
- `desktop/preload.js` — `contextBridge.exposeInMainWorld('karto', {...})`.
- `desktop/renderer/index.html` — shell markup.
- `desktop/renderer/app.js` — tab strip, open/close, session restore, per-tab orchestration.
- `desktop/renderer/views/map.js` — Map view.
- `desktop/renderer/views/board.js` — Board view.
- `desktop/renderer/views/sidebar.js` — sidebar panels.
- `desktop/renderer/views/features.js` — feature browser.
- `desktop/renderer/styles.css` — styles.

**New tests:**
- `test/board-data.test.js`, `test/feature-read.test.js`, `test/desktop-project.test.js`, `test/desktop-session.test.js`.

---

## Task 1: Extract `buildBoard` into a shared lib

**Files:**
- Create: `workflows/lib/board-data.js`
- Test: `test/board-data.test.js`
- Modify: `server/serve.js` (the `GET /board` handler, lines ~98–133)

**Interfaces:**
- Consumes: `parseFeature`, `scenarioClass`, `scenarioProgress` from `workflows/lib/gherkin.js`.
- Produces: `buildBoard(projectRoot: string): Promise<{ scenarios, capabilities, contexts }>` where
  - `scenarios[]` = `{ capability, capabilityName, context, feature, featureName, name, class, progress }`
  - `capabilities[]` = `{ capability, capabilityName, context }`
  - `contexts[]` = `{ context, name, color }`

- [ ] **Step 1: Write the failing test**

Create `test/board-data.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBoard } from '../workflows/lib/board-data.js';

async function tmpProject(map, features = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'karto-board-'));
  await writeFile(join(dir, 'kartograph.json'), JSON.stringify(map));
  for (const [rel, text] of Object.entries(features)) {
    const full = join(dir, 'features', rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, text);
  }
  return dir;
}

test('buildBoard returns contexts, every capability, and tagged scenarios', async () => {
  const dir = await tmpProject(
    {
      contexts: { care: { name: 'Care', color: '#abc' } },
      capabilities: {
        'intake': { name: 'Intake', context: 'care' },
        'empty-cap': { name: 'Empty', context: 'care' },
      },
    },
    {
      'care/intake/sign-in.feature':
        'Feature: Sign in\n@happy @done\nScenario: works\nGiven a user\nWhen they sign in\nThen ok\n',
    },
  );
  const board = await buildBoard(dir);
  assert.deepEqual(board.contexts, [{ context: 'care', name: 'Care', color: '#abc' }]);
  assert.equal(board.capabilities.length, 2);
  assert.equal(board.scenarios.length, 1);
  assert.deepEqual(board.scenarios[0], {
    capability: 'intake', capabilityName: 'Intake', context: 'care',
    feature: 'sign-in.feature', featureName: 'Sign in', name: 'works',
    class: 'happy', progress: 'done',
  });
});

test('buildBoard tolerates a missing kartograph.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'karto-empty-'));
  const board = await buildBoard(dir);
  assert.deepEqual(board, { scenarios: [], capabilities: [], contexts: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/board-data.test.js`
Expected: FAIL — `Cannot find module '../workflows/lib/board-data.js'`.

- [ ] **Step 3: Write the implementation**

Create `workflows/lib/board-data.js` (logic lifted verbatim from serve.js `GET /board`):

```javascript
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFeature, scenarioClass, scenarioProgress } from './gherkin.js';

// Build the cross-capability board model for a project: every context, every
// capability (even scenario-less ones), and every scenario across all .feature
// files, each stamped with its class + progress. Pure of HTTP; reads the project
// from disk. Tolerant: a missing/garbled map yields empty arrays.
export async function buildBoard(projectRoot) {
  let map;
  try { map = JSON.parse(await readFile(join(projectRoot, 'kartograph.json'), 'utf8')); }
  catch { map = { capabilities: {} }; }

  const capabilities = Object.entries(map.capabilities || {})
    .map(([slug, cap]) => ({ capability: slug, capabilityName: cap.name || slug, context: cap.context }));
  const contexts = Object.entries(map.contexts || {})
    .map(([slug, ctx]) => ({ context: slug, name: ctx.name || slug, color: ctx.color }));

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
          feature: name, featureName: parsed.feature || name, name: s.name,
          class: scenarioClass(s.tags), progress: scenarioProgress(s.tags),
        });
      }
    }
  }
  return { scenarios, capabilities, contexts };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/board-data.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Refactor serve.js to call buildBoard**

In `server/serve.js`, add to the import on line 4 area:

```javascript
import { buildBoard } from '../workflows/lib/board-data.js';
```

Replace the entire `GET /board` handler body (currently lines ~98–133, from `if (url.pathname === '/board' && req.method === 'GET') {` through its closing `return; }`) with:

```javascript
    if (url.pathname === '/board' && req.method === 'GET') {
      const board = await buildBoard(projectRoot);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(board));
      return;
    }
```

- [ ] **Step 6: Run the full suite to verify nothing regressed**

Run: `npm test`
Expected: PASS — including the existing `test/server.test.js` board assertions and the new `test/board-data.test.js`.

- [ ] **Step 7: Commit**

```bash
git add workflows/lib/board-data.js test/board-data.test.js server/serve.js
git commit -m "refactor(board): extract buildBoard into a shared lib"
```

---

## Task 2: Extract feature reading + tree listing into a shared lib

**Files:**
- Create: `workflows/lib/feature-read.js`
- Test: `test/feature-read.test.js`
- Modify: `server/serve.js` (the `GET /features/...` handler, lines ~135–173)

**Interfaces:**
- Consumes: `parseFeature`, `scenarioClass` from `workflows/lib/gherkin.js`.
- Produces:
  - `isSlug(s): boolean` — `/^[a-z0-9][a-z0-9-]*$/`
  - `isFeatureName(s): boolean` — `/^[a-z0-9][a-z0-9-]*\.feature$/`
  - `readCapabilityFeatures(projectRoot, context, slug): Promise<{ files }>` where each file = `{ file, feature, description, background, scenarios: [{ name, tags, class, steps }] }`
  - `listFeatureTree(projectRoot): Promise<{ contexts: [{ context, name, capabilities: [{ capability, name, files: string[] }] }] }>`

- [ ] **Step 1: Write the failing test**

Create `test/feature-read.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isSlug, isFeatureName, readCapabilityFeatures, listFeatureTree } from '../workflows/lib/feature-read.js';

async function tmpProject(map, features = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'karto-feat-'));
  await writeFile(join(dir, 'kartograph.json'), JSON.stringify(map));
  for (const [rel, text] of Object.entries(features)) {
    const full = join(dir, 'features', rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, text);
  }
  return dir;
}

test('validators accept slugs/feature names and reject traversal', () => {
  assert.equal(isSlug('care-intake'), true);
  assert.equal(isSlug('../etc'), false);
  assert.equal(isFeatureName('sign-in.feature'), true);
  assert.equal(isFeatureName('sign-in.txt'), false);
});

test('readCapabilityFeatures parses each .feature into scenarios', async () => {
  const dir = await tmpProject({}, {
    'care/intake/sign-in.feature':
      'Feature: Sign in\nA short note.\n@happy\nScenario: works\nGiven a user\nThen ok\n',
  });
  const { files } = await readCapabilityFeatures(dir, 'care', 'intake');
  assert.equal(files.length, 1);
  assert.equal(files[0].file, 'sign-in.feature');
  assert.equal(files[0].feature, 'Sign in');
  assert.equal(files[0].scenarios[0].class, 'happy');
  assert.deepEqual(files[0].scenarios[0].steps, ['Given a user', 'Then ok']);
});

test('listFeatureTree groups files by context then capability', async () => {
  const dir = await tmpProject(
    { contexts: { care: { name: 'Care' } }, capabilities: { intake: { name: 'Intake', context: 'care' } } },
    { 'care/intake/sign-in.feature': 'Feature: Sign in\n' },
  );
  const tree = await listFeatureTree(dir);
  assert.equal(tree.contexts[0].context, 'care');
  assert.equal(tree.contexts[0].name, 'Care');
  assert.equal(tree.contexts[0].capabilities[0].capability, 'intake');
  assert.deepEqual(tree.contexts[0].capabilities[0].files, ['sign-in.feature']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/feature-read.test.js`
Expected: FAIL — `Cannot find module '../workflows/lib/feature-read.js'`.

- [ ] **Step 3: Write the implementation**

Create `workflows/lib/feature-read.js`:

```javascript
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFeature, scenarioClass } from './gherkin.js';

export const isSlug = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(s);
export const isFeatureName = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]*\.feature$/.test(s);

// Parse every .feature in features/<context>/<slug> into structured scenarios.
// Throws if context/slug are not valid slugs (path-traversal guard).
export async function readCapabilityFeatures(projectRoot, context, slug) {
  if (!isSlug(context) || !isSlug(slug)) throw new Error('invalid context or slug');
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
      background: parsed.background,
      scenarios: parsed.scenarios.map((s) => ({
        name: s.name, tags: s.tags, class: scenarioClass(s.tags), steps: s.steps,
      })),
    });
  }
  return { files };
}

// The full context -> capability -> .feature file tree for the browser, driven by
// the map's declared contexts/capabilities. Capabilities with no feature dir show
// an empty files list. Tolerant of a missing/garbled map.
export async function listFeatureTree(projectRoot) {
  let map;
  try { map = JSON.parse(await readFile(join(projectRoot, 'kartograph.json'), 'utf8')); }
  catch { map = {}; }
  const ctxMeta = map.contexts || {};
  const caps = Object.entries(map.capabilities || {});
  const byContext = new Map();
  for (const [slug, cap] of caps) {
    const context = cap.context;
    if (!context) continue;
    let names = [];
    try {
      names = (await readdir(join(projectRoot, 'features', context, slug)))
        .filter((n) => n.endsWith('.feature')).sort();
    } catch { names = []; }
    if (!byContext.has(context)) byContext.set(context, []);
    byContext.get(context).push({ capability: slug, name: cap.name || slug, files: names });
  }
  const contexts = [...byContext.entries()].map(([context, capabilities]) => ({
    context, name: (ctxMeta[context] && ctxMeta[context].name) || context, capabilities,
  }));
  return { contexts };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/feature-read.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor serve.js to call readCapabilityFeatures**

In `server/serve.js`, extend the import added in Task 1:

```javascript
import { readCapabilityFeatures } from '../workflows/lib/feature-read.js';
```

Replace the `GET /features/...` handler body (currently lines ~135–173) with:

```javascript
    const fm = /^\/features\/([^/]+)\/([^/]+)\/?$/.exec(url.pathname);
    if (fm && req.method === 'GET') {
      const [, context, slug] = fm;
      try {
        const out = await readCapabilityFeatures(projectRoot, context, slug);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(out));
      } catch (e) {
        res.writeHead(/invalid/.test(e.message) ? 400 : 500);
        res.end(/invalid/.test(e.message) ? 'bad request' : String(e.message));
      }
      return;
    }
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — existing `test/server.test.js` `/features` assertions plus the new tests.

- [ ] **Step 7: Commit**

```bash
git add workflows/lib/feature-read.js test/feature-read.test.js server/serve.js
git commit -m "refactor(features): extract feature reading + tree listing into a shared lib"
```

---

## Task 3: Electron skeleton — empty window via `npm start`

**Files:**
- Create: `desktop/package.json`, `desktop/main/main.js`, `desktop/preload.js`, `desktop/renderer/index.html`, `desktop/renderer/styles.css`, `desktop/.gitignore`

**Interfaces:**
- Produces: a launchable Electron app (no project logic yet). Later tasks add IPC + views.

This task is scaffolding verified by running, not by unit tests (no pure logic yet).

- [ ] **Step 1: Create `desktop/package.json`**

```json
{
  "name": "kartograph-desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "main/main.js",
  "scripts": {
    "start": "electron ."
  },
  "devDependencies": {
    "electron": "^33.0.0"
  }
}
```

- [ ] **Step 2: Create `desktop/.gitignore`**

```
node_modules/
dist/
```

- [ ] **Step 3: Create `desktop/main/main.js`**

```javascript
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Kartograph Desktop',
    webPreferences: {
      preload: join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

- [ ] **Step 4: Create `desktop/preload.js` (placeholder, real API added in Task 4)**

```javascript
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('karto', {
  ping: () => 'pong',
});
```

- [ ] **Step 5: Create `desktop/renderer/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Kartograph Desktop</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div id="tabstrip"></div>
  <main id="workspace"><p class="empty">Open a kartograph.json to begin (File → Open).</p></main>
  <script type="module" src="app.js"></script>
</body>
</html>
```

Note: `app.js` is created in Task 7. For this task only, also create a one-line stub so the page loads without a 404:

- [ ] **Step 6: Create `desktop/renderer/app.js` stub**

```javascript
// Replaced in Task 7 with the real tab/orchestration code.
console.log(window.karto?.ping?.());
```

- [ ] **Step 7: Create `desktop/renderer/styles.css` (base shell)**

```css
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.5 system-ui, sans-serif; background: #14161a; color: #e6e8ec; }
#tabstrip { display: flex; gap: 2px; background: #0f1115; padding: 6px 6px 0; min-height: 38px; }
#workspace { height: calc(100vh - 38px); overflow: hidden; position: relative; }
.empty { color: #8a909a; padding: 24px; }
```

- [ ] **Step 8: Install and run (manual verification)**

```bash
cd desktop && npm install && npm start
```

Expected: an Electron window opens titled "Kartograph Desktop" showing the "Open a kartograph.json…" text; the devtools console prints `pong`. Close the window to exit. (If `electron` install is blocked offline, note it and stop here.)

- [ ] **Step 9: Commit**

```bash
git add desktop/package.json desktop/.gitignore desktop/main/main.js desktop/preload.js desktop/renderer/
git commit -m "feat(desktop): electron skeleton with empty window"
```

---

## Task 4: IPC data layer — handlers, validated project resolution, preload API

**Files:**
- Create: `desktop/main/project.js`, `desktop/main/ipc.js`
- Test: `test/desktop-project.test.js`
- Modify: `desktop/main/main.js` (register IPC, add File → Open menu), `desktop/preload.js` (real API)

**Interfaces:**
- Consumes: `buildBoard` (Task 1), `readCapabilityFeatures`, `listFeatureTree`, `isSlug`, `isFeatureName` (Task 2), `setScenarioProgress` from `gherkin.js`.
- Produces (preload `window.karto`):
  - `openProject(): Promise<{ root, name } | null>`
  - `readMap(root): Promise<{ map, layout }>`
  - `readBoard(root): Promise<{ scenarios, capabilities, contexts }>`
  - `listFeatures(root): Promise<{ contexts }>`
  - `readFeatures(root, context, slug): Promise<{ files }>`
  - `readRaw(root, relPath): Promise<{ text }>`
  - `setBoardProgress({ root, context, capability, feature, scenario, progress }): Promise<{ ok: true }>`
  - `saveLayout(root, layout): Promise<{ ok: true }>`
  - `onFileChange(cb: (root) => void): void` (subscribe; many calls allowed)
- Produces (project.js): `resolveProjectFromPicked(filePath): { root, name }`, `isSafeRelPath(rel): boolean`.

- [ ] **Step 1: Write the failing test for the pure project helpers**

Create `test/desktop-project.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sep, join } from 'node:path';
import { resolveProjectFromPicked, isSafeRelPath } from '../desktop/main/project.js';

test('resolveProjectFromPicked uses the file folder as root and its basename as name', () => {
  const picked = join(sep, 'home', 'me', 'acme', 'kartograph.json');
  const r = resolveProjectFromPicked(picked);
  assert.equal(r.root, join(sep, 'home', 'me', 'acme'));
  assert.equal(r.name, 'acme');
});

test('isSafeRelPath allows nested feature paths and rejects traversal/absolute', () => {
  assert.equal(isSafeRelPath('features/care/intake/sign-in.feature'), true);
  assert.equal(isSafeRelPath('kartograph.json'), true);
  assert.equal(isSafeRelPath('../secret'), false);
  assert.equal(isSafeRelPath('/etc/passwd'), false);
  assert.equal(isSafeRelPath('a/../../b'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/desktop-project.test.js`
Expected: FAIL — `Cannot find module '../desktop/main/project.js'`.

- [ ] **Step 3: Implement `desktop/main/project.js`**

```javascript
import { dirname, basename, normalize, isAbsolute } from 'node:path';

// A picked kartograph.json defines the project: root = its folder, name = folder name.
export function resolveProjectFromPicked(filePath) {
  const root = dirname(filePath);
  return { root, name: basename(root) };
}

// Guard for readRaw: a project-relative path that stays inside the root.
// Pure ESM (no require): reject absolute paths and any '..' segment.
export function isSafeRelPath(rel) {
  if (typeof rel !== 'string' || !rel) return false;
  if (isAbsolute(rel)) return false;
  const parts = normalize(rel).split(/[\\/]/);
  return !parts.includes('..');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/desktop-project.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `desktop/main/ipc.js`**

```javascript
import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { buildBoard } from '../../workflows/lib/board-data.js';
import { readCapabilityFeatures, listFeatureTree, isSlug, isFeatureName } from '../../workflows/lib/feature-read.js';
import { setScenarioProgress } from '../../workflows/lib/gherkin.js';
import { resolveProjectFromPicked, isSafeRelPath } from './project.js';

const RAW_EXT = new Set(['.feature', '.json', '.md']);

export function registerIpc() {
  ipcMain.handle('open-project', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const r = await dialog.showOpenDialog(win, {
      title: 'Open kartograph.json',
      properties: ['openFile'],
      filters: [{ name: 'Kartograph map', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePaths.length) return null;
    return resolveProjectFromPicked(r.filePaths[0]);
  });

  ipcMain.handle('read-map', async (_e, root) => {
    const map = JSON.parse(await readFile(join(root, 'kartograph.json'), 'utf8'));
    let layout = {};
    try { layout = JSON.parse(await readFile(join(root, 'kartograph.layout.json'), 'utf8')); }
    catch { layout = {}; }
    return { map, layout };
  });

  ipcMain.handle('read-board', (_e, root) => buildBoard(root));
  ipcMain.handle('list-features', (_e, root) => listFeatureTree(root));
  ipcMain.handle('read-features', (_e, root, context, slug) => readCapabilityFeatures(root, context, slug));

  ipcMain.handle('read-raw', async (_e, root, relPath) => {
    if (!isSafeRelPath(relPath) || !RAW_EXT.has(extname(relPath))) throw new Error('invalid path');
    return { text: await readFile(join(root, relPath), 'utf8') };
  });

  ipcMain.handle('set-board-progress', async (_e, p) => {
    const VALID = ['open', 'wip', 'test', 'done'];
    if (!isSlug(p.context) || !isSlug(p.capability) || !isFeatureName(p.feature)
        || typeof p.scenario !== 'string' || !p.scenario || !VALID.includes(p.progress)) {
      throw new Error('invalid request');
    }
    const file = join(p.root, 'features', p.context, p.capability, p.feature);
    const src = await readFile(file, 'utf8');
    const updated = setScenarioProgress(src, p.scenario, p.progress);
    await writeFile(file, updated);
    return { ok: true };
  });

  ipcMain.handle('save-layout', async (_e, root, layout) => {
    await writeFile(join(root, 'kartograph.layout.json'), JSON.stringify(layout, null, 2));
    return { ok: true };
  });
}
```

- [ ] **Step 6: Wire IPC + File→Open menu in `desktop/main/main.js`**

Add imports at the top:

```javascript
import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import { registerIpc } from './ipc.js';
```

In `createWindow()`, after `win.loadFile(...)`, nothing changes. After `app.whenReady().then(createWindow);` replace with:

```javascript
app.whenReady().then(() => {
  registerIpc();
  buildMenu();
  createWindow();
});
```

Add `buildMenu()` (the renderer listens for the `menu:open-project` channel — see Task 7):

```javascript
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project…',
          accelerator: 'CmdOrCtrl+O',
          click: () => win?.webContents.send('menu:open-project'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
```

- [ ] **Step 7: Implement the real preload API in `desktop/preload.js`**

```javascript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('karto', {
  openProject: () => ipcRenderer.invoke('open-project'),
  readMap: (root) => ipcRenderer.invoke('read-map', root),
  readBoard: (root) => ipcRenderer.invoke('read-board', root),
  listFeatures: (root) => ipcRenderer.invoke('list-features', root),
  readFeatures: (root, context, slug) => ipcRenderer.invoke('read-features', root, context, slug),
  readRaw: (root, relPath) => ipcRenderer.invoke('read-raw', root, relPath),
  setBoardProgress: (p) => ipcRenderer.invoke('set-board-progress', p),
  saveLayout: (root, layout) => ipcRenderer.invoke('save-layout', root, layout),
  onFileChange: (cb) => ipcRenderer.on('file-change', (_e, root) => cb(root)),
  onMenuOpenProject: (cb) => ipcRenderer.on('menu:open-project', () => cb()),
});
```

- [ ] **Step 8: Run the suite + manual smoke**

Run: `npm test` (from repo root) — Expected: PASS, including `test/desktop-project.test.js`.
Manual: `cd desktop && npm start`, then in devtools console run `await window.karto.openProject()`, pick a real `kartograph.json`, then `await window.karto.readMap(<root>)`. Expected: returns `{ map, layout }`.

- [ ] **Step 9: Commit**

```bash
git add desktop/main/project.js desktop/main/ipc.js desktop/main/main.js desktop/preload.js test/desktop-project.test.js
git commit -m "feat(desktop): IPC data layer over the shared libs"
```

---

## Task 5: Session + recent-projects persistence

**Files:**
- Create: `desktop/main/session.js`
- Test: `test/desktop-session.test.js`
- Modify: `desktop/main/main.js` (load on start, save on change), `desktop/main/ipc.js` (expose get/set/recent), `desktop/preload.js` (session API)

**Interfaces:**
- Produces:
  - `loadSession(file): Promise<{ openRoots: string[], recent: string[] }>` (defaults `{ openRoots: [], recent: [] }` if absent/garbled)
  - `saveSession(file, state): Promise<void>`
  - `addRecent(recent: string[], root: string): string[]` — pure; dedups, most-recent-first, caps at 10.

- [ ] **Step 1: Write the failing test**

Create `test/desktop-session.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSession, saveSession, addRecent } from '../desktop/main/session.js';

test('loadSession returns defaults when the file is absent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'karto-sess-'));
  assert.deepEqual(await loadSession(join(dir, 'nope.json')), { openRoots: [], recent: [] });
});

test('saveSession then loadSession round-trips', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'karto-sess-'));
  const file = join(dir, 'session.json');
  await saveSession(file, { openRoots: ['/a'], recent: ['/a'] });
  assert.deepEqual(await loadSession(file), { openRoots: ['/a'], recent: ['/a'] });
});

test('addRecent dedups, newest first, caps at 10', () => {
  let r = [];
  for (let i = 0; i < 12; i++) r = addRecent(r, `/p${i}`);
  assert.equal(r.length, 10);
  assert.equal(r[0], '/p11');
  r = addRecent(r, '/p5');
  assert.equal(r[0], '/p5');
  assert.equal(r.filter((x) => x === '/p5').length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/desktop-session.test.js`
Expected: FAIL — `Cannot find module '../desktop/main/session.js'`.

- [ ] **Step 3: Implement `desktop/main/session.js`**

```javascript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function loadSession(file) {
  try {
    const j = JSON.parse(await readFile(file, 'utf8'));
    return {
      openRoots: Array.isArray(j.openRoots) ? j.openRoots : [],
      recent: Array.isArray(j.recent) ? j.recent : [],
    };
  } catch { return { openRoots: [], recent: [] }; }
}

export async function saveSession(file, state) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({
    openRoots: state.openRoots || [],
    recent: state.recent || [],
  }, null, 2));
}

// Pure: move root to the front, dedup, keep at most 10.
export function addRecent(recent, root) {
  return [root, ...(recent || []).filter((r) => r !== root)].slice(0, 10);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/desktop-session.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire session into ipc.js + preload + main.js**

In `desktop/main/ipc.js`, add imports and handlers. At the top:

```javascript
import { app } from 'electron';
import { join as joinPath } from 'node:path';
import { loadSession, saveSession, addRecent } from './session.js';

const sessionFile = () => joinPath(app.getPath('userData'), 'session.json');
```

Inside `registerIpc()` add:

```javascript
  ipcMain.handle('session:load', () => loadSession(sessionFile()));
  ipcMain.handle('session:save', async (_e, state) => { await saveSession(sessionFile(), state); return { ok: true }; });
  ipcMain.handle('session:add-recent', async (_e, root) => {
    const s = await loadSession(sessionFile());
    const recent = addRecent(s.recent, root);
    await saveSession(sessionFile(), { ...s, recent });
    return recent;
  });
```

In `desktop/preload.js`, add to the `karto` object:

```javascript
  loadSession: () => ipcRenderer.invoke('session:load'),
  saveSession: (state) => ipcRenderer.invoke('session:save', state),
  addRecent: (root) => ipcRenderer.invoke('session:add-recent', root),
```

- [ ] **Step 6: Run the suite**

Run: `npm test`
Expected: PASS, including `test/desktop-session.test.js`.

- [ ] **Step 7: Commit**

```bash
git add desktop/main/session.js desktop/main/ipc.js desktop/preload.js test/desktop-session.test.js
git commit -m "feat(desktop): session + recent-projects persistence"
```

---

## Task 6: Live-reload watcher

**Files:**
- Create: `desktop/main/watcher.js`
- Modify: `desktop/main/ipc.js` (start/stop watchers per open root, push `file-change`), `desktop/main/main.js` (close watchers on quit)

**Interfaces:**
- Produces: `watchProject(root, onChange): { close(): void }` — debounced recursive watch with the same filter as serve.js, ignoring `kartograph.layout.json`.

This task has no pure-unit test (it wraps `fs.watch` timers); it mirrors the tested behavior of `server/serve.js` and is verified by running.

- [ ] **Step 1: Implement `desktop/main/watcher.js`**

```javascript
import { watch } from 'node:fs';
import { join } from 'node:path';

// Watch a project tree and call onChange() (debounced) when a relevant file changes.
// Mirrors server/serve.js: ignore our own kartograph.layout.json writes; only react to
// map/feature/decision/json changes; fall back to watching kartograph.json if recursive
// watch is unsupported on this platform.
export function watchProject(root, onChange) {
  let timer = null;
  const notify = () => { clearTimeout(timer); timer = setTimeout(onChange, 100); };
  const handle = (_event, filename) => {
    if (filename === 'kartograph.layout.json') return;
    if (!filename) return notify();
    if (/kartograph|\.feature$|decisions|\.json$/.test(filename)) notify();
  };
  let watcher = null;
  try {
    watcher = watch(root, { recursive: true }, handle);
  } catch {
    try { watcher = watch(join(root, 'kartograph.json'), notify); } catch { watcher = null; }
  }
  return { close: () => { clearTimeout(timer); watcher?.close(); } };
}
```

- [ ] **Step 2: Manage watchers per open project in `desktop/main/ipc.js`**

Add at the top:

```javascript
import { watchProject } from './watcher.js';

const watchers = new Map(); // root -> { close }
```

Inside `registerIpc()` add handlers to start/stop watching, pushing changes to the sender:

```javascript
  ipcMain.handle('watch:start', (event, root) => {
    if (watchers.has(root)) return { ok: true };
    const sender = event.sender;
    watchers.set(root, watchProject(root, () => {
      if (!sender.isDestroyed()) sender.send('file-change', root);
    }));
    return { ok: true };
  });
  ipcMain.handle('watch:stop', (_e, root) => {
    watchers.get(root)?.close();
    watchers.delete(root);
    return { ok: true };
  });
```

Export a cleanup used on quit:

```javascript
export function closeAllWatchers() {
  for (const w of watchers.values()) w.close();
  watchers.clear();
}
```

- [ ] **Step 3: Expose watch start/stop in `desktop/preload.js`**

Add to the `karto` object:

```javascript
  watchStart: (root) => ipcRenderer.invoke('watch:start', root),
  watchStop: (root) => ipcRenderer.invoke('watch:stop', root),
```

- [ ] **Step 4: Close watchers on quit in `desktop/main/main.js`**

Add the import and a `before-quit` hook:

```javascript
import { registerIpc, closeAllWatchers } from './ipc.js';

app.on('before-quit', () => closeAllWatchers());
```

- [ ] **Step 5: Manual verification**

`cd desktop && npm start`, open a project (after Task 7 the UI exists; for now test via devtools): call `await window.karto.watchStart(<root>)`, register `window.karto.onFileChange((r) => console.log('changed', r))`, then edit the project's `kartograph.json` on disk. Expected: console logs `changed <root>` once (debounced). Editing `kartograph.layout.json` does NOT log.

- [ ] **Step 6: Commit**

```bash
git add desktop/main/watcher.js desktop/main/ipc.js desktop/preload.js desktop/main/main.js
git commit -m "feat(desktop): per-project live-reload watcher"
```

---

## Task 7: Renderer shell — tabs, open/close, session restore, error state

**Files:**
- Modify: `desktop/renderer/app.js` (replace the Task 3 stub), `desktop/renderer/index.html` (already has `#tabstrip`/`#workspace`), `desktop/renderer/styles.css` (tab styles)

**Interfaces:**
- Consumes: `window.karto` (openProject, readMap, loadSession, saveSession, addRecent, watchStart, watchStop, onFileChange, onMenuOpenProject).
- Produces (module exports for the view modules in Tasks 8–11):
  - `mountTab(rootEl, tab)` is owned here; view modules export `renderMap(container, tab)`, `renderBoard(container, tab)`, `renderSidebar(container, tab)`, `renderFeatures(container, tab)` — each accepts a DOM container and the tab's loaded data object `tab = { root, name, map, layout, board, tree, error }`.

This is UI; verified by running, not unit tests. Provide the full module.

- [ ] **Step 1: Replace `desktop/renderer/app.js`**

```javascript
import { renderMap } from './views/map.js';
import { renderBoard } from './views/board.js';
import { renderSidebar } from './views/sidebar.js';
import { renderFeatures } from './views/features.js';

const tabs = [];           // { root, name, data, view, dirty, el, paneEl }
let activeRoot = null;

const stripEl = document.getElementById('tabstrip');
const workspaceEl = document.getElementById('workspace');

const VIEWS = { map: renderMap, board: renderBoard, features: renderFeatures };

async function loadProjectData(root) {
  const { map, layout } = await window.karto.readMap(root);
  const [board, tree] = await Promise.all([window.karto.readBoard(root), window.karto.listFeatures(root)]);
  return { root, map, layout, board, tree };
}

async function openProjectByRoot(root, name) {
  if (tabs.find((t) => t.root === root)) { setActive(root); return; }
  const tab = { root, name: name || root, data: null, view: 'map', dirty: false, error: null };
  tabs.push(tab);
  await window.karto.watchStart(root);
  await window.karto.addRecent(root);
  setActive(root);
  await refreshTab(tab);
  renderStrip();
  persistSession();
}

async function refreshTab(tab) {
  try { tab.data = await loadProjectData(tab.root); tab.error = null; }
  catch (e) { tab.error = String(e.message || e); }
  if (tab.root === activeRoot) renderWorkspace();
}

function setActive(root) { activeRoot = root; renderStrip(); renderWorkspace(); }

function closeTab(root) {
  const i = tabs.findIndex((t) => t.root === root);
  if (i === -1) return;
  const tab = tabs[i];
  if (tab.dirty && !confirm(`"${tab.name}" has unsaved layout changes. Close anyway?`)) return;
  window.karto.watchStop(root);
  tabs.splice(i, 1);
  if (activeRoot === root) activeRoot = tabs.length ? tabs[Math.max(0, i - 1)].root : null;
  renderStrip(); renderWorkspace(); persistSession();
}

function renderStrip() {
  stripEl.innerHTML = '';
  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.root === activeRoot ? ' active' : '') + (tab.dirty ? ' dirty' : '');
    el.textContent = tab.name;
    el.title = tab.root;
    el.onclick = () => setActive(tab.root);
    const x = document.createElement('button');
    x.className = 'tab-close'; x.textContent = '×';
    x.onclick = (ev) => { ev.stopPropagation(); closeTab(tab.root); };
    el.appendChild(x);
    stripEl.appendChild(el);
  }
  const add = document.createElement('button');
  add.className = 'tab-add'; add.textContent = '+'; add.title = 'Open project';
  add.onclick = doOpen;
  stripEl.appendChild(add);
}

function renderWorkspace() {
  workspaceEl.innerHTML = '';
  const tab = tabs.find((t) => t.root === activeRoot);
  if (!tab) { workspaceEl.innerHTML = '<p class="empty">Open a kartograph.json to begin (File → Open).</p>'; return; }
  if (tab.error) {
    workspaceEl.innerHTML = `<div class="error"><p>Could not load this project.</p><pre></pre>
      <button id="retry">Retry</button></div>`;
    workspaceEl.querySelector('pre').textContent = tab.error;
    workspaceEl.querySelector('#retry').onclick = () => refreshTab(tab);
    return;
  }
  // View switcher
  const bar = document.createElement('div');
  bar.className = 'viewbar';
  for (const key of ['map', 'board', 'features']) {
    const b = document.createElement('button');
    b.textContent = key[0].toUpperCase() + key.slice(1);
    b.className = tab.view === key ? 'active' : '';
    b.onclick = () => { tab.view = key; renderWorkspace(); };
    bar.appendChild(b);
  }
  workspaceEl.appendChild(bar);

  const layout = document.createElement('div');
  layout.className = 'project-layout';
  const main = document.createElement('div'); main.className = 'project-main';
  const side = document.createElement('aside'); side.className = 'project-side';
  layout.append(main, side);
  workspaceEl.appendChild(layout);

  VIEWS[tab.view](main, tab);
  renderSidebar(side, tab);
}

async function doOpen() {
  const picked = await window.karto.openProject();
  if (picked) await openProjectByRoot(picked.root, picked.name);
}

function persistSession() {
  window.karto.saveSession({ openRoots: tabs.map((t) => t.root) });
}

// Live reload: refresh the matching tab.
window.karto.onFileChange((root) => {
  const tab = tabs.find((t) => t.root === root);
  if (tab) refreshTab(tab);
});

window.karto.onMenuOpenProject(() => doOpen());

// Restore previous session on launch.
(async () => {
  const { openRoots } = await window.karto.loadSession();
  for (const root of openRoots) {
    try { await openProjectByRoot(root, root.split(/[\\/]/).pop()); } catch { /* skip dead roots */ }
  }
  renderStrip(); renderWorkspace();
})();

// Exposed for view modules to mark a tab dirty (e.g. unsaved drag) and trigger a strip repaint.
export function markDirty(tab, dirty) { tab.dirty = dirty; renderStrip(); }
```

- [ ] **Step 2: Add tab + layout styles to `desktop/renderer/styles.css`**

```css
.tab { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: #1b1e24; border-radius: 6px 6px 0 0; cursor: pointer; color: #c2c7d0; max-width: 220px; }
.tab.active { background: #262b33; color: #fff; }
.tab.dirty::before { content: '●'; color: #e0b341; font-size: 10px; }
.tab-close { background: none; border: none; color: inherit; cursor: pointer; font-size: 14px; line-height: 1; }
.tab-add { background: none; border: none; color: #8a909a; font-size: 18px; cursor: pointer; padding: 0 8px; }
.viewbar { display: flex; gap: 4px; padding: 8px; background: #1b1e24; }
.viewbar button { background: #262b33; color: #c2c7d0; border: none; padding: 5px 12px; border-radius: 5px; cursor: pointer; }
.viewbar button.active { background: #3a86ff; color: #fff; }
.project-layout { display: flex; height: calc(100% - 44px); }
.project-main { flex: 1; overflow: auto; position: relative; }
.project-side { width: 320px; border-left: 1px solid #2a2f37; overflow: auto; padding: 12px; }
.error { padding: 24px; color: #ff9b9b; }
.error pre { white-space: pre-wrap; background: #1b1e24; padding: 12px; border-radius: 6px; color: #ddd; }
```

- [ ] **Step 3: Create empty view stubs so imports resolve (filled in Tasks 8–11)**

Create `desktop/renderer/views/map.js`, `board.js`, `sidebar.js`, `features.js`, each:

```javascript
export function renderMap(container, tab) { container.textContent = 'Map view — TODO'; }
```

(Adjust the export name per file: `renderMap`, `renderBoard`, `renderSidebar`, `renderFeatures`.)

- [ ] **Step 4: Manual verification**

`cd desktop && npm start`. Open two different projects via `+` or File → Open. Expected: two tabs appear, switching works, each shows the Map/Board/Features switcher and the placeholder text; closing a tab works; quitting and relaunching reopens the same tabs. A project whose `kartograph.json` was deleted shows the error pane with Retry.

- [ ] **Step 5: Commit**

```bash
git add desktop/renderer/app.js desktop/renderer/styles.css desktop/renderer/views/
git commit -m "feat(desktop): renderer shell with tabs, session restore, error state"
```

---

## Task 8: Map view

**Files:**
- Modify: `desktop/renderer/views/map.js`, `desktop/renderer/styles.css`

**Interfaces:**
- Consumes: `tab.data.map` (`{ contexts, capabilities }`), `tab.data.layout`, `window.karto.saveLayout`, `markDirty` from `../app.js`. May import pure helpers from `../../../viewer/lib/layout.js` (`autoPlaceGrouped`) and `../../../viewer/lib/maturity.js`.
- Produces: a draggable capability graph; dragging persists positions via `saveLayout`.

UI task; verified by running.

- [ ] **Step 1: Implement the map render**

Replace `desktop/renderer/views/map.js`:

```javascript
import { markDirty } from '../app.js';
import { autoPlaceGrouped } from '../../../viewer/lib/layout.js';

const NODE_W = 160, NODE_H = 64;

export function renderMap(container, tab) {
  const { map, layout, root } = tab.data;
  const caps = Object.entries(map.capabilities || {})
    .map(([slug, c]) => ({ slug, name: c.name || slug, context: c.context, maturity: (c.derived && c.derived.maturity) || 'vision' }));
  const positions = { ...autoPlaceGrouped(caps.map((c) => ({ slug: c.slug, group: c.context })), layout, {}), ...layout };

  container.innerHTML = '<div class="map-canvas"><div class="map-world"></div></div>';
  const world = container.querySelector('.map-world');

  for (const cap of caps) {
    const pos = positions[cap.slug] || { x: 40, y: 40 };
    const node = document.createElement('div');
    node.className = `map-node maturity-${cap.maturity}`;
    node.style.left = pos.x + 'px';
    node.style.top = pos.y + 'px';
    node.innerHTML = `<strong>${esc(cap.name)}</strong><span>${esc(cap.context || '')} · ${esc(cap.maturity)}</span>`;
    makeDraggable(node, cap.slug, positions, tab, world);
    world.appendChild(node);
  }
}

function makeDraggable(node, slug, positions, tab, world) {
  node.onpointerdown = (e) => {
    e.preventDefault();
    node.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    const orig = { ...(positions[slug] || { x: 0, y: 0 }) };
    const move = (ev) => {
      positions[slug] = { x: orig.x + (ev.clientX - start.x), y: orig.y + (ev.clientY - start.y) };
      node.style.left = positions[slug].x + 'px';
      node.style.top = positions[slug].y + 'px';
      markDirty(tab, true);
    };
    const up = async () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      tab.data.layout = positions;
      await window.karto.saveLayout(tab.data.root, positions);
      markDirty(tab, false);
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
  };
}

function esc(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
```

Note: confirm `autoPlaceGrouped`'s exact signature in `viewer/lib/layout.js` before use; if its shape differs, fall back to a simple grid (`x = 40 + col*200, y = 40 + row*120`) keyed by index. The grid fallback is acceptable for v1.

- [ ] **Step 2: Add map styles to `desktop/renderer/styles.css`**

```css
.map-canvas { position: absolute; inset: 0; overflow: auto; }
.map-world { position: relative; width: 4000px; height: 3000px; }
.map-node { position: absolute; width: 160px; min-height: 64px; padding: 8px 10px; border-radius: 8px; background: #262b33; border: 1px solid #3a4150; cursor: grab; display: flex; flex-direction: column; gap: 4px; user-select: none; }
.map-node:active { cursor: grabbing; }
.map-node span { color: #8a909a; font-size: 11px; }
.map-node.maturity-vision { border-left: 4px solid #6b7280; }
.map-node.maturity-sketched { border-left: 4px solid #a78bfa; }
.map-node.maturity-building { border-left: 4px solid #3a86ff; }
.map-node.maturity-usable { border-left: 4px solid #34d399; }
.map-node.maturity-stable { border-left: 4px solid #10b981; }
```

- [ ] **Step 3: Manual verification**

`npm start`, open a project, Map view. Expected: one node per capability, colored by maturity, grouped/placed; dragging a node moves it, the tab shows the dirty dot during drag, and on release `kartograph.layout.json` is written (verify on disk). Reopening the project restores positions.

- [ ] **Step 4: Commit**

```bash
git add desktop/renderer/views/map.js desktop/renderer/styles.css
git commit -m "feat(desktop): map view with draggable, persisted layout"
```

---

## Task 9: Board view with progress editing

**Files:**
- Modify: `desktop/renderer/views/board.js`, `desktop/renderer/styles.css`

**Interfaces:**
- Consumes: `tab.data.board` (`{ scenarios, capabilities, contexts }`), `window.karto.setBoardProgress`, `refreshTab` via re-fetch. May import `BOARD_COLUMNS`, `boardColumns`, `groupByContext` from `../../../viewer/lib/board.js`.
- Produces: a Kanban of scenarios by progress column; dragging a card writes the `.feature` progress tag.

UI task; verified by running.

- [ ] **Step 1: Implement the board render**

Replace `desktop/renderer/views/board.js`:

```javascript
const COLUMNS = [
  { key: 'open', label: 'Open' },
  { key: 'wip', label: 'WIP' },
  { key: 'test', label: 'Test' },
  { key: 'done', label: 'Done' },
];

export function renderBoard(container, tab) {
  const { scenarios } = tab.data.board;
  container.innerHTML = '<div class="board"></div>';
  const board = container.querySelector('.board');

  for (const col of COLUMNS) {
    const colEl = document.createElement('div');
    colEl.className = 'board-col';
    colEl.dataset.progress = col.key;
    colEl.innerHTML = `<h3>${col.label}</h3>`;
    colEl.ondragover = (e) => { e.preventDefault(); colEl.classList.add('drop'); };
    colEl.ondragleave = () => colEl.classList.remove('drop');
    colEl.ondrop = (e) => { e.preventDefault(); colEl.classList.remove('drop'); onDrop(e, col.key, tab); };

    for (const s of scenarios.filter((x) => x.progress === col.key)) {
      const card = document.createElement('div');
      card.className = `card class-${s.class || 'none'}`;
      card.draggable = true;
      card.innerHTML = `<div class="card-title">${esc(s.name)}</div>
        <div class="card-meta">${esc(s.capabilityName)} · ${esc(s.feature)}</div>`;
      card.ondragstart = (e) => e.dataTransfer.setData('text/plain', JSON.stringify({
        context: s.context, capability: s.capability, feature: s.feature, scenario: s.name,
      }));
      colEl.appendChild(card);
    }
    board.appendChild(colEl);
  }
}

async function onDrop(e, progress, tab) {
  let p;
  try { p = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
  try {
    await window.karto.setBoardProgress({ root: tab.data.root, ...p, progress });
    tab.data.board = await window.karto.readBoard(tab.data.root);
    renderBoard(document.querySelector('.project-main'), tab);
  } catch (err) {
    alert('Could not update scenario: ' + (err.message || err));
  }
}

function esc(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
```

- [ ] **Step 2: Add board styles to `desktop/renderer/styles.css`**

```css
.board { display: flex; gap: 12px; padding: 12px; height: 100%; align-items: flex-start; }
.board-col { flex: 1; background: #1b1e24; border-radius: 8px; padding: 8px; min-height: 120px; }
.board-col.drop { outline: 2px dashed #3a86ff; }
.board-col h3 { margin: 4px 6px 10px; font-size: 12px; text-transform: uppercase; color: #8a909a; }
.card { background: #262b33; border-radius: 6px; padding: 8px; margin-bottom: 8px; cursor: grab; border-left: 3px solid #6b7280; }
.card.class-happy { border-left-color: #34d399; }
.card.class-edge { border-left-color: #e0b341; }
.card.class-error { border-left-color: #ff6b6b; }
.card-title { font-size: 13px; }
.card-meta { color: #8a909a; font-size: 11px; margin-top: 4px; }
```

- [ ] **Step 3: Manual verification**

`npm start`, open a project, Board view. Expected: scenarios appear in the four columns by progress; dragging a card to another column rewrites the progress tag in the `.feature` file (verify on disk) and the board re-renders with the card in its new column. Path-tag color stripe is preserved.

- [ ] **Step 4: Commit**

```bash
git add desktop/renderer/views/board.js desktop/renderer/styles.css
git commit -m "feat(desktop): board view with drag-to-edit progress"
```

---

## Task 10: Sidebar panels

**Files:**
- Modify: `desktop/renderer/views/sidebar.js`, `desktop/renderer/styles.css`

**Interfaces:**
- Consumes: `tab.data.map` (`glossary`, `adrs`, `openQuestions`, `capabilities` with `derived.maturity`). May import `groupQuestionsByFeature`, `countQuestions` from `../../../viewer/lib/questions.js`.
- Produces: maturity summary, glossary, ADRs, open-questions panels (read-only).

UI task; verified by running.

- [ ] **Step 1: Implement the sidebar render**

Replace `desktop/renderer/views/sidebar.js`:

```javascript
export function renderSidebar(container, tab) {
  const { map } = tab.data;
  container.innerHTML = '';
  container.appendChild(maturityPanel(map));
  container.appendChild(glossaryPanel(map));
  container.appendChild(adrPanel(map));
  container.appendChild(questionsPanel(map));
}

function panel(title, bodyHtml) {
  const sec = document.createElement('section');
  sec.className = 'panel';
  sec.innerHTML = `<h2>${esc(title)}</h2><div class="panel-body">${bodyHtml}</div>`;
  return sec;
}

function maturityPanel(map) {
  const order = ['vision', 'sketched', 'building', 'usable', 'stable'];
  const counts = Object.fromEntries(order.map((k) => [k, 0]));
  for (const c of Object.values(map.capabilities || {})) {
    const m = (c.derived && c.derived.maturity) || 'vision';
    if (m in counts) counts[m]++;
  }
  const rows = order.map((k) => `<div class="mat-row"><span>${k}</span><b>${counts[k]}</b></div>`).join('');
  return panel('Maturity', rows);
}

function glossaryPanel(map) {
  const terms = Object.values(map.glossary || {});
  if (!terms.length) return panel('Glossary', '<p class="muted">No terms.</p>');
  const rows = terms.map((t) => `<tr><td>${esc(t.term || '')}</td><td>${esc(t.definition || '')}</td></tr>`).join('');
  return panel('Glossary', `<table>${rows}</table>`);
}

function adrPanel(map) {
  const adrs = Object.values(map.adrs || {});
  if (!adrs.length) return panel('Decisions (ADR)', '<p class="muted">No decisions.</p>');
  const rows = adrs.map((a) => `<tr><td>${esc(a.id || '')}</td><td>${esc(a.title || '')}</td><td>${esc(a.status || '')}</td></tr>`).join('');
  return panel('Decisions (ADR)', `<table>${rows}</table>`);
}

function questionsPanel(map) {
  const q = map.openQuestions || [];
  const flat = Array.isArray(q) ? q : Object.values(q).flat();
  if (!flat.length) return panel('Open Questions', '<p class="muted">No open questions.</p>');
  const items = flat.map((x) => `<li>${esc(typeof x === 'string' ? x : x.question || '')}</li>`).join('');
  return panel(`Open Questions (${flat.length})`, `<ul>${items}</ul>`);
}

function esc(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
```

Note: confirm the exact shape of `glossary`, `adrs`, and `openQuestions` against a real `kartograph.json` (e.g. `examples/kartograph.seed.json`) and adjust field names (`term`/`definition`, `id`/`title`/`status`) if they differ. The viewer reads `k.glossary`, `k.adrs`, `k.openQuestions` (see `viewer/kartograph.js:335-353`).

- [ ] **Step 2: Add sidebar styles to `desktop/renderer/styles.css`**

```css
.panel { margin-bottom: 16px; }
.panel h2 { font-size: 12px; text-transform: uppercase; color: #8a909a; margin: 0 0 8px; }
.panel table { width: 100%; border-collapse: collapse; font-size: 12px; }
.panel td { padding: 3px 4px; vertical-align: top; border-bottom: 1px solid #23272f; }
.panel .muted { color: #6b7280; font-size: 12px; }
.mat-row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
.panel ul { margin: 0; padding-left: 18px; font-size: 12px; }
```

- [ ] **Step 3: Manual verification**

`npm start`, open `examples/` (or any real project). Expected: the right sidebar shows maturity counts, glossary terms, ADRs, and open questions populated from `kartograph.json`. Empty sections show their "No …" message.

- [ ] **Step 4: Commit**

```bash
git add desktop/renderer/views/sidebar.js desktop/renderer/styles.css
git commit -m "feat(desktop): sidebar panels (maturity, glossary, ADR, questions)"
```

---

## Task 11: Feature browser

**Files:**
- Modify: `desktop/renderer/views/features.js`, `desktop/renderer/styles.css`

**Interfaces:**
- Consumes: `tab.data.tree` (`{ contexts }` from `listFeatures`), `window.karto.readFeatures`, `window.karto.readRaw`.
- Produces: a context→capability→file tree; full Gherkin render; tag filter + text search; raw-source toggle.

UI task; verified by running.

- [ ] **Step 1: Implement the feature browser**

Replace `desktop/renderer/views/features.js`:

```javascript
const PATH_TAGS = ['@happy', '@edge', '@error'];
const PROGRESS_TAGS = ['@wip', '@test', '@done'];

export function renderFeatures(container, tab) {
  const { tree, root } = tab.data;
  container.innerHTML = `
    <div class="fb">
      <div class="fb-tree"></div>
      <div class="fb-main">
        <div class="fb-controls">
          <input class="fb-search" type="search" placeholder="Search scenarios…" />
          <label><input type="checkbox" class="fb-raw" /> Raw</label>
          <span class="fb-tags"></span>
        </div>
        <div class="fb-content"><p class="muted">Pick a capability on the left.</p></div>
      </div>
    </div>`;

  const treeEl = container.querySelector('.fb-tree');
  const contentEl = container.querySelector('.fb-content');
  const searchEl = container.querySelector('.fb-search');
  const rawEl = container.querySelector('.fb-raw');
  const tagsEl = container.querySelector('.fb-tags');

  for (const t of [...PATH_TAGS, ...PROGRESS_TAGS]) {
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="checkbox" value="${t}" /> ${t}`;
    tagsEl.appendChild(lbl);
  }

  const state = { context: null, capability: null };

  for (const ctx of (tree.contexts || [])) {
    const cg = document.createElement('div');
    cg.className = 'fb-ctx';
    cg.innerHTML = `<div class="fb-ctx-name">${esc(ctx.name)}</div>`;
    for (const cap of ctx.capabilities) {
      const cb = document.createElement('button');
      cb.className = 'fb-cap';
      cb.textContent = `${cap.name} (${cap.files.length})`;
      cb.onclick = () => { state.context = ctx.context; state.capability = cap.capability; load(); };
      cg.appendChild(cb);
    }
    treeEl.appendChild(cg);
  }

  searchEl.oninput = render;
  rawEl.onchange = load;
  tagsEl.onchange = render;

  let loaded = null; // { files } for the selected capability

  async function load() {
    if (!state.capability) return;
    if (rawEl.checked) { await renderRaw(); return; }
    loaded = await window.karto.readFeatures(root, state.context, state.capability);
    render();
  }

  function activeTags() {
    return [...tagsEl.querySelectorAll('input:checked')].map((i) => i.value);
  }

  function render() {
    if (rawEl.checked) return;
    if (!loaded) { contentEl.innerHTML = '<p class="muted">Pick a capability on the left.</p>'; return; }
    const q = searchEl.value.trim().toLowerCase();
    const tags = activeTags();
    contentEl.innerHTML = '';
    for (const f of loaded.files) {
      const scenarios = f.scenarios.filter((s) => {
        const tagOk = tags.every((t) => (s.tags || []).includes(t));
        const text = (s.name + ' ' + (s.steps || []).join(' ')).toLowerCase();
        return tagOk && (!q || text.includes(q));
      });
      if (!scenarios.length) continue;
      const fe = document.createElement('article');
      fe.className = 'fb-feature';
      fe.innerHTML = `<h3>${esc(f.feature || f.file)}</h3>` +
        (f.description ? `<p class="fb-desc">${esc(f.description)}</p>` : '') +
        (f.background ? `<pre class="fb-bg">Background:\n${esc(f.background.join('\n'))}</pre>` : '');
      for (const s of scenarios) {
        const se = document.createElement('div');
        se.className = `fb-scenario class-${s.class || 'none'}`;
        se.innerHTML = `<div class="fb-tags-line">${(s.tags || []).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
          <div class="fb-scn-name">${esc(s.name)}</div>
          <pre>${esc((s.steps || []).join('\n'))}</pre>`;
        fe.appendChild(se);
      }
      contentEl.appendChild(fe);
    }
    if (!contentEl.children.length) contentEl.innerHTML = '<p class="muted">No scenarios match.</p>';
  }

  async function renderRaw() {
    contentEl.innerHTML = '<p class="muted">Loading…</p>';
    const tree2 = tab.data.tree.contexts.find((c) => c.context === state.context);
    const cap = tree2?.capabilities.find((c) => c.capability === state.capability);
    const parts = [];
    for (const file of (cap?.files || [])) {
      const rel = `features/${state.context}/${state.capability}/${file}`;
      const { text } = await window.karto.readRaw(root, rel);
      parts.push(`<h4>${esc(file)}</h4><pre class="fb-rawpre">${esc(text)}</pre>`);
    }
    contentEl.innerHTML = parts.join('') || '<p class="muted">No files.</p>';
  }
}

function esc(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
```

- [ ] **Step 2: Add feature-browser styles to `desktop/renderer/styles.css`**

```css
.fb { display: flex; height: 100%; }
.fb-tree { width: 240px; border-right: 1px solid #2a2f37; overflow: auto; padding: 8px; }
.fb-ctx-name { font-size: 11px; text-transform: uppercase; color: #8a909a; margin: 10px 4px 4px; }
.fb-cap { display: block; width: 100%; text-align: left; background: none; border: none; color: #c2c7d0; padding: 4px 8px; border-radius: 4px; cursor: pointer; }
.fb-cap:hover { background: #262b33; }
.fb-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.fb-controls { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-bottom: 1px solid #2a2f37; flex-wrap: wrap; }
.fb-search { background: #1b1e24; border: 1px solid #3a4150; color: #e6e8ec; padding: 5px 8px; border-radius: 5px; min-width: 200px; }
.fb-tags label { font-size: 11px; margin-right: 8px; color: #b6bcc6; }
.fb-content { overflow: auto; padding: 12px; }
.fb-feature { margin-bottom: 20px; }
.fb-feature h3 { margin: 0 0 6px; }
.fb-desc { color: #b6bcc6; }
.fb-bg, .fb-scenario pre, .fb-rawpre { background: #1b1e24; padding: 8px; border-radius: 6px; white-space: pre-wrap; font: 12px/1.5 ui-monospace, monospace; }
.fb-scenario { border-left: 3px solid #6b7280; padding-left: 10px; margin: 10px 0; }
.fb-scenario.class-happy { border-left-color: #34d399; }
.fb-scenario.class-edge { border-left-color: #e0b341; }
.fb-scenario.class-error { border-left-color: #ff6b6b; }
.fb-tags-line span { font-size: 10px; color: #8a909a; margin-right: 6px; }
.fb-scn-name { font-weight: 600; margin: 4px 0; }
.muted { color: #6b7280; }
```

- [ ] **Step 3: Manual verification**

`npm start`, open a project, Features view. Expected: left tree lists contexts → capabilities with file counts; selecting one renders each feature with description/background/scenarios + tags + steps; typing in search filters scenarios; checking `@edge` shows only edge scenarios; toggling Raw shows the raw `.feature` source text.

- [ ] **Step 4: Commit**

```bash
git add desktop/renderer/views/features.js desktop/renderer/styles.css
git commit -m "feat(desktop): feature browser with Gherkin render, filter, search, raw view"
```

---

## Task 12: README + final full-suite check

**Files:**
- Create: `desktop/README.md`
- (No code changes.)

- [ ] **Step 1: Write `desktop/README.md`**

```markdown
# Kartograph Desktop

An Electron app for viewing Kartograph maps. Open a project's `kartograph.json`
directly; each project opens in its own tab and several can be open at once.

## Run

    cd desktop
    npm install
    npm start

File → Open Project… (or the `+` tab) picks a `kartograph.json`; its folder becomes
the project root. Open tabs and a recent list are restored on the next launch.

## Views

- **Map** — capability graph; drag nodes to lay them out (saved to `kartograph.layout.json`).
- **Board** — scenario Kanban; drag a card to change its progress tag in the `.feature` file.
- **Features** — browse all `.feature` files, full Gherkin render, tag filter + search, raw view.
- **Sidebar** — maturity, glossary, ADRs, open questions.

The deterministic board/feature logic is shared with `server/serve.js` via
`workflows/lib/board-data.js` and `workflows/lib/feature-read.js`. Packaging
(installers/auto-update) is a future follow-up; this is a dev-run app for now.
```

- [ ] **Step 2: Run the full suite from the repo root**

Run: `npm test`
Expected: PASS — all existing tests plus `board-data`, `feature-read`, `desktop-project`, `desktop-session`.

- [ ] **Step 3: Final manual smoke**

`cd desktop && npm start`. Open two projects, exercise all four views, confirm live reload (edit a `.feature` on disk → board/features refresh) and session restore.

- [ ] **Step 4: Commit**

```bash
git add desktop/README.md
git commit -m "docs(desktop): add desktop app README"
```

---

## Self-Review Notes

- **Spec coverage:** open-directly + folder=project (Tasks 4, 7); multiple projects/tabs (Task 7); session restore + recent + close-confirm (Tasks 5, 7); shared-logic refactor of serve.js (Tasks 1, 2); IPC replacing all 5 endpoints + readRaw/listFeatures (Tasks 4, 6); Map/Board/Sidebar/Feature-browser with all four browser sub-features (Tasks 8–11); editable layout + board (Tasks 8, 9); live reload (Task 6); error handling per tab (Task 7); pure-layer tests only (Tasks 1, 2, 4, 5); coexist with serve.js, no version bump (Global Constraints).
- **Verification caveats noted inline:** `autoPlaceGrouped` signature (Task 8) and glossary/adr/openQuestions field shapes (Task 10) must be confirmed against real data before relying on them; both have explicit fallbacks.
- **Out of scope (per spec):** packaging/distribution, rewiring `/karto-show`, npm workspace wiring.
