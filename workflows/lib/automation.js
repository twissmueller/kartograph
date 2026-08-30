// Automation preferences: which steps of the Kartograph pipeline run on their own
// and which wait for the user to trigger them.
//
// The plan is a project-wide policy stored at `.kartograph/automation.json` (see
// automation-store.js). `/karto-explore` and `/karto-revise` end by putting the
// questionnaire below to the user; every downstream command reads the answers and
// acts without asking again.
//
// These are PURE helpers — no filesystem, no I/O. The store persists, the commands
// decide.
//
// Deliberately NOT configurable, because they are correctness gates rather than
// preferences: `reconcile.js` (a map whose stored maturity disagrees with its
// scenarios fails the integrity gate) and the inner unit-test loop of `/karto-build`
// (the double loop IS the build method). Turning either off would produce a map that
// lies, so neither is offered as a step.

// Modes, and what a command must do when it sees one:
//   auto     — do it, say what you did, do not ask
//   ask      — pause and ask the user (this is the pre-v0.19 behaviour)
//   manual   — do NOT do it; report the command the user can run themselves
//   full     — (acceptance-suite) run the project's whole acceptance suite
//   scenario — (acceptance-suite) run only the scenario being built
//   off      — (acceptance-suite) skip the outer loop; unit tests are the only signal
export const MODE_LABELS = {
  auto: 'Automatically',
  ask: 'Ask me each time',
  manual: 'Only when I ask',
  full: 'Full suite',
  scenario: 'Only this scenario',
  off: 'Skip the suite',
};

// The step catalogue, in pipeline order. `question`/`hints` drive the questionnaire;
// `group` is how the step is asked (`single` = its own question, `toggle` = one option
// of the shared "which of these happen without asking" multi-select).
export const STEPS = [
  {
    key: 'chart-after-explore',
    title: 'Chart the survey',
    when: 'at the end of /karto-explore and /karto-revise',
    modes: ['auto', 'ask', 'manual'],
    default: 'ask',
    group: 'single',
    question: 'When a survey is finished, should it be charted onto the map?',
    header: 'Charting',
    hints: {
      auto: 'Run /karto-chart straight away — the map, glossary and .feature files update without a pause.',
      ask: 'Summarise the survey and ask before charting.',
      manual: 'Stop after the survey; you run /karto-chart yourself.',
    },
  },
  {
    key: 'build-after-chart',
    title: 'Build the charted capability',
    when: 'at the end of /karto-chart',
    modes: ['auto', 'ask', 'manual'],
    default: 'ask',
    group: 'single',
    question: 'Once a survey is charted, should its capability be built?',
    header: 'Building',
    hints: {
      auto: 'Run /karto-build on the charted capability immediately — this writes code.',
      ask: 'Report what landed on the map and ask before building.',
      manual: 'Stop after charting; you run /karto-build yourself.',
    },
  },
  {
    key: 'acceptance-suite',
    title: 'Acceptance suite during a build',
    when: "in /karto-build's outer loop",
    modes: ['full', 'scenario', 'off'],
    default: 'scenario',
    group: 'single',
    question: 'How much of the acceptance suite should each build run?',
    header: 'Test scope',
    hints: {
      full: 'Run the whole acceptance/e2e suite for every scenario. Thorough, slow.',
      scenario: 'Run only the scenario being built (by name/tag). Fast; run the full suite yourself before release.',
      off: 'No acceptance run at all — the unit-test inner loop is the only signal.',
    },
  },
  {
    key: 'commit',
    title: 'Commit each finished scenario',
    when: 'after each scenario reaches Developed in /karto-build',
    modes: ['auto', 'manual'],
    default: 'auto',
    group: 'toggle',
    hints: {
      auto: 'Commit after each scenario reaches Developed.',
      manual: 'Leave everything in the working tree for you to commit.',
    },
  },
  {
    key: 'rewalk-check',
    title: 'Check for re-walk candidates',
    when: 'at the end of /karto-build',
    modes: ['auto', 'manual'],
    default: 'auto',
    group: 'toggle',
    hints: {
      auto: 'Run rewalk-candidates.js and list Accepted scenarios that may now be broken.',
      manual: 'Skip the check; you run it when you want it.',
    },
  },
  {
    key: 'walk-after-build',
    title: 'Walk the new scenarios',
    when: 'at the end of /karto-build',
    modes: ['auto', 'manual'],
    default: 'manual',
    group: 'toggle',
    hints: {
      auto: 'Start /karto-walk on the built capability as soon as the build finishes.',
      manual: 'Report what is waiting for acceptance; you run /karto-walk when you are ready.',
    },
  },
];

export const STEP_KEYS = STEPS.map((s) => s.key);

const BY_KEY = new Map(STEPS.map((s) => [s.key, s]));

// The step definition for a key, or undefined.
export function step(key) { return BY_KEY.get(key); }

