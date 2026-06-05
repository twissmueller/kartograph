---
description: Implement a capability's open scenarios with double-loop TDD — Gherkin outer loop, unit-test inner loop — then re-derive its maturity.
---

Build the capability named in `$ARGUMENTS` by implementing its **open** scenarios (those not
yet tagged `@done`) with **double-loop, outside-in TDD**.

1. **Load project config.** Read `kartograph/config.json` (`language`, `testCommand`,
   `acceptanceCommand`, `codeDir`, `stepDefinitions`). If it does not exist, tell the user to
   copy the template and fill it in, then stop:
   `cp ${CLAUDE_PLUGIN_ROOT}/kartograph/config.example.json kartograph/config.json`

2. **Find open scenarios.** Locate the capability in `kartograph.json` to get its context, then
   read `features/<context>/<capability>/*.feature`. The open scenarios are those **not** tagged
   `@done`. Work them in order: `@happy` → `@edge` → `@error` (this walks the maturity ladder).

3. **For each open scenario, run the double loop:**
   - **Outer loop (acceptance):** run the scenario via `acceptanceCommand` and **watch it fail**.
   - **Inner loop (unit):** use the **`superpowers:test-driven-development`** skill to drive the
     implementation unit by unit — write a failing unit test, watch it fail, minimal code to
     pass, refactor while green (the Iron Law: no production code without a failing test you
     saw fail). Repeat until the **outer** scenario passes.
   - Tag the now-passing scenario `@done` in its `.feature` file. Commit.

4. **Re-derive maturity.** After scenarios close, run
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/reconcile.js` so the capability's maturity recomputes
   from the now-tagged, passing scenarios, then suggest `/karto-show` to watch it climb.

5. Stop when all open scenarios for the capability are `@done`, and report what moved.
