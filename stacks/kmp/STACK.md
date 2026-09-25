---
name: kmp
title: Kotlin Multiplatform
status: ready
version: 1
targets: [android, ios, desktop-jvm, web-wasmjs, server-jvm]
docs: [design-system.md, code-design.md, build-design.md]
---

# Kotlin Multiplatform

One Kotlin codebase, Compose Multiplatform UI, five targets: Android, iOS, desktop (JVM),
web (wasmJs, thin client) and a Ktor server on the JVM. Clean Architecture with MVVM,
read as a hexagon: screens are the driving adapter, use cases and ports are the core,
repositories, data sources and the server are the driven adapters.

## Detection

A project is this stack when **all three** hold:

- `settings.gradle.kts` or `code/settings.gradle.kts` exists (never search under a `build/`
  directory: the Kotlin Toolchain's build output carries a generated
  `build/tasks/*/gradle-project/settings.gradle.kts`);
- at least one `build.gradle.kts` applies `kotlin("multiplatform")`,
  `alias(libs.plugins.kotlinMultiplatform)` or `id("org.jetbrains.kotlin.multiplatform")`;
- **no** `project.yaml` or `module.yaml` with a `kotlin` wrapper beside it at the project
  root or under `code/` (that is `kmp-toolchain`).

An Android application module alone, without a multiplatform module, is not this stack
(see `android-compose`).

## What the three documents cover

| document | covers | used by |
|---|---|---|
| `design-system.md` | tokens, `AppTheme`, Material 3 substrate, components, layout, accessibility | plan, screens |
| `code-design.md` | the three rings, module and package layout, State/Event/Effect, naming, DI, navigation, what each ring builds | plan, screens, domain, adapters |
| `build-design.md` | ports and adapters in detail: repositories, Room, Ktor client, platform capabilities, the server, tests by layer, definition of done | plan, domain, adapters |

## Provenance

Derived from the user's KMP knowledge repository (`~/projects/knowledge/references/`,
atoms A0–A11, C1, C2, C9–C12, P3, P4, P8, I1–I4). Two deliberate departures, both marked
in the documents: the theme lives in `shared/` rather than `core/presentation/` because
`core` carries no Compose, and the server section of `build-design.md` is Kartograph's own
minimal default because the repository's server atom is a deferred stub.

## Delivery

`distribution/` beside this file holds the entry scripts `kartograph-deliver` copies into a
project on first use, over the shared libraries from `stacks/common/distribution/lib/`:
run-local.sh (desktop, ios, android, docker), run-device.sh, prepare-release.sh, deploy-testflight.sh, deploy-play-internal.sh, push-store-metadata.sh, release-check.sh, release-stores.sh. Their contract is `stacks/common/DISTRIBUTION.md`.
`screenshots.md` beside this file is how `kartograph-release` builds the project's
store-screenshot renderer the first time.
