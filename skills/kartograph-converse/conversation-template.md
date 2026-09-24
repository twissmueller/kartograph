---
type: Conversation
title: <short name for what the conversation was about>
description: <one sentence: what the person brought up>
status: recorded
date: <YYYY-MM-DD>
role: <the role the person spoke from>
language: <language of the conversation>
sources: [<issue, ticket, URL or document the request came from — or an empty list>]
related: [<earlier kartograph/ documents this conversation follows up — or an empty list>]
---

# <title>

<!-- One block per message, numbered from 1, alternating between AI and Person, ending
     with the person. The person's words verbatim. An AI block holds only: one line per
     lookup, at most one line of shortened reasoning, the question verbatim, and the
     options verbatim, one line each. validate-conversation.js checks that shape. -->

### 1 — Person

<what the person said, verbatim>

### 2 — AI

> Looked up: <path, commit hash and subject, or features/….feature › scenario>
Reasoning (shortened): <one line: why this question>

**Question:** <the question, verbatim>
- **A (recommended):** <option, one line>
- **B:** <option, one line>

### 3 — Person

<the answer, verbatim>