// The plan applied when nothing is configured: today's behaviour, minus the full
// e2e suite on every build.
export const DEFAULT_PLAN = Object.freeze(
  Object.fromEntries(STEPS.map((s) => [s.key, s.default])),
);

export function isMode(key, mode) {
  const s = BY_KEY.get(key);
  return !!s && s.modes.includes(mode);
}

// Coerce anything read off disk (or typed by a human) into a complete, valid plan.
// TOLERANT BY DESIGN — this is a preferences file, not the map: an unknown key or a
// misspelled mode is a warning and a fallback to the default, never a hard failure
// that blocks the pipeline. Returns { plan, warnings }.
export function normalizePlan(raw) {
  const warnings = [];
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  if (raw != null && source !== raw) warnings.push('automation plan is not an object — using defaults');

  // Accept both the bare `{ step: mode }` shape and the stored `{ version, steps }` file.
  const steps = source.steps && typeof source.steps === 'object' && !Array.isArray(source.steps)
    ? source.steps
    : source;

  const plan = {};
  for (const s of STEPS) {
    const value = steps[s.key];
    if (value === undefined) { plan[s.key] = s.default; continue; }
    if (isMode(s.key, value)) { plan[s.key] = value; continue; }
    warnings.push(`unknown mode "${value}" for step "${s.key}" — falling back to "${s.default}"`);
    plan[s.key] = s.default;
  }
  for (const key of Object.keys(steps)) {
    if (key === 'version' || key === 'steps') continue;
    if (!BY_KEY.has(key)) warnings.push(`unknown automation step "${key}" — ignored`);
  }
  return { plan, warnings };
}

// A plan with `override`'s valid entries laid over `base`. Invalid or absent entries
// in the override leave the base value alone. Used to apply the plan a survey was
// stamped with on top of the project defaults.
export function mergePlan(base, override) {
  const { plan } = normalizePlan(base);
  const src = override && typeof override === 'object' ? (override.steps || override) : {};
  for (const s of STEPS) {
    if (isMode(s.key, src[s.key])) plan[s.key] = src[s.key];
  }
  return plan;
}

// The mode for one step, defaulting safely. Callers ask this, not the raw object.
export function stepMode(plan, key) {
  const s = BY_KEY.get(key);
  if (!s) throw new Error(`unknown automation step: ${key}`);
  const src = plan && typeof plan === 'object' ? (plan.steps || plan) : {};
  return isMode(key, src[key]) ? src[key] : s.default;
}

// Human-readable lines, one per step: "Chart the survey — Ask me each time".
export function describePlan(plan) {
  return STEPS.map((s) => {
    const mode = stepMode(plan, s.key);
    return { key: s.key, title: s.title, when: s.when, mode, label: MODE_LABELS[mode], hint: s.hints[mode] };
  });
}

// The AskUserQuestion payload for the end-of-survey questionnaire, with each step's
// CURRENT mode listed first so pressing through keeps today's policy. Every `single`
// step becomes its own question; the `toggle` steps share one multi-select where a
// checked option means `auto`. AskUserQuestion allows at most 4 questions of at most
// 4 options each, which the catalogue is sized to fit.
export function questionnaire(plan) {
  const questions = STEPS.filter((s) => s.group === 'single').map((s) => {
    const current = stepMode(plan, s.key);
    const modes = [current, ...s.modes.filter((m) => m !== current)];
    return {
      question: s.question,
      header: s.header,
      multiSelect: false,
      options: modes.map((m) => ({
        label: MODE_LABELS[m] + (m === current ? ' (current)' : ''),
        description: s.hints[m],
        mode: m,
        step: s.key,
      })),
    };
  });

  const toggles = STEPS.filter((s) => s.group === 'toggle');
  questions.push({
    question: 'Which of these should happen on their own, without asking?',
    header: 'After build',
    multiSelect: true,
    options: toggles.map((s) => {
      const current = stepMode(plan, s.key);
      return {
        label: s.title + (current === 'auto' ? ' (currently on)' : ' (currently off)'),
        description: s.hints.auto,
        mode: 'auto',
        step: s.key,
      };
    }),
  });
  return questions;
}

// Turn the questionnaire's selections back into a plan. `selected` is the list of
// chosen `{ step, mode }` option payloads; every `toggle` step NOT selected is
// explicitly set to `manual` (an unchecked box is an answer, not a missing one).
export function planFromAnswers(base, selected) {
  const plan = { ...normalizePlan(base).plan };
  const picked = new Set();
  for (const opt of selected || []) {
    if (opt && isMode(opt.step, opt.mode)) { plan[opt.step] = opt.mode; picked.add(opt.step); }
  }
  for (const s of STEPS) {
    if (s.group === 'toggle' && !picked.has(s.key)) plan[s.key] = 'manual';
  }
  return plan;
}
