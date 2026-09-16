import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validatePlan, validatePlanFile } from "../skills/kartograph-plan/validate-plan.js";

const FILE = "plans/2026-09-16-1100-project-archiving.md";

const task = (n, name) => `### Task ${n}: ${name}

**Scenario:** \`archive-project.feature\` — ${name}
**Layers:** use case · repository

**Interfaces:**
- Consumes: nothing
- Produces: \`ArchiveProjectUseCaseImpl(repo: ProjectRepository)\`

- [ ] **Step 1: Outer test (ViewModel, Given/When/Then)**

\`\`\`kotlin
@Test
fun \`${name}\`() = runTest {
    // Given
    val repo = FakeProjectRepository(listOf(aProject(id = "atlas", owner = "alice")))
    // When
    vm.onEvent(ProjectEvent.Archive("atlas"))
    // Then
    vm.state.test { assertTrue(awaitItem().active.none { it.id == "atlas" }) }
}
\`\`\`

- [ ] **Step 2: Run it, expect failure**

Run: \`./gradlew :feature-project-archiving:allTests --tests "*ProjectViewModelTests*"\`
Expected: FAIL — unresolved reference ArchiveProjectUseCaseImpl

- [ ] **Step 3: Use case — failing test**

\`\`\`kotlin
@Test
fun \`archive marks the project archived\`() = runTest {
    val repo = FakeProjectRepository(listOf(aProject(id = "atlas")))
    val result = ArchiveProjectUseCaseImpl(repo)("atlas")
    assertIs<Resource.Success<Unit>>(result)
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

- [ ] **Step 7: Koin binding**

\`\`\`kotlin
factory<ArchiveProjectUseCase> { ArchiveProjectUseCaseImpl(get()) }
\`\`\`

- [ ] **Step 8: Outer test passes; see it on screen**

Run: \`./gradlew :feature-project-archiving:allTests\`
Expected: PASS. If a Compose Hot Reload window is connected: reload, get_ui_error, take_screenshot; "Atlas" is absent from the active overview.

- [ ] **Step 9: Commit**

\`\`\`bash
git add feature-project-archiving
git commit -m "build(project-archiving): ${name}"
\`\`\`
`;

const valid = `---
capability: project-archiving
features: [archive-project.feature]
status: planned
date: 2026-09-16
supersedes: none
---

# Plan: Project archiving

**Goal:** An owner can archive an active project and it leaves the active overview, backed by a real repository.

**Follows:** \`docs/code-design/mvvm.md\` (phases 2 and 3) and the build skill's \`build-design.md\`.

## Layer map

| scenario | feature | layers crossed | entry point |
|---|---|---|---|
| An owner archives an active project | archive-project.feature | use case · repository | Projects screen, "Archive" on a row |
| A non-owner tries to archive an active project | archive-project.feature | use case · repository | Projects screen, "Archive" on a row |

## Reuse and new

- **Reused:** \`ProjectViewModel\`, \`ProjectState\` from phase 1
- **New in the feature module:** \`ArchiveProjectUseCaseImpl\`, \`ProjectRepository\`
- **New in core/:** nothing
- **New in server/:** nothing

## Ports and adapters

\`\`\`kotlin
interface ProjectRepository {
    fun observeActive(): Flow<ImmutableList<Project>>
    suspend fun archive(id: String): Resource<Unit>
}
\`\`\`

| port | adapter | where |
|---|---|---|
| \`ProjectRepository\` | \`InMemoryProjectRepository\` | \`data/\` |

## Files

- Create: \`feature-project-archiving/src/commonMain/kotlin/com/acme/projects/domain/ProjectRepository.kt\` — the port
- Modify: \`feature-project-archiving/src/commonMain/kotlin/com/acme/projects/di/ProjectModule.kt\` — bind the impl
- Test: \`feature-project-archiving/src/commonTest/kotlin/com/acme/projects/presentation/ProjectViewModelTests.kt\`

## Global constraints

- ImmutableList in state, never List
- Exceptions become AppError at the repository boundary

## Tasks

${task(1, "An owner archives an active project")}
${task(2, "A non-owner tries to archive an active project")}
## Friction

None

## Gaps

None
`;

const swap = (from, to) => valid.replace(from, to);

test("a well-formed plan passes", () => {
  assert.deepEqual(validatePlan(valid, { filename: FILE }).errors, []);
});

