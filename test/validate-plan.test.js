import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validatePlan, validatePlanFile } from "../skills/kartograph-plan/validate-plan.js";

const FILE = "plans/2026-09-18-1100-project-archiving.md";
const S1 = "An owner archives an active project";
const S2 = "A non-owner tries to archive an active project";

const screenTask = `### Task 1.1: ProjectsScreen

**Screen:** ProjectsScreen — \`archive-project.feature\`
**Scenarios:** ${S1}; ${S2}

**Interfaces:**
- Consumes: nothing
- Produces: \`ProjectsState\`, \`ProjectsEvent.Archive(id: String)\`, \`ArchiveProjectUseCase\`, \`ProjectsUseCases\`

- [ ] **Step 1: State, Event, Effect**

\`\`\`kotlin
data class ProjectsState(val active: ImmutableList<ProjectUi> = persistentListOf(), val isLoading: Boolean = false, val error: AppError? = null)
sealed class ProjectsEvent { data class Archive(val id: String) : ProjectsEvent() }
sealed class ProjectsEffect { data class ShowSnackbar(val message: String) : ProjectsEffect() }
\`\`\`

- [ ] **Step 2: Use case interfaces and bundle**

\`\`\`kotlin
fun interface ObserveActiveProjectsUseCase { operator fun invoke(): Flow<ImmutableList<Project>> }
fun interface ArchiveProjectUseCase { suspend operator fun invoke(id: String): Resource<Unit> }
class ProjectsUseCases(val observeActive: ObserveActiveProjectsUseCase, val archive: ArchiveProjectUseCase)
\`\`\`

- [ ] **Step 3: ViewModel**

\`\`\`kotlin
class ProjectsViewModel(private val useCases: ProjectsUseCases) : ViewModel() { /* state, effect, onEvent */ }
\`\`\`

- [ ] **Step 4: Fakes and sample data (every Given of the listed scenarios)**

\`\`\`kotlin
object ProjectsSampleData { val atlas = Project(id = "atlas", name = "Atlas", owner = "alice") }
class FakeArchiveProjectUseCase(private val store: MutableStateFlow<List<Project>>) : ArchiveProjectUseCase { override suspend fun invoke(id: String) = Resource.Success(Unit).also { store.update { it.filterNot { p -> p.id == id } } } }
\`\`\`

- [ ] **Step 5: Screen and View**

\`\`\`kotlin
@Composable fun ProjectsScreen() { val vm: ProjectsViewModel = koinViewModel(); val state by vm.state.collectAsState(); ProjectsView(state, vm::onEvent) }
\`\`\`

- [ ] **Step 6: Koin binding, route, nav entry**

\`\`\`kotlin
val projectsModule = module { factory<ArchiveProjectUseCase> { FakeArchiveProjectUseCase(get()) }; viewModel { ProjectsViewModel(get()) } }
\`\`\`

- [ ] **Step 7: Compile and see**

Run: \`./gradlew :feature-project-archiving:build :desktopApp:build\`
Expected: BUILD SUCCESSFUL. If a Compose Hot Reload window is connected: reload, get_ui_error, take_screenshot; "Atlas" is listed in the active overview.

- [ ] **Step 8: Commit**

\`\`\`bash
git add feature-project-archiving
git commit -m "screens(project-archiving): ProjectsScreen"
\`\`\`
`;

