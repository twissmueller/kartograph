# Code design: three rings (Native Apple with Swift and SwiftUI)

How a feature is built in every native Apple app, and in which order. Clean Architecture
read as a hexagon, with SwiftUI used as Apple intends it: views own `@Observable` models,
models take their collaborators as protocols, the rules live in a Foundation-only Swift
package. This document is the contract `kartograph-plan` plans against and
`kartograph-screens`, `kartograph-domain` and `kartograph-adapters` execute. Change it here,
not in the code. Lines marked *project dial* are where the owner's two apps differ; the
project's copy of this file may switch them.

## 1. The hexagon in this stack

```
ring 1  screens    View → Model                          driving adapter: what the person touches
ring 2  domain     <App>Core: value types, rules,        the core: business behaviour, Foundation only
                   state machines, decision functions
ring 3  adapters   SwiftData records, CloudKit,          driven adapters: what the model talks to,
                   EventKit, HealthKit, CoreBluetooth,   each behind a protocol the model owns
                   Vision, StoreKit via RevenueCat,
                   URLSession
```

- **Ports** are the protocols a model takes in its initialiser, declared in the app target
  beside the model that uses them, never in the core: the core must not know that a camera,
  an iCloud account or a store exists. A port is named for the capability
  (`ICloudStoring`, `BodyPoseSource`), is `@MainActor` unless its adapter is genuinely
  off-main, and ships with its double in the same file. The identifiers in code are the
  project's: `…ing`, `…Source`, `…Model`, `…Record`, `Fake…`; never "port" or "adapter".
- **Dependencies point inward.** A view knows its model; a model knows domain types and
  the protocols it was given; the core knows nothing else. `<App>Core` imports Foundation
  only, never SwiftUI, UIKit, AppKit, SwiftData or a system framework, and its tests run
  with `swift test` in seconds without an Xcode project.
- **Data flows outward as core value types.** Adapters decode records or frames into domain
  values, the model holds them as observed state, the view reads them. Actions flow inward
  as method calls on the model.
- **A use case is two halves:** a method on the model that orchestrates (asks the port,
  updates state) and a pure type in the core that decides (the rule, the state machine,
  the decision function). The pure half is where the tests bite.

### The layers inside the rings

- **View** (`<Subject>View: View`) owns its model with `@State private var model =
  <Subject>Model()` and renders `model`'s state. Small views take plain properties with
  defaults and closure callbacks (`var onOpen: (Day) -> Void = { _ in }`) so they can be
  built alone in previews and tests. No logic beyond choosing what to show.
- **Model** (`@MainActor @Observable final class <Subject>Model`) holds `private(set)`
  state, exposes one method per thing the person can do, and calls the core for every
  decision. Injected collaborators are `@ObservationIgnored` because they never change and
  must not drive a redraw. It never imports SwiftData beyond a `ModelContext` handed to it;
  it never reads `AppEnvironment.shared` except as an initialiser default.
- **Core** (`Packages/<App>Core`) holds one file per concept: `public struct` and `enum`
  value types that are `Hashable, Sendable, Codable`, validating initialisers that throw the
  capability's error enum, and the rules in one of three shapes (§ 6, ring 2).
- **Adapters** implement one port over one data source, live beside the port, and translate
  every foreign error into a small outcome the model can show.

## 2. Module and package layout

One Xcode project, one local Swift package, app folders composed into per-platform targets.
Platform folders hold only the `@main` entry (and a platform-only feature such as the
iPhone camera runner); everything shared sits in `App/Shared` and diverges behind
`#if os(...)` or `#if canImport(...)`.

```
<App>.xcodeproj                 checked in with synchronized folders, or generated from project.yml
Packages/<App>Core/
  Package.swift                 swift-tools-version 6.x, platforms iOS 18 / macOS 15 / watchOS 11
  Sources/<App>Core/<Capability>/   domain types (1:1 with knowledge/ titles), rules, state machines
  Tests/<App>CoreTests/<Capability>/ Swift Testing, one file per concept
App/Shared/<Capability>/        views, models, ports with their doubles and adapters, records
App/Shared/Shell/               AppStyle.swift, the App* components, RootView.swift
App/Shared/AppEnvironment.swift the composition root
App/iOS/, App/macOS/, App/watchOS/   @main only, plus platform-only features
App/Tests/                      model tests: a macOS unit-test bundle compiling App/Shared directly
App/UITests/, App/MacUITests/   XCUITest, one test per scenario
Configuration/<App>.xcconfig    bundle identifier, team, MARKETING_VERSION, CURRENT_PROJECT_VERSION
```

