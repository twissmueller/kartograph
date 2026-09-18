// OpenCode plugin for Kartograph.
//
// OpenCode plugins register tools, not skills, so this module exposes each skill as a
// tool: calling it hands the model the same SKILL.md and supporting files that Claude Code
// and Codex read from `skills/<name>/`. Nothing is duplicated — the files are read from
// this package at call time. The plan tool also names the `stacks/` directory, since it is
// the one skill that reads it.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tool } from "@opencode-ai/plugin";

const skillsDir = new URL("../skills/", import.meta.url);
const stacksDir = fileURLToPath(new URL("../stacks/", import.meta.url));

async function readSkillFile(skill, name) {
  return readFile(fileURLToPath(new URL(`${skill}/${name}`, skillsDir)), "utf8");
}

function skillTool({ skill, files, description, args, opening, extraNote = "" }) {
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
        `"This file's directory" in them is: ${dir}${extraNote}\n\n${body}${extras.join("")}`
      );
    },
  });
}

const intentArg = {
  intent: tool.schema.string().optional().describe("Path of the intent file to process; omit for the newest in intents/."),
};
const intentOpening = (a) => (a.intent ? `The intent to process: ${a.intent}\n\n` : "");
const planArg = {
  target: tool.schema.string().optional().describe("The capability directory (features/<capability>) to work on; omit for the newest planned plan."),
};
const planOpening = (verb) => (a) => (a.target ? `The capability to ${verb}: ${a.target}\n\n` : "");
const ringDescription = (ring, what, prerequisite) =>
  `Use when a capability has a plan under plans/${prerequisite} and the person wants ${what} — ring ${ring} of the plan. ` +
  "Takes the capability named, else the newest planned plan. Returns the instructions to follow for the rest of the conversation.";

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
      args: { topic: tool.schema.string().optional().describe("What the person brought up, in their words, if already known.") },
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
    kartograph_plan: skillTool({
      skill: "kartograph-plan",
      files: ["plan-template.md"],
      description:
        "Use when a capability or feature under features/ is specified and nothing has been " +
        "implemented for it yet, or when its scenarios changed or failed a walk and the " +
        "implementation needs re-planning. Produces the three-ring plan that kartograph_screens, " +
        "kartograph_domain and kartograph_adapters execute, and declares the project's technology " +
        "stack. Requires the capability or feature to be named. Returns the instructions to follow " +
        "for the rest of the conversation.",
      args: { target: tool.schema.string().describe("The capability directory (features/<capability>) or feature file to plan.") },
      opening: (a) => `The capability or feature to plan: ${a.target}\n\n`,
      extraNote: `\nThe stacks/ directory the instructions refer to is: ${stacksDir}`,
    }),
    kartograph_screens: skillTool({
      skill: "kartograph-screens",
      files: [],
      description: ringDescription(1, "to see and use its screens on fakes with sample data before any real behaviour exists", ""),
      args: planArg,
      opening: planOpening("build screens for"),
    }),
    kartograph_domain: skillTool({
      skill: "kartograph-domain",
      files: [],
      description: ringDescription(2, "the real behaviour underneath: use case implementations, rules, repository interfaces and scenario tests, data still in memory", " with ring 1 done"),
      args: planArg,
      opening: planOpening("build the domain for"),
    }),
    kartograph_adapters: skillTool({
      skill: "kartograph-adapters",
      files: [],
      description: ringDescription(3, "real data behind it: repositories over a database and an API, platform capabilities, and the server endpoints", " with ring 2 done"),
      args: planArg,
      opening: planOpening("build the adapters for"),
    }),
    kartograph_walk: skillTool({
      skill: "kartograph-walk",
      files: ["walk-template.md"],
      description:
        "Use when something has been built for a capability or feature under features/ — screens on " +
        "sample data, the domain, or the whole feature — and a person wants to be shown it working in " +
        "the running app, scenario by scenario, and to say whether each one is right. Also use to " +
        "re-walk a capability after changes. Requires the capability, feature or scenario to be " +
        "named. Returns the instructions to follow for the rest of the conversation.",
      args: { target: tool.schema.string().describe("The capability directory, feature file, or scenario name to walk.") },
      opening: (a) => `The capability, feature or scenario to walk: ${a.target}\n\n`,
    }),
  },
});

export default KartographPlugin;
