---
type: Regel
title: Map writes are atomic
description: Every mutation of the map is written to a temp file and atomically renamed over kartograph.json, so a failed run leaves the real map untouched and never half-written.
status: draft
generated: { by: process:kartograph-migrate, at: 2026-08-29T08:26:31Z }
sources:
  - id: map
    resource: ../.kartograph/kartograph.json
    title: Pre-v0.18 Kartograph map
---

# Definition

Every mutation of the map is written to a temp file and atomically renamed over kartograph.json, so a failed run leaves the real map untouched and never half-written.
