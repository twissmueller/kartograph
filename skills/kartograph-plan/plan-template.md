---
capability: <capability directory name under features/; a nested one as its leaf slug, or the slash-joined path when that slug occurs twice>
features: [<feature-name>.feature]
stack: <stack name from docs/code-design/stack.md>
status: planned
date: <YYYY-MM-DD>
supersedes: <plans/<earlier file>.md, or none>
---

<!-- A plan kartograph-revise writes adds one last frontmatter line after supersedes,
     revision: kartograph/YYYY-MM-DD-HHMM-slug.revision.md, and marks every task the
     revision rewrote or added with a line **Revised:** changed or **Revised:** added
     below the task's first field lines, all its checkboxes unticked. Every other task
     keeps the checkboxes it had in the superseded plan. validate-plan.js checks that. -->

# Plan: <capability title>

**Goal:** <One sentence: what is real when every ring is done.>

**Follows:** `docs/code-design/code-design.md`, `docs/code-design/design-system.md` and
`docs/code-design/build-design.md`. This plan cites them; it does not restate them. Every
name below (the presentation model, the ports, the doubles, the composition root, the test
targets, the build commands) is the one those documents give it.

## Screens

| screen | feature | scenarios served | controls named by the steps |
|---|---|---|---|
| <ScreenName> | <feature-name>.feature | <scenario>; <scenario> | <control>, <control> |

## Layer map

| scenario | feature | layers crossed | entry point |
|---|---|---|---|
| <scenario name> | <feature-name>.feature | <the layers as code-design.md names them, e.g. use case · repository · persistence · HTTP · server> | <screen and control> |

## Reuse and new

- **Reused:** <existing types, modules, endpoints, with paths>
- **New in the capability's module or folder:** <what>
- **New in the shared core:** <what, and which second capability will use it>
- **New in the server:** <routes, or none>

## Ports and adapters

```
// the ports the core declares, in the stack's language, exact signatures; later tasks compile against these
<port name> — <exact signature>
<port name> — <exact signature>
```

| port | adapter | where | ring |
|---|---|---|---|
| `<port>` | `<ring-1 double>` → `<ring-2 implementation>` | `<path>` → `<path>` | 1 → 2 |
| `<port>` | `<demo adapter>` → `<real adapter and its constructor>` | `<path>` | 2 → 3 |
| `<data source or endpoint>` | `<the adapter that fulfils it>` | `<path>` | 3 |

## Files

- Create: `<exact path>` — <one responsibility>
- Modify: `<exact path>` — <what changes>
- Test: `<exact path>`

## Global constraints

- <one line each, copied from the stack documents, e.g. a rule about state shape, error types or theme tokens>

## Ring 1: Screens

### Task 1.1: <ScreenName>

**Screen:** <ScreenName> — `<feature-name>.feature`
**Scenarios:** <scenario name>; <scenario name>

**Interfaces:**
- Consumes: <exact signatures from earlier tasks, or "nothing">
- Produces: <exact signatures later tasks rely on: the state contract, the ports, the presentation model>

- [ ] **Step 1: State contract**

```
…
```

- [ ] **Step 2: Ports the screen needs**

```
…
```

- [ ] **Step 3: Presentation model**

```
…
```

- [ ] **Step 4: Fakes and sample data (every Given of the listed scenarios)**

```
…
```

- [ ] **Step 5: Screen and views**

```
…
```

- [ ] **Step 6: Binding in the composition root, route, navigation entry**

```
…
```

- [ ] **Step 7: Compile and see**

Run: `<the stack's build command for the capability and its fast-loop target>`
Expected: <the build's success line>. If a live window is connected (a hot-reload desktop
window, a simulator, a browser): each listed scenario's `Then` is visible at <where>.

- [ ] **Step 8: Commit**

```bash
git add <paths>
git commit -m "screens(<capability>): <ScreenName>"
```

## Ring 2: Domain

### Task 2.1: <Scenario name exactly as in the feature file>

**Scenario:** `<feature-name>.feature` — <scenario name>
**Layers:** <the ring-2 layers this scenario crosses, as code-design.md names them>

**Interfaces:**
- Consumes: <from ring 1 and earlier ring-2 tasks>
- Produces: <the implementation's signature, the port members it adds>

- [ ] **Step 1: Outer test (presentation model, Given/When/Then, fakes behind the ports)**

```
<one test named after the scenario, in the stack's test framework>
```

- [ ] **Step 2: Run it, expect failure**

Run: `<the stack's command for this test>`
Expected: FAIL — <the reason>

- [ ] **Step 3: <Layer> — failing test**

```
…
```

- [ ] **Step 4: Run it, expect failure**

Run: `…`
Expected: FAIL — <reason>

- [ ] **Step 5: <Layer> — minimal implementation**

```
…
```

- [ ] **Step 6: Run it, expect pass**

Run: `…`
Expected: PASS

<!-- repeat steps 3–6 for every further layer the scenario crosses -->

- [ ] **Step N-2: Rebind in the composition root (fake → implementation; the demo binding stays behind the demo flag)**

```
…
```

- [ ] **Step N-1: Outer test passes; see it on screen**

Run: `<the stack's command for the capability's tests>`
Expected: PASS. If a live window is connected: the scenario's `Then` is visible at <where>.

- [ ] **Step N: Commit**

```bash
git add <paths>
git commit -m "domain(<capability>): <scenario name>"
```

## Ring 3: Adapters

### Task 3.1: <Port or endpoint, e.g. the tasks port over the database and the API>

**Adapter:** `<adapter type>` — `<path>`
**Port:** `<port>` (ring 2, task 2.N)

**Interfaces:**
- Consumes: <the port's signature; shared helpers>
- Produces: <the adapter's constructor signature; new endpoints>

- [ ] **Step 1: Adapter test — failing (the double build-design.md names for this layer)**

```
…
```

- [ ] **Step 2: Run it, expect failure**

Run: `…`
Expected: FAIL — <reason>

- [ ] **Step 3: Data source, mapping, adapter — minimal implementation**

```
…
```

- [ ] **Step 4: Run it, expect pass**

Run: `…`
Expected: PASS

- [ ] **Step 5: Rebind in the composition root (demo → real; demo stays behind the demo flag)**

```
…
```

- [ ] **Step 6: Whole suite and every target**

Run: `<the stack's full test and build command>`
Expected: PASS; every enabled target (and the server, if any) builds.

- [ ] **Step 7: Commit**

```bash
git add <paths>
git commit -m "adapters(<capability>): <port or endpoint>"
```

## Friction

- **<Scenario name>** — <why it cannot be built as written; what a person has to decide>

Or: `None`.

## Gaps

- <what the project cannot provide: a service, a credential, an answer — and who can>

Or: `None`.
