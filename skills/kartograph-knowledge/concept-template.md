---
type: <Concept | Actor | Subject | Event | Command | Policy>
title: <the one canonical name, as it should be used everywhere>
description: <one sentence that defines it, in the intent's language>
status: draft
aliases_to_avoid: [<words people use for this that must not become new concepts>]
tags: []
generated: { by: kartograph-knowledge/3.3.0, at: <YYYY-MM-DDTHH:MM:SSZ> }
sources:
  - id: <intent-file-slug>
    resource: ../kartograph/<YYYY-MM-DD-HHMM-slug>.intent.md
    title: <the intent's title>
---

# Definition

<The description, expanded to a short paragraph only where one sentence is not enough.
Nothing the intent did not say. If the meaning hangs on an open question from the intent,
say which one here and keep `status: draft`.>

# Relations

<Bundle-relative links, one per line, with the relationship in prose:>

- Issued by [Actor](/actors/<slug>.md)
- Acts on [Subject](/subjects/<slug>.md)
- Produces [Event](/events/<slug>.md)
- Triggers [Command](/commands/<slug>.md)

# From the intent

<The lines of the intent this concept is drawn from, quoted, each footnoted:>

> <quoted line>[^<intent-file-slug>]

[^<intent-file-slug>]: <the intent's title>
