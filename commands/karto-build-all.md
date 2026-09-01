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

2a. **Read the automation policy** — the workflow cannot touch the filesystem, so it has to be
   passed in: `node ${CLAUDE_PLUGIN_ROOT}/scripts/automation.js . get`. Only two of its steps
   apply to the autonomous part, because build-all never asks mid-run: `acceptance-suite` (how
   much of the outer loop each subagent runs) and `commit`. `walk-after-build` applies at the
   very end, in step 6. The rest are ignored.

3. **Run the orchestrator workflow** via the **Workflow** tool:
   - `scriptPath: ${CLAUDE_PLUGIN_ROOT}/workflows/internal/build-all.js`
   - `args: { "plan": <the plan JSON>, "projectRoot": ".", "pluginRoot": "${CLAUDE_PLUGIN_ROOT}", "automation": <the automation policy JSON from step 2a> }`
   Each capability builds in its own subagent/context window, sequentially, dependencies first; a
   capability whose dependency failed is skipped. The subagents mark passing scenarios **Developed**
   via `scripts/set-tracking.js`, and commit their own work unless the policy's `commit` step says
   `manual`.

4. **Reconcile + validate.** Run
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/reconcile.js .kartograph/kartograph.json` to recompute derived
   blocks and re-validate the map (atomic write). If it fails, surface the errors.

5. **Report**, grouped by outcome, from the workflow result:
   - **Built** — capability + scenarios now Developed.
   - **Partial** — capability + scenarios left open, with reasons.
   - **Failed** — capability + reason.
   - **Skipped (blocked)** — capability + which failed dependency blocked it.
   - **Skipped (empty)** — capability has no charted scenarios.

6. **Hand off to the walk**, honouring `walk-after-build` from the policy you read in step 2a.
   Build-all runs without questions, but a *walk* is a conversation with a person, so it happens
   after the autonomous part is over, not inside it:
   - `auto` (the default) → continue into **`/karto-walk`**, scoped to what you just built, and
     say so: it opens their app and drives each new scenario in front of them, asking after each
     one whether it was implemented correctly.
   - `manual` → close with: "Walk the Developed scenarios and mark them **Accepted** on the Board
     once confirmed."

