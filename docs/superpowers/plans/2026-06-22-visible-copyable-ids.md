# Visible, Copyable IDs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a click-to-copy ID on every context, capability, feature, and scenario in the Map and Tracking views, so an exact item can be quoted to an AI.

**Architecture:** A new pure `viewer/lib/ids.js` defines the canonical capability-rooted locator format (unit-tested). A tiny Electron clipboard IPC (`window.karto.copy`) plus a shared renderer helper `desktop/renderer/idchip.js` render each ID as a copyable chip. The Map and Tracking views compute IDs from data they already hold and drop chips in place. No data persisted, no schema/tag-model/serve.js/browser-viewer change.

**Tech Stack:** Vanilla ESM JavaScript (no framework, no build step), Node built-ins, `node:test`. Electron `clipboard` module for the copy IPC.

## Global Constraints

- **No build step, no framework.** Vanilla ESM JavaScript, Node built-ins + existing deps only. (CLAUDE.md)
- **ESM everywhere** (`"type": "module"`); the renderer loads as `type="module"`; the **preload is CommonJS** (`preload.cjs`, sandboxed) and uses `require`/`ipcRenderer.invoke`.
- **Pure-function + thin-caller split.** ID format lives in a pure, unit-tested `viewer/lib/ids.js`. (CLAUDE.md)
- **ID format (exact), capability-rooted:** context = `<contextSlug>`; capability = `<capabilitySlug>`; feature = `<capabilitySlug>/<featureFile>`; scenario = `<capabilitySlug>/<featureFile>#"<scenarioName>"`.
- **No data persisted / no migration.** IDs are derived at render time. No schema, tag-model, `.feature`, `serve.js`, or browser-viewer change.
- **Clipboard via Electron** (`clipboard.writeText`), not `navigator.clipboard` (unreliable under `file://`).
- **Chips never interfere:** the chip's pointerdown/click `stopPropagation()` so clicking it never starts a Map drag or toggles/selects a Tracking row.
- **Tests gate the pure layer only.** `ids.js` gets `node:test` coverage; the renderer/IPC are verified by running the app. `npm test` must still pass.

---

## File Structure

- **Create** `viewer/lib/ids.js` — four pure ID functions.
- **Create** `test/ids.test.js` — `node:test` for the formats.
- **Create** `desktop/renderer/idchip.js` — `idChip(idText)` chip helper.
- **Modify** `desktop/main/ipc.js` — `clipboard:write` handler.
- **Modify** `desktop/preload.cjs` — `copy` method.
- **Modify** `desktop/renderer/views/map.js`, `views/tracking.js`, `styles.css` — chip placements + `.idchip` CSS.

---

## Task 1: Pure `ids.js` + tests

**Files:**
- Create: `viewer/lib/ids.js`
- Test: `test/ids.test.js`

**Interfaces:**
- Produces: `contextId(contextSlug)`, `capabilityId(capabilitySlug)`, `featureId(capabilitySlug, featureFile)`, `scenarioId(capabilitySlug, featureFile, scenarioName)` — all return `string`, pure, no DOM/IO.

- [ ] **Step 1: Write the failing test**

Create `test/ids.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextId, capabilityId, featureId, scenarioId } from '../viewer/lib/ids.js';

test('contextId and capabilityId are the slug itself', () => {
  assert.equal(contextId('identity-access'), 'identity-access');
  assert.equal(capabilityId('authentication'), 'authentication');
});

test('featureId is capability-rooted', () => {
  assert.equal(featureId('authentication', 'sign-in.feature'), 'authentication/sign-in.feature');
});

test('scenarioId appends the quoted scenario name', () => {
  assert.equal(
    scenarioId('authentication', 'sign-in.feature', 'user signs in'),
    'authentication/sign-in.feature#"user signs in"',
  );
});

test('ids coerce missing parts to empty strings (no "undefined")', () => {
  assert.equal(contextId(undefined), '');
  assert.equal(featureId('cap', undefined), 'cap/');
  assert.equal(scenarioId('cap', 'f.feature', undefined), 'cap/f.feature#""');
});

test('scenarioId embeds the raw name verbatim (inner quotes are not escaped)', () => {
  assert.equal(
    scenarioId('cap', 'x.feature', 'say "hi"'),
    'cap/x.feature#"say "hi""',
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ids.test.js`
Expected: FAIL — `Cannot find module '../viewer/lib/ids.js'`.

- [ ] **Step 3: Implement `viewer/lib/ids.js`**

