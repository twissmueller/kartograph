---
name: kartograph-map
description: Use when an intent has been derived under kartograph/ and has not yet been held against what the project already has, or when the person asks what of an intent is already done, partly done, new, or in conflict. Works from a fresh context; reads only files and the git history.
---

# Kartograph Map

Hold one intent against what the project already has and write down, outcome by outcome,
what is done, partly done, new, or in conflict with something that exists:
`kartograph/<stamp>-<slug>.mapping.md`, beside the intent. Research, sort, write, commit,
push, report. **Fully automated: ask nothing, wait for nothing.**

## Hard rules

- Write only the mapping file, `kartograph/index.md` and `kartograph/log.md`, and commit
  only those. Never the intent, `features/`, `knowledge/`, or code.
- The truth is what exists: the feature files under `features/` and the git history.
  Earlier intents, mappings and conversations are background, never proof that something
  is done.
- Every *Done* and *Partly done* entry cites its evidence in backticks: a commit hash, or a
  `features/….feature › scenario`. No evidence, not done.
- Never resolve a contradiction. Record both sides and the question a follow-up
  conversation has to settle.
- No questions, no review, no confirmation. Run to the end and report.
- Write in the intent's language.

## 0. Version gate

Before anything else, check that the project is on this plugin's layout. The plugin's
layout version is the highest version among the files named like `3.0.0.md` in the
`migrations/` directory at the plugin root, two levels above this file's directory; if
that directory is not there, skip this step. The project is behind when
`kartograph/index.md` names a lower `kartograph_version`, or when `kartograph/index.md`
does not exist but any of `intents/`, `knowledge/`, `features/`, `plans/` or `walks/`
does. Then stop and say only: "This project is on an older Kartograph layout; run
kartograph-migrate first." A project with none of these is new and passes.

## 1. Read

Take the intent the person named; otherwise the newest `kartograph/*.intent.md` that has no
`.mapping.md` with the same stamp and slug. A legacy intent (`legacy-no-conversation` in its
`sources`) predates mapping and is never mapped. If the mapping already exists, say so and
stop. Read the intent in full; its intended outcomes are what you map.

## 2. Research

In this order, as deep as each outcome needs:

1. **Features.** Every `capability.md` from the top level down through its
   sub-capabilities, and the `.feature` files of every capability an outcome touches,
   scenario by scenario.
2. **The git history.** `git log --oneline` in full, then `git log --grep` and
   `git log -- <path>` for the words and paths an outcome names; `git show --stat` where
   the subject alone does not tell what changed. Read code only to confirm what a commit
   claims.
3. **The bundle.** Earlier intents, mappings and conversations in `kartograph/`, for what
   was already asked for, decided, or found in conflict.

## 3. Sort

Each intended outcome goes, word for word as the intent states it and without its turn
citation, into exactly one group:

| group | when | the entry carries |
|---|---|---|
| Done | a scenario specifies it and a commit built it | the commit hash(es) and the `feature › scenario` |
| Partly done | some of it exists: a scenario with no commit behind it, a commit with no scenario, or part of the behaviour | what exists, cited, then `Missing:` what does not |
| New | nothing that exists covers it | one line on why nothing covers it |
| Contradicts | it conflicts with a scenario, a commit, or an earlier intent | both statements, then `Open question:` |

## 4. Write, commit, push, report

Fill `mapping-template.md` from this file's directory into
`kartograph/<stamp>-<slug>.mapping.md`, with the intent's stamp and slug. `status: mapped`;
`sources` holds the intent's file name. Under *Researched*, say how far back the history
was read and which capabilities and documents were read. An empty group is
"None identified.".

Update the bundle: add `* [title](file) - description _(Mapping, mapped)_` as the first line
under `# Kartograph` in `kartograph/index.md`, and under today's date in
`kartograph/log.md`: `* **Mapping**: mapped [title](file) — n done, n partly done, n new, n contradicts.`

Then validate: run `node validate-mapping.js kartograph/<file>` with the script from this
file's directory (it also checks that every intended outcome of the intent is mapped
exactly once), and fix every reported error until it prints `ok`. Never commit a file that
does not pass.

Stage only the mapping file, `kartograph/index.md` and `kartograph/log.md`, commit as
`mapping: <title>`, and push to the branch's upstream. No git or no upstream: skip and say
so. Report the path, the commit, the count per group, and every contradiction as the open
question it raises. Then you are done.
