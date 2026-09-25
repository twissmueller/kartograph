---
name: kartograph-adapters
description: Use when a capability's domain is real and tested (ring 2 done) and the person wants real data behind it — repositories over a database and an API, platform capabilities, and the server endpoints they need. Ring 3 of the plan. Takes the capability named, else the newest planned plan.
---

# Kartograph Adapters

Execute ring 3 of a capability's plan: fulfil every port the core declared with a real
adapter, test first: persistence, the HTTP client, platform capabilities per target, the
server endpoints the scenarios need, and the composition-root rebind from demo to real. Read,
execute, verify, commit, push, report. **Fully automated: ask nothing, wait for nothing.**
The plan sets the scope: the newest `planned` file under `plans/` for the capability
named, else the newest overall; none means stop and say that `kartograph-plan` runs
first. **Ring 2 must be complete:** every ring-2 checkbox ticked; otherwise stop and say
that `kartograph-domain` runs first.

## Hard rules

- **Ring 3 only.** Nothing above the ports changes: no presentation model, no use
  case, no rule. If an adapter needs a port the core does not declare, that is a
  deviation to report, not a port to add silently.
- **Test first, always.** A failing adapter test before the adapter, over the double
  `build-design.md` § 8 names for that layer: an in-memory database, a stubbed HTTP
  engine, a test server, a platform capability in its target's test bundle. Never weaken a
  test.
- **Exceptions stop at the boundary.** Every adapter translates its library's exceptions
  into the stack's error and result types at the boundary; nothing above sees a framework
  exception.
- **Never edit a `.feature` file**, never weaken a scenario test to make an adapter fit.
- **The plan is the contract, the code is the truth.** Follow the ring-3 tasks' steps as
  written; the smallest correction where the code contradicts a step, always reported;
  the plan's only edit is its checkboxes.
- **Follow `docs/code-design/build-design.md`** for every adapter decision: persistence,
  HTTP client, platform patterns, server, tests by layer.
- **Stay in scope.** The capability's adapter code and its bindings, the shared data
  layer, the server, the per-target platform bindings, the dependency manifest for new
  dependencies, and the plan's checkboxes. Never presentation or domain code, `kartograph/`,
  `knowledge/`, `features/`, `walks/`, other capabilities' code or the plan's content.
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

The plan in full; `docs/code-design/build-design.md` and `code-design.md`, the
capability's code as ring 2 left it, the shared core and data layer, the server, the build
files and the dependency manifest.
Say which plan you are executing. Review the ring-3 tasks against the code as it is now:
a port whose signature moved since the plan was written is a deviation to report.

## 2. Execute ring 3, task by task

A task whose steps are all ticked is done and is skipped: a plan `kartograph-revise` wrote
keeps the ticks of work already built. Each ring-3 task is one port or endpoint. The
failing adapter test as given, run and see it fail, the data source and mapping and
adapter as given, run and see it pass, refactor while green, each in the shape
`build-design.md` prescribes. For persistence: the entity or record, the data access type,
the schema version, a migration and its test when the schema changed. For HTTP: the DTOs,
the client type, the calls through the stack's safe-call boundary. For a platform
capability: the port, one implementation per target, a stub returning the stack's
not-supported outcome where a target cannot provide it, bound in that target's platform
bindings. For the server: the route, the shared request and response types, the status
mapping, one route test. Then the composition-root rebind from the demo adapter to the
real one, keeping the demo one behind the demo flag. Tick each step's checkbox.

## 3. Verify, commit, push, report

Run the whole suite, including the ring-2 scenario tests, which must still pass
unchanged; build every enabled target and the server. Check the diff: only in-scope
paths changed, no test weakened, no framework exception above the boundary, no double
bound where the stack forbids it. Stage what you wrote plus the plan, commit as `adapters: <capability>`, push;
no git or no upstream, skip and say so. Report the adapters built and what each talks
to, the server endpoints and what a client needs to reach them, the platform
capabilities and any target stubbed, every deviation from the plan, what could only be
verified by compiling, and one line that the capability is real end to end and
`kartograph-walk` can confirm it. Then you are done.
