# Build design: the layers below the view (Native Apple with Swift and SwiftUI)

What rings 2 and 3 write and how, one section per layer: `kartograph-domain` builds § 1 and
the tests in § 8 that belong to it; `kartograph-adapters` builds § 2 to § 7. Ring 1 is
described in `code-design.md` § 6. Ports-and-adapters read through Clean Architecture: the
ports are the protocols a model takes, declared beside it in the app target; the adapters are
the records and the `<Technology><Capability>` classes that fulfil them. The names in code are
the project's (`…ing`, `…Source`, `…Record`, `Fake…`, `Fixed…`), never "port" or "adapter".
Everything here follows `code-design.md`; where that document is silent, this one decides.
Lines marked *project dial* are where the owner's two apps differ.

## 1. Domain: use cases and ports

- A use case is a method on the model that orchestrates plus the pure type in `<App>Core`
  that decides. Ring 1 wrote the method against the port; ring 2 puts the rule between the
  event and the port call and never changes the method's signature, so the view and the
  scenario test do not move.
- Rules take one of three shapes, all `public`, `Sendable`, free of I/O and of `Date()`:

  ```swift
  public struct RepCounter: Hashable, Sendable {                 // 1. state machine
      public private(set) var count = 0
      public mutating func saw(_ pose: BodyPose?) -> [Cue] { … }
  }
  public enum DayAccess: Equatable, Sendable {                    // 2. decision function
      case writable, readOnly(Reason), paywall, silent
      /// Five rules, in this order; the order is the decision.
      public static func `for`(_ day: Day, today: Day, written: Bool,
                               protected: Bool, mayWrite: Bool) -> DayAccess { … }
  }
  public enum Merge {                                             // 3. namespace
      public static func merge(mine: Stack, theirs: Stack, base: Stack) -> Result { … }
  }
  ```

- Validation lives in the value type's initialiser and throws the capability's error enum
  (`WateringError: Error, Equatable, Sendable`, one per capability, each case documented by
  the reason it exists). Decoding routes through the validating initialiser
  (`init(from:)` calls `self.init(…)`), so a stored value is checked on the way in. Typed
  throws (`throws(WateringError)`) are allowed inside the core; a port never throws.
- A business outcome is a case of the returned value, never an error; an error is a rule
  violation the person can correct.
- Domain types own their printed wording (`printedCount`, `displayName`) through
  `String(localized:)`; formatters are pinned to an injected `Locale`.
- Ports are declared beside the model that uses them, in `App/Shared/<Capability>/`, never in
  the core. A port exposes domain types only, returns an outcome (`Bool`, an optional, a
  small `enum`), and is `@MainActor` unless its adapter is genuinely off-main.

## 2. Data: adapters and data sources

- An adapter implements one port over one data source and is named
  `<Technology><Capability>`: `SwiftDataWateringTasks(container:)`, `EventKitCalendar()`,
  `HealthKitWorkoutStore()`, `CoreBluetoothHeartRateBelt()`, `VisionBodyPoseSource()`,
  `RevenueCatSubscriptionService()`, `URLSessionWeatherClient(session:)`. The data sources
  are the SwiftData `ModelContext`, the system framework, the store SDK, `FileManager`,
  `UserDefaults`, the Keychain and `URLSession`.
- **Exceptions stop at the adapter.** Every framework error is caught there and translated
  into the port's outcome: a `LAError` becomes `.cancelled` or `.failed`, a store error
  `.failed`, an unreachable network `false`. The model never sees an `NSError`, a
  `URLError` or a framework type. Where a failure is not actionable the adapter returns
  nothing and the feature degrades ("no location, but writing goes on"); where data
  integrity is at stake the outcome says so and nothing is overwritten.
- **Mapping is the record's own job.** A `@Model` record carries a failable
  `init?(_ value: WateringTask)` that encodes the value and a computed `var task:
  WateringTask?` that decodes it back and returns `nil` when the blob no longer parses. A
  record that cannot be decoded is skipped, never repaired by guesswork. No separate mapper
  type, no identity mappers.
- **Demo mode** is the fake bound under `isUITest` (`-uiTestMode YES`), seeded from the
  capability's `…SampleData`. It stays in the app target for UI tests, previews and the walk;
  the composition root is the only place that chooses it.

## 3. Persistence

SwiftData, one `ModelContainer` for the app built in `AppEnvironment`.

- `@Model final class <Subject>Record` in `App/Shared/<Capability>/`, listed in the `Schema`
  the root builds. A record stores its domain value as one JSON `Data` blob beside the few
  columns a query needs: `key`, `date`, `changedAt`, `deletedAt`, plus a `#Index` on what is
  sorted or filtered. Enum-typed columns are stored as their raw value.