```javascript
// Canonical, capability-rooted locator IDs for map items, used as human-quotable
// references (e.g. to point an AI at an exact scenario). Pure — no DOM/IO.
// Capability slugs are globally unique in kartograph.json, so IDs are capability-rooted.
//   context    -> <contextSlug>
//   capability -> <capabilitySlug>
//   feature    -> <capabilitySlug>/<featureFile>
//   scenario   -> <capabilitySlug>/<featureFile>#"<scenarioName>"
export function contextId(contextSlug) { return String(contextSlug ?? ''); }
export function capabilityId(capabilitySlug) { return String(capabilitySlug ?? ''); }
export function featureId(capabilitySlug, featureFile) {
  return `${capabilityId(capabilitySlug)}/${String(featureFile ?? '')}`;
}
export function scenarioId(capabilitySlug, featureFile, scenarioName) {
  return `${featureId(capabilitySlug, featureFile)}#"${String(scenarioName ?? '')}"`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/ids.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (no regression).

- [ ] **Step 6: Commit**

```bash
git add viewer/lib/ids.js test/ids.test.js
git commit -m "feat(ids): pure capability-rooted locator IDs"
```

---

## Task 2: Clipboard IPC + `idChip` helper + CSS

**Files:**
- Modify: `desktop/main/ipc.js` (electron import line 1; add one handler inside `registerIpc()`)
- Modify: `desktop/preload.cjs` (add one method)
- Create: `desktop/renderer/idchip.js`
- Modify: `desktop/renderer/styles.css` (append `.idchip` rules)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `window.karto.copy(text): Promise<{ok:true}>`; `idChip(idText): HTMLElement` (a `<span class="idchip">` that copies `idText` on click).

This is plumbing — no unit test (the helper touches the DOM + IPC). Verified by `node --check` + full suite + a console smoke in Step 5.

- [ ] **Step 1: Add the clipboard handler in `desktop/main/ipc.js`**

Change the electron import (line 1) from:

```javascript
import { ipcMain, dialog, BrowserWindow, app } from 'electron';
```

to:

```javascript
import { ipcMain, dialog, BrowserWindow, app, clipboard } from 'electron';
```

Then, inside `registerIpc()` (anywhere among the other `ipcMain.handle` calls — e.g. right after the `save-layout` handler), add:

```javascript
  ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text ?? '')); return { ok: true }; });
```

- [ ] **Step 2: Expose `copy` in `desktop/preload.cjs`**

Add this line to the `karto` object (e.g. after `saveLayout`):

```javascript
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
```

- [ ] **Step 3: Create `desktop/renderer/idchip.js`**

```javascript
// A subtle, monospace chip showing an item's locator ID. Clicking it copies the full
// ID to the clipboard (via window.karto.copy) and briefly flashes. Its pointer/click
// handlers stopPropagation so clicking it never starts a map drag or toggles a tree row.
export function idChip(idText) {
  const el = document.createElement('span');
  el.className = 'idchip';
  el.textContent = idText;
  el.title = 'Click to copy ID';
  el.onpointerdown = (e) => e.stopPropagation();
  el.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await window.karto.copy(idText);
      el.classList.add('copied');
      setTimeout(() => el.classList.remove('copied'), 1000);
    } catch { /* best-effort copy */ }
  };
  return el;
}
```

- [ ] **Step 4: Append `.idchip` CSS to `desktop/renderer/styles.css`**

```css
/* Copyable locator IDs */
.idchip { font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #6b7280; background: #1b1e24; border: 1px solid #2a2f37; border-radius: 4px; padding: 0 5px; cursor: pointer; white-space: nowrap; user-select: none; }
.idchip:hover { color: #c2c7d0; border-color: #3a4150; }
.idchip.copied { color: #34d399; border-color: #34d399; }
```

- [ ] **Step 5: Verify**

Run: `node --check desktop/main/ipc.js && node --check desktop/preload.cjs && node --check desktop/renderer/idchip.js`
Expected: no output (all parse).

Run: `npm test`
Expected: PASS (202 tests; only renderer/main files + CSS touched).

