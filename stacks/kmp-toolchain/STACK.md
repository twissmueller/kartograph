---
name: kmp-toolchain
title: Kotlin Multiplatform on the Kotlin Toolchain
status: ready
version: 1
targets: [android, ios, desktop-jvm, web-wasmjs, server-jvm]
docs: [design-system.md, code-design.md, build-design.md]
---

# Kotlin Multiplatform on the Kotlin Toolchain

The `kmp` stack with a different build system. One Kotlin codebase, Compose Multiplatform
UI, five targets: Android, iOS, desktop (JVM), web (wasmJs, thin client) and a Ktor server
on the JVM. Clean Architecture with MVVM, read as a hexagon: screens are the driving
adapter, use cases and ports are the core, repositories, data sources and the server are
the driven adapters. Everything that is not the build is the `kmp` stack's, unchanged:
one feature is one module, Pattern A/B, Koin, Room, `core/` without Compose, the theme in
`shared/`, delivery through TestFlight and Play.

The build is JetBrains' **Kotlin Toolchain** (formerly Amper): a `project.yaml` listing
the modules, one declarative `module.yaml` per module, and the `kotlin` wrapper script
committed at the project root, run as `./kotlin build|test|run|package`. New Kotlin
Multiplatform projects use this stack (the owner's decision of 2026-09-25); existing
Gradle projects stay on `kmp`. The Kotlin Toolchain is **Alpha**: its file formats and
commands may change between releases, and the wrapper pins the exact version a project
builds with.

**Scope: iOS shares the UI through Compose.** This stack is for projects whose iOS app is
the Compose Multiplatform UI in an `ios/app` module. A project whose iOS app is native
SwiftUI consuming the shared code through an SPM wrapper package with SKIE (the knowledge
repo's I5) stays on Gradle and the `kmp` stack, until the Toolchain can export an
XCFramework with full SKIE. The check of 2026-09-25 found no XCFramework product and no
framework from a `kmp/lib` module: only a fixed-name `KotlinModules.framework` per slice
from the `ios/app` module through an undocumented `./kotlin task`. SKIE also ran only
partly, as a hand-wired compiler plugin (sealed classes to Swift enums, but no
`suspend`/`Flow` bridging). This is a matter of scope, not of detection: the owner picks
the stack before the project is created.

**Created with `kotlin new`, worked without an IDE.** A new project starts with
`./kotlin new --project-id=<id> --target-platform=android --target-platform=ios
--target-platform=desktop --target-platform=web --target-platform=server <dir>` (the
wizard is not the route; `code-design.md` § 2). The project is worked with command-line
tools only: the `./kotlin` commands in `build-design.md` are the whole build interface,
and the stack names no IDE, plugin or run configuration. The agent sees and drives the
running desktop app through Compose Hot Reload's MCP server, which the Toolchain serves
itself (P8; `build-design.md` § 9).

## Detection

A project is this stack when **all three** hold:

- a `project.yaml` exists at the project root or under `code/`, with an executable `kotlin`
  wrapper script beside it;
- at least one `module.yaml` listed by it declares the product type `kmp/lib`
  (`product:` → `type: kmp/lib`);
- **no** `settings.gradle.kts` and no `code/settings.gradle.kts` (that is the `kmp` stack,
  which in turn excludes a `project.yaml` with a `kotlin` wrapper, so a project holding
  both is mid-migration and matches neither until one build is removed). Never search
  under `build/`: the Toolchain's own output carries a generated
  `build/tasks/*/gradle-project/settings.gradle.kts`.

A single-module Toolchain project (a root `module.yaml` and no `project.yaml`) is not this
stack: the module layout below needs one module per feature. The Kotlin Toolchain
generates `iosApp/module.xcodeproj`; the `apple-swift` stack's detection excludes a project
with a `project.yaml`, so the Xcode project never makes this an Apple project.

## What the three documents cover

| document | covers | used by |
|---|---|---|
| `design-system.md` | tokens, `AppTheme`, Material 3 substrate, components, layout, accessibility | plan, screens |
| `code-design.md` | the three rings, module layout in `project.yaml` and `module.yaml`, package layout, State/Event/Effect, naming, DI, navigation, what each ring builds | plan, screens, domain, adapters |
| `build-design.md` | ports and adapters in detail: repositories, Room, Ktor client, platform capabilities, the server, the `module.yaml` wiring, `./kotlin` commands, tests by layer, definition of done | plan, domain, adapters |

## Provenance

Derived from the user's KMP knowledge repository (`~/projects/knowledge/references/`,
atoms A0–A11, C1, C2, C9–C12, P3, P4, P8, I1–I4) exactly as `kmp` is, plus atom **I11**
(Kotlin Toolchain), which records the decision to build new projects with it and the
owner's answers of 2026-09-25 (`kotlin new`, no IDE, P8 through the Toolchain's MCP server,
native-SwiftUI iOS stays on Gradle). The two
departures `kmp` declares stay: the theme lives in `shared/` because `core` carries no
Compose, and the server section of `build-design.md` is Kartograph's own minimal default.

