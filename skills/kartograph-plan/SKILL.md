---
name: kartograph-plan
description: Use when a capability or feature under features/ has its screens (phase 1, on fakes) and the real behaviour is about to be built, before any production code below the view is written; or when scenarios failed a walk and need re-planning. Produces the plan kartograph-build executes. Requires the capability or feature to be named.
---

# Kartograph Plan

Turn a capability's scenarios into the implementation plan `kartograph-build` executes:
the layer map, the ports and adapters with exact signatures, the files, and one
double-loop task per scenario, with real test code and real minimal code in every step.
Written for an implementer who sees only their task and knows nothing of the project.
**Fully automated: ask nothing, wait for nothing.** If no capability or feature was
named, stop and say so.

## Hard rules

- **No placeholders.** Never "TBD", "TODO", "implement later", "add error handling",
  "handle edge cases", "write tests for the above", or "similar to task N". Every code
  step shows the code. Every type, function and signature used in a task is defined in
  that task or an earlier one.
- **Never invent behaviour or vocabulary.** A task implements what a scenario states.
  Domain types come from `knowledge/`; a word in any `aliases_to_avoid` never appears. A
  scenario that cannot be planned as written (ambiguous `Then`, unreachable `Given`,
  contradiction) gets no task and a friction entry instead. A `.feature` is never edited.
- **Follow `docs/code-design/mvvm.md` and the build skill's `build-design.md`** for every
  layer decision; the plan cites them, it does not restate them.
- **Write only the plan file, and commit only that.**
- Re-running on unchanged input changes nothing; a re-plan after changes supersedes the
  earlier plan rather than rewriting it.

## 1. Read

Take the named capability or feature. Read its `capability.md` and `.feature` files, the
`knowledge/` bundle, `docs/code-design/mvvm.md`, `build-design.md` from the build skill's
directory (a sibling of this file's directory), the feature module as phase 1 left it
(State, Event, Effect, ViewModel, use case interfaces, `presentation/fake/`), `core/`,
`shared/`, `server/`, `settings.gradle.kts` and `gradle/libs.versions.toml`, the newest
file under `walks/` for this capability, and the newest `planned` file under `plans/` for
it. If that plan already covers every scenario and nothing changed since, report so and
stop.

## 2. Map

Decide, and write down, before any task:

- **Layers per scenario:** which of use case, repository, Room, Ktor client, settings,
  platform capability, server endpoint each scenario crosses, and its entry point.
- **Reuse versus new:** what exists in the module, `core/` and `server/` and is reused;
  what is new; what moves to `core/` because a second feature will use it.
- **Ports and adapters:** every interface (use case, repository, platform capability) with
  its exact Kotlin signature, and every adapter (`…Impl`, `…Api`, `…Dao`, per-target
  implementation, server route) that fulfils it.
- **Files:** exact paths to create or modify, with one responsibility each.
- **Friction and gaps:** what the project cannot provide (an external service, a
  credential, an open question's answer); those scenarios get no task.

## 3. Write

Fill `plan-template.md` from this file's directory into
`plans/<YYYY-MM-DD-HHMM>-<capability>.md`. Tasks are in walk order: scenarios a walk
failed first, then by feature file. Each task is one scenario and carries, in order: the
outer test (real Kotlin, at the ViewModel level, Given/When/Then, Turbine), its expected
failure, then per layer the failing test, the expected failure, the minimal code, and the
passing run, then the Koin change, the on-screen check, and the commit. A task's
*Interfaces* block names exactly what it consumes from earlier tasks and produces for
later ones. Section headings stay exactly as in the template.

If an earlier `planned` plan exists for the capability, set its frontmatter `status` to
`superseded` in the same commit.

**Self-review** before validating: every in-scope scenario has a task or a friction entry;
no placeholder pattern anywhere; every signature used in a later task matches where it
was defined; the files list and the tasks agree. Fix inline.

## 4. Validate, commit, push, report

Run `node validate-plan.js <path>` from this file's directory until it prints `ok`; never
commit a plan that does not pass. Stage only the plan files, commit as
`plan: <capability>`, push to the branch's upstream; no git or no upstream, skip and say
so. Report the task count, the scenarios with friction and why, the gaps a person has to
close, and one line that `kartograph-build` can now run. Then you are done.
