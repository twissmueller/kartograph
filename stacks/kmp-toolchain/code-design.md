# Code design: three rings

How a feature is built in every Kotlin Multiplatform app on the Kotlin Toolchain, and in
which order. Clean Architecture with MVVM, read as a hexagon; the framework used as
intended; one feature is one module with its own `module.yaml`. Everything but the module
layout in § 2 and the folder names is the `kmp` stack's. This document is the contract
`kartograph-plan` plans against and `kartograph-screens`, `kartograph-domain` and
`kartograph-adapters` execute. Change it here, not in the code.

## 1. The hexagon, read through Clean Architecture

```
ring 1  screens    Screen → View → ViewModel            driving adapter: what the person touches
ring 2  domain     UseCases → domain models → ports     the core: business behaviour, no framework
ring 3  adapters   …RepositoryImpl, …Api, …Dao, Room,   driven adapters: what the core talks to
                   Ktor client, platform capabilities,
                   the Ktor server
```

- **Ports** are the interfaces the core declares in `domain/`: use case interfaces (called
  by ring 1) and repository or capability interfaces (fulfilled by ring 3). The identifiers
  in code are the project's: `…UseCase`, `…Repository`, `…Impl`, `…Api`, `…Dao`; never
  "port" or "adapter".
- **Dependencies point inward.** Ring 1 knows use case interfaces; ring 2 knows its own
  ports; ring 3 implements them. `domain/` imports nothing from Compose, Android, Ktor or
  Room, and compiles and tests in the module's common `test/` with no infrastructure.
- **Data flows outward as `Flow`.** Adapters emit, use cases expose, the ViewModel turns
  them into `StateFlow`, the View collects. Actions flow inward through `onEvent`.

### The five layers inside the rings

- **Screen** (`XxxScreen`) is stateful glue: `koinViewModel<XxxViewModel>()`,
  `state.collectAsState()`, effects collected in `LaunchedEffect(Unit)`, then it renders the
  View. No logic.
- **View** (`XxxView(state, onEvent)`) is a stateless projection of `XxxState`. No DI, no
  business logic, no data access.
- **ViewModel** (`XxxViewModel : androidx.lifecycle.ViewModel`, in the common `src/`) takes one
  dependency, the feature's `XxxUseCases` bundle, plus optionally a `CoroutineDispatcher`.
  It composes `Flow`s from use cases into `StateFlow<XxxState>` with
  `stateIn(viewModelScope, WhileSubscribed(5_000), XxxState())` and handles `onEvent`.
- **UseCases** are one per business operation, `VerbNounUseCase`, `operator fun invoke`.
  Reads: `Observe…` returning `Flow`. Commands: `suspend`, returning `Resource<T>`.
  Bundled into `class XxxUseCases(val …)`. Never touch Compose.
- **Data** is repository interfaces in `domain/`, implementations and data sources in
  `data/`. The ViewModel never sees a repository.

## 2. Module and package layout

*Toolchain departure:* the build is a `project.yaml` listing the modules and one
`module.yaml` per module, not `settings.gradle.kts` and `build.gradle.kts`; the source
folders are `src/`, `src@<platform>/`, `test/` and `test@<platform>/`, not
`src/<sourceSet>/kotlin/`. The module taxonomy, the package layout and the dependency
direction are the `kmp` stack's.

A new project is created with the Toolchain's own generator, never the web wizard:

```
./kotlin new --project-id=<reverse-dns id> \
  --target-platform=android --target-platform=ios --target-platform=desktop \
  --target-platform=web --target-platform=server code
```

`--project-id` becomes the Kotlin package, the Android namespace and applicationId, and
the iOS bundle id. The generator writes the wrappers, `project.yaml`, `libs.versions.toml`,
`shared/` and one app module per target, with the iOS app as Compose UI in an `ios/app`
module and its `module.xcodeproj` (checked hands-on for android, ios, desktop and web;
`server` is listed by `--help` but was not generated in the check). The first `kotlin` to
run it is the wrapper script downloaded into an empty directory (nothing installed
globally). After that, add `core/` and the feature modules to `project.yaml` by hand as
below. The project is worked from the command line only; no IDE, plugin or run
configuration belongs to the stack.

