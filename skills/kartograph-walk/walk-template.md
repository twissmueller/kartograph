---
capability: <capability directory name under features/>
features: [<feature-name>.feature, <another>.feature]
driver: compose-hot-reload | chrome | playwright | screen-control | person
surface: desktop | web | ios-simulator | macos | iphone | ipad | android
date: <YYYY-MM-DD>
walker: <the person's role, as they named it>
---

# Walk: <capability title>

## Summary

- **Passed:** <n>
- **Failed:** <n>
- **Skipped:** <n>
- **Not drivable:** <n>

<One line saying what this surface proves: a desktop window or a browser proves the shared
UI and nothing platform-specific; a simulator or device proves that platform.>

## <feature-name>.feature

### <Scenario name exactly as in the file>

- **Verdict:** passed | failed | skipped | not drivable
- **Observed:** <what you actually saw at the Then, in the scenario's words>
- **Person said:** <their words on a failure, or "—">
- **Stuck at:** <the step where driving stopped, only for not drivable, or "—">

### <Next scenario name>

- **Verdict:** …
- **Observed:** …
- **Person said:** …
- **Stuck at:** …

## <another-feature>.feature

### …
