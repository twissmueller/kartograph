// OpenCode plugin for Kartograph.
//
// OpenCode plugins register tools, not skills, so this module exposes each skill as a
// tool: calling it hands the model the same SKILL.md and supporting files that Claude Code
// and Codex read from `skills/<name>/`. Nothing is duplicated — the files are read from
// this package at call time.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tool } from "@opencode-ai/plugin";

const skillsDir = new URL("../skills/", import.meta.url);

async function readSkillFile(skill, name) {
  return readFile(fileURLToPath(new URL(`${skill}/${name}`, skillsDir)), "utf8");
}

function skillTool({ skill, files, description, args, opening }) {
  return tool({
    description,
    args,
    async execute(a) {
      const body = await readSkillFile(skill, "SKILL.md");
      const extras = await Promise.all(
        files.map(async (f) => `\n\n---\n\nThe ${f} the instructions refer to:\n\n${await readSkillFile(skill, f)}`),
      );
      const dir = fileURLToPath(new URL(`${skill}/`, skillsDir));
      return (
        `${opening(a)}Follow these instructions for the rest of this conversation. ` +
        `"This file's directory" in them is: ${dir}\n\n${body}${extras.join("")}`
      );
    },
  });
}

const intentArg = {
  intent: tool.schema
    .string()
    .optional()
    .describe("Path of the intent file to process; omit for the newest in intents/."),
};
const intentOpening = (a) => (a.intent ? `The intent to process: ${a.intent}\n\n` : "");

export const KartographPlugin = async () => ({
  tool: {
    kartograph_explore: skillTool({
      skill: "kartograph-explore",
      files: ["intent-template.md"],
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
      opening: (a) => (a.topic ? `The person's opening request: ${a.topic}\n\n` : ""),
    }),
    kartograph_knowledge: skillTool({
      skill: "kartograph-knowledge",
      files: ["concept-template.md"],
      description:
        "Use when an intent file exists under intents/ and its concepts have not yet been " +
        "recorded in the project's knowledge/ bundle, or when the person asks to extract, update, " +
        "or extend the knowledge base from an intent. Returns the instructions to follow for the " +
        "rest of the conversation.",
      args: intentArg,
      opening: intentOpening,
    }),
    kartograph_features: skillTool({
      skill: "kartograph-features",
      files: ["capability-template.md", "example.md"],
      description:
        "Use when an intent file exists under intents/ and the behaviour it asks for is not yet " +
        "specified as capabilities and Gherkin features under features/, or when the person asks " +
        "to derive, update, or extend the feature specifications from an intent. Returns the " +
        "instructions to follow for the rest of the conversation.",
      args: intentArg,
      opening: intentOpening,
    }),
    kartograph_views: skillTool({
      skill: "kartograph-views",
      files: ["design-system.md", "mvvm.md"],
      description:
        "Use when a capability or feature under features/ is specified and the person wants to see " +
        "and use its screens in the Kotlin Multiplatform app before any real behaviour exists — the " +
        "UI-first phase with mocked data. Also use to update those screens after the specification " +
        "changed. Requires the capability or feature to be named. Returns the instructions to follow " +
        "for the rest of the conversation.",
      args: {
        target: tool.schema
          .string()
          .describe("The capability directory (features/<capability>) or feature file to build screens for."),
      },
      opening: (a) => `The capability or feature to build: ${a.target}\n\n`,
    }),
  },
});

export default KartographPlugin;
