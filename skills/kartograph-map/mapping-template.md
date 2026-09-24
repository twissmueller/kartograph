---
type: Mapping
title: <the intent's title>
description: <one sentence: how much of the intent the project already has>
status: mapped
date: <YYYY-MM-DD>
sources: [<the intent's file name: YYYY-MM-DD-HHMM-slug.intent.md>]
related: [<earlier kartograph/ documents the research leaned on — or an empty list>]
---

# <the intent's title>

<!-- Every intended outcome of the intent appears in exactly one of the four groups, in
     bold and word for word as the intent states it, without its turn citation. An empty
     group is 'None identified.'. validate-mapping.js checks all of that. -->

## Done

- **<intended outcome>** — `<commit hash>` <commit subject>; `features/<capability>/<feature>.feature › <scenario>`

## Partly done

- **<intended outcome>** — exists: `<commit hash, or features/….feature › scenario>`. Missing: <what is not there yet>.

## New

- **<intended outcome>** — <one line: why nothing that exists covers it>

## Contradicts

- **<intended outcome>** — conflicts with `<commit, features/….feature › scenario, or kartograph/ document>`: "<what the intent says>" versus "<what exists>". Open question: <what a follow-up conversation has to settle>

## Researched

- git log: <how far back, how many commits>
- features: <the capabilities read>
- kartograph: <the earlier documents read, or none>
