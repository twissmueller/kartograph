---
description: Walk a person through Developed scenarios one at a time and record what they Accept — the acceptance step.
---

Walk the **Developed** scenarios of the current project past a real person, in front of the
running system, and record their verdict. This is the acceptance step: it is the only way a
scenario becomes **Accepted**, the map's core claim that a behaviour is real.

**Scope** from `$ARGUMENTS`:
- empty → the whole map;
- `context:<slug>` → only capabilities in that context;
- `<capability-slug>` → only that capability.

**Tone (binding).** You are guiding a possibly non-technical stakeholder through their product.
Read each scenario in **plain domain language, exactly as written**. Never paraphrase a step
into tech-speak, never mention files, endpoints, databases, status codes, or code. If a step
is unclear, read it again verbatim — do not "translate" it.

## Steps

1. **List what is walkable.** Run the deterministic lister for Developed scenarios:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/list-tracking.js" . developed
   ```

   It prints a JSON array of `{ context, capability, feature, scenario, state, class, note? }`.
   Filter it to the scope from `$ARGUMENTS` (match `context` for `context:<slug>`, or
   `capability` for a capability slug). If the filtered list is **empty**, tell the user there
   is **nothing to walk** in this scope and stop.

2. **Ask them to start their app.** This command does not manage the app's lifecycle. Ask the
   user to start their application however they normally do (suggest their run script if you
   know it). Offer `/karto-show` if they want the live map open alongside. Wait until they
   confirm the app is running.

3. **Walk one scenario at a time.** For each scenario in the filtered list, in order:
   - Announce it as: **capability · feature · scenario name**.
   - Read the scenario's **Given / When / Then** steps **verbatim** from its `.feature` file
     (in `features/<context>/<capability>/<feature>`). Plain language only.
   - If the entry carries a `note`, mention briefly that this scenario previously had friction
     (show the note's `reason`) so they know what to look for.
   - Ask exactly: **Pass / Fail / Skip?**

   Then, based on their answer:
   - **Pass** → mark it Accepted:

     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/set-tracking.js" . <context> <capability> <feature> "<scenario>" accepted
     ```

   - **Fail** → ask **one** short question: *"What went wrong?"* Then record the failure,
     leaving the scenario Open with the reason attached:

     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/set-tracking.js" . <context> <capability> <feature> "<scenario>" open --reason "<their answer>" --source walk
     ```

   - **Skip** → write nothing; move on.

   Every state change flows through `set-tracking.js` — never edit `.kartograph/kartograph.json`
   or any `.feature` file yourself during a walk.

4. **Summarise.** When the list is exhausted, report:
   - counts: **accepted / failed / skipped**;
   - the **failed** scenarios with their recorded reasons;
   - for every capability that had at least one failure, suggest running
     `/karto-build <capability>` to address it.
