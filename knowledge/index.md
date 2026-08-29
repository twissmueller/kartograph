---
okf_version: "0.2"
---

# Kartograph Knowledge

The project glossary: one canonical term per concept, one markdown file per term.

# acceptance

* [Acceptance](acceptance/acceptance.md) - Confirming built behaviour by walking each scenario in the running system, exactly as a stakeholder would. _(Kontext, draft)_
* [Walk scenarios to accept](acceptance/walk-scenarios-to-accept.md) - Walk each Developed scenario in the running system one at a time; accept the ones that pass and send failures back to Open with a recorded reason. _(Capability, draft)_

# charting

* [Chart a survey](charting/chart-a-survey.md) - Fold an approved survey onto the map: add capabilities, grow the glossary, write path-tagged scenarios and ADRs, then reconcile maturity — all as one atomic swap. _(Capability, draft)_
* [Charting](charting/charting.md) - Recording an approved discovery onto the living map as capabilities, glossary terms, path-tagged scenarios and decisions. _(Kontext, draft)_

# construction

* [Build a capability](construction/build-a-capability.md) - Implement a capability's open scenarios with outside-in double-loop TDD, advancing each to Developed once it is walkable end-to-end through the real interface. _(Capability, draft)_
* [Build a whole scope](construction/build-a-whole-scope.md) - Autonomously build every open scenario in a scope, one capability per subagent in dependency order, each left at Developed for the maintainer to accept. _(Capability, draft)_
* [Construction](construction/construction.md) - Turning mapped, open scenarios into working software with outside-in double-loop TDD. _(Kontext, draft)_

# exploration

* [Exploration](exploration/exploration.md) - Discovering and shaping what to build, before anything touches the map. _(Kontext, draft)_
* [Revise existing behaviour](exploration/revise-existing-behaviour.md) - Assemble a survey that retires or renames existing capabilities and scenarios, for charting to apply. _(Capability, draft)_
* [Survey a feature](exploration/survey-a-feature.md) - Interview the maintainer about a new feature and produce a reviewable discovery survey — read-only, never touching the map. _(Capability, draft)_

# shared

* [Build agent](shared/build-agent.md) - A subagent that implements one capability's open scenarios with double-loop TDD and leaves them at Developed. _(Akteur, draft)_
* [Cartographer](shared/cartographer.md) - The person who maintains the map together with the AI — the one who runs the commands, answers the interview, and approves every write. _(Akteur, draft)_
* [Map writes are atomic](shared/atomic-map-write.md) - Every mutation of the map is written to a temp file and atomically renamed over kartograph.json, so a failed run leaves the real map untouched and never half-written. _(Regel, draft)_
* [Maturity is derived, never declared](shared/maturity-derived-not-declared.md) - A capability's maturity is computed from its on-disk .feature scenarios (vision -> sketched -> building -> usable -> stable), never hand-set; the integrity gate rejects any stored maturity inconsistent with its counts. _(Regel, draft)_
* [Scenarios are user-walkable](shared/scenarios-user-walkable.md) - Every scenario is written in plain domain language a non-technical stakeholder can walk and confirm in the running system, with no leaked implementation detail. _(Regel, draft)_
* [Stakeholder](shared/stakeholder.md) - The non-technical person who walks Developed scenarios in front of the running system and decides whether each one is Accepted. _(Akteur, draft)_

# stewardship

* [Bootstrap a map from code](stewardship/bootstrap-a-map-from-code.md) - Reverse-engineer a draft map from an existing codebase for the maintainer to review. _(Capability, draft)_
* [Groom decisions](stewardship/groom-decisions.md) - Maintain MADR-style ADRs — sequential numbering, supersession, and the worthiness test — kept in sync with the map's adr metadata. _(Capability, draft)_
* [Groom dependencies](stewardship/groom-dependencies.md) - Back-fill each dependency edge with a one-line reason and the features that justify it, flagging edges no feature supports. _(Capability, draft)_
* [Groom the glossary](stewardship/groom-the-glossary.md) - Enforce one canonical term per concept, fold synonyms into aliasesToAvoid, and flag ambiguities and collisions. _(Capability, draft)_
* [Stewardship](stewardship/stewardship.md) - Keeping the map honest and current — bootstrapping it from code, syncing it to code, and grooming its glossary, decisions and dependencies. _(Kontext, draft)_
* [Sync the map with code](stewardship/sync-the-map-with-code.md) - Detect structural drift between the map and the code, groom, then validate and write — additive and non-destructive, never deleting. _(Capability, draft)_

# visualisation

* [View the living map](visualisation/view-the-living-map.md) - Open the desktop app on the current project to browse the capability map and the per-scenario tracking board, with live reload. _(Capability, draft)_
* [Visualisation](visualisation/visualisation.md) - Seeing the living map and per-scenario progress in the desktop app. _(Kontext, draft)_
