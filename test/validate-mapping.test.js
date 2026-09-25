import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMapping, outcomesOf, normalizeOutcome } from "../skills/kartograph-map/validate-mapping.js";

const FILE = "kartograph/2026-09-15-1042-offline-watering.mapping.md";

const intent = `## Intended outcomes

- Today's tasks are visible offline [turn 3]
- A task ticked offline shows as done
  after reconnecting [turns 3, 5]
- Overdue tasks are highlighted. [turn 9]
- Watering can be planned by week [turn 11]

## Non-goals
`;

const valid = `---
type: Mapping
title: Offline watering schedule
description: Half of the offline schedule exists; ticking offline is new.
status: mapped
date: 2026-09-15
sources: [2026-09-15-1042-offline-watering.intent.md]
related: []
---

# Offline watering schedule

## Done

- **Today's tasks are visible offline** — \`3f2a9c1\` feat: cache today's tasks; \`features/watering/today.feature › Showing today's tasks offline\`

## Partly done

- **A task ticked offline shows as done after reconnecting** — exists: \`features/watering/tick.feature › Ticking a task\`. Missing: the offline queue.

## New

- **Overdue tasks are highlighted** — nothing marks tasks by age today.

## Contradicts

- **Watering can be planned by week** — conflicts with \`2026-09-01-0900-daily-only.intent.md\`: "plan by week" versus "the schedule is daily only". Open question: Is the weekly plan a change of the daily-only decision?

## Researched

- git log: all 214 commits
- features: watering, planning
- kartograph: 2026-09-01-0900-daily-only.intent.md
`;

const swap = (from, to) => valid.replace(from, to);
const errs = (text, opts = {}) => validateMapping(text, { filename: FILE, outcomes: outcomesOf(intent), ...opts }).errors;
const has = (list, re) => list.some((e) => re.test(e));

test("a well-formed mapping passes", () => {
  assert.deepEqual(errs(valid), []);
});

test("outcomes are read from the intent without citations, wraps or trailing periods", () => {
  assert.deepEqual(outcomesOf(intent), [
    "Today's tasks are visible offline",
    "A task ticked offline shows as done after reconnecting",
    "Overdue tasks are highlighted",
    "Watering can be planned by week",
  ]);
  assert.equal(normalizeOutcome("  A  b [turn 2]. "), "A b");
});

test("frontmatter: type, status, and one intent with the same stamp and slug", () => {
  assert.ok(has(errs(swap("type: Mapping", "type: Intent")), /type must be Mapping/));
  assert.ok(has(errs(swap("status: mapped", "status: draft")), /status must be mapped/));
  assert.ok(has(errs(swap("sources: [2026-09-15-1042-offline-watering.intent.md]", "sources: []")), /exactly one intent file/));
  assert.ok(has(errs(swap("sources: [2026-09-15-1042-offline-watering.intent.md]", "sources: [2026-09-14-1000-other.intent.md]")), /stamp and slug/));
});

test("sections are exact and in order; empty groups say so", () => {
  assert.ok(has(errs(swap("## Researched", "## Findings")), /unknown section/));
  const noNew = swap("- **Overdue tasks are highlighted** — nothing marks tasks by age today.", "None identified.");
  assert.ok(has(errs(noNew), /'Overdue tasks are highlighted' is not mapped/));
  assert.deepEqual(errs(noNew, { outcomes: outcomesOf(intent).filter((o) => !o.startsWith("Overdue")) }), []);
  assert.ok(has(errs(swap("- git log: all 214 commits\n- features: watering, planning\n- kartograph: 2026-09-01-0900-daily-only.intent.md", "None identified.")), /Researched says what was read/));
});

test("each group's entries carry their evidence", () => {
  assert.ok(has(errs(swap("\`3f2a9c1\` feat: cache today's tasks; ", "")), /## Done: .* needs a commit hash and a features\/ citation/));
  assert.ok(has(errs(swap(". Missing: the offline queue.", ".")), /needs 'Missing:'/));
  assert.ok(has(errs(swap("exists: \`features/watering/tick.feature › Ticking a task\`", "exists: the tick screen")), /needs what exists, cited/));
  assert.ok(has(errs(swap(" Open question: Is the weekly plan a change of the daily-only decision?", "")), /needs 'Open question:'/));
  assert.ok(has(errs(swap("- **Overdue tasks are highlighted**", "- Overdue tasks are highlighted")), /starts with the intended outcome in bold/));
});

test("every intended outcome is mapped exactly once, and nothing else is", () => {
  const twice = swap("## Contradicts\n", "## Contradicts\n\n- **Overdue tasks are highlighted** — again. Open question: which?\n");
  assert.ok(has(errs(twice), /mapped twice/));
  assert.ok(has(errs(swap("**Overdue tasks are highlighted**", "**Something invented**")), /'Something invented' is not an intended outcome/));
});

test("related may name a revision", () => {
  assert.deepEqual(errs(swap("related: []", "related: [2026-09-25-1000-archive-undo.revision.md]")), []);
});