- **Deletion is a `deletedAt` tombstone**, applied in the accessor
  (`var workout: Workout? { deletedAt == nil ? stored : nil }`), so a merge cannot
  resurrect a record. Every record carries `changedAt`; a merge is last-write-wins on it.
- **Migration:** a new field carries a default, so an existing store keeps opening
  (lightweight). A rename or a backfill is a `VersionedSchema` pair and a `MigrationStage`
  in a `SchemaMigrationPlan`; a data repair that must run at every start is an idempotent
  function called from `AppEnvironment.init` (`SessionHistoryConsistency.reconcile`). Every
  migration has a test that seeds the previous shape in memory, migrates, and asserts.
- **Never reset.** Opening the store is the one place that may `fatalError`, and its message
  says that no data was deleted. Nothing in the app deletes or recreates a store to recover.
- `ModelConfiguration(isStoredInMemoryOnly: isUITest, cloudKitDatabase: …)`; tests build
  their own in-memory container over the records they need.
- **Sync** is the CloudKit private database through SwiftData when the capability asks for
  it: every relationship optional, no `unique` or `deny`, the schema additive once
  promoted, initialised in DEBUG only. Large media never enters the store: a video or a
  drawing lives as a file in Application Support under a key derived from the record, and
  only its metadata syncs. *Project dial:* a document-style app keeps its data as open files
  in a user-chosen folder (Mokuso: one folder per day, a versioned `struktur.json`, a
  security-scoped bookmark in `UserDefaults`, `NSFileCoordinator` around every read and
  write, a three-way merge in the core); the persistence port is the same, the adapter is
  `FileSystem<Capability>`.
- **Small state** goes to `UserDefaults` when it is device-local and non-sensitive
  (settings, "explainer seen"), each behind a tiny `struct` in the core with the defaults
  injected; to the **Keychain** (`kSecAttrSynchronizable`) when it must survive reinstall and
  follow the Apple ID (a trial counter); never to the store.

## 4. HTTP client

There is none by default: the owner's apps talk to Apple's services and to the store SDK
only. A capability that needs one declares a port first, then:

- one `URLSessionClient` in `App/Shared/Shell/` over `URLSession` with async/await
  (`data(for:)`), an ephemeral configuration, a 15 s resource timeout, `JSONDecoder` with
  `.iso8601` dates; DTOs are `Codable` structs beside the adapter, decoded into domain values
  at the boundary, no DTO leaves the adapter;
- the adapter maps a `URLError` and a non-2xx status into the port's outcome enum
  (`.unreachable`, `.unauthorized`, `.failed`), retries idempotent reads once, never a write;
- its test runs the adapter over a `URLProtocol` stub with canned responses and asserts the
  translation. No third-party networking library.

## 5. Platform capabilities

- A capability with state, async, permissions, lifecycle or a need for a fake (camera,
  Bluetooth, HealthKit, EventKit, Vision, CoreLocation, LocalAuthentication, mail, the
  network, the store, on-device models) sits behind its port with the double beside it:

  | port | real | double |
  |---|---|---|
  | `CameraAccessing` | `SystemCameraAccess` | `FixedCameraAccess(permission:)` |
  | `BodyPoseSource` | `VisionBodyPoseSource` | `FakeBodyPoseSource` |
  | `AppleCalendarStoring` | `EventKitCalendar` | `FakeAppleCalendar` |
  | `AppleHealthStoring` | `HealthKitWorkoutStore` | `FakeAppleHealth` |
  | `HeartRateBeltSource` | `CoreBluetoothHeartRateBelt` | `FakeHeartRateBelt` |
  | `Authenticating` | `DeviceAuthentication` | `SimulatedAuthentication` |
  | `Networking` | `DeviceNetwork` (`NWPathMonitor`) | `FixedNetwork(reachable:)` |
  | `SubscriptionServing` | `RevenueCatSubscriptionService` | `TestSubscriptionService` |

- Availability is decided once, in `AppEnvironment.init`, by `#if os(...)` or
  `#if canImport(...)` and `isUITest`; a platform that lacks the capability binds the double
  permanently, and the view asks the core (`AppShell.offers`) whether to show the feature.
- Permission and connection states are core enums (`CameraPermission`, `ICloudAccount`),
  so the model and the view never see a framework type.
- Callback-style frameworks expose an assignable closure on the port
  (`var onFrame: ((PoseFrame) -> Void)? { get set }`, set before `start()`), or an
  `AsyncStream` when the consumer is a `for await`.
- **The store:** RevenueCat behind `SubscriptionServing`; the entitlement identifier and the
  product identifiers are defined exactly once in the core; the public SDK key lives in a
  committed plist and a placeholder key boots a deterministic no-purchase double, never a
  crash; prices come from StoreKit through the SDK, never a literal; a Restore action is
  always present; iOS and macOS share the bundle identifier so one purchase covers both.