The build facts (file names, product types, `src@<platform>` folders, `module.yaml` keys,
commands, flags, output paths) come from the Kotlin Toolchain documentation
(`kotlin-toolchain.org/dev`, release 0.12.2) and a hands-on check on 2026-09-25 with the
wrapper pinned at `0.13.0-dev-4435`, plus a second check the same day of the hot-reload
MCP server and of iOS framework export with SKIE. Every line the checks did not exercise
says so. Lines
where the Toolchain forces a departure from `kmp` are marked *Toolchain departure*.

## Delivery

`distribution/` beside this file holds the entry scripts `kartograph-deliver` copies into a
project on first use, over the shared libraries from `stacks/common/distribution/lib/`:
run-local.sh (desktop, ios, android, docker), run-device.sh, prepare-release.sh,
deploy-testflight.sh, deploy-play-internal.sh, push-store-metadata.sh, release-check.sh, release-stores.sh.
They are the `kmp` scripts byte for byte; `config.sh` sets `STACK="kmp-toolchain"`, which
makes them build the Android and desktop apps through `lib/kotlin-toolchain.sh` instead of
`lib/gradle.sh`. Their contract is `stacks/common/DISTRIBUTION.md`.

- **Android.** `androidApp/module.yaml` carries `settings.android.versionCode`,
  `versionName` and `signing: { enabled: true, propertiesFile: … }`, the properties file
  being the gitignored one `KEYSTORE_PROPERTIES` names (`./kotlin tool generate-keystore`
  writes a keystore and the file). `./kotlin package -m androidApp -f aab -v release`
  shrinks and signs the bundle; the scripts bump the two numbers in `module.yaml` first, so
  they land in the diff. Checked hands-on, up to a bundle `jarsigner` verifies; the Play
  upload itself is the shared, build-independent part.
- **iOS.** Only the Compose-UI iOS app is in scope here (see *Scope* above). A native
  SwiftUI app fed by an SPM-wrapped XCFramework is delivered by the `kmp` stack on Gradle.
  The Toolchain keeps bundle id, team, `MARKETING_VERSION` and
  `CURRENT_PROJECT_VERSION` as ordinary target settings in `iosApp/module.xcodeproj`
  (there is no `ios` section in `module.yaml`). The scripts read and write the version in
  an `.xcconfig`, so on first use move those two settings (and `DEVELOPMENT_TEAM`) out of
  the target into `iosApp/Configuration/Version.xcconfig`, set it as the base
  configuration of the `app` target's Debug and Release, and point `VERSION_FILE` at it;
  the Toolchain allows any change that keeps its `KOTLIN_CLI_WRAPPER_PATH` setting and its
  `Build Kotlin` phase. The route is `xcodebuild` on `module.xcodeproj`, scheme `app`, via
  `lib/xcode.sh`. **Not verified:** `./kotlin build` builds the unsigned app, but no
  archive, export or signed device build of a Toolchain project was run; a simulator build
  through `xcodebuild` directly failed in the check (both simulator architectures at once,
  then a module lookup under the symlinked `/tmp`), which a `-destination` naming one
  simulator and a project outside `/tmp` should avoid. Run `deploy-testflight.sh
  --platform ios` once by hand before relying on it.
