---
name: kartograph-plan
description: Use when a capability or feature under features/ is specified and nothing has been implemented for it yet, or when its scenarios changed or failed a walk and the implementation needs re-planning. Produces the three-ring plan that kartograph-screens, kartograph-domain and kartograph-adapters execute, and declares the project's technology stack. Requires the capability or feature to be named.
---

# Kartograph Plan

Turn a capability's scenarios into the implementation plan the three build skills execute,
ring by ring: screens (the driving adapter), domain (the core), adapters (the driven
adapters). The plan carries the layer map, the ports and adapters with exact signatures,
the files, and one task per unit of each ring with real code in every step, written for
an implementer who sees only their task. **Fully automated: ask nothing, wait for
nothing.** If no capability or feature was named, stop and say so.

## Hard rules

- **No placeholders.** Never "TBD", "TODO", "implement later", "add error handling",
  "handle edge cases", "write tests for the above", or "similar to task N". Every code
  step shows the code. Every type and signature used in a task is defined in that task or
  an earlier one.
- **Never invent behaviour or vocabulary.** A task implements what a scenario states.
  Domain types come from `knowledge/`; a word in any `aliases_to_avoid` never appears. A
  scenario that cannot be planned as written gets no task and a friction entry. A
  `.feature` is never edited.
- **The stack's documents are the contract.** The plan cites `docs/code-design/*` for
  every layer decision; it does not restate them.
- **Never plan against a scaffold stack** or an unknown one; stop and say what is missing.
- **Write only the plan and, on first use, the stack declaration; commit only those.**
- Re-running on unchanged input changes nothing; a re-plan supersedes the earlier plan.

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

## 1. Stack

If `docs/code-design/stack.md` exists, read its `stack` and use the documents beside it.
Otherwise **detect** the stack: read each `STACK.md` under the `stacks/` directory at the
plugin root (two levels above this file's directory) and test its *Detection* rules
against the project's build files. Exactly one match with `status: ready` → copy that
stack's `design-system.md`, `code-design.md` and `build-design.md` into
`docs/code-design/` and write `docs/code-design/stack.md` (frontmatter: `stack`, `title`,
`version`, `declared: <date>`; body: one line per copied document). No match, more than
one, or a `status: scaffold` → stop, name what was seen and what must exist, write
nothing. The copies are the project's from then on; later runs never touch `stacks/`.

## 2. Read

The named capability's `capability.md` and `.feature` files (a capability may sit inside
another one, `features/<parent>/<capability>/`: resolve the name as the single directory of
that slug anywhere under `features/`, and write the slash-joined path in the plan's
frontmatter when the slug occurs twice), the `knowledge/` bundle, the
three documents in `docs/code-design/`, the code that exists for the capability and the
shared code, laid out as `code-design.md` § 2 describes, the build files and the dependency
manifest, the newest `walks/` file for the capability, and the newest `planned` plan for it. If that plan
covers every scenario and nothing changed since, report so and stop.

## 3. Map

Before any task, decide and write down: the **screens** (one per `.feature` unless its
scenarios clearly describe more than one place, each listing the scenarios it serves and
the controls their steps name); per scenario the **layers** it crosses and its entry
point; **reuse versus new**, and what moves to the shared core; the **ports and adapters** with
exact signatures in the stack's language; the **files** to create or modify; **friction and
gaps**.

## 4. Write the three rings

Fill `plan-template.md` from this file's directory into
`plans/<YYYY-MM-DD-HHMM>-<capability>.md`. Section headings stay exactly as in the
template. The template is stack-neutral: every step names its unit in the words the
project's `code-design.md` uses for it (the KMP stack says ViewModel, use case interface
and Koin module; the Swift stack says Model, port protocol and `AppEnvironment`), code
fences carry the stack's language, and every `Run:` line is a command from
`build-design.md` § 8.

- **Ring 1, one task per screen:** the state contract, the ports the screen needs, the
  presentation model, the screen and its views, fakes and sample data covering every
  listed scenario's `Given`, the composition-root binding of the fakes, route and
  navigation entry, the compile-and-see step, commit. Real code in every step; no tests in
  this ring.
- **Ring 2, one task per scenario** in walk order (walk failures first): the outer test
  at the presentation model against fakes behind the ports, red first; then per layer the
  failing test, the minimal code, the passing run, through the ring-2 layers
  `code-design.md` § 6 lists (implementations, rules, the ports the core adds, the demo
  data behind the demo flag); the composition-root rebind from fake to implementation;
  the on-screen check; commit.
- **Ring 3, one task per port or endpoint:** the adapter and its data source and mapping,
  the failing adapter test over the double `build-design.md` § 8 names for that layer,
  the implementation, the passing run, the composition-root rebind from demo to real,
  commit.

Each task's *Interfaces* block names exactly what it consumes from earlier tasks and
produces for later ones. If an earlier `planned` plan exists, set its `status` to
`superseded` in the same commit. A plan you write never carries a `revision:` line or a
`**Revised:**` mark; those belong to the plans `kartograph-revise` writes, which keep the
ticks of work already built.

**Self-review** before validating: every scenario has a ring-2 task or a friction entry
and appears in exactly one ring-1 screen; every port declared in ring 2 has a ring-3
task; no placeholder pattern anywhere; every signature used later matches where it was
defined; the files list and the tasks agree. Fix inline.

## 5. Validate, commit, push, report

Run `node validate-plan.js <path>` from this file's directory until it prints `ok`; never
commit a plan that does not pass. Stage the plan files and, if created, `docs/code-design/`;
commit as `plan: <capability>`; push to the branch's upstream; no git or no upstream, skip
and say so. Report the stack, the screens, the task count per ring, the scenarios with
friction and why, the gaps a person has to close, and one line that `kartograph-screens`
can now run. Then you are done.
