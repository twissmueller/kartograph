---
name: kartograph-knowledge
description: Use when an intent under kartograph/ has been mapped and its concepts have not yet been recorded in the project's knowledge/ bundle, or when the person asks to extract, update, or extend the knowledge base from an intent. Works from a fresh context; reads only files.
---

# Kartograph Knowledge

Extract every concept an intent introduces into the project's knowledge base: an
[Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
v0.2 bundle at `knowledge/`, one markdown file per concept. Read, extract, reconcile,
write, commit, push, report. **Fully automated: ask nothing, wait for nothing.**

## Hard rules

- Write only inside `knowledge/`, and commit only that.
- Never invent meaning. A word the intent uses but never defines becomes a stub that says
  so, not a guessed definition.
- Never write `verified`. Trust is derived from who confirmed a concept; you are not a
  human reviewer.
- Never delete a concept; retire it with `status: deprecated`.
- Never rewrite an existing definition; a contradiction is recorded, not resolved.
- No questions, no review, no confirmation. Run to the end and report.
- The bundle is written in the intent's language.

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

Take the intent the person named; otherwise the newest `kartograph/*.intent.md` that has a
`.mapping.md` with the same stamp and slug. An intent without its mapping is not ready: say
so and stop. Read the intent and its mapping. Then read
`knowledge/log.md` (if the log already lists that intent, say so and stop unless told to
redo), `knowledge/index.md`, and every concept file so you know every title and every
`aliases_to_avoid` word already taken.

## 2. Extract

Six types, each its own directory; the path is the concept's identity:

| type | directory | what it is | drawn from |
|---|---|---|---|
| Concept | `concepts/` | a domain word with a definition | Terms, Summary |
| Actor | `actors/` | a role or system that acts | Who |
| Subject | `subjects/` | a thing acted upon, with a lifecycle | Terms, outcomes |
| Event | `events/` | something that happened, past tense | Intended outcomes |
| Command | `commands/` | an action an actor issues, imperative | Summary, outcomes |
| Policy | `policies/` | when <event> then <command>, or a constraint that must hold | Decisions, Constraints, Assumptions |

Goals, non-goals and open questions yield nothing by themselves. A concept whose meaning
hangs on an open question stays `draft` and names the question in its body.

The mapping decides what is new behaviour: an intended outcome under *Done* adds no Event
or Command, since it is already built and specified; those under *Partly done* and *New*
do. Who, Terms, Decisions and Constraints are read in full, because a word can be new
where the behaviour is not. An outcome under *Contradicts* yields nothing yet; the concepts
it touches stay as they are.

## 3. Reconcile

For each candidate, against the bundle, decide alone:

- same title → **extend**: add the source and relations, keep the definition;
- a word another concept lists in `aliases_to_avoid`, or a plain synonym of an existing
  title → **alias**: no new file, the word joins that concept's `aliases_to_avoid`;
- a definition that contradicts an existing one → **collision**: keep the existing
  definition, add the source, and record the intent's wording under a `# Collision`
  heading in the body so a person can settle it later;
- something the intent retires → **deprecate**;
- a word used but never defined → **stub**: a new `draft` file whose description is
  `TODO — define this term.` and whose body says where it was used;
- otherwise → **new**.

One canonical title per concept, always. When unsure whether two words mean the same
thing, prefer alias over a second file.

## 4. Write, commit, push

Write each concept from `concept-template.md` in this file's directory. Frontmatter:
`type`, `title`, `description`, `status: draft` for new files, `aliases_to_avoid`,
`generated: { by: kartograph-knowledge/3.0.0, at: <ISO 8601> }`, and `sources` with one
entry pointing at the intent (`resource: ../kartograph/<file>.intent.md`, `id` used for footnotes).
Links between concepts are bundle-relative (`/events/plant-watered.md`); a link to a
concept not yet written is allowed. Slugs are lowercase hyphenated.

Regenerate `knowledge/index.md`: frontmatter `okf_version: "0.2"` only, then one section
per directory listing `* [Title](dir/slug.md) - description _(Type, status)_`. Prepend to
`knowledge/log.md` under today's `## YYYY-MM-DD`: `* **Intent**: processed
[<title>](../kartograph/<file>.intent.md) — <n> new, <n> extended, <n> aliased, <n> deprecated,
<n> stubs, <n> collisions.`

Then validate: run `node validate-knowledge.js knowledge` with the script from this
file's directory, and fix every reported error until it prints `ok`. Warnings (stubs,
links to concepts not yet written) are reported, not fixed. Never commit a bundle that
does not pass.

Stage only `knowledge/`, commit as `knowledge: <intent title>`, push to the branch's
upstream. No git or no upstream: skip and say so. Report the paths, the commit, and the
stubs and collisions a person still has to settle. Then you are done.
