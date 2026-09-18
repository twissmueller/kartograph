---
capability: <capability directory name under features/; a nested one as its leaf slug, or the slash-joined path when that slug occurs twice>
features: [<feature-name>.feature]
stack: <stack name from docs/code-design/stack.md>
status: planned
date: <YYYY-MM-DD>
supersedes: <plans/<earlier file>.md, or none>
---

# Plan: <capability title>

**Goal:** <One sentence: what is real when every ring is done.>

**Follows:** `docs/code-design/code-design.md`, `docs/code-design/design-system.md` and
`docs/code-design/build-design.md`. This plan cites them; it does not restate them.

## Screens

| screen | feature | scenarios served | controls named by the steps |
|---|---|---|---|
| <ScreenName> | <feature-name>.feature | <scenario>; <scenario> | <control>, <control> |

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
fun interface <Verb><Noun>UseCase { suspend operator fun invoke(…): Resource<…> }
interface <Xxx>Repository {
    fun observe…(): Flow<ImmutableList<…>>
    suspend fun …(…): Resource<…>
}
```

| port | adapter | where | ring |
|---|---|---|---|
| `<Verb><Noun>UseCase` | `Fake…UseCase` → `…UseCaseImpl` | `presentation/fake/` → `domain/` | 1 → 2 |
| `<Xxx>Repository` | `InMemory<Xxx>Repository` → `<Xxx>RepositoryImpl(api, dao, errorReporter)` | `data/` | 2 → 3 |
| `<Xxx>Api` | Ktor over `createHttpClient` | `data/` | 3 |
| `<Xxx>Dao` | Room, in `AppDatabase` | `core/data/db/` | 3 |
| `/api/v1/<capability>` | `routes/<Capability>Routes.kt` | `server/` | 3 |

## Files

- Create: `<exact path>` — <one responsibility>
- Modify: `<exact path>` — <what changes>
- Test: `<exact path>`

## Global constraints

- <one line each, copied from the stack documents, e.g. "ImmutableList in state, never List">

## Ring 1: Screens

### Task 1.1: <ScreenName>

**Screen:** <ScreenName> — `<feature-name>.feature`
**Scenarios:** <scenario name>; <scenario name>

**Interfaces:**
- Consumes: <exact signatures from earlier tasks, or "nothing">
- Produces: <exact signatures later tasks rely on: State, Event, use case interfaces, bundle>

- [ ] **Step 1: State, Event, Effect**

```kotlin
…
```

- [ ] **Step 2: Use case interfaces and bundle**

```kotlin
…
```

- [ ] **Step 3: ViewModel**

```kotlin
…
```

- [ ] **Step 4: Fakes and sample data (every Given of the listed scenarios)**

```kotlin
…
```

- [ ] **Step 5: Screen and View**

```kotlin
…
```

- [ ] **Step 6: Koin binding, route, nav entry**

```kotlin
…
```

- [ ] **Step 7: Compile and see**

Run: `./gradlew :feature-<capability>:build :desktopApp:build`
Expected: BUILD SUCCESSFUL. If a Compose Hot Reload window is connected: `reload`,
`get_ui_error`, `take_screenshot`; each listed scenario's `Then` is visible at <where>.

- [ ] **Step 8: Commit**

```bash
git add <paths>
git commit -m "screens(<capability>): <ScreenName>"
```

## Ring 2: Domain

### Task 2.1: <Scenario name exactly as in the feature file>

**Scenario:** `<feature-name>.feature` — <scenario name>
**Layers:** <use case · rule · repository interface · in-memory repository>

**Interfaces:**
- Consumes: <from ring 1 and earlier ring-2 tasks>
- Produces: <…UseCaseImpl signature, repository interface members>

- [ ] **Step 1: Outer test (ViewModel, Given/When/Then, fake repository)**

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
Expected: FAIL — <the reason>

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

<!-- repeat steps 3–6 for every further layer the scenario crosses -->

- [ ] **Step N-2: Koin rebind (fake use case → implementation; in-memory repository behind the demo flag)**

```kotlin
factory<…UseCase> { …UseCaseImpl(get()) }
single<…Repository> { if (get<AppConfig>().demo) InMemory…Repository(…SampleData) else InMemory…Repository(…SampleData) } // ring 3 replaces the else branch
```

- [ ] **Step N-1: Outer test passes; see it on screen**

Run: `./gradlew :feature-<capability>:allTests`
Expected: PASS. If a Compose Hot Reload window is connected: `reload`, `get_ui_error`,
`take_screenshot`; the scenario's `Then` is visible at <where>.

- [ ] **Step N: Commit**

```bash
git add <paths>
git commit -m "domain(<capability>): <scenario name>"
```

## Ring 3: Adapters

### Task 3.1: <Port or endpoint, e.g. WateringRepository over Room and Ktor>

**Adapter:** `<Xxx>RepositoryImpl` — `data/…`
**Port:** `<Xxx>Repository` (ring 2, task 2.N)

**Interfaces:**
- Consumes: <the port's signature; core/ helpers>
- Produces: <the adapter's constructor signature; new endpoints>

- [ ] **Step 1: Adapter test — failing (in-memory driver / MockEngine / testApplication)**

```kotlin
…
```

- [ ] **Step 2: Run it, expect failure**

Run: `…`
Expected: FAIL — <reason>

- [ ] **Step 3: Data source, mapper, adapter — minimal implementation**

```kotlin
…
```

- [ ] **Step 4: Run it, expect pass**

Run: `…`
Expected: PASS

- [ ] **Step 5: Koin rebind (in-memory → real; in-memory stays behind the demo flag)**

```kotlin
single<…Repository> { if (get<AppConfig>().demo) InMemory…Repository(…SampleData) else …RepositoryImpl(get(), get(), get()) }
```

- [ ] **Step 6: Whole suite and every target**

Run: `./gradlew allTests build`
Expected: PASS; every enabled target and the server build.

- [ ] **Step 7: Commit**

```bash
git add <paths>
git commit -m "adapters(<capability>): <port or endpoint>"
```

## Friction

- **<Scenario name>** — <why it cannot be built as written; what a person has to decide>

Or: `None`.

## Gaps

- <what the project cannot provide: a service, a credential, an answer — and who can>

Or: `None`.
