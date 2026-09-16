---
name: kartograph-build
description: Use when a capability or feature under features/ has its screens (phase 1, on fakes) and a plan under plans/, and the person wants the real behaviour built underneath — use cases, repositories, database, API client, platform capabilities and the server — or when scenarios that failed a walk need implementing. Takes the capability named, else the newest planned plan.
---

# Kartograph Build

Make a capability real by executing its plan: replace its fakes with use cases,
repositories, data sources, a database, an API client, platform capabilities and the
server endpoints they need, task by task as `kartograph-plan` laid them out, test first.
Read, execute, verify, commit, push, report. **Fully automated: ask nothing, wait for
nothing.** The plan decides the scope: the newest `planned` file under `plans/` for the
capability named, or, when none was named, the newest `planned` file overall. No such
plan means stop and say that `kartograph-plan` runs first.

## Hard rules

- **Never edit a `.feature` file.** A scenario that cannot be built as written (ambiguous
  `Then`, unreachable `Given`, contradicts another) is left open with the friction recorded
  in the report, never forced and never rewritten.
- **Test first, always.** No production code before a failing test that you watched fail
  for the right reason. Minimal code to green, refactor while green. Never weaken a test
  or an assertion to fit the implementation.
- **Fakes over mocks; test the real thing.** No mocking library. A fake implements the
  production interface and is constructor-injected; the unit under test is the production
  class.
- **Build the whole vertical slice.** A scenario is done only when its `Then` is reachable
  through the UI the person uses, with every layer it crosses wired. Never finish the
  backend and ask the person to test.
- **Follow the project's `docs/code-design/mvvm.md`** and `build-design.md` in this file's
  directory. Vocabulary comes from `knowledge/`: domain types match its canonical titles
  one to one; a word in any `aliases_to_avoid` never becomes a type. A domain word the
  bundle does not have is a gap you report, not a type you invent.
- **Never scaffold, never launch.** No Gradle build means stop. The app is started by the
  person; you only `reload` and look through Compose Hot Reload when a window is connected.
- **Stay in scope.** Write only the feature module, `core/`, `server/` and their wiring,
  plus the checkboxes in the plan; never other features' modules, `intents/`,
  `knowledge/`, `features/`, `walks/` or the plan's content.
- **The plan is the contract, the code is the truth.** Follow the plan's steps; where
  the code contradicts a step, keep the step's intent, take the smallest correction, and
  report the deviation. Never silently do something else.
- Re-running on unchanged input changes nothing.

## 1. Read

Take the plan: the newest `planned` file under `plans/` for the capability named, or
the newest `planned` file when none was named; its frontmatter says which capability and
features it covers. Say in one line which plan you are executing. Read it in full, then
what it cites: the `.feature` files, the `knowledge/` bundle,
`docs/code-design/mvvm.md`, `build-design.md` in this file's directory, and the current
state of the feature module, `core/`, `shared/` and `server/`. Review the plan critically
against the code as it is now: a file it says to create that exists, a signature that
moved, a scenario that changed since the plan was written. A plan that no longer matches
its scenarios is reported and not executed; a plan with a small drift is executed with
the deviation named in the report. Never rewrite the plan file.

## 2. Execute the plan, task by task

Take the tasks in the plan's order. Each task is one scenario in double-loop shape and
you follow its steps exactly:

**Outer loop.** The task's Step 1 is the scenario's test at the ViewModel level; write it
as given, run it, and confirm it fails for the reason the plan expects, not because
something is broken. A scenario that describes a rejection or an error asserts the
`AppError` and its recoverable/fatal classification.

**Inner loop.** For each layer step in the task: the failing test as given, run and see
it fail, the minimal code as given, run and see it pass, refactor while green. Use case
tests assert `Resource<T>` positionally. Repository tests use an in-memory driver for
Room and Ktor's `MockEngine` for the API. Platform capability tests live in the target's
test source set. Server route tests use `testApplication`. Move a phase-1 fake to
`commonTest` as `Fake<Xxx>Repository` when its real implementation exists; delete
`presentation/fake/` once nothing binds it. The Koin change is the task's own step.

A step that turns out wrong once you are in the code (the plan's minimal code does not
compile, a signature differs) is corrected in the smallest way that keeps the step's
intent, and the deviation goes into the report. A task whose scenario cannot be built
as written is skipped, and its friction is recorded. Tick each step's checkbox in the
plan file as you complete it; that is the only edit the plan receives.

**See it.** When the outer test is green and a Compose Hot Reload window is connected:
`reload`, `get_ui_error`, `get_semantic_tree`, `take_screenshot`, and check the
scenario's `Then` is visible where a person would look. A rendering error or a missing
outcome means the slice is not wired; keep going. No window: compiling every enabled
target is the evidence, and the report says so.

## 3. Verify and finish

Run the feature module's tests and the whole suite, then build every enabled target and
the server. Check the diff: only in-scope paths changed, no `.feature` touched, no fake
left in production code, no `List` in state, no raw colour or dp in composables, no
exception type above the repository boundary. Validate nothing else drifted: the
scenario tests still map one to one onto the scenarios.

Stage only what you wrote (the feature module, `core/`, `server/`, wiring, and the plan
file with its ticked checkboxes), commit as `build: <capability>`, push to the branch's
upstream; no git or no upstream, skip and say so. Report: tasks completed and where each
scenario's `Then` is reachable; tasks skipped with their friction; every deviation from
the plan and why; new server endpoints and what a client needs to reach them; what could
only be verified by compiling; and one line saying the person can now walk it. Then you
are done.
