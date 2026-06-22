# Desktop Board Acceptance-Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop Board's four-column Kanban with a collapsible `context → capability → feature → scenario` tree where each scenario's state is set with a segmented control (Open/WIP/Developed/Accepted) and features/capabilities/contexts show derived acceptance roll-ups.

**Architecture:** A new pure, unit-tested `buildAcceptanceTree` helper in `viewer/lib/board.js` groups the flat `scenarios` list (already returned by `readBoard()`) into an ordered tree with per-node counts and a derived status. The renderer `desktop/renderer/views/board.js` is rewritten to render that tree, with state changes flowing through the existing `setBoardProgress` IPC. No new IPC, no tag-model/schema/serve.js/viewer change.

**Tech Stack:** Vanilla ESM JavaScript (no framework, no build step), Node built-ins, `node:test`. Reuses the existing `window.karto.readBoard` / `window.karto.setBoardProgress` IPC.

## Global Constraints

- **No build step, no framework.** Vanilla ESM JavaScript, Node built-ins + existing deps only. (CLAUDE.md)
- **ESM everywhere** (`"type": "module"`). Renderer modules load as `type="module"`.
- **No tag-model change.** Progress values stay `open`/`wip`/`test`/`done`; the desktop labels Open/WIP/Developed/Accepted are presentational only. Do NOT change `gherkin.js`, `board-data.js`, `serve.js`, the schema, or the browser viewer.
- **Feature/capability/context "Done" is derived, never stored.** No feature-level tag.
- **Pure-function + thin-caller split.** Roll-up/grouping logic is a pure exported function in `viewer/lib/board.js`, unit-tested; the renderer only renders. (CLAUDE.md)
- **Tests gate the pure layer only.** The new helper gets `node:test` coverage; the renderer is verified by running the app. (CLAUDE.md)
- **Tests run with** `npm test` (alias for `node --test`) from the repo root; tests live in `test/*.test.js`.
- **State→progress mapping (exact):** Open=`open`, WIP=`wip`, Developed=`test`, Accepted=`done`.
- **Status values (exact):** `'untouched'` | `'progress'` | `'done'`.

---

## File Structure

- **Modify** `viewer/lib/board.js` — add the pure `buildAcceptanceTree(scenarios, { contexts, capabilities })`.
- **Modify** `test/board.test.js` — add `node:test` cases for `buildAcceptanceTree`.
- **Rewrite** `desktop/renderer/views/board.js` — render the collapsible tree + segmented controls + roll-ups; writes via `setBoardProgress`.
- **Modify** `desktop/renderer/styles.css` — board-tree, segmented control, status dots, chevrons, path-tag markers. (The old `.board`/`.board-col`/`.card*` rules may remain unused; leave them — out of scope to prune.)

---

## Task 1: Pure `buildAcceptanceTree` helper

**Files:**
- Modify: `viewer/lib/board.js` (add one exported function at the end)
- Test: `test/board.test.js` (add cases; existing import line adds the new symbol)

