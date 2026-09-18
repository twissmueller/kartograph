---
name: kartograph-screens
description: Use when a capability has a plan under plans/ and the person wants to see and use its screens in the app before any real behaviour exists — ring 1, on fakes with sample data. Also use to rebuild the screens after the plan was superseded. Takes the capability named, else the newest planned plan.
---

# Kartograph Screens

Execute ring 1 of a capability's plan: the screens, view models, use case interfaces and
fake use cases with sample data, so every scenario can be walked in the running app and
the person can judge the flow before anything real is built. Read, execute, verify,
commit, push, report. **Fully automated: ask nothing, wait for nothing.** The plan sets
the scope: the newest `planned` file under `plans/` for the capability named, else the
newest overall; none means stop and say that `kartograph-plan` runs first.

## Hard rules

- **Ring 1 only.** No real use cases, no repositories, no database, no network, no
  server, no unit tests. Those are rings 2 and 3.
- **The plan is the contract, the code is the truth.** Follow the ring-1 tasks' steps as
  written; where the code contradicts a step, keep the step's intent, take the smallest
  correction, report the deviation. The plan's only edit is its checkboxes.
- **Follow the project's `docs/code-design/`** documents (`design-system.md`,
  `code-design.md`). Every unit is named as they name it; every view reads theme tokens
  only. Vocabulary comes from
  `knowledge/`; a word in any `aliases_to_avoid` never appears in code or on screen.
- **Never invent behaviour.** What a scenario does not state is not built; an open
  question in `capability.md` shows nothing on screen.
- **Never scaffold, never launch.** No build means stop. The app is started by the
  person; you only look through a live window when one is connected (a hot-reload desktop
  window, a simulator through a screen-control tool, a browser through its automation
  tools) and reload only where the runtime offers it.
- **Stay in scope.** The capability's module or folder, the wiring the plan names (the
  build files, the composition root, the navigation registration), the theme entry point
  `design-system.md` names when missing, and the plan's checkboxes. Never `intents/`,
  `knowledge/`, `features/`, `walks/`, other features' modules or the plan's content.
- Re-running on unchanged input changes nothing.

## 1. Read

The plan in full; then what it cites: the `.feature` files, the `knowledge/` bundle, the
three documents in `docs/code-design/`, the build files, the shared code and any code that
exists for the capability. Say in one line which plan you are executing.
Review the ring-1 tasks against the code as it is now; a plan that no longer matches its
scenarios is reported and not executed.

## 2. Execute ring 1, task by task

Each ring-1 task is one screen. Follow its steps: the state contract, the ports the
screen needs, the presentation model, the fakes and sample data, the screen and its views,
the binding in the composition root and the route and navigation entry, then compile and
see. Every control and outcome a scenario names
gets the scenario's own words as its text or content description, so a person and a
semantic tree can find it. Loading, empty and error are states of the screen. If
the theme entry point `design-system.md` names does not exist yet, create it exactly as
that document describes. Tick each step's checkbox as you complete it.

**See it.** Compile the capability and the fast-loop target `build-design.md` names. If a
live window is connected, look: through Compose Hot Reload (`reload`, `get_ui_error`,
`get_semantic_tree`, `take_screenshot`) for a desktop window, through a screen-control
tool for a simulator or device, through a browser's automation tools for a web UI; check
each listed scenario's `Then` is visible where a person would look. A rendering error or a
missing outcome means the slice is not wired, so fix and look again. No window: compiling
is the evidence, and the report says so.

## 3. Verify, commit, push, report

Every enabled target builds. Check the diff: only in-scope paths changed, no `.feature`
touched, no raw colour or size literal in a view, nothing in the state the stack's
contract forbids, no test files. Stage what
you wrote plus the plan, commit as `screens: <capability>`, push to the branch's
upstream; no git or no upstream, skip and say so. Report the screens and where each lives,
the scenarios the person can now walk and what to click, what the sample data contains,
every deviation from the plan, and one line saying what the surface you looked at proves
(a desktop window or a browser proves the shared UI only; a simulator proves that platform)
and that `kartograph-walk` can now run. Then you are done.
