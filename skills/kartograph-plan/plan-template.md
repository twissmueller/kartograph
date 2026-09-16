---
capability: <capability directory name under features/>
features: [<feature-name>.feature]
status: planned
date: <YYYY-MM-DD>
supersedes: <plans/<earlier file>.md, or none>
---

# Plan: <capability title>

**Goal:** <One sentence: what is real when every task is done.>

**Follows:** `docs/code-design/mvvm.md` (phases 2 and 3) and the build skill's
`build-design.md`. This plan cites them; it does not restate them.

## Layer map

| scenario | feature | layers crossed | entry point |
|---|---|---|---|
| <scenario name> | <feature-name>.feature | use case · repository · Room · Ktor · server | <screen and control> |

## Reuse and new

- **Reused:** <existing types, modules, endpoints, with paths>
- **New in the feature module:** <what>
- **New in core/:** <what, and which second feature will use it>
- **New in server/:** <routes>

## Ports and adapters

```kotlin
// domain/ — ports (exact signatures; later tasks compile against these)
interface <Xxx>Repository {
    fun observe…(): Flow<ImmutableList<…>>
    suspend fun …(…): Resource<…>
}
```

| port | adapter | where |
|---|---|---|
| `<Xxx>Repository` | `<Xxx>RepositoryImpl(api, dao, errorReporter)` | `data/` |
| `<Xxx>Api` | Ktor over `createHttpClient` | `data/` |
| `<Xxx>Dao` | Room, in `AppDatabase` | `core/data/db/` |
| `<Capability>` | `Android…` / `Ios…` / `Desktop…` / `Web…` | per-target source sets |
| `/api/v1/<capability>` | `routes/<Capability>Routes.kt` | `server/` |

## Files

- Create: `<exact path>` — <one responsibility>
- Modify: `<exact path>` — <what changes>
- Test: `<exact path>`

## Global constraints

- <one line each, copied from mvvm.md / build-design.md, e.g. "ImmutableList in state, never List">
- <…>

## Tasks

### Task 1: <Scenario name exactly as in the feature file>

**Scenario:** `<feature-name>.feature` — <scenario name>
**Layers:** <use case · repository · Room · …>

**Interfaces:**
- Consumes: <exact signatures from earlier tasks, or "nothing">
- Produces: <exact signatures later tasks rely on>

- [ ] **Step 1: Outer test (ViewModel, Given/When/Then)**

```kotlin
@Test
fun `<scenario name>`() = runTest {
    // Given
    …
    // When
    …
    // Then
    …
}
```

- [ ] **Step 2: Run it, expect failure**

Run: `./gradlew :feature-<capability>:allTests --tests "*<TestClass>*"`
Expected: FAIL — <the reason: unresolved reference / assertion on …>

- [ ] **Step 3: <Layer> — failing test**

```kotlin
…
```

- [ ] **Step 4: Run it, expect failure**

Run: `…`
Expected: FAIL — <reason>

- [ ] **Step 5: <Layer> — minimal implementation**

```kotlin
…
```

- [ ] **Step 6: Run it, expect pass**

Run: `…`
Expected: PASS

<!-- repeat steps 3–6 for every further layer the scenario crosses, top down -->

- [ ] **Step N-2: Koin binding**

```kotlin
// di/<Feature>Module.kt — replace the fake binding
factory<…UseCase> { …UseCaseImpl(get()) }
single<…Repository> { …RepositoryImpl(get(), get(), get()) }
```

- [ ] **Step N-1: Outer test passes; see it on screen**

Run: `./gradlew :feature-<capability>:allTests`
Expected: PASS. If a Compose Hot Reload window is connected: `reload`, `get_ui_error`,
`take_screenshot`; the scenario's `Then` is visible at <where>.

- [ ] **Step N: Commit**

```bash
git add <paths>
git commit -m "build(<capability>): <scenario name>"
```

### Task 2: <Next scenario>

…

## Friction

- **<Scenario name>** — <why it cannot be built as written; what a person has to decide>

Or: `None`.

## Gaps

- <what the project cannot provide: a service, a credential, an answer — and who can>

Or: `None`.
