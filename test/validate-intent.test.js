import { test } from "node:test";
import assert from "node:assert/strict";
import { validateIntent, turnsOf, SECTIONS, LEGACY } from "../skills/kartograph-intent/validate-intent.js";

const FILE = "kartograph/2026-09-15-1042-offline-watering.intent.md";

const valid = `---
type: Intent
title: Offline watering schedule
description: The gardener wants today's watering tasks usable without a network connection.
status: derived
date: 2026-09-15
role: product owner
language: English
sources: [2026-09-15-1042-offline-watering.conversation.md]
related: []
---

# Offline watering schedule

## Summary

The gardener wants to see and tick off today's watering tasks without a network connection.

## Who

- **Speaking:** product owner of the garden app
- **Benefits:** gardeners in greenhouses with no reception
- **Affected:** the sync team

## Goals

- Watering tasks usable without a network connection [turn 1]

## Intended outcomes

- Today's tasks are visible offline [turn 3]
- A task ticked offline shows as done after reconnecting [turns 3, 5]

## Non-goals

- Editing the schedule offline — rare, and it needs conflict handling [turn 5]

## Constraints

- Must work on the existing Android build [turn 7]

## Assumptions

- Tasks for the day are already on the device before the connection drops

## Decisions

- **Cache the whole day** — because a day is small. Rejected: caching the week (stale data). [turn 7]

## Open questions

- **How long may cached tasks be shown?** — who can answer: the head gardener. Why it
  matters: staleness rules.

## Terms

- **Watering task**: one plant bed to water on one day

## Notes

None identified.
`;

const conversation = [1, 2, 3, 4, 5, 6, 7].map((n) => `### ${n} — ${n % 2 ? "Person" : "AI"}\n\ntext\n`).join("\n");
const swap = (from, to) => valid.replace(from, to);
const errs = (text, opts = {}) => validateIntent(text, { filename: FILE, ...opts }).errors;
const has = (list, re) => list.some((e) => re.test(e));

test("a well-formed intent passes, with and without the conversation beside it", () => {
  assert.deepEqual(errs(valid), []);
  assert.deepEqual(errs(valid, { turns: turnsOf(conversation) }), []);
  assert.equal(SECTIONS.length, 11);
});

test("turnsOf reads block numbers and speakers", () => {
  const t = turnsOf(conversation);
  assert.equal(t.get(1), "Person");
  assert.equal(t.get(2), "AI");
  assert.equal(t.size, 7);
});

test("filename, type and flat lists are enforced", () => {
  assert.ok(has(errs(valid, { filename: "kartograph/2026-09-15-1042-offline-watering.md" }), /filename must be/));
  assert.ok(has(errs(swap("type: Intent", "type: Conversation")), /type must be Intent/));
  assert.ok(has(errs(swap("related: []", "related: none")), /related must be a list/));
  assert.ok(has(errs(swap("role: product owner\n", "")), /missing 'role'/));
});

test("sources name exactly one conversation with the intent's stamp and slug, or the legacy marker", () => {
  assert.ok(has(errs(swap("sources: [2026-09-15-1042-offline-watering.conversation.md]", "sources: []")), /exactly one conversation file/));
  assert.ok(has(errs(swap("2026-09-15-1042-offline-watering.conversation.md", "2026-09-14-0900-other.conversation.md")), /stamp and slug/));
  assert.ok(has(errs(swap("sources: [2026-09-15-1042-offline-watering.conversation.md]", `sources: [2026-09-15-1042-offline-watering.conversation.md, ${LEGACY}]`)), /exactly one conversation file/));
});

test("status follows the origin", () => {
  assert.ok(has(errs(swap("status: derived", "status: draft")), /never 'draft'/));
  const legacy = swap("sources: [2026-09-15-1042-offline-watering.conversation.md]", `sources: [${LEGACY}, https://example.org/issue/7]`);
  assert.ok(has(errs(legacy), /legacy intent is never 'derived'/));
  assert.deepEqual(errs(legacy.replace("status: derived", "status: confirmed")), []);
});

test("goals, outcomes, non-goals, constraints and decisions cite the person's block", () => {
  assert.ok(has(errs(swap("- Today's tasks are visible offline [turn 3]", "- Today's tasks are visible offline")), /## Intended outcomes: every entry cites/));
  assert.ok(has(errs(swap("[turn 7]\n\n## Assumptions", "[turn 9]\n\n## Assumptions"), { turns: turnsOf(conversation) }), /cites turn 9, which the conversation does not have/));
  assert.ok(has(errs(swap("[turn 3]\n- A task", "[turn 2]\n- A task"), { turns: turnsOf(conversation) }), /cites turn 2, which is the AI's/));
  const legacy = swap("sources: [2026-09-15-1042-offline-watering.conversation.md]", `sources: [${LEGACY}]`).replace("status: derived", "status: confirmed").replace(/ \[turns? [\d, ]+\]/g, "");
  assert.deepEqual(errs(legacy), []);
});

test("sections, H1, lists and placeholders keep the old rules", () => {
  assert.ok(has(errs(swap("# Offline watering schedule", "# Something else")), /does not match the frontmatter title/));
  assert.ok(has(errs(swap("## Notes\n\nNone identified.\n", "")), /missing section\(s\): ## Notes/));
  assert.ok(has(errs(swap("- **Affected:** the sync team\n", "")), /## Who is missing the '\*\*Affected:\*\*'/));
  assert.ok(has(errs(swap("- Tasks for the day are already on the device before the connection drops", "Prose instead.")), /## Assumptions must be a bullet list/));
  assert.ok(has(errs(swap("- **Watering task**: one plant bed to water on one day", "- <term>")), /template placeholder/));
});

test("related may name a revision", () => {
  assert.deepEqual(errs(swap("related: []", "related: [2026-09-25-1000-archive-undo.revision.md]")), []);
});