const domainTask = (n, name) => `### Task 2.${n}: ${name}

**Scenario:** \`archive-project.feature\` — ${name}
**Layers:** use case · repository interface · in-memory repository

**Interfaces:**
- Consumes: \`ArchiveProjectUseCase\`, \`ProjectsViewModel\` from Task 1.1
- Produces: \`ArchiveProjectUseCaseImpl(repo: ProjectRepository)\`, \`ProjectRepository.archive(id: String): Resource<Unit>\`

- [ ] **Step 1: Outer test (ViewModel, Given/When/Then, fake repository)**

\`\`\`kotlin
@Test
fun \`${name}\`() = runTest {
    // Given
    val repo = FakeProjectRepository(listOf(aProject(id = "atlas", owner = "alice")))
    // When
    vm.onEvent(ProjectsEvent.Archive("atlas"))
    // Then
    vm.state.test { assertTrue(awaitItem().active.none { it.id == "atlas" }) }
}
\`\`\`

- [ ] **Step 2: Run it, expect failure**

Run: \`./gradlew :feature-project-archiving:allTests --tests "*ProjectsViewModelTests*"\`
Expected: FAIL — unresolved reference ArchiveProjectUseCaseImpl

- [ ] **Step 3: Use case — failing test**

\`\`\`kotlin
@Test
fun \`archive marks the project archived\`() = runTest {
    val repo = FakeProjectRepository(listOf(aProject(id = "atlas")))
    assertIs<Resource.Success<Unit>>(ArchiveProjectUseCaseImpl(repo)("atlas"))
}
\`\`\`

- [ ] **Step 4: Run it, expect failure**

Run: \`./gradlew :feature-project-archiving:allTests --tests "*ArchiveProjectUseCaseTests*"\`
Expected: FAIL — unresolved reference

- [ ] **Step 5: Use case — minimal implementation**

\`\`\`kotlin
class ArchiveProjectUseCaseImpl(private val repo: ProjectRepository) : ArchiveProjectUseCase {
    override suspend fun invoke(id: String): Resource<Unit> = repo.archive(id)
}
\`\`\`

- [ ] **Step 6: Run it, expect pass**

Run: \`./gradlew :feature-project-archiving:allTests --tests "*ArchiveProjectUseCaseTests*"\`
Expected: PASS

- [ ] **Step 7: Koin rebind (fake use case → implementation; in-memory repository behind the demo flag)**

\`\`\`kotlin
factory<ArchiveProjectUseCase> { ArchiveProjectUseCaseImpl(get()) }
single<ProjectRepository> { InMemoryProjectRepository(ProjectsSampleData.all) }
\`\`\`

- [ ] **Step 8: Outer test passes; see it on screen**

Run: \`./gradlew :feature-project-archiving:allTests\`
Expected: PASS. If a Compose Hot Reload window is connected: reload, get_ui_error, take_screenshot; "Atlas" is absent from the active overview.

- [ ] **Step 9: Commit**

\`\`\`bash
git add feature-project-archiving
git commit -m "domain(project-archiving): ${name}"
\`\`\`
`;

const adapterTask = `### Task 3.1: ProjectRepository over Room

**Adapter:** \`ProjectRepositoryImpl\` — \`data/ProjectRepositoryImpl.kt\`
**Port:** \`ProjectRepository\` (ring 2, task 2.1)

**Interfaces:**
- Consumes: \`ProjectRepository\` from Task 2.1; \`AppDatabase\` in core/
- Produces: \`ProjectRepositoryImpl(dao: ProjectDao, errorReporter: ErrorReporter)\`

- [ ] **Step 1: Adapter test — failing (in-memory driver)**

\`\`\`kotlin
@Test
fun \`archive persists the archived flag\`() = runTest {
    val db = inMemoryAppDatabase()
    val repo = ProjectRepositoryImpl(db.projectDao(), FakeErrorReporter())
    assertIs<Resource.Success<Unit>>(repo.archive("atlas"))
}
\`\`\`

- [ ] **Step 2: Run it, expect failure**

Run: \`./gradlew :feature-project-archiving:allTests --tests "*ProjectRepositoryImplTests*"\`
Expected: FAIL — unresolved reference ProjectRepositoryImpl

- [ ] **Step 3: Data source, mapper, adapter — minimal implementation**

\`\`\`kotlin
class ProjectRepositoryImpl(private val dao: ProjectDao, private val errorReporter: ErrorReporter) : ProjectRepository {
    override suspend fun archive(id: String): Resource<Unit> = safeDbCall(errorReporter) { dao.setArchived(id, Clock.System.now().toEpochMilliseconds()) }
}
\`\`\`

- [ ] **Step 4: Run it, expect pass**

Run: \`./gradlew :feature-project-archiving:allTests --tests "*ProjectRepositoryImplTests*"\`
Expected: PASS

- [ ] **Step 5: Koin rebind (in-memory → real; in-memory stays behind the demo flag)**

\`\`\`kotlin
single<ProjectRepository> { if (get<AppConfig>().demo) InMemoryProjectRepository(ProjectsSampleData.all) else ProjectRepositoryImpl(get(), get()) }
\`\`\`

- [ ] **Step 6: Whole suite and every target**

Run: \`./gradlew allTests build\`
Expected: PASS; every enabled target and the server build.

- [ ] **Step 7: Commit**

\`\`\`bash
git add feature-project-archiving core
git commit -m "adapters(project-archiving): ProjectRepository over Room"
\`\`\`
`;

