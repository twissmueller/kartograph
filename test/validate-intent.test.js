import { test } from "node:test";
import assert from "node:assert/strict";
import { validateIntent, SECTIONS } from "../skills/kartograph-explore/validate-intent.js";

const FILE = "intents/2026-09-15-1042-offline-watering.md";

const valid = `---
title: Offline watering schedule
date: 2026-09-15
status: confirmed
role: product owner
language: English
sources: none
related: none
---

# Offline watering schedule

## Summary

The gardener wants to see and tick off today's watering tasks without a network connection.

## Who

- **Speaking:** product owner of the garden app
- **Benefits:** gardeners in greenhouses with no reception
- **Affected:** the sync team

## Goals

- Watering tasks usable without a network connection

## Intended outcomes

- Today's tasks are visible offline
- A task ticked offline shows as done after reconnecting

## Non-goals

- Editing the schedule offline — rare, and it needs conflict handling

## Constraints

- Must work on the existing Android build

## Assumptions

- Tasks for the day are already on the device before the connection drops

## Decisions

- **Cache the whole day** — because a day is small. Rejected: caching the week (stale data).

## Open questions

- **How long may cached tasks be shown?** — who can answer: the head gardener. Why it
  matters: staleness rules.

## Terms

- **Watering task**: one plant bed to water on one day

## Notes

None identified.
`;

const swap = (from, to) => valid.replace(from, to);

test("a well-formed intent passes", () => {
  const { errors } = validateIntent(valid, { filename: FILE });
  assert.deepEqual(errors, []);
});

test("filename shape and slug length are enforced", () => {
  assert.ok(validateIntent(valid, { filename: "intents/offline.md" }).errors.some((e) => /filename must be/.test(e)));
  assert.ok(validateIntent(valid, { filename: "intents/2026-09-15-1042-a-b-c-d-e-f.md" }).errors.some((e) => /at most 5/.test(e)));
});

test("frontmatter keys are exact, ordered and non-empty", () => {
  assert.ok(validateIntent(swap("role: product owner\n", ""), { filename: FILE }).errors.some((e) => /missing 'role'/.test(e)));
  assert.ok(validateIntent(swap("related: none\n", "related: none\nowner: me\n"), { filename: FILE }).errors.some((e) => /unknown key 'owner'/.test(e)));
  assert.ok(validateIntent(swap("title: Offline watering schedule\ndate: 2026-09-15\n", "date: 2026-09-15\ntitle: Offline watering schedule\n"), { filename: FILE }).errors.some((e) => /order/.test(e)));
  assert.ok(validateIntent(swap("sources: none", "sources:"), { filename: FILE }).errors.some((e) => /'sources' is empty/.test(e)));
});

test("date must match the filename and status is constrained", () => {
  assert.ok(validateIntent(swap("date: 2026-09-15", "date: 2026-09-14"), { filename: FILE }).errors.some((e) => /does not match the filename date/.test(e)));
  assert.ok(validateIntent(swap("status: confirmed", "status: final"), { filename: FILE }).errors.some((e) => /status must be/.test(e)));
});

test("the H1 must equal the title", () => {
  const r = validateIntent(swap("# Offline watering schedule", "# Something else"), { filename: FILE });
  assert.ok(r.errors.some((e) => /does not match the frontmatter title/.test(e)));
});

test("every section is required, in order, and non-empty", () => {
  const missing = validateIntent(swap("## Notes\n\nNone identified.\n", ""), { filename: FILE });
  assert.ok(missing.errors.some((e) => /missing section\(s\): ## Notes/.test(e)));
  const extra = validateIntent(swap("## Notes", "## Risks\n\n- none\n\n## Notes"), { filename: FILE });
  assert.ok(extra.errors.some((e) => /unknown section\(s\): ## Risks/.test(e)));
  const empty = validateIntent(swap("## Constraints\n\n- Must work on the existing Android build\n", "## Constraints\n\n"), { filename: FILE });
  assert.ok(empty.errors.some((e) => /## Constraints is empty/.test(e)));
  const reordered = validateIntent(valid.replace("## Goals\n\n- Watering tasks usable without a network connection\n\n", "").replace("## Notes", "## Goals\n\n- late\n\n## Notes"), { filename: FILE });
  assert.ok(reordered.errors.some((e) => /order/.test(e)));
  assert.equal(SECTIONS.length, 11);
});

test("list sections must be bullets or the empty marker; Who needs its three labels", () => {
  const prose = validateIntent(swap("- Watering tasks usable without a network connection", "Watering tasks usable offline."), { filename: FILE });
  assert.ok(prose.errors.some((e) => /## Goals must be a bullet list/.test(e)));
  const who = validateIntent(swap("- **Affected:** the sync team\n", ""), { filename: FILE });
  assert.ok(who.errors.some((e) => /## Who is missing the '\*\*Affected:\*\*'/.test(e)));
});

test("template placeholders are rejected", () => {
  const r = validateIntent(swap("- Must work on the existing Android build", "- <what cannot change>"), { filename: FILE });
  assert.ok(r.errors.some((e) => /template placeholder/.test(e)));
});
