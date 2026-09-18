---
name: kartograph-domain
description: Use when a capability's screens exist on fakes (ring 1 done) and the person wants the real behaviour underneath — use case implementations, business rules, repository interfaces, scenario tests — while the data stays local. Ring 2 of the plan. Takes the capability named, else the newest planned plan.
---

# Kartograph Domain

Execute ring 2 of a capability's plan: replace the fake use cases with implementations,
declare the ports the core needs, put the business rules in, and prove every scenario
with a test, scenario by scenario, test first. The data stays in memory behind the demo
flag until ring 3. Read, execute, verify, commit, push, report. **Fully automated: ask
nothing, wait for nothing.** The plan sets the scope: the newest `planned` file under
`plans/` for the capability named, else the newest overall; none means stop and say that
`kartograph-plan` runs first. **Ring 1 must be complete:** every ring-1 checkbox ticked;
otherwise stop and say that `kartograph-screens` runs first.

## Hard rules

- **Ring 2 only.** No repository implementations over a database or network, no server,
  no platform capability implementations. Those are ring 3.
- **Test first, always.** No production code before a failing test that you watched fail
  for the right reason; minimal code to green; refactor while green. Never weaken a test
  or an assertion to fit the implementation.
- **Fakes over mocks.** No mocking library. `FakeXxxRepository` implements the port, is
  seeded through its constructor, exposes side-effect counters and an outcome knob, and
  lives in `commonTest`.
- **Never edit a `.feature` file.** A scenario that cannot be built as written is skipped
  and its friction recorded; never forced, never rewritten.
- **The plan is the contract, the code is the truth.** Follow the ring-2 tasks' steps as
  written; the smallest correction where the code contradicts a step, always reported;
  the plan's only edit is its checkboxes.
- **Follow `docs/code-design/code-design.md` and `build-design.md`.** Domain types match
  `knowledge/`'s canonical titles; a word the bundle does not have is a gap you report.
- **Stay in scope.** The feature module, `core/` (for `AppError`, `Resource`, `AppConfig`
  when missing) and the plan's checkboxes. Never `intents/`, `knowledge/`, `features/`,
  `walks/`, `server/`, other features' modules or the plan's content.
- Re-running on unchanged input changes nothing.

## 1. Read

The plan in full; the `.feature` files, the `knowledge/` bundle, `docs/code-design/`, the
feature module as ring 1 left it, `core/`, and the newest `walks/` file for the
capability. Say which plan you are executing. Review the ring-2 tasks against the code as
it is now; a plan that no longer matches its scenarios is reported and not executed.

## 2. Execute ring 2, task by task

Each ring-2 task is one scenario. **Outer loop:** its Step 1 is the scenario's test at the
ViewModel level against fake repositories; write it as given, run it, confirm it fails for
the reason the plan expects. A scenario that describes a rejection or an error asserts the
`AppError` and its recoverable/fatal classification. **Inner loop:** per layer step, the
failing test as given, run and see it fail, the minimal code as given, run and see it
pass, refactor while green: use case implementation, rule or validator, repository
interface, in-memory repository seeded from the ring-1 sample data. Then the Koin rebind
from the fake use case to the implementation, with the in-memory repository as the only
binding and behind the demo flag for later. Delete `presentation/fake/` once nothing
binds it. Tick each step's checkbox.

**See it.** When the outer test is green and a Compose Hot Reload window is connected:
`reload`, `get_ui_error`, `take_screenshot`; the scenario's `Then` is visible where a
person would look. No window: the green test and a compiling desktop target are the
evidence, and the report says so.

## 3. Verify, commit, push, report

Run the feature module's tests and the whole suite; build every enabled target. Check the
diff: only in-scope paths changed, no `.feature` touched, no fake left in production code,
no `Throwable` above the repository interface, no `List` in state, the scenario tests map
one to one onto the scenarios. Stage what you wrote plus the plan, commit as
`domain: <capability>`, push; no git or no upstream, skip and say so. Report the scenarios
proven and where each `Then` is reachable, the scenarios skipped with their friction,
every deviation from the plan, the ports ring 3 has to fulfil, and one line that
`kartograph-walk` can run now and `kartograph-adapters` next. Then you are done.
