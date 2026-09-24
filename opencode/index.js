// OpenCode plugin for Kartograph.
//
// OpenCode plugins register tools, not skills, so this module exposes each skill as a
// tool: calling it hands the model the same SKILL.md and supporting files that Claude Code
// and Codex read from `skills/<name>/`. Nothing is duplicated — the files are read from
// this package at call time. The plan and deliver tools also name the `stacks/` directory,
// since those two skills read it; migrate names the plugin root, since it runs `scripts/`
// and reads `migrations/`.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tool } from "@opencode-ai/plugin";

const skillsDir = new URL("../skills/", import.meta.url);
const stacksDir = fileURLToPath(new URL("../stacks/", import.meta.url));
const pluginRoot = fileURLToPath(new URL("../", import.meta.url));

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
  intent: tool.schema.string().optional().describe("Path of the intent file under kartograph/; omit for the newest mapped intent."),
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
    kartograph_converse: skillTool({
      skill: "kartograph-converse",
      files: ["conversation-template.md"],
      description:
        "Use when a person brings an idea, a feature request, a problem, or a change they want, " +
        "and no conversation about it has been recorded under kartograph/ yet — before any intent " +
        "is derived, and before anything is designed, planned, specified, or coded. Also use for a " +
        "follow-up conversation on what an earlier mapping left open. Returns the instructions to " +
        "follow for the rest of the conversation.",
      args: { topic: tool.schema.string().optional().describe("What the person brought up, in their words, if already known.") },
      opening: (a) => (a.topic ? `The person's opening request: ${a.topic}\n\n` : ""),
    }),
    kartograph_intent: skillTool({
      skill: "kartograph-intent",
      files: ["intent-template.md"],
      description:
        "Use when a conversation has been recorded under kartograph/ and no intent has been " +
        "derived from it yet. Returns the instructions to follow for the rest of the conversation.",
      args: { conversation: tool.schema.string().optional().describe("Path of the conversation file; omit for the newest without an intent.") },
      opening: (a) => (a.conversation ? `The conversation to derive from: ${a.conversation}\n\n` : ""),
    }),
    kartograph_map: skillTool({
      skill: "kartograph-map",
      files: ["mapping-template.md"],
      description:
        "Use when an intent has been derived under kartograph/ and has not yet been held against " +
        "what the project already has — features and git history. Returns the instructions to " +
        "follow for the rest of the conversation.",
      args: { intent: tool.schema.string().optional().describe("Path of the intent file; omit for the newest without a mapping.") },
      opening: (a) => (a.intent ? `The intent to map: ${a.intent}\n\n` : ""),
    }),
    kartograph_knowledge: skillTool({
      skill: "kartograph-knowledge",
      files: ["concept-template.md"],
      description:
        "Use when an intent under kartograph/ has been mapped and its concepts have not yet been " +
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
        "Use when an intent under kartograph/ has been mapped and the behaviour it asks for is not " +
        "yet specified as capabilities and Gherkin features under features/, or when the person asks " +
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
    kartograph_deliver: skillTool({
      skill: "kartograph-deliver",
      files: [],
      description:
        "Use when the person wants the app running locally (Mac, iOS simulator, Android emulator, " +
        "or the docker stack), on their own iPhone or iPad, on TestFlight or Play internal testing, " +
        "in the store listings, prepared as a release with notes and a version bump, released to the " +
        "stores, or deployed as a backend and frontend. Sets up the project's delivery scripts on " +
        "first use. Requires the action to be named. Returns the instructions to follow for the rest " +
        "of the conversation.",
      args: { action: tool.schema.string().describe("What to deliver and where, in the person's words.") },
      opening: (a) => `What the person wants delivered: ${a.action}\n\n`,
      extraNote: `\nThe stacks/ directory the instructions refer to is: ${stacksDir}`,
    }),
    kartograph_migrate: skillTool({
      skill: "kartograph-migrate",
      files: [],
      description:
        "Use when a Kartograph tool stopped because the project is on an older Kartograph layout, " +
        "after updating the plugin, or when the person asks to migrate a project to the current " +
        "Kartograph version. Returns the instructions to follow for the rest of the conversation.",
      args: {},
      opening: () => "",
      extraNote: `\nThe plugin root the instructions refer to is: ${pluginRoot}`,
    }),
  },
});

export default KartographPlugin;
