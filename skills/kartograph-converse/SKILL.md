---
name: kartograph-converse
description: Use when a person brings an idea, a feature request, a problem, or a change they want, and no conversation about it has been recorded under kartograph/ yet — before any intent is derived, and before anything is designed, planned, specified, or coded. Also use for a follow-up conversation on the open questions or contradictions an earlier mapping recorded.
---

# Kartograph Converse

One conversation that pulls what a person really wants out of their head and records it,
block by block, as `kartograph/<YYYY-MM-DD-HHMM>-<slug>.conversation.md`. You steer the
conversation as well as you can; you do not interpret it. No goals, no buckets, no
summary: deriving the intent is not your job. The conversation file is the only output.

## Hard rules

- Write only the conversation file, `kartograph/index.md` and `kartograph/log.md`, and
  commit only those. No code, no other files.
- Record the person's words verbatim. Never paraphrase, correct, or summarise them.
- Never conclude on the person's behalf. What you find in the project is used only to ask.
- Ask in plain chat: one question per message, always with your recommended answer and,
  where there are choices, lettered options.
- You drive. Every message ends with the next question or the written file. Never stop to
  wait for the person to ask what comes next, and never ask whether to write.
- Do not name or start any later phase.
- Write the file in the language of the conversation.

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

## 1. Orient, silently

Read the project's instruction file, its README, and `kartograph/index.md`, so earlier
conversations and intents are not asked again. Then look at what exists, cheaply:
`git log --oneline` for the recent history, and the top-level capabilities under
`features/` (each `capability.md`'s heading and first lines). Fetch any referenced issue
or URL.

## 2. Look up while you talk

Whenever a topic touches something that may already exist, look it up before you ask:
drill from the top-level capability down through its sub-capabilities to the `.feature`
files and their scenarios, and search the history (`git log --oneline --grep`, or
`git log --oneline -- <path>`) for the commits that touched it. Use what you find only to
ask a better question — "Session history already has a scenario for this. Is this a change
to it?" — never to answer for the person, and never to decide that something is done or
planned.

## 3. Open up, then converge

Before any solution is discussed, establish in order: **who is speaking** (their role),
**what they want and why** (when they open with a solution, ask what outcome it serves),
**for whom things change**, and **how they will recognise success**. When the goal could
be read more than one way, offer two or three framings as options and let them pick.

Then converge like a tough, friendly reviewer, one dependent decision at a time: sharpen
vague words by asking for the concrete case ("walk me through the last time…"), ask what
is deliberately left out, ask what cannot change, and ask about anything the lookups
showed may overlap or conflict. Never loop on the unanswerable: when the person cannot
answer, move on; their answer is recorded as they gave it.

The conversation ends when the person says they are done or nothing is open. The last
question is always "Is anything missing?", recommending "Nothing is missing".

## 4. Record

Keep the record as you go, in the shape of `conversation-template.md` in this file's
directory: one block per message, numbered from 1, alternating between `AI` and `Person`,
ending with the person. When the person sends two messages in a row, they are one block.

- **Person blocks:** every word, verbatim. A spoken answer is transcribed, not tidied.
- **AI blocks:** only these lines —
  - `> Looked up: …`, one per lookup made for this message: the path, the commit hash and
    subject, or `features/….feature › scenario`; never the content;
  - `Reasoning (shortened): …`, at most one line: why you asked this;
  - `**Question:** …`, the question verbatim;
  - `- **A (recommended):** …`, `- **B:** …`, the options verbatim, one line each.

  Everything else you said (explanations, restatements, background) is not recorded.

## 5. Write and report

Write immediately when the conversation ends, without asking, to
`kartograph/<YYYY-MM-DD-HHMM>-<slug>.conversation.md` (the stamp is when the conversation
started; slug: the topic, lowercase, hyphenated, at most five words). Frontmatter as in the
template: `status: recorded`; `sources` lists the issue, ticket or URL the request came
from, else `[]`; `related` lists the earlier `kartograph/` documents this conversation
follows up by file name, without the `kartograph/` prefix, else `[]`. A follow-up is a new file, never an edit of an earlier one.

Update the bundle. If `kartograph/index.md` does not exist, create it with the frontmatter
`okf_version: "0.2"` and `kartograph_version:` the plugin's layout version from step 0,
then a `# Kartograph` heading. Add `* [title](file) - description _(Conversation, recorded)_`
as the first line under the heading. In `kartograph/log.md` (create it with a
`# Kartograph Log` heading if missing) add, under today's `## YYYY-MM-DD` (a new date goes
first): `* **Conversation**: recorded [title](file) — n blocks.`

Then validate: run `node validate-conversation.js kartograph/<file>` with the script from
this file's directory, and fix every reported error until it prints `ok`. Never commit a
file that does not pass.

Then commit and push, without asking: stage **only** the conversation file,
`kartograph/index.md` and `kartograph/log.md`, commit as `conversation: <title>`, and push
to the current branch's upstream. No git or no upstream: skip that part and say so. Show
the path and the commit, then stop.
