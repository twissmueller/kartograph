---
name: apple-swift
title: Native Apple with Swift and SwiftUI
status: scaffold
version: 0
targets: [ios, macos]
docs: [design-system.md, code-design.md, build-design.md]
---

# Native Apple with Swift and SwiftUI

Swift, SwiftUI, one Xcode project or Swift package.

**This stack is a scaffold.** Its three documents carry the section headings every stack
must answer and an UNFILLED marker in each; `kartograph-plan` refuses to plan against a
scaffold and says so. Fill the sections from the owner's own conventions — never from
general practice — then set `status: ready` and `version: 1`.

## Detection

A project is this stack when:

- a `Package.swift` at the root, or an `*.xcodeproj` / `*.xcworkspace` directory;
- **no** `settings.gradle.kts` (a KMP project also carries an `iosApp/` Xcode project; the Gradle build decides).

## What the three documents must cover

| document | must answer |
|---|---|
| `design-system.md` | the token surface (colour, type, spacing, shape, elevation, motion), the one theme entry point, the component rules, layout and breakpoints, accessibility, what feature code may and may not touch |
| `code-design.md` | the three rings in this stack's terms (what is the driving adapter, the core, the driven adapters), module and package layout, the UI state contract, naming, dependency injection, navigation, what each ring builds and leaves behind |
| `build-design.md` | ports and adapters in detail: persistence, HTTP client, platform capabilities, the server, error translation, tests by layer, the definition of done per scenario |