One capability from `features/<capability>/` is one folder `App/Shared/<Capability>/` plus,
when it has rules, one folder `Sources/<App>Core/<Capability>/`. Both use the same folder
name. Types used by more than one capability live in the core, never in `App/Shared`.
Capabilities never import each other's models. iOS and macOS share one bundle identifier
(Universal Purchase) and one build number from the xcconfig; `xcodebuild` never receives
signing overrides on the command line.

*Project dial:* the Xcode project is either checked in with `PBXFileSystemSynchronizedRootGroup`
folders (Mokuso: a file added to a folder is in its target) or generated by XcodeGen from
`project.yml` and gitignored (Beatrep: run `xcodegen generate` after adding or removing any
file under `App/`). The project's copy states which.

## 3. UI state contract

```swift
@MainActor @Observable final class WateringModel {
    enum State: Equatable {
        case loading
        case ready(tasks: [WateringTask], selected: WateringTask.ID?)
        case failed(reason: String)
    }
    private(set) var state: State = .loading
    var notice: WateringNotice?                       // one-shot, the view consumes and clears it

    @ObservationIgnored private let tasks: any WateringTasksStoring
    @ObservationIgnored private let now: @Sendable () -> Date

    init(tasks: any WateringTasksStoring = AppEnvironment.shared.wateringTasks,
         now: @escaping @Sendable () -> Date = AppEnvironment.shared.clock) {
        self.tasks = tasks; self.now = now
    }

    func load() async { … }
    func tick(_ id: WateringTask.ID) async { … }      // one method per thing the person can do
}

enum WateringNotice: Identifiable, Equatable {
    case saved, offline
    var id: String { String(describing: self) }
    var title: String { … }                            // String(localized:)
    var message: String { … }
}
```

- **State** is one `private(set) var state: State` enum on the model whose cases are the
  situations the screen can be in, plus computed properties that turn a case into what the
  view prints (`status`, `hint`). Loading, empty and error are cases, never separate screens
  and never a bag of booleans. A collection case carries the domain values; an empty array is
  the empty state.
- **Events** are plain methods on the model, named for what the person did, `async` when
  they touch a port.
- **Effects** are state the view consumes and the model then clears: an optional
  `Identifiable` enum for notices, shown with `.alert(item:)`; a `@State` flag plus a pending
  value for a destructive confirmation, shown with `.confirmationDialog`. No stream, no
  publisher, no Combine.
- **Errors**: a rule violation is a thrown case of the capability's error enum from the core;
  an adapter failure is a small outcome enum from the port. The model turns either into a
  `failed(reason:)` case or a notice with a sentence a person can act on. Nothing is
  swallowed; nothing `fatalError`s except opening the store.
- Navigation is state too: `@State` on the view, a `NavigationPath` or an optional selection,
  never a router object. The model never navigates.

## 4. Naming

| thing | name | where | ring |
|---|---|---|---|
| screen | `WateringView` | `App/Shared/Watering/` | 1 |
| model behind a screen | `WateringModel`, nested `State` | `App/Shared/Watering/` | 1 |
| notice enum | `WateringNotice` | beside its model | 1 |
| port | `WateringTasksStoring`, `HeartRateBeltSource` | beside its model | 1 |
| ring-1 double | `FakeWateringTasksStore` (works, seeded with sample data) | beside its port | 1 |
| sample data | `WateringSampleData` | beside the double | 1 |
| domain value type | the `knowledge/` title: `WateringTask` | `<App>Core/Watering/` | 2 |
| domain error | `WateringError: Error, Equatable, Sendable` | `<App>Core/Watering/` | 2 |
| rule, state machine | the domain word: `WateringSchedule`, `RepCounter` | `<App>Core/Watering/` | 2 |
| decision function | `WateringAccess.for(day:today:…)` | `<App>Core/Watering/` | 2 |
| fixed double | `FixedNetwork(reachable:)`, `StubProfileReader` | beside its port | 2, 3 |
| real adapter | `<Technology><Capability>`: `SwiftDataWateringTasks`, `EventKitCalendar` | beside its port | 3 |
| SwiftData record | `WateringTaskRecord` | `App/Shared/Watering/` | 3 |
| composition root | `AppEnvironment.shared` | `App/Shared/AppEnvironment.swift` | 1, rebound in 3 |
| route | a case of `AppArea` (root) or a `Hashable` value for `navigationDestination(for:)` | `App/Shared/Shell/RootView.swift` | 1 |
| accessibility identifier | `watering.tick.<id>`, `watering.empty` | on the control | 1 |
| scenario test | `@Test("<scenario name>")` under `// MARK: - @happy <scenario name>` | `App/Tests/Watering/` | 2 |
| UI scenario test | `test_<scenarioInWords>()` | `App/UITests/` | 3 |