**Interfaces:**
- Consumes: nothing new (pure).
- Produces:
  `buildAcceptanceTree(scenarios, { contexts, capabilities }) -> { contexts: ContextNode[] }` where
  - `scenarios[]` items are `{ context, capability, capabilityName, feature, featureName, name, class, progress }` (the shape `readBoard()` returns).
  - `contexts` arg = `[{ context, name, color }]`; `capabilities` arg = `[{ capability, capabilityName, context }]` (both as `readBoard()` returns them).
  - `ContextNode` = `{ context, name, color, status, doneCount, total, capabilities: CapNode[] }` (`total` = #capabilities, `doneCount` = #capabilities whose status is `'done'`).
  - `CapNode` = `{ capability, name, status, doneCount, total, features: FeatureNode[] }` (`total` = #features, `doneCount` = #features whose status is `'done'`).
  - `FeatureNode` = `{ feature, featureName, status, accepted, total, scenarios: { name, class, progress }[] }` (`total` = #scenarios, `accepted` = #scenarios with `progress === 'done'`).
  - `status ∈ 'untouched' | 'progress' | 'done'` at every level, derived from the node's own scenarios: `done` when there is ≥1 scenario and all are `done`; `untouched` when there are no scenarios or every scenario is `open`; otherwise `progress`.

- [ ] **Step 1: Write the failing tests**

Append to `test/board.test.js`. First update the import on line 3 to add the new symbol:

```javascript
import { BOARD_COLUMNS, boardColumns, capabilityStatuses, groupByContext, buildAcceptanceTree } from '../viewer/lib/board.js';
```

Then append these tests at the end of the file:

```javascript
test('buildAcceptanceTree groups context -> capability -> feature -> scenarios with counts and status', () => {
  const scenarios = [
    { context: 'ws', capability: 'pm', capabilityName: 'Project Mgmt', feature: 'sign-in.feature', featureName: 'Sign in', name: 'user signs in', class: 'happy', progress: 'done' },
    { context: 'ws', capability: 'pm', capabilityName: 'Project Mgmt', feature: 'sign-in.feature', featureName: 'Sign in', name: 'bad password', class: 'error', progress: 'done' },
    { context: 'ws', capability: 'pm', capabilityName: 'Project Mgmt', feature: 'profile.feature', featureName: 'Profile', name: 'view', class: 'happy', progress: 'test' },
    { context: 'ws', capability: 'pm', capabilityName: 'Project Mgmt', feature: 'profile.feature', featureName: 'Profile', name: 'edit', class: 'edge', progress: 'open' },
  ];
  const contexts = [{ context: 'ws', name: 'Workspace', color: '#abc' }];
  const capabilities = [{ capability: 'pm', capabilityName: 'Project Mgmt', context: 'ws' }];
  const tree = buildAcceptanceTree(scenarios, { contexts, capabilities });

  assert.equal(tree.contexts.length, 1);
  const ctx = tree.contexts[0];
  assert.equal(ctx.context, 'ws');
  assert.equal(ctx.name, 'Workspace');
  assert.equal(ctx.color, '#abc');
  assert.equal(ctx.total, 1);          // one capability
  assert.equal(ctx.doneCount, 0);      // pm is not all-accepted
  assert.equal(ctx.status, 'progress');

  const cap = ctx.capabilities[0];
  assert.equal(cap.capability, 'pm');
  assert.equal(cap.name, 'Project Mgmt');
  assert.equal(cap.total, 2);          // two features
  assert.equal(cap.doneCount, 1);      // sign-in is done
  assert.equal(cap.status, 'progress');

  // features are sorted by filename ascending
  assert.deepEqual(cap.features.map((f) => f.feature), ['profile.feature', 'sign-in.feature']);
  const prof = cap.features.find((f) => f.feature === 'profile.feature');
  const sign = cap.features.find((f) => f.feature === 'sign-in.feature');
  assert.equal(sign.total, 2);
  assert.equal(sign.accepted, 2);
  assert.equal(sign.status, 'done');
  assert.equal(prof.total, 2);
  assert.equal(prof.accepted, 0);
  assert.equal(prof.status, 'progress'); // one 'test', one 'open' -> started but not done
  assert.deepEqual(prof.scenarios.map((s) => s.name), ['view', 'edit']); // scenario order preserved
});

test('buildAcceptanceTree: untouched when all scenarios open or none; done when all accepted', () => {
  const capabilities = [
    { capability: 'a', capabilityName: 'A', context: 'c1' },
    { capability: 'b', capabilityName: 'B', context: 'c1' },
    { capability: 'empty', capabilityName: 'Empty', context: 'c1' },
  ];
  const contexts = [{ context: 'c1', name: 'C1' }];
  const scenarios = [
    { context: 'c1', capability: 'a', capabilityName: 'A', feature: 'a.feature', featureName: 'A', name: 's1', class: 'happy', progress: 'open' },
    { context: 'c1', capability: 'b', capabilityName: 'B', feature: 'b.feature', featureName: 'B', name: 's1', class: 'happy', progress: 'done' },
  ];
  const tree = buildAcceptanceTree(scenarios, { contexts, capabilities });
  const ctx = tree.contexts[0];
  const a = ctx.capabilities.find((c) => c.capability === 'a');
  const b = ctx.capabilities.find((c) => c.capability === 'b');
  const empty = ctx.capabilities.find((c) => c.capability === 'empty');

  assert.equal(a.status, 'untouched');          // single open scenario
  assert.equal(b.status, 'done');               // single accepted scenario
  assert.equal(empty.status, 'untouched');      // no scenarios at all
  assert.equal(empty.total, 0);
  assert.equal(empty.features.length, 0);
  assert.equal(ctx.total, 3);                    // three capabilities
  assert.equal(ctx.doneCount, 1);               // only b
  assert.equal(ctx.status, 'progress');         // mix of done + open
});

test('buildAcceptanceTree orders contexts by the contexts list and puts unlisted contexts last', () => {
  const capabilities = [
    { capability: 'x', capabilityName: 'X', context: 'ghost' },
    { capability: 'y', capabilityName: 'Y', context: 'care' },
  ];
  const contexts = [{ context: 'care', name: 'Care' }];
  const tree = buildAcceptanceTree([], { contexts, capabilities });
  assert.deepEqual(tree.contexts.map((c) => c.context), ['care', 'ghost']);
  assert.equal(tree.contexts[1].name, 'ghost'); // falls back to the slug
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/board.test.js`
Expected: FAIL — `buildAcceptanceTree` is not exported (`buildAcceptanceTree is not a function` / import is `undefined`).

- [ ] **Step 3: Implement `buildAcceptanceTree`**

Append to `viewer/lib/board.js`:

```javascript
// Group the flat board `scenarios` into an ordered acceptance tree for the desktop board:
// context -> capability -> feature -> scenarios, with per-node counts and a derived status.
//   status: 'done'      — >=1 scenario and every scenario is 'done' (Accepted)
//           'untouched' — no scenarios, or every scenario is 'open'
//           'progress'  — otherwise
// `contexts` = [{ context, name, color }] and `capabilities` = [{ capability, capabilityName,
// context }] come straight from the board payload; iterating `capabilities` means empty
// capabilities (no scenarios) still appear. Pure — no DOM.
export function buildAcceptanceTree(scenarios, { contexts = [], capabilities = [] } = {}) {
  const statusOf = (scen) => {
    if (!scen.length) return 'untouched';
    const accepted = scen.filter((s) => s.progress === 'done').length;
    if (accepted === scen.length) return 'done';
    return scen.some((s) => s.progress && s.progress !== 'open') ? 'progress' : 'untouched';
  };

  // capability -> feature(filename) -> { feature, featureName, scenarios } (order preserved)
  const byCap = new Map();
  for (const s of scenarios || []) {
    if (!byCap.has(s.capability)) byCap.set(s.capability, new Map());
    const feats = byCap.get(s.capability);
    if (!feats.has(s.feature)) feats.set(s.feature, { feature: s.feature, featureName: s.featureName || s.feature, scenarios: [] });
    feats.get(s.feature).scenarios.push({ name: s.name, class: s.class, progress: s.progress || 'open' });
  }

  const ctxMeta = Object.fromEntries((contexts || []).map((c) => [c.context, c]));

  // capabilities grouped by context, preserving the capabilities-list order
  const capsByCtx = new Map();
  for (const cap of capabilities || []) {
    const key = cap.context ?? '';
    if (!capsByCtx.has(key)) capsByCtx.set(key, []);
    capsByCtx.get(key).push(cap);
  }
  const ctxOrder = [...new Set([...(contexts || []).map((c) => c.context), ...capsByCtx.keys()])]
    .filter((k) => capsByCtx.has(k));

  const outContexts = ctxOrder.map((ctxKey) => {
    const caps = capsByCtx.get(ctxKey).map((cap) => {
      const featMap = byCap.get(cap.capability) || new Map();
      const features = [...featMap.values()]
        .sort((a, b) => a.feature.localeCompare(b.feature))
        .map((f) => ({
          feature: f.feature,
          featureName: f.featureName,
          scenarios: f.scenarios,
          total: f.scenarios.length,
          accepted: f.scenarios.filter((s) => s.progress === 'done').length,
          status: statusOf(f.scenarios),
        }));
      const capScen = features.flatMap((f) => f.scenarios);
      return {
        capability: cap.capability,
        name: cap.capabilityName || cap.capability,
        features,
        total: features.length,
        doneCount: features.filter((f) => f.status === 'done').length,
        status: statusOf(capScen),
      };
    });
    const ctxScen = caps.flatMap((c) => c.features.flatMap((f) => f.scenarios));
    return {
      context: ctxKey,
      name: ctxMeta[ctxKey]?.name || ctxKey || 'Other',
      color: ctxMeta[ctxKey]?.color,
      capabilities: caps,
      total: caps.length,
      doneCount: caps.filter((c) => c.status === 'done').length,
      status: statusOf(ctxScen),
    };
  });

  return { contexts: outContexts };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/board.test.js`
Expected: PASS — all existing board tests plus the three new ones.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (no regression).

- [ ] **Step 6: Commit**

```bash
git add viewer/lib/board.js test/board.test.js
git commit -m "feat(board): pure buildAcceptanceTree helper for the desktop board"
```

---

## Task 2: Rewrite the desktop Board view as the acceptance tree

**Files:**
- Rewrite: `desktop/renderer/views/board.js`
- Modify: `desktop/renderer/styles.css` (append board-tree styles)

**Interfaces:**
- Consumes: `buildAcceptanceTree` (Task 1) from `../../../viewer/lib/board.js`; `tab.data.board` = `{ scenarios, capabilities, contexts }`; `tab.data.root`; `window.karto.setBoardProgress({ root, context, capability, feature, scenario, progress })`; `window.karto.readBoard(root)`.
- Produces: `renderBoard(container, tab)` (the export `app.js` already imports). Uses a per-tab `tab.boardCollapsed` Set of collapsed keys (`ctx:<context>` and `cap:<context>/<capability>`).

This is renderer UI — no unit test (repo convention). Verified by `node --check`, the full suite (no regression), and a manual reload.

- [ ] **Step 1: Rewrite `desktop/renderer/views/board.js`**

Replace the entire file with:

```javascript
import { buildAcceptanceTree } from '../../../viewer/lib/board.js';

// Desktop labels (presentational) over the stored progress values.
const STATES = [
  { progress: 'open', label: 'Open' },
  { progress: 'wip', label: 'WIP' },
  { progress: 'test', label: 'Developed' },
  { progress: 'done', label: 'Accepted' },
];

export function renderBoard(container, tab) {
  if (!tab.boardCollapsed) tab.boardCollapsed = new Set();
  const { scenarios, contexts, capabilities } = tab.data.board;
  const tree = buildAcceptanceTree(scenarios, { contexts, capabilities });

  container.innerHTML = '<div class="board-tree"></div>';
  const rootEl = container.querySelector('.board-tree');
  if (!tree.contexts.length) { rootEl.innerHTML = '<p class="muted">No capabilities yet.</p>'; return; }

  const collapsed = tab.boardCollapsed;
  const rerender = () => renderBoard(container, tab);

  async function setState(ref, progress) {
    try {
      await window.karto.setBoardProgress({ root: tab.data.root, ...ref, progress });
      tab.data.board = await window.karto.readBoard(tab.data.root);
      rerender(); // collapse state lives on tab, so it survives the re-render
    } catch (err) {
      alert('Could not update scenario: ' + (err && err.message || err));
    }
  }

  for (const ctx of tree.contexts) {
    const ctxKey = `ctx:${ctx.context}`;
    const ctxOpen = !collapsed.has(ctxKey);
    const ctxEl = document.createElement('section');
    ctxEl.className = 'bt-ctx';
    ctxEl.appendChild(header('bt-ctx-head', ctxOpen, ctx.name, ctx.status, `${ctx.doneCount}/${ctx.total} done`, () => {
      toggle(collapsed, ctxKey); rerender();
    }));
    if (ctxOpen) {
      for (const cap of ctx.capabilities) {
        const capKey = `cap:${ctx.context}/${cap.capability}`;
        const capOpen = !collapsed.has(capKey);
        const capEl = document.createElement('div');
        capEl.className = 'bt-cap';
        capEl.appendChild(header('bt-cap-head', capOpen, cap.name, cap.status, `${cap.doneCount}/${cap.total} done`, () => {
          toggle(collapsed, capKey); rerender();
        }));
        if (capOpen) {
          for (const feat of cap.features) capEl.appendChild(renderFeature(ctx, cap, feat, setState));
          if (!cap.features.length) {
            const none = document.createElement('div');
            none.className = 'bt-empty muted'; none.textContent = 'No scenarios';
            capEl.appendChild(none);
          }
        }
        ctxEl.appendChild(capEl);
      }
    }
    rootEl.appendChild(ctxEl);
  }
}

function renderFeature(ctx, cap, feat, setState) {
  const el = document.createElement('div');
  el.className = 'bt-feature';
  const head = document.createElement('div');
  head.className = 'bt-feat-head';
  head.innerHTML = `<span class="bt-name">${esc(feat.featureName)}</span>` +
    `<span class="bt-meta">${dot(feat.status)}<span class="bt-count">${feat.accepted}/${feat.total}</span></span>`;
  el.appendChild(head);
  for (const s of feat.scenarios) {
    const row = document.createElement('div');
    row.className = 'bt-scenario';
    row.innerHTML = `<span class="bt-tag class-${s.class || 'none'}" title="${esc(s.class || 'untagged')}"></span>` +
      `<span class="bt-name">${esc(s.name)}</span>`;
    const seg = document.createElement('span');
    seg.className = 'seg';
    for (const st of STATES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = st.label;
      if ((s.progress || 'open') === st.progress) b.className = 'active';
      b.onclick = () => setState({ context: ctx.context, capability: cap.capability, feature: feat.feature, scenario: s.name }, st.progress);
      seg.appendChild(b);
    }
    row.appendChild(seg);
    el.appendChild(row);
  }
  return el;
}

function header(cls, open, name, status, count, onToggle) {
  const h = document.createElement('div');
  h.className = cls;
  h.innerHTML = `<span class="bt-chevron">${open ? '▾' : '▸'}</span>` +
    `<span class="bt-name">${esc(name)}</span>` +
    `<span class="bt-meta">${dot(status)}<span class="bt-count">${esc(count)}</span></span>`;
  h.onclick = onToggle;
  return h;
}

function dot(status) { return `<span class="dot dot-${status}"></span>`; }
function toggle(set, key) { if (set.has(key)) set.delete(key); else set.add(key); }
function esc(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
```

- [ ] **Step 2: Append board-tree styles to `desktop/renderer/styles.css`**

```css
/* Board acceptance tree */
.board-tree { padding: 12px 16px; overflow: auto; height: 100%; }
.bt-ctx { margin-bottom: 14px; }
.bt-ctx-head, .bt-cap-head { display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
.bt-ctx-head { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #8a909a; margin: 8px 0 6px; }
.bt-cap-head { color: #e6e8ec; font-weight: 600; padding: 4px 0 4px 14px; }
.bt-chevron { width: 12px; color: #8a909a; font-size: 10px; }
.bt-meta { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }
.bt-count { color: #8a909a; font-size: 12px; }
.bt-feature { margin: 4px 0 8px 28px; }
.bt-feat-head { display: flex; align-items: center; gap: 8px; color: #c2c7d0; font-size: 13px; padding: 3px 0; border-bottom: 1px solid #23272f; }
.bt-scenario { display: flex; align-items: center; gap: 8px; padding: 4px 0 4px 8px; }
.bt-scenario .bt-name { flex: 1; font-size: 13px; }
.bt-tag { width: 8px; height: 8px; border-radius: 2px; background: #6b7280; flex: none; }
.bt-tag.class-happy { background: #34d399; }
.bt-tag.class-edge { background: #e0b341; }
.bt-tag.class-error { background: #ff6b6b; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; background: #6b7280; }
.dot-untouched { background: #6b7280; }
.dot-progress { background: #3a86ff; }
.dot-done { background: #34d399; }
.seg { display: inline-flex; border: 1px solid #3a4150; border-radius: 6px; overflow: hidden; flex: none; }
.seg button { background: #1b1e24; color: #c2c7d0; border: none; border-right: 1px solid #3a4150; padding: 3px 9px; font: inherit; font-size: 12px; cursor: pointer; }
.seg button:last-child { border-right: none; }
.seg button:hover { background: #262b33; }
.seg button.active { background: #3a86ff; color: #fff; }
.bt-empty { padding: 4px 0 4px 28px; font-size: 12px; }
```

- [ ] **Step 3: Syntax check**

Run: `node --check desktop/renderer/views/board.js`
Expected: no output (syntax OK).

- [ ] **Step 4: Run the full suite (no regression)**

Run: `npm test`
Expected: PASS (the renderer change is not unit-tested; this confirms nothing else broke).

- [ ] **Step 5: Manual verification (human, on a display — cannot be done headless)**

`cd desktop && npm start`, open a project, click **Board**. Expected:
- A `CONTEXT → capability → feature → scenario` tree; context and capability headers collapse/expand on click; collapse state persists while switching tabs/views (resets on app restart).
- Each scenario has an Open|WIP|Developed|Accepted segmented control with the current state highlighted; clicking a segment writes the `.feature` tag (verify on disk) and the feature/capability/context dots + counts update.
- A feature whose scenarios are all Accepted shows a green dot and `m/m`; a capability/context all-accepted shows green and `n/n done`.

- [ ] **Step 6: Commit**

```bash
git add desktop/renderer/views/board.js desktop/renderer/styles.css
git commit -m "feat(desktop): board acceptance tree with per-scenario state + roll-ups"
```

---

## Self-Review Notes

- **Spec coverage:** state model + label mapping (Task 2 `STATES`, Global Constraints); collapsible context→capability→feature→scenario tree (Task 2); segmented per-scenario control writing via existing `setBoardProgress` (Task 2 `setState`); derived feature/capability/context roll-ups with grey/blue/green dots + counts (Task 1 `buildAcceptanceTree` + Task 2 `dot`); empty-capability shown untouched (Task 1 iterates `capabilities`, tested; Task 2 "No scenarios"); per-tab in-memory collapse (Task 2 `tab.boardCollapsed`); reuse `readBoard`/`setBoardProgress`, no new IPC (Task 2); pure helper unit-tested, renderer not (Tasks 1/2, Global Constraints).
- **Out of scope (per spec), intentionally absent:** search/filter, hide-completed toggle, persisting collapse across restarts, manual feature-Done override, browser-viewer/serve.js/schema/tag changes.
- **Type consistency:** `status` values `untouched|progress|done` are produced in Task 1 and consumed by Task 2's `dot()`/CSS (`.dot-untouched|.dot-progress|.dot-done`). The `setBoardProgress` payload `{ root, context, capability, feature, scenario, progress }` matches the existing IPC handler.
