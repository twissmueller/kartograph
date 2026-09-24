# Conversation, intent, mapping — and versioned migration (v3.0.0)

Date: 2026-09-24. Status: approved in conversation, awaiting spec review.

## Why

Today `kartograph-explore` talks with the person *and* writes the intent in the same
conversation: the interpretation happens while talking, and nothing checks the intent
against what the project already has. The person wants three separate phases:

1. **Converse** — talk, and record the conversation. No interpretation.
2. **Intent** — derive the intent from the recorded conversation.
3. **Map** — research what already exists and map it against the intent, so that
   knowledge and features only work on what is still to be done and accept what is done.

The git log (the code) and `features/` are the truth for the mapping.

## The `kartograph/` directory

One flat Open Knowledge Format bundle at the project root. No subdirectories.

```
kartograph/
  index.md                                     okf_version: "0.2", kartograph_version: 3.0.0
  log.md                                       date-grouped, newest first
  2026-09-24-1430-export-csv.conversation.md   type: Conversation
  2026-09-24-1430-export-csv.intent.md         type: Intent
  2026-09-24-1430-export-csv.mapping.md        type: Mapping
  2026-09-18-0900-session-history.intent.md    migrated; no conversation behind it
```

- File name: `<YYYY-MM-DD-HHMM>-<slug>.<type>.md`, type lowercase. The intent and the
  mapping inherit the conversation's stamp and slug, so one chain sorts together.
- The `type` frontmatter property and the file-name suffix must agree (validator error).
- Every document carries flat frontmatter: `type`, `title`, `description`, `status`,
  `date`, then per type `role`/`language`, and `sources: [..]` / `related: [..]` as
  one-line lists (flat, so the validators need no YAML parser). Provenance chain: intent →
  its conversation (`sources`); mapping → its intent (`sources`), and the commits and
  feature files it cites in its body.
- A follow-up conversation (e.g. one resolving a mapping's contradictions) gets a new
  stamp and names the earlier documents under `related`.
- `index.md` frontmatter: `okf_version: "0.2"` and `kartograph_version`, the layout
  version the project is on. The plugin's layout version is the highest version among
  the files in `migrations/`; a release without a migration document leaves it unchanged.
  Body: `# Kartograph` and one line per document, newest first.
- Scope: only these three types move here. `knowledge/`, `features/`, `plans/`, `walks/`,
  `docs/code-design/` and `distribution/` stay where they are.

## `kartograph-converse` (replaces `kartograph-explore`; interactive)

- Steers the conversation as explore does today: open up (who, what and why, for whom,
  success), then converge one question per message, each with a recommended answer and
  lettered options where there are choices. The AI drives; every message ends with the
  next question or the written file.
- **Looks up during the conversation**, before and whenever a topic touches it:
  `git log --oneline`, and `features/` from the top-level capabilities (`capability.md`)
  down to sub-capabilities and `.feature` files. What it finds is used **only to ask**
  ("*Session history* already has a scenario for this — is this a change to it?"),
  never to conclude.
- **Records turn by turn** into `<stamp>-<slug>.conversation.md`:
  - verbatim: every word of the person; the AI's question; the options with their
    one-line descriptions; which one it recommended;
  - as a reference: what was looked up (path, commit hash, scenario name), not its
    content;
  - shortened to one line: the AI's reasoning and explanatory prose.
- No buckets, no summary, no intent playback. It ends when the person says they are done
  or nothing is open; the last question is "Is anything missing?".
- Writes, validates (`validate-conversation.js`), commits (`conversation: <title>`) and
  pushes only that file; updates `log.md` and creates `index.md` if missing.

Block shape (the template fixes it; the validator checks it). Blocks are numbered
sequentially from 1 and alternate between AI and Person, ending with the person, so a
citation `[turn 8]` names exactly one block of the person's words:

```markdown
### 7 — AI
> Looked up: `features/export/capability.md`
Reasoning (shortened): the intent phase may derive only from this file.

**Question:** What exactly goes into the conversation file?
- **A (recommended):** …
- **B:** …

### 8 — Person
A
```

## `kartograph-intent` (new; automated)

- Takes the conversation named, else the newest conversation without an intent.
- Writes `<same stamp>-<same slug>.intent.md` with today's intent sections (Summary, Who,
  Goals, Intended outcomes, Non-goals, Constraints, Assumptions, Decisions, Open
  questions, Terms, Notes).
- Every goal, outcome, non-goal, constraint and decision cites the turn it comes from
  (`[turn 7]`). What the person did not say is an assumption or an open question, never
  a statement. An AI recommendation the person did not accept is not a decision.
- `status: derived` (the person never saw the intent in this form); `sources` → the
  conversation.
- No questions; validates, commits (`intent: <title>`), pushes, reports.

## `kartograph-map` (new; automated)

- Takes the intent named, else the newest intent without a mapping.
- Researches, in order of authority: `features/` and the git log (the truth), then
  earlier intents, mappings and conversations in `kartograph/` (background). Reads code
  only to confirm what a commit or scenario claims.