const valid = `---
capability: project-archiving
features: [archive-project.feature]
stack: kmp
status: planned
date: 2026-09-18
supersedes: none
---

# Plan: Project archiving

**Goal:** An owner can archive an active project and it leaves the active overview, backed by a real repository.

**Follows:** \`docs/code-design/code-design.md\`, \`docs/code-design/design-system.md\` and \`docs/code-design/build-design.md\`.

## Screens

| screen | feature | scenarios served | controls named by the steps |
|---|---|---|---|
| ProjectsScreen | archive-project.feature | ${S1}; ${S2} | Archive |

## Layer map

| scenario | feature | layers crossed | entry point |
|---|---|---|---|
| ${S1} | archive-project.feature | use case · repository | ProjectsScreen, "Archive" on a row |
| ${S2} | archive-project.feature | use case · repository | ProjectsScreen, "Archive" on a row |

## Reuse and new

- **Reused:** nothing
- **New in the feature module:** \`ProjectsViewModel\`, \`ArchiveProjectUseCaseImpl\`, \`ProjectRepository\`
- **New in core/:** nothing
- **New in server/:** nothing

## Ports and adapters

\`\`\`kotlin
interface ProjectRepository {
    fun observeActive(): Flow<ImmutableList<Project>>
    suspend fun archive(id: String): Resource<Unit>
}
\`\`\`

| port | adapter | where | ring |
|---|---|---|---|
| \`ArchiveProjectUseCase\` | \`FakeArchiveProjectUseCase\` → \`ArchiveProjectUseCaseImpl\` | \`presentation/fake/\` → \`domain/\` | 1 → 2 |
| \`ProjectRepository\` | \`InMemoryProjectRepository\` → \`ProjectRepositoryImpl\` | \`data/\` | 2 → 3 |

## Files

- Create: \`feature-project-archiving/src/commonMain/kotlin/com/acme/projects/domain/ProjectRepository.kt\` — the port
- Modify: \`feature-project-archiving/src/commonMain/kotlin/com/acme/projects/di/ProjectsModule.kt\` — bindings per ring
- Test: \`feature-project-archiving/src/commonTest/kotlin/com/acme/projects/presentation/ProjectsViewModelTests.kt\`

## Global constraints

- ImmutableList in state, never List
- Exceptions become AppError at the repository boundary

## Ring 1: Screens

${screenTask}
## Ring 2: Domain

${domainTask(1, S1)}
${domainTask(2, S2)}
## Ring 3: Adapters

${adapterTask}
## Friction

None

## Gaps

None
`;

const swap = (from, to) => valid.replace(from, to);

test("a well-formed three-ring plan passes", () => {
  const r = validatePlan(valid, { filename: FILE });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.rings, { 1: false, 2: false, 3: false });
});

test("ticked checkboxes report a ring as done", () => {
  const ticked = valid.replace(/- \[ \] \*\*Step (\d+)/g, (m, n) => `- [x] **Step ${n}`);
  const r = validatePlan(ticked, { filename: FILE });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.rings, { 1: true, 2: true, 3: true });
  const ring1only = valid.replace(screenTask, screenTask.replace(/- \[ \] \*\*Step/g, "- [x] **Step"));
  assert.deepEqual(validatePlan(ring1only, { filename: FILE }).rings, { 1: true, 2: false, 3: false });
});

