---
description: Implement a capability's open scenarios with double-loop TDD — Gherkin outer loop, unit-test inner loop — then re-derive its maturity.
---

Build the capability named in `$ARGUMENTS` by implementing its **open** scenarios (those not
yet tagged `@done`) with **double-loop, outside-in TDD**. Everything build needs lives in the
map: `kartograph.json` and its `.feature` files. There is **no separate config** — the only
files Kartograph keeps are `kartograph.json` (the content) and `kartograph.layout.json` (UI
layout only).

1. **Find open scenarios.** Locate the capability in `kartograph.json` to get its context, then
   read `features/<context>/<capability>/*.feature`. The open scenarios are those **not** tagged
   `@done`. Work them in order: `@happy` → `@edge` → `@error` (this walks the maturity ladder).

2. **Learn how this project builds and tests itself.** Infer the unit-test runner, the
   acceptance/Gherkin runner (if any), and where source lives by inspecting the project itself —
   e.g. `package.json` scripts, a `Makefile`, `Cargo.toml`, `pyproject.toml`, or an existing
   `features/steps` directory. Use what the project already uses; do not introduce a new stack.

3. **For each open scenario, run the double loop:**
   - **Outer loop (acceptance):** run the scenario through the project's acceptance runner and
     **watch it fail**. If the project has no acceptance runner, skip the outer run and rely on
     the inner unit tests as the loop's signal — tell the user the acceptance loop is disabled.
   - **Inner loop (unit):** use the **`superpowers:test-driven-development`** skill to drive the
     implementation unit by unit — write a failing unit test, watch it fail, minimal code to
     pass, refactor while green (the Iron Law: no production code without a failing test you
     saw fail). Repeat until the **outer** scenario passes.
   - Tag the now-passing scenario `@done` in its `.feature` file. Commit.

4. **Re-derive maturity.** After scenarios close, run
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/reconcile.js` so the capability's maturity recomputes
   from the now-tagged, passing scenarios, then suggest `/karto-show` to watch it climb.

5. Stop when all open scenarios for the capability are `@done`, and report what moved.
