---
name: kartograph-revise
description: Use when a person has looked at what was built — in a walk, in the running app, or anywhere else — and says what should be different, and that change has not been recorded under kartograph/ yet. Also use when a walk recorded failed scenarios whose behaviour the person now wants changed. Works on capabilities already specified under features/.
---

# Kartograph Revise

The person looked at what was built and says "change this and that". Record their words,
then carry the change through everything that describes the product and through the code
already built, in one run: the revision record, the scenarios, the concepts, the plan, the
rings. One commit per step, in that order, so the plan and the documents never drift from
the code. The screens are built first precisely so that such changes turn up early; this
skill is where they land.

## Hard rules

- **The person's words first, verbatim.** They are recorded before anything else changes,
  and every change cites the block it comes from.
- **Ask only when the words are genuinely ambiguous**: when they can be read two ways and
  the readings lead to different scenarios. Then one question per message, with your
  recommended answer and lettered options, recorded as a block. Otherwise ask nothing:
  no review, no confirmation, never whether to go on.
- **Change exactly what the words change.** A scenario the words do not touch keeps its
  title and steps byte for byte. New behaviour is a new scenario. A scenario is removed
  only when the person said to drop it.
- **Never invent a requirement.** What the words leave open is an open question in the
  revision and in `capability.md`, never a scenario with a guessed outcome.
- **This skill deliberately writes more than one phase's output**: the revision,
  `kartograph/index.md` and `kartograph/log.md`; `features/`; `knowledge/`; `plans/`; and
  the code of the rings already built for the affected capabilities. Nothing else: never
  `walks/`, `distribution/`, `docs/code-design/`, a ring that was not built, or another
  capability's code.
- **Code follows the ring skills' rules exactly**: test first, fakes over mocks, never a
  weakened test, never an edited `.feature` while building, each ring's own scope. Never
  launch, reload, restart or reset the app the person is watching; look through a live
  window only.
- **Every step validates before it commits.** A step that cannot pass its validator is not
  committed: stop there, keep the commits that passed, and report where it stopped and why.
- Write in the language of the person's words.

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

## 1. Record the revision

The plugin root is two levels above this file's directory; the other skills' files named
below are under its `skills/`.

Read `kartograph/index.md`, the walk the person refers to (else the newest file under
`walks/`), every `capability.md` from the top level down, the `.feature` files of every
capability the words touch, the newest `planned` plan of each such capability under
`plans/` (its screens table names the screens; note which of its rings are already built —
every checkbox of every task of that ring is `- [x]` — for step 5), and the `knowledge/`
bundle. Resolve every
thing the person names to a capability, a feature, a scenario or a screen, in the bundle's
canonical titles. When nothing under `features/` matches what they describe, say that
`kartograph-converse` is the place for new ground and stop.

Record in the shape of `revision-template.md` in this file's directory:

- **Conversation.** Block 1 is the person's words verbatim: everything they said about
  what to change, two messages in a row being one block. A question you had to ask is an
  AI block holding only `> Looked up: …` lines, at most one `Reasoning (shortened): …`
  line, the `**Question:** …` and its options, one line each; the answer is the next
  person block, verbatim.
- **Affected.** One `- Capability:` line per capability touched, then its features,
  scenarios and screens in the template's shapes.
- **Changes.** One line per change, each citing the person's block: `**Changed:**` an
  existing scenario whose behaviour changes (its path and ` › ` name), `**Added:**` new
  behaviour (the feature file that gets the scenario, or the `capability.md` that gets a
  new feature), `**Removed:**` a scenario or feature the person said to drop.
- **Open questions.** What the words leave open, naming the change it blocks, or
  `None identified.`

Write it to `kartograph/<YYYY-MM-DD-HHMM>-<slug>.revision.md` (the stamp is now; slug: what
changes, lowercase, hyphenated, at most five words). Frontmatter as in the template:
`status: recorded`; `sources` holds the file name of every intent listed under
`## Sources` of an affected capability, without the `kartograph/` prefix; `related` the
earlier revisions of the same capabilities, else `[]`. Add
`* [title](file) - description _(Revision, recorded)_` as the first line under
`# Kartograph` in `kartograph/index.md`, and under today's `## YYYY-MM-DD` in
`kartograph/log.md`: `* **Revision**: recorded [title](file) — n changed, n added, n removed.`

Run `node validate-revision.js kartograph/<file>` with the script from this file's
directory until it prints `ok`. Stage the revision, `kartograph/index.md` and
`kartograph/log.md`; commit as `revision: <title>`.

## 2. Features

Apply every change under `features/` by the rules of
`skills/kartograph-features/SKILL.md` at the plugin root (plain Gherkin, the bundle's
vocabulary, extend before create, never invent), with these marks:

- **Changed:** rewrite exactly the steps (and the title, if the words rename it) of that
  scenario. Put `# Changed by kartograph/<file>.revision.md` on its own line directly above
  the scenario, above its tags. An earlier `# Changed by` line stays.
- **Added:** a new scenario in the feature file the change names, under the rule it
  belongs to, with the same `# Changed by` line above it. A new feature file starts with
  the two header comments, `# Source intent:` naming the capability's own first
  `- Intent:` path from its `capability.md` (the `kartograph/` prefix included).
- **Removed:** delete the scenario, and a rule or feature file left empty; drop a deleted
  file's line from its `capability.md`'s `## Features` list.

In every affected `capability.md`, add ``- Revision: `kartograph/<file>.revision.md` ``
under `## Sources`, after the lines already there (none is ever removed); replace an
`## Open questions` section that reads only `None` before adding the revision's open
questions, else append them to what is already there. Run
`node <plugin root>/skills/kartograph-features/validate-features.js features` until it
prints `ok`. Stage `features/`; commit as `features: <revision title>` — do not push; step
6 pushes every commit of this run once.

