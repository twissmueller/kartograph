# 🗺️ Kartograph

**Draw out what a person really wants before anything gets built.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/twissmueller)

Kartograph is a plugin for [Claude Code](https://code.claude.com),
[Codex](https://developers.openai.com/codex) and [OpenCode](https://opencode.ai) with a
single skill, **`kartograph-explore`**.
It runs one exploring conversation with you and ends by writing down your intent as a
plain markdown file in your project:

```
intents/2026-09-15-1042-offline-watering-schedule.md
```

That file is the whole output. No code, no plan, no design — just what you want, in a form
that you, a colleague, or a later AI session can pick up and act on.

## Why

AI assistants write code faster than anyone can think. What they cannot do is know what you
meant. Every drifting implementation, every "that's not what I asked for", starts with an
intent that lived only in someone's head and was never pulled out and written down.

Kartograph makes that the first, separate step. The conversation has two halves:

1. **Opening up.** Before any solution is on the table: who you are in this, what you want
   and why, who it is for, and how you would recognise success. When your goal could be
   read two ways, the AI reflects both back and lets you pick.
2. **Converging.** Then it grills you, one question at a time, always with a recommended
   answer, until it can play your whole intent back and you say nothing is missing. Vague
   words get sharpened into concrete cases. Solutions get asked what outcome they serve.
   Non-goals get asked for explicitly. Decisions get recorded with their reasons and the
   alternatives you rejected. Anything you cannot answer yet becomes an open question with
   a name next to it, not a loop.

## What the intent file holds

Every file has the same sections, and an empty section says so, so a reader knows the
question was asked:

- **Summary**, one paragraph
- **Who**: the role you spoke from, who benefits, who is affected
- **Goals**: why the work exists
- **Intended outcomes**: what will observably be true when it is done
- **Non-goals**: what is deliberately left out, and why
- **Constraints**: what cannot change
- **Assumptions**: what either side is taking for granted, stated so it can be denied
- **Decisions**: each with its reason and what was rejected
- **Open questions**: each with who can answer it and why it matters
- **Terms**: the words you used with a specific meaning
- **Notes**: anything said that fits nowhere else

The file is written in the language the conversation was held in. Its frontmatter carries
the date, your role, a `draft`/`confirmed` status, and links to any earlier intent it
revisits.

## Install

### Claude Code

```
/plugin marketplace add twissmueller/kartograph
/plugin install kartograph@twissmueller
```

Then, in any project:

```
/kartograph:kartograph-explore I want the app to work without a network connection
```

The skill also triggers on its own when you bring an idea or change request and no intent
for it exists yet.

### Codex

Clone this repository and register it as a local marketplace in `~/.codex/config.toml`:

```toml
[marketplaces.twissmueller]
source_type = "local"
source = "/path/to/kartograph"

[plugins."kartograph@twissmueller"]
enabled = true
```

Alternatively, copy or symlink `skills/kartograph-explore` into `~/.codex/skills/`. Codex
reads the same `SKILL.md`.

### OpenCode

OpenCode plugins register tools rather than skills, so the plugin exposes the skill as a
tool named `kartograph_explore` that hands the model the same `SKILL.md`. Add the npm
package to `opencode.json`:

```json
{ "plugin": ["opencode-kartograph"] }
```

Or skip the plugin: OpenCode also reads skills straight from `~/.agents/skills/`, so a copy
or symlink of `skills/kartograph-explore` there is enough, and Codex picks it up from the
same place.

### Any agent that reads `SKILL.md`

The skill follows the [agentskills.io](https://agentskills.io) format and depends on no
runtime-specific tool. Drop `skills/kartograph-explore` wherever your agent looks for
skills.

## Guardrails

- The skill writes **only** the intent file. It never touches code or other files.
- It never fills a gap with a guess. What you did not say is an assumption or an open
  question, labelled as such.
- It never overwrites an earlier intent; revisiting one produces a new file that names the
  old one.
- It does not start any further phase. What you do with the intent is your call.

## History

Versions up to `v0.21.2` were a much larger Kartograph: a living map of a software system
with a desktop app, validators, nine commands, and a build-and-walk pipeline. That work is
still in git history under its tags. `v1.0.0` restarts from the one step that mattered most.

## License

MIT — see [LICENSE](./LICENSE). Attributions in [NOTICE](./NOTICE).