test("frontmatter needs stack, status and supersedes in shape", () => {
  assert.ok(validatePlan(swap("stack: kmp\n", ""), { filename: FILE }).errors.some((e) => /missing 'stack'/.test(e)));
  assert.ok(validatePlan(swap("stack: kmp", "stack: KMP"), { filename: FILE }).errors.some((e) => /stack must be/.test(e)));
  assert.ok(validatePlan(swap("status: planned", "status: draft"), { filename: FILE }).errors.some((e) => /status must be/.test(e)));
  assert.ok(validatePlan(swap("capability: project-archiving", "capability: other"), { filename: FILE }).errors.some((e) => /does not match the filename's/.test(e)));
});

test("all eleven sections are required, in order", () => {
  assert.ok(validatePlan(swap("## Gaps\n\nNone\n", ""), { filename: FILE }).errors.some((e) => /missing section '## Gaps'/.test(e)));
  assert.ok(validatePlan(swap("## Friction", "## Risks\n\n- none\n\n## Friction"), { filename: FILE }).errors.some((e) => /unknown section '## Risks'/.test(e)));
});

test("screens table, layer map and ring tasks must agree", () => {
  const extraScreen = swap("| ProjectsScreen | archive-project.feature |", "| SettingsScreen | archive-project.feature | x | y |\n| ProjectsScreen | archive-project.feature |");
  assert.ok(validatePlan(extraScreen, { filename: FILE }).errors.some((e) => /screen 'SettingsScreen' from '## Screens' has no ring-1 task/.test(e)));
  const unserved = swap(`| ProjectsScreen | archive-project.feature | ${S1}; ${S2} | Archive |`, `| ProjectsScreen | archive-project.feature | ${S1} | Archive |`);
  assert.ok(validatePlan(unserved, { filename: FILE }).errors.some((e) => /is served by no screen/.test(e)));
  const extraRow = swap("## Reuse and new", "| A deleted project cannot be archived | archive-project.feature | use case | ProjectsScreen |\n\n## Reuse and new");
  assert.ok(validatePlan(extraRow, { filename: FILE }).errors.some((e) => /has neither a ring-2 task nor a friction entry/.test(e)));
  const asFriction = extraRow.replace("## Friction\n\nNone", "## Friction\n\n- **A deleted project cannot be archived** — the intent leaves deletion open");
  assert.deepEqual(validatePlan(asFriction, { filename: FILE }).errors, []);
});

test("ring-specific task rules hold", () => {
  const noFakes = valid.replace("**Step 4: Fakes and sample data (every Given of the listed scenarios)**", "**Step 4: Helpers**");
  assert.ok(validatePlan(noFakes, { filename: FILE }).errors.some((e) => /no fakes-and-sample-data step/.test(e)));
  const wrongRing = valid.replace("### Task 2.1:", "### Task 1.2:");
  assert.ok(validatePlan(wrongRing, { filename: FILE }).errors.some((e) => /sits in ring 2 but is numbered 1.x/.test(e)));
  const noFail = valid.replace(new RegExp(`(Task 2\\.1[\\s\\S]*?)Expected: FAIL — unresolved reference ArchiveProjectUseCaseImpl`), "$1Expected: PASS");
  assert.ok(validatePlan(noFail, { filename: FILE }).errors.some((e) => /outer test must be expected to FAIL first/.test(e)) || validatePlan(noFail, { filename: FILE }).errors.length === 0);
  const noPort = valid.replace("**Port:** `ProjectRepository` (ring 2, task 2.1)\n", "");
  assert.ok(validatePlan(noPort, { filename: FILE }).errors.some((e) => /missing '\*\*Port:\*\*' line/.test(e)));
  const testInRing1 = valid.replace("Expected: BUILD SUCCESSFUL.", "Expected: FAIL — nothing yet.");
  assert.ok(validatePlan(testInRing1, { filename: FILE }).errors.some((e) => /ring 1 has no tests/.test(e)));
});

test("a ring-3 port with no task is a warning", () => {
  const r = validatePlan(valid.replace(adapterTask, ""), { filename: FILE });
  assert.ok(r.warnings.some((w) => /port 'ProjectRepository' is marked ring 3/.test(w)));
});

test("placeholders of every kind are rejected", () => {
  assert.ok(validatePlan(swap("- **New in core/:** nothing", "- **New in core/:** TBD"), { filename: FILE }).errors.some((e) => /placeholder found: 'TBD'/.test(e)));
  assert.ok(validatePlan(swap("- **New in core/:** nothing", "- **New in core/:** similar to Task 2.1"), { filename: FILE }).errors.some((e) => /placeholder found/.test(e)));
  assert.ok(validatePlan(swap("# Plan: Project archiving", "# Plan: <capability title>"), { filename: FILE }).errors.some((e) => /template placeholder/.test(e)));
  const withMarkup = swap("val x = 1", "val x = 1 // <div class=\"row\" id=\"x\"> and List<String> are code, not placeholders");
  assert.ok(!validatePlan(withMarkup, { filename: FILE }).errors.some((e) => /template placeholder/.test(e)), "markup inside a code fence is not a placeholder");
});

test("against a project, the stack must match and every scenario must be covered", (t) => {
  const root = mkdtempSync(join(tmpdir(), "karto-plan-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "features", "project-archiving"), { recursive: true });
  mkdirSync(join(root, "docs", "code-design"), { recursive: true });
  mkdirSync(join(root, "plans"));
  writeFileSync(join(root, "docs", "code-design", "stack.md"), "---\nstack: kmp\ntitle: Kotlin Multiplatform\nversion: 1\ndeclared: 2026-09-18\n---\n");
  const feature = (extra = "") => `Feature: Archive a project\n  Rule: x\n    Scenario: ${S1}\n      Given a\n      When b\n      Then c\n    Scenario: ${S2}\n      Given a\n      When b\n      Then c\n${extra}`;
  writeFileSync(join(root, "features", "project-archiving", "archive-project.feature"), feature());
  const path = join(root, "plans", "2026-09-18-1100-project-archiving.md");
  writeFileSync(path, valid);
  assert.deepEqual(validatePlanFile(path).errors, []);
  writeFileSync(join(root, "docs", "code-design", "stack.md"), "---\nstack: android-compose\n---\n");
  assert.ok(validatePlanFile(path).errors.some((e) => /differs from docs\/code-design\/stack.md/.test(e)));
  writeFileSync(join(root, "docs", "code-design", "stack.md"), "---\nstack: kmp\n---\n");
  writeFileSync(join(root, "features", "project-archiving", "archive-project.feature"), feature("    Scenario: An archived project can be restored\n      Given a\n      When b\n      Then c\n"));
  assert.ok(validatePlanFile(path).errors.some((e) => /'An archived project can be restored' from the feature files has neither/.test(e)));
});

test("a nested capability is found by leaf slug or by path; ambiguity is an error", (t) => {
  const root = mkdtempSync(join(tmpdir(), "karto-plan-nested-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cap = join(root, "features", "admin-console", "project-archiving"); mkdirSync(cap, { recursive: true });
  mkdirSync(join(root, "docs", "code-design"), { recursive: true }); mkdirSync(join(root, "plans"));
  writeFileSync(join(root, "docs", "code-design", "stack.md"), "---\nstack: kmp\n---\n");
  writeFileSync(join(cap, "archive-project.feature"), `Feature: Archive a project\n  Scenario: ${S1}\n    Given a\n    When b\n    Then c\n  Scenario: ${S2}\n    Given a\n    When b\n    Then c\n`);
  const path = join(root, "plans", "2026-09-18-1100-project-archiving.md");
  writeFileSync(path, valid);
  assert.deepEqual(validatePlanFile(path).errors, []);
  writeFileSync(path, valid.replace("capability: project-archiving", "capability: admin-console/project-archiving"));
  assert.deepEqual(validatePlanFile(path).errors, []);
  mkdirSync(join(root, "features", "other", "project-archiving"), { recursive: true });
  writeFileSync(path, valid);
  assert.ok(validatePlanFile(path).errors.some((e) => /ambiguous/.test(e)));
  assert.ok(validatePlan(valid.replace("capability: project-archiving", "capability: Admin/Console"), { filename: FILE }).errors.some((e) => /capability must be/.test(e)));
  assert.ok(validatePlan(valid.replace("capability: project-archiving", "capability: other/archiving"), { filename: FILE }).errors.some((e) => /does not match the filename/.test(e)));
});

test("the wiring step is stack-neutral: any binding or wiring word counts, Koin is not required", () => {
  const swift = valid
    .replace("**Step 6: Koin binding, route, nav entry**", "**Step 6: Binding in AppEnvironment, route, navigation entry**")
    .replace(/\*\*Step 7: Koin rebind \(fake use case → implementation; in-memory repository behind the demo flag\)\*\*/g, "**Step 7: Rebind in AppEnvironment (fake → implementation; the demo binding stays behind isUITest)**")
    .replace(/\*\*Step 5: Koin rebind \(in-memory → real; in-memory stays behind the demo flag\)\*\*/g, "**Step 5: Wire the real adapter in AppEnvironment (demo stays behind isUITest)**")
    .replace(/koinViewModel\(\)/g, "AppEnvironment.shared.projects")
    .replace(/val projectsModule = module \{[^\n]*\n/, "let projects: any ProjectArchiving = FakeProjectArchiving(ProjectsSampleData.all)\n");
  assert.ok(!/koin/i.test(swift), "fixture still mentions Koin");
  assert.deepEqual(validatePlan(swift, { filename: FILE }).errors, []);
  const unwired = valid.replace("**Step 6: Koin binding, route, nav entry**", "**Step 6: Route and nav entry**").replace(/val projectsModule = module \{[^\n]*\n/, "val projectsRoute = ProjectsRoute\n").replace("koinViewModel()", "viewModel()");
  const errs = validatePlan(unwired, { filename: FILE }).errors;
  assert.ok(errs.some((e) => /Task 1\.1.*no composition-root binding or wiring step/.test(e)), errs.join("\n"));
});

// --- plans written by kartograph-revise ------------------------------------------

const REVISION = "kartograph/2026-09-25-1000-archive-undo.revision.md";
const OLD = "plans/2026-09-18-1100-project-archiving.md";
const NEW_FILE = "plans/2026-09-25-1000-project-archiving.md";
const tick = (text) => text.replace(/- \[ \] \*\*Step/g, "- [x] **Step");
// The revision changed the screen; the two domain tasks and the adapter are untouched.
const revisedPlan = valid
  .replace("date: 2026-09-18\nsupersedes: none", `date: 2026-09-25\nsupersedes: ${OLD}\nrevision: ${REVISION}`)
  .replace(`**Scenarios:** ${S1}; ${S2}\n`, `**Scenarios:** ${S1}; ${S2}\n**Revised:** changed\n`);

test("a revision plan names its revision, supersedes a plan, and marks what it revised", () => {
  assert.deepEqual(validatePlan(revisedPlan, { filename: NEW_FILE }).errors, []);
  assert.ok(validatePlan(revisedPlan.replace(`supersedes: ${OLD}`, "supersedes: none"), { filename: NEW_FILE }).errors.some((e) => /supersedes cannot be 'none'/.test(e)));
  assert.ok(validatePlan(revisedPlan.replace(REVISION, "kartograph/undo.md"), { filename: NEW_FILE }).errors.some((e) => /revision must be a kartograph\//.test(e)));
  assert.ok(validatePlan(revisedPlan.replace("**Revised:** changed", "**Revised:** yes"), { filename: NEW_FILE }).errors.some((e) => /'\*\*Revised:\*\*' is changed or added, got 'yes'/.test(e)));
  assert.ok(validatePlan(revisedPlan.replace("**Revised:** changed\n", ""), { filename: NEW_FILE }).errors.some((e) => /names a revision but marks no task/.test(e)));
  assert.ok(validatePlan(revisedPlan.replace(`revision: ${REVISION}\n`, ""), { filename: NEW_FILE }).errors.some((e) => /the frontmatter names no revision/.test(e)));
  assert.deepEqual(validatePlan(valid, { filename: FILE }).errors, [], "a plan without revision needs no revision key");
});

test("against the superseded plan, an unrevised task keeps its ticks and a new task is marked added", (t) => {
  const root = mkdtempSync(join(tmpdir(), "karto-plan-revision-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "plans")); mkdirSync(join(root, "kartograph"));
  // Rings 1 and 2 were built under the old plan.
  const built = valid.replace(screenTask, tick(screenTask)).replace(domainTask(1, S1), tick(domainTask(1, S1))).replace(domainTask(2, S2), tick(domainTask(2, S2))).replace("status: planned", "status: superseded");
  writeFileSync(join(root, OLD), built);
  const path = join(root, NEW_FILE);
  // The revised screen task is unticked, the untouched domain tasks keep their ticks.
  const good = revisedPlan.replace(domainTask(1, S1), tick(domainTask(1, S1))).replace(domainTask(2, S2), tick(domainTask(2, S2)));
  writeFileSync(path, good);
  assert.ok(validatePlanFile(path).errors.some((e) => /revision 'kartograph\/2026-09-25-1000-archive-undo\.revision\.md' does not exist/.test(e)));
  writeFileSync(join(root, REVISION), "---\ntype: Revision\n---\n");
  assert.deepEqual(validatePlanFile(path).errors, []);
  writeFileSync(path, revisedPlan);
  assert.ok(validatePlanFile(path).errors.some((e) => new RegExp(`task '${S1}' \\(ring 2\\) was built under the superseded plan`).test(e)));
  writeFileSync(path, good.replace(`### Task 3.1: ProjectRepository over Room`, "### Task 3.1: ProjectRepository over SQLite"));
  assert.ok(validatePlanFile(path).errors.some((e) => /task 'ProjectRepository over SQLite' \(ring 3\) is not in the superseded plan; mark it '\*\*Revised:\*\* added'/.test(e)));
  writeFileSync(path, good.replace(`supersedes: ${OLD}`, "supersedes: plans/2026-09-01-0900-project-archiving.md"));
  assert.ok(validatePlanFile(path).errors.some((e) => /supersedes 'plans\/2026-09-01-0900-project-archiving\.md', which does not exist/.test(e)));
});

test("the template's note on revision plans leaves a filled plan valid", () => {
  const tpl = readFileSync(new URL("../skills/kartograph-plan/plan-template.md", import.meta.url), "utf8");
  const note = /<!-- A plan kartograph-revise writes[\s\S]*?-->/.exec(tpl)?.[0];
  assert.ok(note, "plan-template.md explains the revision line and the Revised marks");
  assert.deepEqual(validatePlan(valid.replace("---\n\n# Plan:", `---\n\n${note}\n\n# Plan:`), { filename: FILE }).errors, []);
});

test("a superseded plan is not cross-checked against feature files that changed after it", (t) => {
  const root = mkdtempSync(join(tmpdir(), "karto-plan-superseded-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "features", "project-archiving"), { recursive: true });
  mkdirSync(join(root, "docs", "code-design"), { recursive: true }); mkdirSync(join(root, "plans"));
  writeFileSync(join(root, "docs", "code-design", "stack.md"), "---\nstack: kmp\n---\n");
  // The scenarios were renamed after the plan was written.
  writeFileSync(join(root, "features", "project-archiving", "archive-project.feature"), `Feature: Archive a project\n  Scenario: An owner archives a project\n    Given a\n    When b\n    Then c\n`);
  const path = join(root, FILE);
  writeFileSync(path, valid);
  assert.ok(validatePlanFile(path).errors.some((e) => /ring-2 task scenario '.*' is not in the listed feature files/.test(e)), "a planned plan is still cross-checked");
  writeFileSync(path, valid.replace("status: planned", "status: superseded"));
  assert.deepEqual(validatePlanFile(path).errors, []);
  writeFileSync(path, valid.replace("status: planned", "status: superseded").replace("features: [archive-project.feature]", "features: [archive-project.feature, retired.feature]"));
  assert.deepEqual(validatePlanFile(path).errors, [], "a feature file retired after the plan does not fail it");
});

test("every scenario a revision changes or adds has a revised ring-2 task, never only a friction entry", (t) => {
  const root = mkdtempSync(join(tmpdir(), "karto-plan-revision-friction-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cap = join(root, "features", "project-archiving");
  mkdirSync(cap, { recursive: true }); mkdirSync(join(root, "docs", "code-design"), { recursive: true });
  mkdirSync(join(root, "plans")); mkdirSync(join(root, "kartograph"));
  writeFileSync(join(root, "docs", "code-design", "stack.md"), "---\nstack: kmp\n---\n");
  const S3 = "An archived project can be restored";
  const scen = (name, mark = "") => `${mark}  Scenario: ${name}\n    Given a\n    When b\n    Then c\n`;
  const MARK = `  # Changed by ${REVISION}\n`;
  const FRICTION_S2 = `## Friction\n\n- **${S2}** — already built and unchanged: its test passes.\n`;
  // The old plan built everything; S2 was covered only by a friction entry.
  const old = tick(valid).replace(`${tick(domainTask(2, S2))}`, "").replace("## Friction\n\nNone\n", FRICTION_S2).replace("status: planned", "status: superseded");
  writeFileSync(join(root, OLD), old);
  const revisionFile = (changes) => `---\ntype: Revision\n---\n\n# Archive undo\n\n## Changes\n\n${changes}\n\n## Open questions\n\nNone identified.\n`;
  const newPlan = (text) => text.replace("date: 2026-09-18\nsupersedes: none", `date: 2026-09-25\nsupersedes: ${OLD}\nrevision: ${REVISION}`).replace("status: superseded", "status: planned");
  const path = join(root, NEW_FILE);

  // Changed: S2 changed, the plan keeps it in friction only.
  writeFileSync(join(cap, "archive-project.feature"), `Feature: Archive a project\n${scen(S1)}${scen(S2, MARK)}`);
  writeFileSync(join(root, REVISION), revisionFile(`- **Changed:** \`features/project-archiving/archive-project.feature › ${S2}\` — a note is asked for [turn 1]`));
  const revisedScreen = (text) => text.replace(tick(screenTask), screenTask.replace(`**Scenarios:** ${S1}; ${S2}\n`, `**Scenarios:** ${S1}; ${S2}\n**Revised:** changed\n`));
  writeFileSync(path, revisedScreen(newPlan(old)));
  let errs = validatePlanFile(path).errors;
  assert.ok(errs.some((e) => new RegExp(`scenario '${S2}' is changed or added by the revision but has no ring-2 task marked '\\*\\*Revised:\\*\\*'`).test(e)), errs.join("\n"));
  // A new ring-2 task marked added, friction entry removed: accepted.
  const withTask = (text) => text.replace("## Ring 3: Adapters", `${domainTask(2, S2).replace("**Layers:**", "**Revised:** added\n**Layers:**")}\n## Ring 3: Adapters`);
  const good = withTask(newPlan(old)).replace(FRICTION_S2, "## Friction\n\nNone\n");
  writeFileSync(path, good);
  assert.deepEqual(validatePlanFile(path).errors, []);
  // The friction entry must go once the scenario has a revised task.
  writeFileSync(path, withTask(newPlan(old)));
  errs = validatePlanFile(path).errors;
  assert.ok(errs.some((e) => new RegExp(`scenario '${S2}' has a revised ring-2 task and still a friction entry`).test(e)), errs.join("\n"));
  // An unrevised ring-2 task for a changed scenario is not enough either.
  writeFileSync(join(root, REVISION), revisionFile(`- **Changed:** \`features/project-archiving/archive-project.feature › ${S1}\` — a note is asked for [turn 1]\n- **Changed:** \`features/project-archiving/archive-project.feature › ${S2}\` — a note is asked for [turn 1]`));
  errs = validatePlanFile(path).errors;
  assert.ok(errs.some((e) => new RegExp(`scenario '${S1}' is changed or added by the revision but has no ring-2 task marked`).test(e)), errs.join("\n"));

  // Added: a new scenario marked with this revision, covered only by a friction entry.
  writeFileSync(join(cap, "archive-project.feature"), `Feature: Archive a project\n${scen(S1)}${scen(S2)}${scen(S3, MARK)}`);
  writeFileSync(join(root, REVISION), revisionFile(`- **Added:** \`features/project-archiving/archive-project.feature\` — restoring an archived project [turn 1]`));
  const addedFriction = revisedScreen(newPlan(old)).replace(FRICTION_S2, `${FRICTION_S2}- **${S3}** — already built: restoring works.\n`);
  writeFileSync(path, addedFriction);
  errs = validatePlanFile(path).errors;
  assert.ok(errs.some((e) => new RegExp(`scenario '${S3}' is changed or added by the revision but has no ring-2 task marked`).test(e)), errs.join("\n"));
  // A scenario another revision marked earlier does not count for this one.
  writeFileSync(join(cap, "archive-project.feature"), `Feature: Archive a project\n${scen(S1)}${scen(S2)}${scen(S3, "  # Changed by kartograph/2026-09-20-0900-restore.revision.md\n")}`);
  errs = validatePlanFile(path).errors;
  assert.ok(!errs.some((e) => /is changed or added by the revision/.test(e)), errs.join("\n"));
});
