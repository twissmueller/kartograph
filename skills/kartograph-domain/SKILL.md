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
- **Fakes over mocks.** No mocking library. A `Fake…` implements the port, is seeded
  through its constructor, exposes side-effect counters and an outcome knob, and lives
  where `build-design.md` § 8 puts test doubles.
- **Never edit a `.feature` file.** A scenario that cannot be built as written is skipped
  and its friction recorded; never forced, never rewritten.
- **The plan is the contract, the code is the truth.** Follow the ring-2 tasks' steps as
  written; the smallest correction where the code contradicts a step, always reported;
  the plan's only edit is its checkboxes.
- **Follow `docs/code-design/code-design.md` and `build-design.md`.** Domain types match
  `knowledge/`'s canonical titles; a word the bundle does not have is a gap you report.
- **Stay in scope.** The capability's module or folder, the shared core for the error,
  result and configuration types `code-design.md` names when they are missing, and the
  plan's checkboxes. Never `kartograph/`, `knowledge/`, `features/`, `walks/`, the server,
  other capabilities' code or the plan's content.
- Re-running on unchanged input changes nothing.

## 0. Version gate

Before anything else, check that the project is on this plugin's layout. The plugin's
layout version is the highest version among the files named like `3.0.0.md` in the
`migrations/` directory at the plugin root, two levels above this file's directory; if
that directory is not there, skip this step. The project is behind when
`kartograph/index.md` names a lower `kartograph_version` or names none, or when
`kartograph/index.md` does not exist but the project holds Kartograph files from before:
stamp-named files in `intents/`, a `capability.md` or a `# Source intent:` line under
`features/`, a `knowledge/index.md` with `okf_version`, or a `.kartograph/` directory.
Then stop and say only: "This project is on an older Kartograph layout; run
kartograph-migrate first." A project with none of these is new and passes; a directory
name alone, such as `features/` in a Cucumber project, is not a Kartograph file.

## 1. Read

The plan in full; the `.feature` files, the `knowledge/` bundle, `docs/code-design/`, the
capability's code as ring 1 left it, the shared core, and the newest `walks/` file for the
capability. Say which plan you are executing. Review the ring-2 tasks against the code as
it is now; a plan that no longer matches its scenarios is reported and not executed.

## 2. Execute ring 2, task by task

Each ring-2 task is one scenario. **Outer loop:** its Step 1 is the scenario's test at the
presentation model against fakes behind the ports; write it as given, run it, confirm it
fails for the reason the plan expects. A scenario that describes a rejection or an error
asserts the error the stack's error type carries and its classification. **Inner loop:**
per layer step, the failing test as given, run and see it fail, the minimal code as given,
run and see it pass, refactor while green, through the ring-2 layers `code-design.md` § 6
lists in the stack's own shapes (implementations, rules or validators, the ports the core
adds, the demo data seeded from the ring-1 sample data). Then the composition-root rebind
from fake to implementation as `code-design.md` § 6 describes for ring 2, with the demo
binding behind the demo flag for later. A ring-1 double that nothing binds any more is
deleted; one the stack keeps as its demo or UI-test substrate stays. Tick each step's
checkbox.

**See it.** When the outer test is green and a live window is connected (a hot-reload
desktop window, a simulator through a screen-control tool, a browser), look: the
scenario's `Then` is visible where a person would look. No window: the green test and a
compiling target are the evidence, and the report says so.

## 3. Verify, commit, push, report

Run the capability's tests and the whole suite; build every enabled target. Check the
diff: only in-scope paths changed, no `.feature` touched, no double bound where the stack
forbids it, no framework exception above the ports, nothing in the state the stack's
contract forbids, the scenario tests map one to one onto the scenarios. Stage what you wrote plus the plan, commit as
`domain: <capability>`, push; no git or no upstream, skip and say so. Report the scenarios
proven and where each `Then` is reachable, the scenarios skipped with their friction,
every deviation from the plan, the ports ring 3 has to fulfil, and one line that
`kartograph-walk` can run now and `kartograph-adapters` next. Then you are done.
