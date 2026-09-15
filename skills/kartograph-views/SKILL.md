---
name: kartograph-views
description: Use when a capability or feature under features/ is specified and the person wants to see and use its screens in the Kotlin Multiplatform app before any real behaviour exists — the UI-first phase with mocked data. Also use to update those screens after the specification changed. Requires the capability or feature to be named.
---

# Kartograph Views

Build phase 1 of a capability: its screens, view models and fake use cases with sample
data, so every scenario can be walked in the running app and the person can judge the
flow before anything real is built. Read, derive, write, compile, look, commit, push,
report. **Fully automated: ask nothing, wait for nothing.** The one exception is the
input: if no capability or feature was named, stop and say so.

## Hard rules

- Implement **phase 1 only** as `docs/code-design/mvvm.md` defines it: view, view model,
  use case interfaces, fakes. No real use cases, no repositories, no data sources, no
  network, no database, no unit tests.
- Follow `docs/design-system.md` and `docs/code-design/mvvm.md` to the letter. If the
  project has neither, copy the defaults from this file's directory (`design-system.md`,
  `mvvm.md`) to those paths first; they are part of what you commit.
- Never invent behaviour. What a scenario does not state is not built; an open question
  in `capability.md` stays open and its screen shows nothing for it.
- Never scaffold a project. If there is no Gradle build (no `settings.gradle.kts` at the
  root or under `code/`), stop and tell the person to bootstrap with the KMP wizard first.
- Never launch the app. If a Compose Hot Reload server is connected you may `reload` and
  look; if not, compiling is the evidence and you say so.
- Never touch `intents/`, `knowledge/`, `features/`, or other features' modules. Outside
  the feature module you edit only the wiring: `settings.gradle.kts`, each app target's
  Koin and navigation registration, `core/navigation/Routes.kt`, and the theme in
  `shared/` when it is missing.
- Re-running on unchanged input changes nothing.

## 1. Read

Take the capability (`features/<capability>/`) or the feature file the person named. Read
its `capability.md` and every `.feature` in scope, the `knowledge/` bundle (canonical
titles become type and label names; a word in any `aliases_to_avoid` never appears in
code or on screen), both design documents, the project's instruction file, the Gradle
build (`settings.gradle.kts`, `gradle/libs.versions.toml`, the app targets, `shared/`,
`core/`), and any existing `feature-<capability>` module.

## 2. Derive

From the feature files, decide the screens: one per `.feature` unless its scenarios
clearly describe more than one place, with the scenarios' steps naming the controls and
the outcomes. For each screen, list from the scenarios:

- the **state** it shows (what `Given` and `Then` steps mention),
- the **events** the person can raise (each `When` step),
- the **effects** (navigation, snackbars) the `Then` steps imply,
- the **use cases** the view model needs: `Observe…` for what is shown, a command per
  `When` that changes something,
- the **sample data**: every named thing in every `Given`, in the stated state, plus the
  outcome knob an `@error` scenario needs.

Reconcile with what exists: an existing screen, state field, event or fake is extended,
never duplicated; a scenario that changed updates only what it changed; nothing is
removed unless the feature file no longer contains it.

## 3. Write

Following `mvvm.md` §2 and §6 phase 1: the module `feature-<capability>` (Gradle file from
the project's convention plugin or the nearest existing feature module as the template,
included in `settings.gradle.kts`), `domain/` models and use case interfaces and the
bundle, `presentation/` State, Event, Effect, ViewModel, Screen, View, `presentation/fake/`
fakes and sample data, `di/` module binding the fakes, the route in
`core/navigation/Routes.kt`, the nav entry, and the registration in each app target. Every
composable reads `AppTheme` tokens only; if `shared/` has no `AppTheme` yet, create it
exactly as `design-system.md` §1 describes, with the token values from §2 to §4.

Every control and outcome a scenario names has visible text or a `contentDescription`
using the scenario's own words, so a person and a semantic tree can find it. Loading,
empty and error are states of the screen. Strings live in one `strings` object per
feature, never inline.

## 4. Compile, look, commit, push, report

Compile the module and the desktop target (`./gradlew :feature-<capability>:build
:desktopApp:build`, with the project's actual paths); fix until green. If the Compose Hot
Reload MCP server reports a connected window, `reload`, then `get_ui_error`,
`get_semantic_tree` and `take_screenshot` for each screen, and check each scenario's
`Then` is visible where a person would look; a rendering error or a missing outcome means
the slice is not wired, so fix and reload. Never `restart` or `reset_ui` a window the
person is looking at without saying so in the report.

Stage only what you wrote or wired (the module, the wiring files, the two docs if you
copied them, the theme if you created it), commit as `views: <capability>`, push to the
branch's upstream. No git or no upstream: skip and say so. Report the screens and where
each lives, the scenarios the person can now walk and what to click, what the sample data
contains, what could not be built and why, and one line saying the desktop window proves
the shared UI only. Then you are done.