Manual (headless cannot launch the GUI): note in the report that the GUI copy smoke is deferred to a human — verified plumbing via `node --check` + suite. (A human can later confirm in the app's devtools console: `await window.karto.copy('hello')` returns `{ok:true}` and the clipboard holds `hello`.)

- [ ] **Step 6: Commit**

```bash
git add desktop/main/ipc.js desktop/preload.cjs desktop/renderer/idchip.js desktop/renderer/styles.css
git commit -m "feat(desktop): clipboard IPC + copyable idChip helper"
```

---

## Task 3: Place ID chips in Map and Tracking

**Files:**
- Modify: `desktop/renderer/views/map.js`
- Modify: `desktop/renderer/views/tracking.js`

**Interfaces:**
- Consumes: `contextId`/`capabilityId`/`featureId`/`scenarioId` from `../../../viewer/lib/ids.js` (Task 1); `idChip` from `../idchip.js` (Task 2).

Renderer UI — no unit test. Verified by `node --check` + full suite + a manual GUI checklist.

- [ ] **Step 1: Map — add imports**

At the top of `desktop/renderer/views/map.js`, after the existing
`import { autoPlaceGrouped, boundsForGroups } from '../../../viewer/lib/layout.js';` line, add:

```javascript
import { contextId, capabilityId } from '../../../viewer/lib/ids.js';
import { idChip } from '../idchip.js';
```

- [ ] **Step 2: Map — chip on each capability node**

In the capability-node loop, immediately after the line that sets `node.innerHTML = ...` (the
`<strong>…</strong><span>…</span>` line), add:

```javascript
    node.appendChild(idChip(capabilityId(cap.slug)));
```

- [ ] **Step 3: Map — chip on each context label**

In `drawContainers()`, immediately after the line `label.textContent = contextName[ctx] || ctx;`, add:

```javascript
      label.appendChild(idChip(contextId(ctx)));
```

- [ ] **Step 4: Tracking — add imports**

At the top of `desktop/renderer/views/tracking.js`, after the existing
`import { scenarioProgress } from '../../../workflows/lib/gherkin.js';` line, add:

```javascript
import { contextId, capabilityId, featureId, scenarioId } from '../../../viewer/lib/ids.js';
import { idChip } from '../idchip.js';
```

- [ ] **Step 5: Tracking — chips on tree rows**

In `drawTree()`:

(a) Immediately after the context `head.innerHTML = ...` assignment (the chevron + `fb-ctx-name` + `bt-meta` line), add:

```javascript
      head.appendChild(idChip(contextId(ctx.context)));
```

(b) Immediately after the capability `lbl.innerHTML = ...` assignment, add:

```javascript
        lbl.appendChild(idChip(capabilityId(cap.capability)));
```

(c) Immediately after the feature `fb.innerHTML = ...` assignment, add:

```javascript
            fb.appendChild(idChip(featureId(cap.capability, f.feature)));
```

- [ ] **Step 6: Tracking — chips in the detail**

In `render()`:

(a) Immediately after the feature-card `fhead.innerHTML = ...` assignment, add:

```javascript
      fhead.appendChild(idChip(featureId(state.capability, f.file)));
```

(b) Immediately after the scenario `se.innerHTML = ...` assignment (and before the `const cur = scenarioProgress(...)` line), add:

```javascript
        se.querySelector('.fb-scn-name').appendChild(idChip(scenarioId(state.capability, f.file, s.name)));
```

- [ ] **Step 7: Verify**

Run: `node --check desktop/renderer/views/map.js && node --check desktop/renderer/views/tracking.js`
Expected: no output (both parse).

Run: `npm test`
Expected: PASS (202 tests; only renderer files touched).

- [ ] **Step 8: Manual verification (human, on a display — cannot be done headless)**

`cd desktop && npm start`, open a project. Expected:
- **Map:** each capability node shows its slug as a small monospace chip; each context region label shows its context slug as a chip. Clicking a chip copies the ID (chip flashes green) and does NOT start a drag. Dragging the node/region still works when started off the chip.
- **Tracking tree:** context, capability, and feature rows each show an ID chip; clicking copies (flash) without toggling/selecting the row.
- **Tracking detail:** each feature card header shows `<capability>/<file>`; each scenario row shows `<capability>/<file>#"<name>"`. Clicking copies the full locator.
- Paste-check: after clicking a scenario chip, the clipboard holds e.g. `authentication/sign-in.feature#"user signs in"`.

- [ ] **Step 9: Commit**

```bash
git add desktop/renderer/views/map.js desktop/renderer/views/tracking.js
git commit -m "feat(desktop): show copyable IDs in Map and Tracking"
```

---

## Self-Review Notes

- **Spec coverage:** ID format in a pure tested module (Task 1); capability-rooted formats incl. scenario quoting + missing-part coercion (Task 1 tests); clipboard via Electron + `window.karto.copy` (Task 2 Steps 1-2); shared `idChip` with copy + flash + stopPropagation (Task 2 Step 3 + CSS Step 4); Map context + capability placement (Task 3 Steps 2-3); Tracking tree context/capability/feature (Step 5) + detail feature-card + scenario (Step 6); no persisted data / no schema/tag-model/serve.js/viewer change (Global Constraints).
- **Out of scope (per spec):** persisted/short/positional IDs; scenario/feature IDs on the Map; any schema/`.feature`/serve.js/viewer change; deferred polish items.
- **Type consistency:** `idChip(idText)` returns an `HTMLElement` appended via `appendChild` at every placement. ID functions take `(slug)` / `(capSlug, file)` / `(capSlug, file, name)` and are called with `cap.slug` (map), `ctx`/`cap.capability`/`f.feature` (tracking tree), and `state.capability`/`f.file`/`s.name` (tracking detail) — matching the data each scope holds. `window.karto.copy` (preload) ↔ `clipboard:write` (ipc handler).
