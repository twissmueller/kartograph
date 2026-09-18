---
name: kartograph-adapters
description: Use when a capability's domain is real and tested (ring 2 done) and the person wants real data behind it — repositories over a database and an API, platform capabilities, and the server endpoints they need. Ring 3 of the plan. Takes the capability named, else the newest planned plan.
---

# Kartograph Adapters

Execute ring 3 of a capability's plan: fulfil every port the core declared with a real
adapter, test first: repositories over Room and Ktor, platform capabilities per target,
the server routes the scenarios need, and the Koin rebind from in-memory to real. Read,
execute, verify, commit, push, report. **Fully automated: ask nothing, wait for nothing.**
The plan sets the scope: the newest `planned` file under `plans/` for the capability
named, else the newest overall; none means stop and say that `kartograph-plan` runs
first. **Ring 2 must be complete:** every ring-2 checkbox ticked; otherwise stop and say
that `kartograph-domain` runs first.

## Hard rules

- **Ring 3 only.** Nothing above the repository interface changes: no ViewModel, no use
  case, no rule. If an adapter needs a port the core does not declare, that is a
  deviation to report, not a port to add silently.
- **Test first, always.** A failing adapter test before the adapter: Room over an
  in-memory driver, Ktor over `MockEngine`, the server over `testApplication`, a platform
  capability in its target's test source set. Never weaken a test.
- **Exceptions stop at the boundary.** Every adapter translates its library's exceptions
  to `AppError` and returns `Resource<T>`; nothing above sees a `Throwable`.
- **Never edit a `.feature` file**, never weaken a scenario test to make an adapter fit.
- **The plan is the contract, the code is the truth.** Follow the ring-3 tasks' steps as
  written; the smallest correction where the code contradicts a step, always reported;
  the plan's only edit is its checkboxes.
- **Follow `docs/code-design/build-design.md`** for every adapter decision: persistence,
  HTTP client, platform patterns, server, tests by layer.
- **Stay in scope.** The feature module's `data/` and `di/`, `core/data/`, `server/`, the
  per-target `platformModule`s, the version catalog for new dependencies, and the plan's
  checkboxes. Never presentation or domain code, `intents/`, `knowledge/`, `features/`,
  `walks/`, other features' modules or the plan's content.
- Re-running on unchanged input changes nothing.

## 1. Read

The plan in full; `docs/code-design/build-design.md` and `code-design.md`, the feature
module as ring 2 left it, `core/`, `server/`, the Gradle build and the version catalog.
Say which plan you are executing. Review the ring-3 tasks against the code as it is now:
a port whose signature moved since the plan was written is a deviation to report.

## 2. Execute ring 3, task by task

Each ring-3 task is one port or endpoint. The failing adapter test as given, run and see
it fail, the data source and mapper and adapter as given, run and see it pass, refactor
while green. For Room: the entity, the DAO, the database version and schema export, a
migration and its test when the schema changed. For Ktor: the DTOs, the `…Api`, the calls
through `safeApiCall`. For a platform capability: the interface in `commonMain`, one
implementation per target, a stub returning `NotSupported` where a target cannot provide
it, bound in that target's `platformModule`. For the server: the route, the request and
response types in `core/`, the status mapping, one route test. Then the Koin rebind from
the in-memory repository to the real one, keeping the in-memory one behind the demo flag.
Tick each step's checkbox.

## 3. Verify, commit, push, report

Run the whole suite, including the ring-2 scenario tests, which must still pass
unchanged; build every enabled target and the server. Check the diff: only in-scope
paths changed, no test weakened, no `Throwable` above the boundary, no fake in
production. Stage what you wrote plus the plan, commit as `adapters: <capability>`, push;
no git or no upstream, skip and say so. Report the adapters built and what each talks
to, the server endpoints and what a client needs to reach them, the platform
capabilities and any target stubbed, every deviation from the plan, what could only be
verified by compiling, and one line that the capability is real end to end and
`kartograph-walk` can confirm it. Then you are done.