The project root (or `code/`, when the build lives there) holds the committed `kotlin` and
`kotlin.bat` wrappers, `project.yaml`, `libs.versions.toml` and one directory per module:

```yaml
# project.yaml
modules:
  - core                      # kmp/lib, no Compose: shared domain, data, db, network
  - shared                    # kmp/lib, Compose: AppTheme, App(), common composables
  - feature-watering          # kmp/lib, one per capability
  - androidApp                # android/app   composition root for Android
  - iosApp                    # ios/app       composition root for iOS, module.xcodeproj beside module.yaml
  - desktopApp                # jvm/app       composition root for the desktop
  - webApp                    # wasm-js/app   composition root for the browser
  - server                    # jvm/app with ktor enabled
```

The Toolchain has no multiplatform application product type, so every target gets its own
app module, which is also the `kmp` stack's rule: each app module is its own composition
root, and no shared "app" module sits above them.

One capability from `features/<capability>/` is one module `feature-<capability>`: a
directory with its own `module.yaml`, added to `project.yaml`'s `modules`, and referenced
from other modules as `//feature-<capability>` (`//` is the directory holding
`project.yaml`, also when that is `code/`). Its `module.yaml`:

```yaml
product:
  type: kmp/lib
  platforms: [android, iosArm64, iosSimulatorArm64, jvm, wasmJs]

dependencies:
  - //core
  - //shared
  - $compose.foundation
  - $compose.material3
  - $compose.components.resources
  - $libs.androidx.lifecycle.viewmodel.compose
  - $libs.koin.compose.viewmodel
  - $libs.kotlinx.collections.immutable

test-dependencies:
  - $libs.turbine
  - $libs.kotlinx.coroutines.test

settings:
  compose: enabled
```

`platforms` lists every target whose app module includes the feature; `jvm` is the
desktop app (the server is its own module and never depends on a feature). A capability
one target cannot provide still lists that target and gets the Pattern B stub
(`build-design.md` § 5); per-target folders exist only where there is per-target code.
Versions live in `libs.versions.toml`, referenced as `$libs.<key>`; the Toolchain reads only
its `[versions]` and `[libraries]` tables. A dependency whose types appear in a module's
public signatures is marked `exported` (`- //core: exported`), which is what Gradle's `api`
was.

Inside a feature module, three flat sub-packages below the package path, as in `kmp`:

```
feature-<capability>/
  module.yaml
  src/<package>/<capability>/
    domain/        models (1:1 with knowledge/ titles), use case interfaces + impls, repository interfaces
    data/          repository implementations, data sources, mappers, in-memory repository (demo)
    presentation/  State, Event, Effect, ViewModel, Screen, View, UI models, fakes (ring 1 only)
    di/            XxxModule.kt — one flat Koin module for the feature
  src@android/  src@ios/  src@jvm/  src@wasmJs/    per-target code (Pattern A/B), only the folders it needs
  test/<package>/<capability>/                     common tests
  test@android/ test@ios/ test@jvm/ test@wasmJs/   platform-path tests
  composeResources/                                strings and drawables (Compose resources)
```

