# Worked example

Fictional input, not default product requirements. Do not import its rules into unrelated
intents.

## Input: `intents/2026-09-15-1042-archive-projects.md` (excerpt)

```markdown
# Archive projects

## Summary
An owner can archive an active project to remove it from the active overview. A
non-owner's attempt must be rejected and leave the project unchanged.

## Non-goals
- Deleting projects — a separate intent.
```

## Output: `features/project-archiving/capability.md`

```markdown
# Capability: Project archiving

Owners can take a project out of the active overview without deleting it.

## Sources
- Intent: `intents/2026-09-15-1042-archive-projects.md`

## Purpose and outcome
Project owners can remove active projects from the active overview by archiving them.
Users who do not own a project cannot archive it.

## Scope and exclusions
Includes archiving active projects and rejecting non-owner attempts. Deleting projects
is excluded.

## Features
- [Archive a project](archive-project.feature): successful and rejected attempts.

## Open questions
- Where, if anywhere, does an archived project remain accessible? Blocks any
  post-archive access behaviour; none is specified yet.
```

## Output: `features/project-archiving/archive-project.feature`

```gherkin
# Source intent: intents/2026-09-15-1042-archive-projects.md
# Capability: features/project-archiving/capability.md
Feature: Archive a project
  Project owners can remove an active project from the active overview.

  Rule: Owners can archive their active projects
    When an owner archives an active project, the system shall remove that project from the active overview.

    Scenario: An owner archives an active project
      Given Alice owns the active project "Atlas"
      When Alice archives "Atlas"
      Then "Atlas" is absent from the active project overview

  Rule: Non-owners cannot archive a project
    If a non-owner attempts to archive an active project, then the system shall reject the request and leave the project unchanged.

    Scenario: A non-owner tries to archive an active project
      Given Alice owns the active project "Atlas"
      And Bob is not its owner
      When Bob attempts to archive "Atlas"
      Then the request is rejected
      And "Atlas" remains unchanged in the active project overview
```

The skill specified the supported behaviour and exposed a missing decision. It did not
invent an archive screen, restoration, or read-only access.

## Format references

- Cucumber Gherkin reference: https://cucumber.io/docs/gherkin/reference/
- Alistair Mavin, EARS: https://alistairmavin.com/ears/
