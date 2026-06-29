---
description: Autonomously build every open scenario in a scope — one capability per subagent, in dependency order, each left at Developed for you to Accept.
---

Autonomously build the open scenarios in the scope given by `$ARGUMENTS`, with **no questions**.
Scope: empty = the whole map; `context:<slug>` = one context; `<capability-slug>` = that
capability and everything it transitively depends on. Each scenario is taken to **Developed**;
**Accepted** stays your call after you walk it. This is a large autonomous operation that spawns
one build subagent per capability — invoking the command is your opt-in.

1. **Compute the plan (deterministic).** Run
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/build-plan.js . "$ARGUMENTS"` and capture the JSON. Print a
   short human summary: how many capabilities and scenarios will build, in what order, and which
   capabilities are skipped because they have no charted scenarios (suggest `/karto-explore` for
   those). Proceed immediately — do **not** ask for confirmation.

2. **Stop early if empty.** If `order` is empty, report "nothing to build in this scope" (plus any
   `skippedEmpty`) and stop.

3. **Run the orchestrator workflow** via the **Workflow** tool:
   - `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/internal/build-all.js`
   - `args: { "plan": <the plan JSON>, "projectRoot": ".", "pluginRoot": "${CLAUDE_PLUGIN_ROOT}" }`
   Each capability builds in its own subagent/context window, sequentially, dependencies first; a
   capability whose dependency failed is skipped. The subagents mark passing scenarios **Developed**
   via `scripts/set-tracking.js` and commit their own work.

4. **Reconcile + validate.** Run
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/reconcile.js .kartograph/kartograph.json` to recompute derived
   blocks and re-validate the map (atomic write). If it fails, surface the errors.

5. **Report**, grouped by outcome, from the workflow result:
   - **Built** — capability + scenarios now Developed.
   - **Partial** — capability + scenarios left open, with reasons.
   - **Failed** — capability + reason.
   - **Skipped (blocked)** — capability + which failed dependency blocked it.
   - **Skipped (empty)** — capability has no charted scenarios.
   Close with: "Walk the Developed scenarios and mark them **Accepted** on the Board once confirmed."
