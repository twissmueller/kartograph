---
name: kartograph-explore
description: Use when a person brings an idea, a feature request, a problem, or a change they want, and no written statement of their intent exists yet — before anything is designed, planned, specified, or coded. Also use to revisit or extend an intent already recorded under intents/.
---

# Kartograph Explore

One conversation that pulls what a person really wants out of their head and writes it
down as `intents/<YYYY-MM-DD-HHMM>-<slug>.md`. It first **opens the idea up**, then
**converges** one question at a time. The intent file is the only output.

## Hard rules

- Write only the intent file, and commit only that. No code, no other files.
- Never invent. What was neither said nor read is an *assumption* or an *open question*.
- Ask in plain chat: one question per message, always with your recommended answer.
- You drive. Every message ends with the next question, the playback, or the written
  file. Never stop to wait for the person to ask what comes next, and never ask whether
  to continue or whether to write.
- Do not name or start any later phase.
- Write the file in the language of the conversation.

## 1. Orient, silently

Read the project's instruction file, its README, and every file under `intents/`; earlier
intents must not be re-asked. Fetch any referenced issue or URL. Prefer reading the code
over asking.

## 2. Open up

Before any solution is discussed, establish in order: **who is speaking** (their role),
**what they want and why** (when they open with a solution, ask what outcome it serves),
**for whom things change**, and **how they will recognise success**. When the goal could
be read more than one way, reflect two or three framings back and let them pick. Whatever
is not needed for the stated success is a candidate non-goal; say so.

## 3. Grill

Converge like a tough, friendly reviewer, resolving dependent decisions one by one. Every
statement lands in exactly one bucket:

| bucket | test |
|---|---|
| goal | why the work exists |
| intended outcome | what will observably be true when it is done |
| non-goal | deliberately left out, and why |
| constraint | what cannot change: time, money, platform, law, existing systems |
| assumption | taken for granted by either side, stated so it can be denied |
| decision | a choice, with its reason and the rejected alternatives |
| open question | what the person cannot answer yet, and who can |

Sharpen vague words by asking for the concrete case ("walk me through the last time…").
Ask for non-goals explicitly. Never loop on the unanswerable: record it and move on.

**Stop condition:** play the whole intent back in prose and ask what is missing or wrong.
Repeat until nothing is. That confirmation turns `draft` into `confirmed`, and you write
the file in the same turn.

## 4. Write and report

Write immediately, without asking. Fill `intent-template.md` from this file's directory into
`intents/<YYYY-MM-DD-HHMM>-<slug>.md` (slug: the topic, lowercase, hyphenated, at most
five words). Create `intents/` if missing. Never overwrite an earlier intent; a revisited
one gets a new file naming the old one under `related`. Keep every section, writing
"None identified." where empty, so a reader knows it was asked.

Then commit and push it, without asking: stage **only** that file (never the rest of the
working tree), commit it as `intent: <title>`, and push to the current branch's upstream.
If the project is not a git repository or has no upstream, skip that part and say so.
Show the path, the commit, and the open questions, then stop.
