---
name: kartograph-intent
description: Use when a conversation has been recorded under kartograph/ and no intent has been derived from it yet, or when the person asks to derive the intent of a recorded conversation. Works from a fresh context; reads only files.
---

# Kartograph Intent

Derive what the person wants from one recorded conversation and write it as
`kartograph/<stamp>-<slug>.intent.md`, beside the conversation it came from. Read, derive,
write, commit, push, report. **Fully automated: ask nothing, wait for nothing.**

## Hard rules

- Write only the intent file, `kartograph/index.md` and `kartograph/log.md`, and commit
  only those. Never the conversation.
- Derive only from the conversation. What the person did not say is an assumption or an
  open question, never a statement. Never read code or features to fill a gap.
- The person's words decide. An option the AI recommended is a decision only when the
  person chose it; a question the person could not answer is an open question.
- Every goal, intended outcome, non-goal, constraint and decision cites the person's block
  it comes from: `[turn 8]`, or `[turns 8, 12]`.
- No questions, no review, no confirmation. Run to the end and report.
- Write in the language of the conversation.

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

Take the conversation the person named; otherwise the newest `kartograph/*.conversation.md`
that has no `.intent.md` with the same stamp and slug. If that intent already exists, say
so and stop. Read the conversation in full, and the documents it names under `related`.

## 2. Derive

Sort everything the person said into exactly one bucket:

| bucket | test |
|---|---|
| goal | why the work exists |
| intended outcome | what will observably be true when it is done |
| non-goal | deliberately left out, and why |
| constraint | what cannot change: time, money, platform, law, existing systems |
| assumption | taken for granted by either side, stated so it can be denied |
| decision | a choice, with its reason and the rejected alternatives |
| open question | what the person could not answer yet, and who can |

The mapping later checks intended outcomes one by one against the project, so write each
as one observable statement on one bullet line, in the person's words where possible.
Terms are words the person used with a specific meaning; where they used two words for one
thing, record both and the one they settled on.

## 3. Write, commit, push, report

Fill `intent-template.md` from this file's directory into
`kartograph/<stamp>-<slug>.intent.md`, with the conversation's stamp and slug. Frontmatter:
`status: derived` (the person has not seen it in this form); `sources` holds the
conversation's file name; `related` the earlier documents the conversation named. Keep
every section, writing "None identified." where empty. Section headings stay exactly as in
the template, whatever the language of the content.

Update the bundle: add `* [title](file) - description _(Intent, derived)_` as the first
line under `# Kartograph` in `kartograph/index.md`, and under today's date in
`kartograph/log.md`: `* **Intent**: derived [title](file) from [conversation title](conversation file).`

Then validate: run `node validate-intent.js kartograph/<file>` with the script from this
file's directory (it also checks every citation against the conversation), and fix every
reported error until it prints `ok`. Never commit a file that does not pass.

Stage only the intent file, `kartograph/index.md` and `kartograph/log.md`, commit as
`intent: <title>`, and push to the branch's upstream. No git or no upstream: skip and say
so. Report the path, the commit, and the open questions. Then you are done.