`Fake` is a working double with behaviour, `Fixed` returns one configured answer, `Stub`
returns nothing useful. Domain type names match the `knowledge/` bundle's canonical titles one
to one; a word listed there as an alias to avoid never becomes a type, property or label.

*Project dial:* identifiers are English (Beatrep) or German with transliterated umlauts and
grammatical argument labels (Mokuso: `Tageszugang.fuer(_:heute:)`, `Tagesordner.sichere(_:in:)`).
Whichever the project speaks, on-disk keys and accessibility identifiers stay
language-neutral and stable.

## 5. Dependency injection and navigation

No container, no service locator, no environment key per service. `AppEnvironment.shared`
in `App/Shared/AppEnvironment.swift` is the only composition root: a `@MainActor final class`
whose `init` builds, in this order, the launch flags, the `ModelContainer`, the startup
migrations, then one stored property per port. Models take their ports as initialiser
parameters defaulting to `AppEnvironment.shared`, so a test constructs them with fakes and an
in-memory container without touching the root. Shared models are `lazy var`s on the root.

```swift
@MainActor final class AppEnvironment {
    static let shared = AppEnvironment()
    let isUITest: Bool                                   // -uiTestMode YES
    let container: ModelContainer
    let clock: @Sendable () -> Date = { Date() }
    let wateringTasks: any WateringTasksStoring
    let calendar: any AppleCalendarStoring

    private init() {
        isUITest = UserDefaults.standard.bool(forKey: "uiTestMode")
        container = Self.makeContainer(inMemory: isUITest)
        Self.migrate(container.mainContext)
        wateringTasks = FakeWateringTasksStore(WateringSampleData.tasks)          // ring 1 and 2
        // wateringTasks = isUITest ? FakeWateringTasksStore(…) : SwiftDataWateringTasks(container) // ring 3
        #if os(iOS) || os(macOS)
        calendar = isUITest ? FakeAppleCalendar(permission: .allowed) : EventKitCalendar()
        #else
        calendar = FakeAppleCalendar(permission: .denied)
        #endif
    }
}
```

The binding line per port is the seam between rings: ring 1 binds the fake, ring 2 keeps it,
ring 3 turns it into `isUITest ? Fake… : Real…`. A capability a platform lacks binds its
double permanently under `#if os(...)`; nothing at a call site checks the platform. Launch
seams that pick a fake's outcome are read only here and only inside `#if DEBUG`.

Navigation is SwiftUI's own. `RootView` in `App/Shared/Shell/` is the single shell: on iOS a
`TabView { Tab(…) }` over the app's areas, each wrapping a `NavigationStack`; on macOS a
`NavigationSplitView` with a `List(selection:)` sidebar; on watchOS a `NavigationStack` over a
short `List`. Areas are one `enum AppArea: String, CaseIterable, Identifiable` with a title,
an SF Symbol and the identifier `root.area.<rawValue>`. Deeper steps are `NavigationLink`
with a value and `navigationDestination(for:)`; a programmatic push is
`navigationDestination(isPresented:)`; modals are `.sheet` and `.fullScreenCover` over
`@State` flags. A product rule about which platform offers what is a core decision
(`AppShell.offers(_:on:)`), asked by the view, never an `#if os` in the view.

## 6. The three rings, in order

The order is deliberate: the person sees and uses the real screens before any behaviour is
committed to, and each later ring replaces exactly one binding line.

### Ring 1: screens (`kartograph-screens`)

Goal: every scenario can be walked in the running app on `-uiTestMode YES`, with the real
views, the real model and the real ports, but no real rules and no real data underneath.

- `App/Shared/<Capability>/` gets the **ports** the model needs, each with its double:

  ```swift
  @MainActor protocol WateringTasksStoring: AnyObject {
      func tasks(on day: Date) async -> [WateringTask]
      func markDone(_ id: WateringTask.ID) async -> Bool
  }
  @MainActor final class FakeWateringTasksStore: WateringTasksStoring {
      private(set) var tasks: [WateringTask]
      var failsNextWrite = false                        // outcome knob
      init(_ tasks: [WateringTask]) { self.tasks = tasks }
      func tasks(on day: Date) async -> [WateringTask] { tasks.filter { $0.day == day } }
      func markDone(_ id: WateringTask.ID) async -> Bool {
          if failsNextWrite { failsNextWrite = false; return false }
          tasks[id]?.done = true; return true
      }
  }
  ```

  The fake is deterministic, holds its data in memory and **reacts to commands** so the
  person sees the consequence. `WateringSampleData` covers every listed scenario's `Given`;
  an `@error` scenario's condition is reachable through the fake's outcome knob, set from a
  launch environment variable read in `AppEnvironment` under `#if DEBUG`.