## 3. Knowledge

Only when a change gives a term a new meaning, introduces a term, or retires one; else
skip this step and say so. Reconcile and write by the rules of
`skills/kartograph-knowledge/SKILL.md` at the plugin root (§ 3 and § 4), with the revision
as an extra source of every concept it touches: a `sources` entry with `id` the revision's
file name without `.revision.md` (`<YYYY-MM-DD-HHMM>-<slug>`, the form an intent's entry
takes), `resource: ../kartograph/<file>.revision.md` and `title` the revision's title, and
the person's words quoted under `# From the intent`, footnoted to that id. An existing
definition is never rewritten: a changed meaning is recorded under `# Collision`. Prepend
to `knowledge/log.md` under today's date: `* **Revision**: processed
[title](../kartograph/<file>.revision.md) — n new, n extended, n aliased, n deprecated,
n stubs, n collisions.` Run
`node <plugin root>/skills/kartograph-knowledge/validate-knowledge.js knowledge` until it
prints `ok`. Stage `knowledge/`; commit as `knowledge: <revision title>` — do not push;
step 6 pushes every commit of this run once.

## 4. Plan

For each affected capability that has a `planned` plan, write the plan that supersedes it,
by the rules of `skills/kartograph-plan/SKILL.md` and its `plan-template.md` at the plugin
root. A capability without a plan has nothing built yet: write no plan for it, and report
that `kartograph-plan` covers it from the changed scenarios.

Start from the old plan, as it stands with its ticks, in
`plans/<YYYY-MM-DD-HHMM>-<capability>.md` with the revision's stamp. In the frontmatter,
`date` is today, `supersedes` names the old plan, and a last line
`revision: kartograph/<file>.revision.md` follows it; `features` lists the feature files
as they are now. Then, change by change:

- **Changed scenario:** its ring-2 task is rewritten for the new steps. A scenario the old
  plan covered only by a `## Friction` entry (typically "already built") has no ring-2
  task to rewrite: it gets a new one, `**Revised:** added`, and its friction entry goes.
  The ring-1 task of the screen serving it is rewritten when what the screen shows or
  offers changes, and a ring-3 task only when a port's signature changes.
- **Added scenario:** a new ring-2 task, never a friction entry; a new ring-1 task for a
  new screen, or the serving screen's task rewritten for a new control; a new ring-3 task
  for a new port.
- **Removed scenario:** its ring-2 task or its friction entry, its layer-map row and its
  place in the screens table go; drop its name from the serving screen's `**Scenarios:**`
  line, which alone keeps that task's ticks (validate-plan.js rejects a name the layer
  map no longer has); the task is rewritten, `**Revised:** changed` and unticked, only
  when a control goes with it.

Every rewritten task carries `**Revised:** changed`, every new one `**Revised:** added`,
on its own line below the task's first field lines, and all its checkboxes are unticked.
Every other task stays byte for byte with its ticks. Renumber tasks so each ring counts
from 1; update the screens table, the layer map, ports and adapters and the files list to
match. Set the old plan's `status` to `superseded`. Run
`node <plugin root>/skills/kartograph-plan/validate-plan.js plans/<new file>` until it
prints `ok`; it also checks that no task built under the old plan lost its ticks, and
that every scenario the revision changed or added has a `**Revised:**` ring-2 task and no
friction entry. Stage both plans; commit as `plan: <capability> (revision)` — do not push;
step 6 pushes every commit of this run once.

## 5. Code

A ring is **built** when every checkbox of every task of that ring in the superseded plan
is `- [x]`: read this directly from the plan file read in step 1, before step 2 changed
anything under `features/` — do not decide it by running the plan's own validator on the
superseded plan now, since step 2 may have left it failing its cross-check against the
now-different feature files (expected, and the superseded plan is never edited over it).
For each capability, in ring order, for each built ring
only: execute the new plan's unticked tasks of that ring by the ring's own skill,
`skills/kartograph-screens/SKILL.md` for ring 1, `skills/kartograph-domain/SKILL.md` for
ring 2, `skills/kartograph-adapters/SKILL.md` for ring 3, all at the plugin root: its
hard rules and its sections 1 to 3 for this plan, ticking each step, with three
differences. Look through a live window when one is connected, but never launch, reload,
restart or reset the app. A removed scenario's test and the code only it used are deleted
in the ring where they live, in that ring's commit, and reported as a deviation from the
plan. Commit as the ring skill does, with ` (revision)` after the capability; do not push
and do not report yet.

A ring that was only partly built, and every ring not built, keeps its unticked tasks for
its ring skill; say so in the report.

## 6. Applied, push, report

Set the revision's `status` to `applied`, its index line to `_(Revision, applied)_`, and
add under today's date in `kartograph/log.md`: `* **Revision**: applied [title](file) —
features, knowledge, plan, rings n.` (the rings you rebuilt). Run
`node validate-revision.js kartograph/<file>` again; stage those three files; commit as
`revision: <title> applied`. Push every commit of this run to the branch's upstream; no
git or no upstream, skip and say so.

Report, per step, what changed where and its commit: the revision; the scenarios changed,
added and removed; the concepts; the plan written and the one it superseded; the rings
rebuilt, each deviation from the plan, and the rings left for their skills. Then the open
questions a person has to settle, and one line on whether a walk makes sense: yes when a
built ring changed, naming `kartograph-walk` and the capability. Then you are done.