| `kmp` (Gradle) source set | here |
|---|---|
| `src/commonMain/kotlin/` | `src/` |
| `src/commonTest/kotlin/` | `test/` |
| `src/androidMain/kotlin/`, `src/iosMain/kotlin/`, `src/jvmMain/kotlin/`, `src/wasmJsMain/kotlin/` | `src@android/`, `src@ios/`, `src@jvm/`, `src@wasmJs/` |
| `androidUnitTest`, `iosTest`, `desktopTest`, `wasmJsTest` | `test@android/`, `test@ios/`, `test@jvm/`, `test@wasmJs/` |
| an intermediate source set over some targets (Room's, without web) | an alias in `module.yaml` (`aliases: - room: [android, iosArm64, iosSimulatorArm64, jvm]`) and `src@room/` |

Types used by more than one feature live in `core/` (`core/domain`, `core/data`; `core`
has no Compose and no presentation: its `module.yaml` never enables `compose` nor lists a
`$compose.*` dependency). Features never depend on each other. The theme lives in `shared/`
(see `design-system.md`). The server lives in `server/` and depends on `//core`.
Dependencies point one way: app modules → features, `shared`, `core`; features → `core`
and `shared`; `shared` → `core`; `server` → `core`.

## 3. State, Event, Effect

```kotlin
data class WateringState(
    val tasks: ImmutableList<WateringTaskUi> = persistentListOf(),
    val selected: WateringTaskUi? = null,
    val isLoading: Boolean = false,
    val error: AppError? = null,
)

sealed class WateringEvent {
    data class TaskTicked(val id: String) : WateringEvent()
    data object Refresh : WateringEvent()
}

sealed class WateringEffect {
    data class ShowSnackbar(val message: String) : WateringEffect()
    data object NavigateBack : WateringEffect()
}
```

- **State** is one immutable data class with a default for every field; `isLoading` and
  `error` are fields, not a sealed hierarchy. Lists are `ImmutableList`, never `List`.
- **Event** is a sealed class; parameterised members are `data class`, parameterless ones
  `data object`. Names say what the person did.
- **Effect** is one-shot: `MutableSharedFlow(replay = 0, extraBufferCapacity = 1)` exposed
  as `Flow<XxxEffect>`, consumed only in `LaunchedEffect(Unit)`. Navigation is an effect;
  the ViewModel never holds a nav controller.
- Recoverable errors become a `ShowSnackbar` effect; fatal ones set `state.error`.
- UI models (`XxxUi`) exist only when the domain model is actually transformed for
  display; no identity mappers.

## 4. Naming

| thing | name | where | ring |
|---|---|---|---|
| screen / view | `WateringScreen`, `WateringView` | `presentation/` | 1 |
| state / event / effect | `WateringState`, `WateringEvent`, `WateringEffect` | `presentation/` | 1 |
| view model | `WateringViewModel` | `presentation/` | 1 |
| use case interface | `ObserveWateringTasksUseCase`, `TickWateringTaskUseCase` | `domain/` | 1 |
| use case bundle | `WateringUseCases` | `domain/` | 1 |
| ring-1 fake | `FakeObserveWateringTasksUseCase`, `WateringSampleData` | `presentation/fake/` | 1 |
| use case implementation | `ObserveWateringTasksUseCaseImpl` | `domain/` | 2 |
| repository interface | `WateringRepository` | `domain/` | 2 |
| in-memory repository (demo) | `InMemoryWateringRepository` | `data/` | 2 |
| test fake | `FakeWateringRepository` | `test/…/data/` | 2 |
| repository implementation | `WateringRepositoryImpl` | `data/` | 3 |
| data sources | `WateringApi`, `WateringDao` | `data/` | 3 |
| platform capability | `GpsProvider` / `AndroidGpsProvider`, `IosGpsProvider` | `data/` or `core/data/` | 3 |
| server route | `routes/WateringRoutes.kt` | `server/` | 3 |
| Koin module | `val wateringModule = module { }` | `di/WateringModule.kt` | 1, rebound in 2 and 3 |
| route | `WateringRoute` (`@Serializable`, member of `AppRoute`) | `core/navigation/Routes.kt` | 1 |
| nav entry | `EntryProviderScope<AppRoute>.wateringEntry(navigator)` | `presentation/Navigation.kt` | 1 |

Domain type names match the `knowledge/` bundle's canonical titles one to one; a word
listed there as an alias to avoid never becomes a type, property or label.

## 5. Dependency injection and navigation

Koin, one flat module per feature: `single` for repositories and data sources, `factory`
for use cases and the bundle, `viewModel { }` for ViewModels. Compose looks things up with
`koinViewModel<T>()` and `koinInject<T>()`. Each app target's `startKoin { }` lists the
feature modules; nothing else registers them. Navigation is Jetpack Navigation 3: routes
are `@Serializable` members of `sealed interface AppRoute : NavKey` in `core/navigation/`,
each feature exports one `…Entry(navigator)` extension, and back-stack changes go through
the `Navigator` helper. Guards live in the ViewModel.

The Koin module is the seam between rings: ring 1 binds fakes, ring 2 rebinds use cases to
their implementations and binds the in-memory repository, ring 3 rebinds repositories to
their real implementations. Nothing above the binding changes between rings.

## 6. The three rings, in order

The order is deliberate: the person sees and uses the real screens before any behaviour
is committed to, and each later ring replaces exactly one binding.

### Ring 1: screens (`kartograph-screens`)

Goal: every scenario can be walked in the running app, with the real screens and the real
`State`/`Event`/`Effect` contract, but no real behaviour underneath.

- `domain/` gets the models (from `knowledge/`), the **use case interfaces** and the bundle:

  ```kotlin
  fun interface ObserveWateringTasksUseCase { operator fun invoke(): Flow<ImmutableList<WateringTask>> }
  fun interface TickWateringTaskUseCase { suspend operator fun invoke(id: String): Resource<Unit> }
  class WateringUseCases(val observeTasks: ObserveWateringTasksUseCase, val tickTask: TickWateringTaskUseCase)
  ```

  No repository interfaces yet.
- `presentation/` gets `State`, `Event`, `Effect`, `ViewModel`, `Screen`, `View`, and
  `presentation/fake/`: one `Fake…UseCase` per interface plus a `…SampleData` object.
  Fakes are deterministic, hold their data in a `MutableStateFlow`, and **react to
  commands** so the person sees the consequence. Sample data covers every scenario's
  `Given`; an `@error` scenario's condition is reachable through a fake's outcome knob.
- `di/` binds the fakes. Screens are derived from the feature files: one per `.feature`
  unless its scenarios clearly describe more than one place; scenario steps name the
  controls, and every control and outcome a scenario names is findable by its text or
  content description.
- Done = `./kotlin build -m feature-<capability>` succeeds, every screen renders, each
  scenario's `Then` is visible where a person would look. No unit tests in this ring.

### Ring 2: domain (`kartograph-domain`)

Goal: the behaviour is real and tested, the data is still local.

- `domain/` gets `…UseCaseImpl` next to each interface, the repository interfaces (one per
  aggregate, domain types only), business-rule validation in the use cases or a
  `Validator`, and `AppError` / `Resource<T>` in `core/` if missing.
- One ViewModel test per scenario in the module's `test/`, red first: fakes for the
  repositories (`FakeXxxRepository` with constructor-seeded state and an outcome knob), Turbine on
  `state` and `effect`, injected dispatcher. Use case tests assert `Resource<T>`
  positionally.
- `data/` gets `InMemoryXxxRepository`, seeded from the ring-1 sample data, bound when
  `AppConfig.demo` is true (a build-time flag in `core/`, default false in release) and as
  the only binding until ring 3. The ring-1 fakes in `presentation/fake/` are deleted once
  nothing binds them.
- `di/` rebinds each use case to its implementation. The presentation layer does not
  change; the person can walk the same screens with real rules.

### Ring 3: adapters (`kartograph-adapters`)

Goal: real data, real platform, real server.

- `data/` gets `…RepositoryImpl` over `…Api` (Ktor) and `…Dao` (Room), the mappers, and
  exception-to-`AppError` translation at the repository boundary. Room lives in
  `core/data/db/` (in `core/src@room/`, the targets that have Room), the Ktor client in
  `core/data/network/`, small key-value in `multiplatform-settings`; web has nothing
  relational.
- Platform capabilities are Pattern B: an interface in the common `src/`, per-target
  implementations in `src@<platform>/`, bound in `platformModule`.
- `server/` gets the Ktor routes a scenario needs, request and response types shared
  through `core/`, one route test per endpoint.
- `di/` rebinds repositories to the real implementations; the in-memory one stays behind
  the demo flag. Nothing above the repository changes.

`build-design.md` holds the layer-by-layer detail for rings 2 and 3.

## 7. Rules that hold in every ring

- The View is stateless and renders only `state`; the ViewModel takes only the use case
  bundle; feature code reads only `AppTheme` tokens.
- Loading, empty and error are states of the screen, not separate screens.
- Strings shown to the person come from Compose resources, never literals in
  `presentation/` (ring 1 may use a single `strings` object per feature, replaced by
  resources in ring 2, but never inline literals in composables).
- A re-run of any ring on unchanged input changes nothing.
