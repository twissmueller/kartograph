import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readPlan, writePlan } from '../workflows/lib/automation-store.js';
import {
  STEPS, STEP_KEYS, MODE_LABELS, isMode, describePlan, questionnaire, stepMode, mergePlan,
} from '../workflows/lib/automation.js';

const USAGE = `usage:
  automation.js <projectRoot> show                     human-readable policy
  automation.js <projectRoot> get [<step>]             the plan as JSON, or one step's mode
  automation.js <projectRoot> set <step> <mode> [...]  set one or more steps, atomically
  automation.js <projectRoot> questions                AskUserQuestion payload as JSON
  automation.js <projectRoot> init                     write the defaults if no file exists

show and get accept --survey <discovery.json>, which lays that survey's own automation
stamp over the project policy — the mode the user agreed to for that feature.

steps: ${STEP_KEYS.join(', ')}`;

// Print the plan the way a human reads it: one line per step, current mode and what
// that means in practice.
export function renderPlan(plan) {
  const rows = describePlan(plan);
  const w = Math.max(...rows.map((r) => r.title.length));
  return rows.map((r) => `  ${r.title.padEnd(w)}  ${r.label.padEnd(20)} ${r.hint}`).join('\n');
}

// CLI: read and write `.kartograph/automation.json`. Every command that needs to know
// whether a step is automatic goes through `get`; the end-of-survey questionnaire in
// /karto-explore and /karto-revise goes through `questions` then `set`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const rest = [];
  let surveyPath = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--survey') surveyPath = argv[++i];
    else rest.push(argv[i]);
  }
  const [root, cmd] = rest.splice(0, 2);
  if (!root || !cmd) { console.error(USAGE); process.exit(2); }

  const { plan: stored, warnings, exists } = await readPlan(root);
  for (const w of warnings) console.error(`warning: ${w}`);

  // A survey's stamp is a per-run override of the project policy: it is what the user
  // agreed to when THAT feature was surveyed, so it wins for the run that survey drives.
  let plan = stored;
  let stamped = false;
  if (surveyPath) {
    if (cmd === 'set') { console.error('--survey is read-only; it cannot be combined with `set`'); process.exit(2); }
    let survey;
    try { survey = JSON.parse(await readFile(surveyPath, 'utf8')); }
    catch (err) { console.error(`cannot read survey ${surveyPath}: ${err.message}`); process.exit(1); }
    if (survey && survey.automation) { plan = mergePlan(stored, survey.automation); stamped = true; }
  }

  if (cmd === 'show') {
    const source = exists ? '.kartograph/automation.json' : 'defaults — no .kartograph/automation.json yet';
    console.log(`Automation policy (${source}${stamped ? `, overridden by ${surveyPath}` : ''}):`);
    console.log(renderPlan(plan));
  } else if (cmd === 'get') {
    const [key] = rest;
    if (!key) console.log(JSON.stringify(plan, null, 2));
    else if (!STEP_KEYS.includes(key)) { console.error(`unknown step: ${key}\nsteps: ${STEP_KEYS.join(', ')}`); process.exit(2); }
    else console.log(stepMode(plan, key));
  } else if (cmd === 'set') {
    if (!rest.length || rest.length % 2 !== 0) { console.error(USAGE); process.exit(2); }
    const override = {};
    for (let i = 0; i < rest.length; i += 2) {
      const [key, mode] = [rest[i], rest[i + 1]];
      if (!STEP_KEYS.includes(key)) { console.error(`unknown step: ${key}\nsteps: ${STEP_KEYS.join(', ')}`); process.exit(2); }
      if (!isMode(key, mode)) {
        const modes = STEPS.find((s) => s.key === key).modes;
        console.error(`invalid mode "${mode}" for ${key} (expected ${modes.join('|')})`);
        process.exit(2);
      }
      override[key] = mode;
    }
    const next = mergePlan(plan, override);
    await writePlan(root, next);
    for (const key of Object.keys(override)) console.log(`set ${key} -> ${override[key]} (${MODE_LABELS[override[key]]})`);
  } else if (cmd === 'questions') {
    console.log(JSON.stringify(questionnaire(plan), null, 2));
  } else if (cmd === 'init') {
    if (exists) console.log('automation.json already exists — unchanged');
    else { await writePlan(root, plan); console.log('wrote .kartograph/automation.json with the defaults'); }
  } else {
    console.error(USAGE);
    process.exit(2);
  }
}
