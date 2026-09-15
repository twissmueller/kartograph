// OpenCode plugin for Kartograph.
//
// OpenCode plugins register tools, not skills, so this module exposes the one skill as a
// tool: calling `kartograph_explore` hands the model the same SKILL.md and template that
// Claude Code and Codex read from `skills/kartograph-explore/`. Nothing is duplicated — the
// files are read from this package at call time.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tool } from "@opencode-ai/plugin";

const skillDir = new URL("../skills/kartograph-explore/", import.meta.url);

async function readSkillFile(name) {
  return readFile(fileURLToPath(new URL(name, skillDir)), "utf8");
}

export const KartographPlugin = async () => ({
  tool: {
    kartograph_explore: tool({
      description:
        "Use when a person brings an idea, a feature request, a problem, or a change they want, " +
        "and no written statement of their intent exists yet — before anything is designed, " +
        "planned, specified, or coded. Also use to revisit or extend an intent already recorded " +
        "under intents/. Returns the instructions to follow for the rest of the conversation.",
      args: {
        topic: tool.schema
          .string()
          .optional()
          .describe("What the person brought up, in their words, if already known."),
      },
      async execute(args) {
        const [skill, template] = await Promise.all([
          readSkillFile("SKILL.md"),
          readSkillFile("intent-template.md"),
        ]);
        const opening = args.topic ? `The person's opening request: ${args.topic}\n\n` : "";
        return (
          `${opening}Follow these instructions for the rest of this conversation.\n\n` +
          `${skill}\n\n---\n\n` +
          `The intent-template.md the instructions refer to:\n\n${template}`
        );
      },
    }),
  },
});

export default KartographPlugin;
