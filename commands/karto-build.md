---
description: Implement a capability's open scenarios with double-loop TDD — Gherkin outer loop, unit-test inner loop — then re-derive its maturity.
---

Build the capability named in `$ARGUMENTS` by implementing its **open** scenarios (those whose
tracking state is not yet **Accepted**) with **double-loop, outside-in TDD**. Everything build
needs lives in the map: `.kartograph/kartograph.json` and its `.feature` files. The only other
file Kartograph keeps is `.kartograph/kartograph.layout.json` (UI layout only), plus
`.kartograph/automation.json` — the automation policy the user set during `/karto-explore`,
which decides how much of this command runs without asking.

**Tracking state lives in the map, not in tags.** A scenario carries exactly one *path* tag in
its `.feature` file (`@happy`/`@edge`/`@error`, which drives maturity). Its *progress* —
**Open → Developed → Accepted** — is stored in `kartograph.json`'s `tracking` block,
keyed by scenario, and set with `node ${CLAUDE_PLUGIN_ROOT}/scripts/set-tracking.js` (or from
the viewer's Tracking board). Build moves scenarios to **Developed**; **Accepted** is the
user's call after they walk it.

**Build the whole vertical slice, not one layer.** A Kartograph scenario describes
*user-walkable* behaviour — a recognisable situation, a user action, a confirmable outcome —
so "built" means the user can walk that scenario **end-to-end through the real UI they
actually use**, not through one layer in isolation. If the system spans a frontend and a
backend (or an API, a worker, a CLI, persistence…), a scenario is **not** done until every
layer it touches is wired together and reachable from the entry point the user walks. Never
implement only the backend (or only the frontend) and then ask the user to test — they must
be able to confirm the outcome through the final interface, exactly as they would in
production. If a scenario genuinely needs more than one layer but you can only finish one this
session, say so plainly and **do not** mark it Developed or claim it is ready to test.

**Never edit a `.feature` file during build.** The map changes only through
explore/revise → chart, never from build. If a scenario cannot be implemented as written —
its `Then` is ambiguous, its `Given` is impossible to reach, or it contradicts another
scenario — do **not** force it and do **not** rewrite the scenario to make it buildable.
Instead: skip it, record the friction with
`node ${CLAUDE_PLUGIN_ROOT}/scripts/set-tracking.js <projectRoot> <context> <capability> <feature.feature> "<scenario>" open --reason "<friction>" --source build`,
then continue with the remaining scenarios. In the final report, list every friction you
recorded and point the user to `/karto-revise` to fix the spec (which then flows back through
`/karto-chart`). Recording friction is the correct outcome for an unbuildable scenario — a
forced or hand-edited `.feature` is not.

0. **Read the automation policy** before anything else, and obey it for the whole run — never
   substitute your own judgement about what is "worth" running:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/automation.js . show
   ```

   Three of its steps govern this command: `acceptance-suite` (how much of the outer loop runs),
   `commit` (whether finished scenarios are committed), and `walk-after-build` and `rewalk-check`
   (what happens when the build is done). If the build was reached from a specific survey, pass
   `--survey <survey>` so that survey's own stamp wins. Say in one line which policy you are
   working under, so the user can see why the full suite did or did not run.

1. **Find open scenarios.** Locate the capability in `.kartograph/kartograph.json` to get its
   context, then read `features/<context>/<capability>/*.feature`. The open scenarios are those
   whose tracking state in the map is **not Accepted** (Open or Developed). Work them in
   order: `@happy` → `@edge` → `@error` (this walks the maturity ladder).
   **Also read the prior frictions** for this capability: run
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/list-tracking.js <projectRoot> open` and inspect the
   `note` field on any entry — a `scenarioNotes` reason records *why* that scenario was left
   Open (a walk failure with `"source": "walk"`, or a build friction you or a prior session
   recorded with `"source": "build"`). Treat these notes as context for the implementation:
   they tell you what went wrong last time and what the user actually expects. Do not clear or
   ignore a note by hand — advancing the scenario to Developed clears it automatically.

2. **Learn how this project builds and tests itself.** Infer the unit-test runner, the
   acceptance/Gherkin runner (if any), and where source lives by inspecting the project itself —
   e.g. `package.json` scripts, a `Makefile`, `Cargo.toml`, `pyproject.toml`, or an existing
   `features/steps` directory. Use what the project already uses; do not introduce a new stack.
   **Also map every layer the scenario will cross** (frontend, backend/API, worker, persistence,
   CLI) and **the entry point the user walks** (the UI screen, the command) — this is the slice
   you must finish, and the surface through which the scenario gets confirmed.

3. **For each open scenario, run the double loop:**
   - **Outer loop (acceptance) — scoped by `acceptance-suite`:** run the scenario through the
     project's acceptance runner and **watch it fail**.
     - `scenario` (the default) → run **only the scenario being built**, selected by name or tag
       (e.g. the runner's `--name`/`-n`, `--tags`, or single-file argument). Do **not** run the
       whole suite; that is the user's call before a release, not this loop's job.
     - `full` → run the project's whole acceptance/e2e suite each time round the loop.
     - `off` → skip the outer run entirely; the inner unit tests are the only signal. Say so
       explicitly in the report, since the scenario has then never been executed as written.
     If the project has no acceptance runner at all, skip the outer run whatever the mode says
     and tell the user the acceptance loop is disabled.
   - **Inner loop (unit):** if the **`superpowers`** plugin is installed, use the
     **`superpowers:test-driven-development`** skill to drive the implementation unit by unit.
     Otherwise follow this condensed **Iron Law**: write a failing unit test and **watch it
     fail** before writing any production code; write only the minimal code needed to make it
     green; refactor while green; and never test mock behaviour — test the real thing. Either
     way, work through **every layer the scenario crosses** — when the backend behaviour is
     green, keep going and wire it up through to the user-facing entry point, so the outcome is
     reachable and confirmable from the real UI.
   - **Definition of done — the user can walk it.** Before marking the scenario **Developed**,
     confirm it is reachable end-to-end through the final interface (the actual UI screen /
     command the user uses), with all layers connected — not just the backend passing its own
     tests. When you ask the user to test, they must be able to confirm the `Then` outcome by
     walking the scenario in the running system, exactly as a non-technical stakeholder would.
     If only part of the slice is finished, leave the scenario as-is and tell the user what
     still needs wiring before it is testable.
   - Mark the now-passing scenario **Developed** in the map:
     `node ${CLAUDE_PLUGIN_ROOT}/scripts/set-tracking.js <projectRoot> <context> <capability> <feature.feature> "<scenario>" developed`.
     Leave it for the user to flip to **Accepted** once they've walked it. Then honour the
     `commit` mode: `auto` → commit the scenario's work now; `manual` → leave it in the working
     tree and say so, so the user can review and commit it themselves.

4. **Re-derive maturity.** After scenarios are built, run
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/reconcile.js` so the capability's maturity recomputes
   from its `.feature` path tags (`@happy`/`@edge`/`@error`) — maturity is independent of
   tracking state — then suggest `/karto-show` to watch it climb.

5. **Flag re-walk candidates — if `rewalk-check` is `auto`.** Building this capability may have
   changed behaviour that other capabilities **depend on**, so their already-**Accepted**
   scenarios could now be broken. Run
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/rewalk-candidates.js <projectRoot> <capability>`. If the
   JSON list is non-empty, list the affected scenarios grouped by capability and suggest running
   `/karto-walk <capability>` for each affected capability to re-confirm them. (This is direct
   dependents only — the map's dependency edges carry the information.) If the list is empty, say
   nothing changed downstream. If the mode is `manual`, skip the check and mention the script in
   one line instead of running it.

6. Stop when every open scenario for the capability is at least **Developed**, and report what
   moved (and which scenarios are now waiting on the user's Accept). Then honour
   `walk-after-build`: `auto` → say the automation policy walks them, and continue straight into
   **`/karto-walk <capability>`**; `manual` → stop, and tell them `/karto-walk <capability>` is
   how those scenarios become Accepted.
