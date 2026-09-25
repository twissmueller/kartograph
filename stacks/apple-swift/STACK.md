---
name: apple-swift
title: Native Apple with Swift and SwiftUI
status: ready
version: 1
targets: [ios, macos, watchos]
docs: [design-system.md, code-design.md, build-design.md]
---

# Native Apple with Swift and SwiftUI

One Swift codebase, SwiftUI on every Apple platform: iPhone and iPad, Mac, and optionally
Watch, from one Xcode project over one local Swift package. Clean Architecture read as a
hexagon: SwiftUI views and their `@Observable` models are the driving adapter, the
Foundation-only core package holds the rules, and the protocols the models take at their
initialiser are the ports that SwiftData, CloudKit, the system frameworks and the store SDK
fulfil. iOS and macOS share one bundle identifier (Universal Purchase) and one build number.

## Detection

A project is this stack when **both** hold:

- a `Package.swift` at the root or under `Packages/`, or an `*.xcodeproj` / `*.xcworkspace`
  directory, or a `project.yml` for XcodeGen at the root;
- **no** `settings.gradle.kts` anywhere (a KMP project also carries an `iosApp/` Xcode
  project; the Gradle build decides, see `kmp`), and **no** `project.yaml` with a `kotlin`
  wrapper beside it at the root or under `code/` (a Kotlin Toolchain project generates
  `iosApp/module.xcodeproj`; see `kmp-toolchain`).

## What the three documents cover

| document | covers | used by |
|---|---|---|
| `design-system.md` | `AppStyle` tokens over the asset catalog, system appearance, semantic type, the `App*` components, size-class layout, accessibility identifiers, string catalogs | plan, screens |
| `code-design.md` | the three rings in Swift, package and folder layout, the `@Observable` model contract, naming, `AppEnvironment` as the composition root, navigation, what each ring builds | plan, screens, domain, adapters |
| `build-design.md` | ports and adapters in detail: SwiftData records, CloudKit, URLSession, platform capabilities behind protocols with doubles, launch seams, tests by layer, definition of done | plan, domain, adapters |

## Provenance

Derived from the owner's two shipped Swift apps, Beatrep (`~/projects/beatrep`, English
identifiers, Swift 6, `@Observable`, SwiftData, Swift Testing, XcodeGen) and Mokuso
(`~/projects/mokuso`, German identifiers, Swift 5 language mode, `ObservableObject`, plain
files in a user-chosen folder, XCTest, checked-in project), and from the owner's knowledge
repository atoms that touch the native lane (MON13, MAS8–MAS12, HRD7, RED10, CI4). Where the
two apps differ the documents take the newer convention and say so, marked *project dial*:
a project's copy may switch a dial and every later run follows the copy. Apple's current
guidance (Observation, Swift 6 concurrency, SwiftData, Swift Testing, Liquid Glass, string
catalogs) is cited where it confirms or sharpens a convention; it never replaces one.

## Delivery

`distribution/` beside this file holds the entry scripts `kartograph-deliver` copies into a
project on first use, over the shared libraries from `stacks/common/distribution/lib/`:
run-local.sh (macos, ios), run-device.sh, prepare-release.sh, deploy-testflight.sh (ios or mac), push-store-metadata.sh, release-check.sh, release-stores.sh. Their contract is `stacks/common/DISTRIBUTION.md`.
