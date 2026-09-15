# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Kartograph is a plugin with exactly **one skill**, `kartograph-explore`. The skill runs one
exploring conversation with a person and writes what they want down as
`intents/<YYYY-MM-DD-HHMM>-<slug>.md` in the target project. That file is the whole
product. There is no build and no test suite.

The same skill is served to three runtimes from one place:

```
skills/kartograph-explore/SKILL.md          the skill (agentskills.io format, read by all three)
skills/kartograph-explore/intent-template.md the skeleton of the intent file
.claude-plugin/plugin.json                  Claude Code manifest  (lists the skill directory)
.claude-plugin/marketplace.json             Claude Code marketplace, source "./"
.codex-plugin/plugin.json                   Codex manifest        (points at ./skills/)
.agents/plugins/marketplace.json            Codex marketplace, local source "./"
opencode/index.js                           OpenCode plugin: a `kartograph_explore` tool that
                                            returns SKILL.md + template at call time
package.json                                npm manifest for the OpenCode plugin only
```

OpenCode plugins can register tools but not skills, which is why the OpenCode entry is a
tiny JS module: it reads the two skill files from the package and returns them. It must
never carry a copy of the skill text. `package.json` exists only to publish that module as
`opencode-kartograph`; its single peer dependency is the OpenCode plugin SDK.

## Rules for editing the skill

- **Tool-neutral.** The skill must behave the same in Claude Code and Codex, so it asks in
  plain chat and reads files with whatever the runtime offers. Never reference a
  runtime-specific tool, variable (`${CLAUDE_PLUGIN_ROOT}`), or slash command in `SKILL.md`.
  The template is addressed as "`intent-template.md` in the same directory as this file".
- **The intent file is the only output.** The skill writes nothing else and never starts,
  names, or hints at a later phase. Keep it that way; if a follow-up phase ever exists it
  will be a separate skill that *reads* intents.
- **Frontmatter is the contract.** `name` stays `kartograph-explore` (it is the slash name
  and the Codex skill folder). `description` states *when* to use the skill, never *how* it
  works — a description that summarises the process makes agents skip the body.
- **Every template section survives.** The skill promises a reader that an empty section
  means "asked, nothing found". Adding a section means adding it to the template, the
  skill's bucket table, and the README's list.

## Releasing

Bump `version` in **all three** of `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`
and `package.json` to the same value — each marketplace compares its own manifest, so an
un-bumped release is invisible downstream. Then tag it and push commit and tag together; the
repo is its own marketplace and resolves against `main`. OpenCode users get the release only
after `npm publish`:

```bash
git tag -a v1.1.0 -m "v1.1.0 — <the one-line headline>"
git push origin main && git push origin v1.1.0
```

Tags `v0.19.0` … `v0.21.2` mark the earlier, much larger Kartograph (a living map with a
desktop app, validators, and nine commands). That history is still in git; nothing in the
current plugin depends on it.