- The core gets the **value types** the screen shows (from `knowledge/`), with their
  validating initialisers, but no rules yet.
- The capability folder gets `<Subject>Model` with its `State` enum, notices, and one method
  per action that only asks the port and updates state; `<Subject>View` and the smaller
  views over the `App*` components; every control and outcome a scenario names findable by
  the scenario's own words and carrying a dotted `accessibilityIdentifier`.
- `AppEnvironment` binds the fake; `RootView` gets the area or the destination. Screens are
  derived from the feature files: one per `.feature` unless its scenarios clearly describe
  more than one place.
- Done = every app target builds, the screen is reachable from `RootView`, each scenario's
  `Then` is visible where a person would look when the app runs with `-uiTestMode YES`. No
  tests in this ring.

### Ring 2: domain (`kartograph-domain`)

Goal: the behaviour is real and tested, the data is still the fake's.

- The core gets the **rules**, in one of three shapes, each `public`, `Sendable`, and free of
  I/O:
  1. a **state machine**: a `struct` with `private(set)` state and `mutating` verbs named for
     what happened (`startSet()`, `saw(_ pose:)`, `advance(to:)`), returning cues;
  2. a **decision function**: `static func for(…) -> Outcome` on an enum, whose ordered
     guards *are* the decision, documented in that order;
  3. a **namespace** of static functions for stateless operations on values.
  A rejected input throws the capability's error enum; a business outcome ("no free day
  left") is a case of the returned value, never an error.
- One **scenario test per scenario** in `App/Tests/<Capability>/`, red first: the model
  constructed with fakes and an in-memory `ModelContainer`, Given as fake seeding, When as
  the model's method, Then as `#expect` on `model.state` and the fake's counters. Core rules
  get their own tests in `Tests/<App>CoreTests/`, also red first.
- The model's methods now call the rules between the event and the port. The fake stays
  bound; the person can walk the same screens with real rules.
- Done = `swift test --package-path Packages/<App>Core` and the `<App>ModelTests` scheme pass.

### Ring 3: adapters (`kartograph-adapters`)

Goal: real data, real platform, real store.

- The capability folder gets the **records** and the **real adapters**: a
  `SwiftData<Capability>…` over `ModelContext`, an `EventKit…`, `HealthKit…`,
  `CoreBluetooth…`, `Vision…` or `RevenueCat…` over its framework, a `URLSession…` over an
  HTTP contract when the capability has one. Each translates its framework's errors into the
  port's outcome at the boundary.
- One adapter test per adapter in `App/Tests/`: SwiftData over `isStoredInMemoryOnly`, a
  framework adapter over its own double or in its target's test bundle, `URLSession` over a
  `URLProtocol` stub.
- `AppEnvironment` rebinds `isUITest ? Fake… : Real…`; the fake stays for UI tests, previews
  and the walk. The UI scenario test in `App/UITests/` runs the app on the fakes through
  identifiers only.
- Done = the whole ladder in `build-design.md` § 9.

`build-design.md` holds the layer-by-layer detail for rings 2 and 3.

## 7. Rules that hold in every ring

- The core imports Foundation only and stays in Swift 6 language mode with strict
  concurrency; models and ports are `@MainActor`; core types are `Sendable`; time comes in
  as `now: @Sendable () -> Date`, never `Date()` inside a rule.
- The view renders only its model; the model takes only ports and a clock; feature code reads
  only `AppStyle` tokens and the `App*` components.
- Loading, empty and error are cases of the model's state, not separate screens.
- Every control a scenario touches has a dotted `accessibilityIdentifier`; test-only controls
  carry `.test.` and compile only in DEBUG or under `isUITest`.
- Strings shown to the person are string-catalog keys: literals in `Text` inside views,
  `String(localized:)` everywhere else; never a literal assembled in a model.
- Doubles live beside their port in the app target and are chosen only in `AppEnvironment`;
  nothing else in the app decides between a fake and a real implementation. (A deliberate
  departure from the KMP stack, where fakes leave production code: here the fake is the
  UI-test and walk substrate.)
- A re-run of any ring on unchanged input changes nothing.
- *Project dial:* Swift 5 language mode with `ObservableObject` and `@Published` (Mokuso) is
  allowed in a project's copy; the state, naming and ring rules do not change.
