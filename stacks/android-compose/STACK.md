---
name: android-compose
title: Native Android with Jetpack Compose
status: scaffold
version: 0
targets: [android]
docs: [design-system.md, code-design.md, build-design.md]
---

# Native Android with Jetpack Compose

Kotlin, Jetpack Compose, one Android app.

**This stack is a scaffold.** Its three documents carry the section headings every stack
must answer and an UNFILLED marker in each; `kartograph-plan` refuses to plan against a
scaffold and says so. Fill the sections from the owner's own conventions — never from
general practice — then set `status: ready` and `version: 1`.

## Detection

A project is this stack when:

- an Android application module: a `build.gradle.kts` applying `com.android.application` (or `alias(libs.plugins.androidApplication)`) with Compose enabled;
- **no** module applying `kotlin("multiplatform")` (that is the `kmp` stack).

## What the three documents must cover

| document | must answer |
|---|---|
| `design-system.md` | the token surface (colour, type, spacing, shape, elevation, motion), the one theme entry point, the component rules, layout and breakpoints, accessibility, what feature code may and may not touch |
| `code-design.md` | the three rings in this stack's terms (what is the driving adapter, the core, the driven adapters), module and package layout, the UI state contract, naming, dependency injection, navigation, what each ring builds and leaves behind |
| `build-design.md` | ports and adapters in detail: persistence, HTTP client, platform capabilities, the server, error translation, tests by layer, the definition of done per scenario |

## Delivery

`distribution/` beside this file holds the entry scripts `kartograph-deliver` copies into a
project on first use, over the shared libraries from `stacks/common/distribution/lib/`:
run-local.sh (android), prepare-release.sh, deploy-play-internal.sh, push-store-metadata.sh, release-stores.sh. Their contract is `stacks/common/DISTRIBUTION.md`.
