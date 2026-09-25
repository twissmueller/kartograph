---
type: Revision
title: <short name for what changes>
description: <one sentence: what the person wants changed>
status: recorded
date: <YYYY-MM-DD>
role: <the role the person spoke from>
language: <language of the revision>
sources: [<the intent file of every affected capability: YYYY-MM-DD-HHMM-slug.intent.md>]
related: [<earlier kartograph/ documents this revision follows up — or an empty list>]
---

# <title>

<!-- The person's words verbatim in numbered blocks, starting and ending with the person.
     An AI block only when the words were genuinely ambiguous: one question and its
     options. Every change cites the person's block it comes from. validate-revision.js
     checks all of that. -->

## Conversation

### 1 — Person

<what the person said, verbatim>

## Affected

- Capability: `features/<capability>/capability.md`
- Feature: `features/<capability>/<feature>.feature`
- Scenario: `features/<capability>/<feature>.feature › <scenario>`
- Screen: `<ScreenName>` in `plans/<YYYY-MM-DD-HHMM>-<capability>.md`

## Changes

- **Changed:** `features/<capability>/<feature>.feature › <scenario>` — <what changes, in the person's words where possible> [turn 1]
- **Added:** `features/<capability>/<feature>.feature` — <the new behaviour> [turn 1]
- **Removed:** `features/<capability>/<feature>.feature › <scenario>` — <what the person said to drop> [turn 1]

## Open questions

<One bullet per thing the words leave open, naming the change it blocks. Or: None identified.>