- Writes `<same stamp>-<same slug>.mapping.md`: one entry per intended outcome in exactly
  one of four groups:
  - **Done** — with the commit hash(es) or `feature › scenario` that show it;
  - **Partly done** — what exists (cited) and what is missing;
  - **New** — nothing exists;
  - **Contradicts** — the intent conflicts with a scenario, a commit, or an earlier
    intent; each becomes an open question for a follow-up conversation.
- No questions; validates, commits (`mapping: <title>`), pushes, reports.

## Knowledge and features

- Both take an intent **and its mapping**; they refuse an intent that has no mapping.
- They work only on *Partly done* and *New*; *Done* is accepted as is; *Contradicts* is
  recorded as an open question (features: in `capability.md`), never resolved by them.
- Knowledge concepts' `sources[].resource` becomes `../kartograph/<file>.intent.md`.
- Feature provenance becomes `# Source intent: kartograph/<file>.intent.md` in `.feature`
  files and `- Intent: \`kartograph/<file>.intent.md\`` in `capability.md`; the features
  validator's path pattern changes accordingly.

## Versions and migration

### `migrations/<version>.md` at the plugin root

One per version that changes a project's layout. Each has three sections:

- **Target state** — what is true of a project on this version.
- **Recognise** — how to tell a project is not there yet.
- **Do** — what changes, naming the script for the mechanical part.

Written now: `migrations/2.1.0.md` (behind it `scripts/migrate-features.js`) and
`migrations/3.0.0.md` (behind it the new `scripts/migrate-kartograph.js`).

Migration scripts always write the **newest** layout: when a later version changes the
layout, the earlier scripts are updated to write the new one directly (so
`migrate-features.js` now writes its provenance intent to `kartograph/`). The
`migrate-kartograph.js` script composes them in one run with `--check` reporting the
project version, the layout version and the documents in between. This is how the merge
happens mechanically; the skill merges any judgment steps the documents name.

### Project version

`kartograph_version` in `kartograph/index.md`. Without it, the version is inferred from
the layout: `intents/` present → before 3.0.0; `features/` without `capability.md` →
before 2.1.0.

### `kartograph-migrate` (new; automated)

- Reads the project version and the plugin version, collects every migration document in
  between, and **merges them into the final target state**: it does only what is needed
  to reach the newest target, never replays each version step by step (a file moved by
  one version and renamed by the next is moved once, to its final name).
- Runs all current validators on the result, including `validate-kartograph.js` (the
  bundle's structure: only `index.md`, `log.md` and typed documents, no subdirectories,
  file-name suffix agrees with `type`, every document listed in `index.md`, every
  `sources` link resolves); anything it cannot derive is noted in
  `kartograph/log.md`, never invented.
- Sets `kartograph_version`, commits once (`chore: migrate to kartograph <version>`),
  pushes, reports.

### Version gate in every other skill

Each skill first determines the project version. If it is older than the plugin's, it
stops with one sentence: "This project is on Kartograph <x>; run kartograph-migrate
first." A project with no Kartograph files at all is new, not old, and passes.

### The 3.0.0 migration

- `intents/<stamp>-<slug>.md` → `kartograph/<stamp>-<slug>.intent.md`, frontmatter
  converted to the OKF shape, `status` kept as is (`confirmed`/`draft`), `sources` gets
  an entry marking it *legacy — derived without a recorded conversation*.
- Rewrites every `../intents/…` in `knowledge/` and every `intents/…` provenance line in
  `features/` (header comments and `capability.md` only; no step, scenario or title is
  touched).
- Creates `index.md` and `log.md`; removes the empty `intents/`.
- No mappings are generated for legacy intents.

## Repository changes

- Skills: remove `kartograph-explore`; add `kartograph-converse`, `kartograph-intent`,
  `kartograph-map`, `kartograph-migrate`.
- Templates and validators: `conversation-template.md` + `validate-conversation.js`;
  `intent-template.md` + `validate-intent.js` move to `kartograph-intent` and gain type,
  OKF provenance, turn citations and `derived`; `mapping-template.md` +
  `validate-mapping.js`. Features and knowledge validators accept the new provenance
  paths. Tests for each under `test/`.
- Version gate text in every skill; `kartograph-knowledge` and `kartograph-features`
  read the mapping.
- `.claude-plugin/plugin.json` skills list, `opencode/index.js` tools and files, README
  table, CLAUDE.md, `docs/phases.svg`.
- Release 3.0.0 (breaking): all three manifests, `generated.by` actors bumped, tag.
- Then migrate hyperid, beatrep, mokuso, longpath and aida with `kartograph-migrate`.

Skill count after the change: converse, intent, map, knowledge, features, plan, screens,
domain, adapters, walk, deliver, migrate — **twelve**.

## Out of scope

- Moving `knowledge/`, `features/`, `plans/` or `walks/` into `kartograph/`.
- Generating mappings for migrated legacy intents.
- Any change to plan, the rings, walk or deliver beyond the version gate.