- **Launch seams** for the doubles are read only in `AppEnvironment` and only under
  `#if DEBUG`: `-uiTestMode YES` switches to the fakes; one upper-snake environment variable
  per knob (`SUBSCRIPTION_STATUS=active`, `AUTH_RESULT=succeeded`, `CLOCK=2026-09-18T09:00:00`)
  sets a fake's outcome, and the fake's doc comment names the variable and its values. The
  clock is a seam like any other; a test drives time through it, never through `sleep`.

## 6. Server

There is none. The App Store is the system of record for entitlements, CloudKit's private
database is the only remote store, and both are reached through Apple's frameworks behind
the ports in § 3 and § 5. A project with a backend of its own declares each endpoint as an
HTTP port under § 4 and keeps the server outside this stack; nothing in the app assumes one.

## 7. Dependency injection and wiring

`AppEnvironment.shared` builds everything once, in `init`, in this order: the launch flags,
the `Schema` and `ModelContainer`, the startup migrations, then one stored property per
port. Models that need a context are `lazy var`s on the root. The rebinding between rings is
one expression per port, `isUITest ? Fake…(…) : Real…(…)`; nothing else in the app chooses
an implementation, and no model reaches for `AppEnvironment` except as an initialiser
default. Unit tests never touch the root; UI tests reach it only through launch arguments.
*Project dial:* a larger app splits the root into one `<Context>Start` enum per bounded
context with static factories (Mokuso), each still the only reader of its launch seams.

## 8. Tests, by layer

| layer | target | shape | run |
|---|---|---|---|
| core rule | `Tests/<App>CoreTests/<Capability>/` | Swift Testing: `@Suite`, `@Test("<rule as a sentence>")`, `#expect`, `@Test(arguments:)` for tables; the Gherkin tag as `// MARK: - @happy <scenario>` | `swift test --package-path Packages/<App>Core` |
| scenario (outer) | `App/Tests/<Capability>/` | one `@Test("<scenario name verbatim>")` per scenario; the model over fakes and an in-memory container; Given seeds the fakes, When calls the method, Then asserts `model.state` and the fakes' counters | `xcodebuild -project <App>.xcodeproj -scheme <App>ModelTests -destination 'platform=macOS' test` |
| record, migration | `App/Tests/<Capability>/` | in-memory `ModelContainer` over the records under test; previous shape, migrate, assert | same scheme |
| adapter | `App/Tests/` or the platform test bundle | SwiftData in memory; `URLProtocol` stub; a framework adapter behind its own double | same scheme, or `-scheme <App> -destination 'platform=iOS Simulator,…'` |
| UI scenario | `App/UITests/`, `App/MacUITests/` | XCTest + XCUIAutomation, `test_<scenarioInWords>()`, launch with `-uiTestMode YES` and the knobs, identifiers only, `waitForExistence`, one attachment per outcome | `xcodebuild … -scheme <App> -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M4)' -only-testing:<App>UITests/<Class>/<test> test` |
| Mac and Watch shells | `<App>Mac`, `<App>Watch` schemes | build only | `xcodebuild … -scheme <App>Mac -destination 'platform=macOS' build` |

Fixtures are builder functions with defaults in a shared test-helper target
(`func aWateringTask(id: String = "t1", …)`), one file per domain type; the on-disk shape is
written by one helper both suites import. Every suite that touches the file system works in
`temporaryDirectory/<prefix>-<UUID>` created in `init` and removed in `deinit`. No mocking
library; no `sleep`; the clock and the locale are injected. Swift Testing for every unit
test, XCTest only where Apple requires it (XCUIApplication, performance). Run only the tests
of the current increment with `-only-testing:`; the full suite only on request. Never two
`xcodebuild` runs at once against the same derived data. A project generated by XcodeGen
runs `xcodegen generate` first.

*Project dial:* the model tests may live in a simulator-hosted bundle (Mokuso) instead of the
macOS bundle that compiles `App/Shared` directly (Beatrep); the second needs no simulator and
is the default.

## 9. Definition of done, per scenario

1. Its scenario test at the model is green and was red first.
2. Every core rule it crosses has its own green test in `<App>CoreTests`.
3. Its UI scenario test passes on the simulator on the fakes, through identifiers only.
4. The iOS app, the Mac app and the Watch app build; the Mac build was skipped only when
   neither the core nor a shared folder changed.
5. Its `Then` is reachable through the UI on `-uiTestMode YES`, seen on the simulator or
   the device when one was connected, otherwise stated as compiled-only.
6. No framework type above an adapter, no colour or inset literal in a view, no control a
   scenario touches without an identifier, no word from `aliases_to_avoid` anywhere, no
   store reset path, no hard-coded price.
7. A real adapter has been exercised on a device once before the scenario is called
   verified; a capability whose reliability no test settles (camera counting) says so.
