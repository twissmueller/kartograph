# Code design for views: MVVM in three phases

How a feature's presentation layer is built in every Kotlin Multiplatform app, and in
which order. Clean Architecture with MVVM; the framework used as intended; one feature is
one Gradle module. This document is the contract the `kartograph-views` skill implements
(phase 1) and later phases extend. Change it here, not in the code.

## 1. The five layers

```
Screen  →  View  →  ViewModel  →  UseCases  →  Data (repositories, data sources)
```

- **Screen** (`XxxScreen`) is stateful glue: `koinViewModel<XxxViewModel>()`,
  `state.collectAsState()`, effects collected in `LaunchedEffect(Unit)`, then it renders the
  View. No logic.
- **View** (`XxxView(state, onEvent)`) is a stateless projection of `XxxState`. No DI, no
  business logic, no data access. Everything it shows is in `state`; everything the person
  does goes up through `onEvent`.
- **ViewModel** (`XxxViewModel : androidx.lifecycle.ViewModel`, in `commonMain`) takes one
  dependency, the feature's `XxxUseCases` bundle, plus optionally a
  `CoroutineDispatcher`. It composes `Flow`s from use cases into `StateFlow<XxxState>` with
  `stateIn(viewModelScope, WhileSubscribed(5_000), XxxState())`, and handles
  `onEvent(XxxEvent)`.
- **UseCases** are one per business operation, `VerbNounUseCase`, invoked with
  `operator fun invoke`. Reactive reads are `Observe…` and return `Flow`; commands are
  `suspend` and return `Resource<T>`. They are bundled into `class XxxUseCases(val …)` so
  the ViewModel has a single dependency. UseCases never touch Compose.
- **Data** is repository interfaces in `domain/`, implementations and data sources in
  `data/`. The ViewModel never sees a repository.

## 2. Module and package layout

One capability from `features/<capability>/` is one Gradle module `feature-<capability>`,
included as `:feature-<capability>` (or `:code:feature-<capability>` when the build lives
under `code/`). Inside, three flat sub-packages:

```
feature-<capability>/src/commonMain/kotlin/<package>/<capability>/
  domain/        models (1:1 with knowledge/ titles), use case interfaces, repository interfaces
  data/          repository implementations, data sources, DB↔domain mappers   (phase 3)
  presentation/  State, Event, Effect, ViewModel, Screen, View, UI models, fakes (phase 1)
  di/            XxxModule.kt — one flat Koin module for the feature
```

Types used by more than one feature live in `core/` (`core/domain`, `core/data`; `core`
has no Compose and no presentation). Features never depend on each other. The theme lives
in `shared/` (see `docs/design-system.md`).

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
  as `Flow<XxxEffect>`, consumed only in `LaunchedEffect(Unit)`. Navigation is an effect
  (`NavigationEffect.NavigateTo(route)`); the ViewModel never holds a nav controller.
- Recoverable errors become a `ShowSnackbar` effect; fatal ones set `state.error`.
- UI models (`XxxUi`) exist only when the domain model is actually transformed for
  display; no identity mappers.

## 4. Naming

| thing | name | where |
|---|---|---|
| screen / view | `WateringScreen`, `WateringView` | `presentation/` |
| state / event / effect | `WateringState`, `WateringEvent`, `WateringEffect` | `presentation/` |
| view model | `WateringViewModel` | `presentation/` |
| use case (interface) | `ObserveWateringTasksUseCase`, `TickWateringTaskUseCase` | `domain/` |
| use case bundle | `WateringUseCases` | `domain/` |
| phase-1 fake | `FakeObserveWateringTasksUseCase`, `WateringSampleData` | `presentation/fake/` |
| phase-2 implementation | `ObserveWateringTasksUseCaseImpl` | `domain/` |
| repository | `WateringRepository` / `WateringRepositoryImpl` | `domain/` / `data/` |
| Koin module | `val wateringModule = module { }` | `di/WateringModule.kt` |
| route | `WateringRoute` (`@Serializable`, member of `AppRoute`) | `core/navigation/Routes.kt` |
| nav entry | `EntryProviderScope<AppRoute>.wateringEntry(navigator)` | `presentation/Navigation.kt` |

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

## 6. The three phases

The order is deliberate: the person sees and uses the real screens before any behaviour
is committed to, and each later phase replaces exactly one thing.

### Phase 1: view and view model on fakes (what `kartograph-views` does)

Goal: every scenario of the capability can be walked in the running app, with the real
screens and the real `State`/`Event`/`Effect` contract, but no real behaviour underneath.

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
  commands** so the person sees the consequence (ticking a task marks it done). Sample
  data covers every scenario's `Given`: each named thing in a `Given` exists in the sample
  data with the stated state, and an `@error` scenario's condition is reachable through a
  fake's outcome knob. No randomness, no delays longer than `short2`.
- `di/` registers the fakes: `factory<ObserveWateringTasksUseCase> { FakeObserveWateringTasksUseCase(get()) }`.
  Phase 2 changes only these lines.
- Screens are derived from the feature files: one screen per `.feature` unless its
  scenarios clearly describe more than one place; scenario steps name the controls
  (`When I tick "Bed 3"` means a control labelled with the task, not a generic button).
  Every control and outcome a scenario names is findable by its text or content
  description.
- Done = the module compiles, every screen renders, and each scenario's `Then` is
  visible where a person would look. No unit tests in this phase: they come with the real
  use cases, against scenarios that have survived the person's feedback.

### Phase 2: real use cases

Replace each `Fake…UseCase` with `…UseCaseImpl` in `domain/`, add repository interfaces
in `domain/`, and move the fakes to `commonTest` as `Fake…Repository`. Business-rule
validation lives in the use cases. Write one ViewModel test per scenario (kotlin.test +
Turbine, fakes over mocks, injected dispatcher). The presentation layer does not change.

### Phase 3: repositories and data

Add `…RepositoryImpl` and data sources in `data/` (Room, Ktor, multiplatform-settings per
the project's picks), the DB↔domain mappers, and exception-to-`AppError` translation at
the repository boundary. Swap the Koin `single` binding. Nothing above the repository
changes.

## 7. Rules that hold in every phase

- The View is stateless and renders only `state`; the ViewModel takes only the use case
  bundle; feature code reads only `AppTheme` tokens.
- Loading, empty and error are states of the screen, not separate screens.
- Strings shown to the person come from Compose resources, never literals in
  `presentation/` (phase 1 may use a single `strings` object per feature to be replaced
  by resources in phase 2, but never inline literals in composables).
- A re-run of any phase on unchanged input changes nothing.
