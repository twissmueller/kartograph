---
name: karto-grill
user-invocable: false
description: Survey a feature for Kartograph — interview the user relentlessly to discover Subjects, Events, Actors, Rules, affected and candidate Capabilities, and ADR candidates, challenging every term against the project glossary. Use as Phase A of /karto-explore. Read-only — captures findings into a survey, never writes the map.
---

# Karto-Grill — the survey conversation

This is **Phase A of `/karto-explore`**: a relentless, one-question-at-a-time interview that
turns a rough feature idea into a precise, shared understanding — expressed in Kartograph's
vocabulary — ready to hand to the discovery workflow.

## Read first (read-only)

- The **meta-glossary** (the ten framework terms) at `${CLAUDE_PLUGIN_ROOT}/reference/glossary.md`.
- The **project glossary and current map** in `.kartograph/kartograph.json` (if it exists). Load the
  existing contexts, capabilities, subjects, and glossary terms so you can challenge new
  language against them.
- If the user references a GitHub issue, fetch it (`gh issue view <n>`) and fold it in.

## The interview

Run it like a tough technical reviewer. **One question at a time. Always offer your
recommended answer.** Walk the decision tree, resolving dependencies between decisions one by
one. Prefer to answer a question by reading the codebase rather than asking.

As you go, actively:

- **Challenge new terms against the glossary.** If the user says a word the glossary already
  covers under a different name, call it out: *"You said 'user' — the glossary already defines
  'Akteur (Actor)'. Same thing, or genuinely different?"* Drive toward the single canonical term.
- **Sharpen fuzzy language.** When a term is vague or overloaded, propose a precise canonical
  term and a one-line definition.
- **Probe concrete scenarios.** Push for Given/When/Then examples — happy path, edge cases,
  and error paths — and note which Subjects, Events, and Rules each touches.
- **Surface architecture decisions.** When the user states a technical/structural intent
  (platforms, storage, sync, third-party services), apply the **ADR worthiness test** — record
  it as an ADR candidate only when ALL three hold: **hard to reverse**, **surprising without
  context**, and **the result of a real trade-off**. Otherwise it is a plain Feature, not an ADR.
- **Locate it on the map.** Decide which existing Context/Capability the change touches, and
  whether it needs a new Capability candidate (born `vision`).
- **Capture open questions.** When you raise a valid question the user cannot answer yet
  (often a customer decision — retention, ownership, pricing, an external constraint), do not
  loop on it: note it as an **open question** and move on. These are not failures — they are
  the agenda for the next customer conversation.

## Hard rule — read-only

**Do not write anything except, ultimately, the survey.** Never modify `.kartograph/kartograph.json`, the
glossary, `.feature` files, ADR files, or code. You *capture* glossary additions and ADR
candidates as proposals; the separate `/karto-chart` phase is the only thing that writes them.
This division is deliberate: it preserves the human review gate and the atomic, schema-gated
write.

## Output

End by producing a tight **conversation summary** (what was discussed and decided, in prose)
plus the raw feature description and any issue reference. If any questions were left
unanswered, list them verbatim under an **"Offene Fragen / Open questions"** heading at the
end of the summary — the discovery workflow reads that section to record them on the map. The `/karto-explore` command hands
these to the discovery workflow, which extracts the structured findings and writes the survey
file `kartograph/surveys/<date>-<slug>.discovery.json`.