test("filename, capability, status and supersedes are constrained", () => {
  assert.ok(validatePlan(valid, { filename: "plans/archiving.md" }).errors.some((e) => /filename must be/.test(e)));
  assert.ok(validatePlan(swap("capability: project-archiving", "capability: other"), { filename: FILE }).errors.some((e) => /does not match the filename's/.test(e)));
  assert.ok(validatePlan(swap("status: planned", "status: draft"), { filename: FILE }).errors.some((e) => /status must be/.test(e)));
  assert.ok(validatePlan(swap("supersedes: none", "supersedes: yesterday"), { filename: FILE }).errors.some((e) => /supersedes must be/.test(e)));
  assert.deepEqual(validatePlan(swap("supersedes: none", "supersedes: plans/2026-09-15-0900-project-archiving.md"), { filename: FILE }).errors, []);
});

test("goal, follows line and every section are required, in order", () => {
  assert.ok(validatePlan(swap("**Goal:** An owner", "Goal: An owner"), { filename: FILE }).errors.some((e) => /'\*\*Goal:\*\*/.test(e)));
  assert.ok(validatePlan(swap("## Gaps\n\nNone\n", ""), { filename: FILE }).errors.some((e) => /missing section '## Gaps'/.test(e)));
  assert.ok(validatePlan(swap("## Friction", "## Risks\n\n- none\n\n## Friction"), { filename: FILE }).errors.some((e) => /unknown section '## Risks'/.test(e)));
});

test("every layer-map scenario needs a task or a friction entry, and vice versa", () => {
  const extraRow = swap("## Reuse and new", "| A deleted project cannot be archived | archive-project.feature | use case | Projects screen |\n\n## Reuse and new");
  assert.ok(validatePlan(extraRow, { filename: FILE }).errors.some((e) => /has neither a task nor a friction entry/.test(e)));
  const asFriction = extraRow.replace("## Friction\n\nNone", "## Friction\n\n- **A deleted project cannot be archived** — the intent leaves deletion open");
  assert.deepEqual(validatePlan(asFriction, { filename: FILE }).errors, []);
  const unmapped = swap("| A non-owner tries to archive an active project | archive-project.feature | use case · repository | Projects screen, \"Archive\" on a row |\n", "");
  assert.ok(validatePlan(unmapped, { filename: FILE }).errors.some((e) => /is not in the layer map/.test(e)));
});

test("tasks need numbering, scenario and layers lines, interfaces, steps in shape", () => {
  assert.ok(validatePlan(swap("### Task 2:", "### Task 3:"), { filename: FILE }).errors.some((e) => /out of order/.test(e)));
  assert.ok(validatePlan(swap("- Produces: `ArchiveProjectUseCaseImpl(repo: ProjectRepository)`\n\n- [ ] **Step 1: Outer test (ViewModel, Given/When/Then)**\n\n```kotlin\n@Test\nfun `An owner", "- Produces: `ArchiveProjectUseCaseImpl(repo: ProjectRepository)`\n\n- [ ] **Step 1: Write the code**\n\n```kotlin\n@Test\nfun `An owner"), { filename: FILE }).errors.some((e) => /Step 1 must be the outer test/.test(e)));
  const noFail = valid.replace(/Expected: FAIL[^\n]*/g, "Expected: PASS");
  assert.ok(validatePlan(noFail, { filename: FILE }).errors.some((e) => /expected to FAIL first/.test(e)));
  const noKoin = valid.replace(/- \[ \] \*\*Step 7: Koin binding\*\*/g, "- [ ] **Step 7: Wiring**").replace(/factory<ArchiveProjectUseCase>[^\n]*/g, "bind()");
  assert.ok(validatePlan(noKoin, { filename: FILE }).errors.some((e) => /no Koin binding step/.test(e)));
});

test("placeholders of every kind are rejected", () => {
  assert.ok(validatePlan(swap("- **New in core/:** nothing", "- **New in core/:** TBD"), { filename: FILE }).errors.some((e) => /placeholder found: 'TBD'/.test(e)));
  assert.ok(validatePlan(swap("- **New in core/:** nothing", "- **New in core/:** add appropriate error handling"), { filename: FILE }).errors.some((e) => /placeholder found/.test(e)));
  assert.ok(validatePlan(swap("- **New in core/:** nothing", "- **New in core/:** similar to Task 1"), { filename: FILE }).errors.some((e) => /placeholder found/.test(e)));
  assert.ok(validatePlan(swap("# Plan: Project archiving", "# Plan: <capability title>"), { filename: FILE }).errors.some((e) => /template placeholder/.test(e)));
});

test("against a project, task scenarios must exist and every scenario must be covered", (t) => {
  const root = mkdtempSync(join(tmpdir(), "karto-plan-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "features", "project-archiving"), { recursive: true });
  mkdirSync(join(root, "plans"));
  const feature = (extra = "") => `Feature: Archive a project\n  Rule: x\n    Scenario: An owner archives an active project\n      Given a\n      When b\n      Then c\n    Scenario: A non-owner tries to archive an active project\n      Given a\n      When b\n      Then c\n${extra}`;
  writeFileSync(join(root, "features", "project-archiving", "archive-project.feature"), feature());
  const path = join(root, "plans", "2026-09-16-1100-project-archiving.md");
  writeFileSync(path, valid);
  assert.deepEqual(validatePlanFile(path).errors, []);
  writeFileSync(join(root, "features", "project-archiving", "archive-project.feature"), feature("    Scenario: An archived project can be restored\n      Given a\n      When b\n      Then c\n"));
  assert.ok(validatePlanFile(path).errors.some((e) => /'An archived project can be restored' from the feature files has neither/.test(e)));
  writeFileSync(path, valid.replace(/archive-project\.feature/g, "gone.feature"));
  assert.ok(validatePlanFile(path).errors.some((e) => /gone.feature does not exist/.test(e)));
});
