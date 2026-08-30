import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { automationPath } from './paths.js';
import { normalizePlan, STEPS, stepMode } from './automation.js';

// Read a project's automation preferences from `.kartograph/automation.json`.
// NEVER throws: a missing, unreadable or garbled file yields DEFAULT_PLAN with a
// warning, because a preferences file must not be able to block the pipeline.
// Returns { plan, warnings, exists }.
export async function readPlan(projectRoot) {
  let raw;
  try {
    raw = await readFile(automationPath(projectRoot), 'utf8');
  } catch {
    const { plan } = normalizePlan(null);
    return { plan, warnings: [], exists: false };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const { plan } = normalizePlan(null);
    return { plan, warnings: [`automation.json is not valid JSON (${err.message}) — using defaults`], exists: true };
  }
  const { plan, warnings } = normalizePlan(parsed);
  return { plan, warnings, exists: true };
}

// Write the plan back atomically (temp file + rename), in the same
// `{ version, steps }` envelope the map uses for its own state. Values are written in
// catalogue order so the file diffs cleanly when one answer changes.
export async function writePlan(projectRoot, plan) {
  const p = automationPath(projectRoot);
  await mkdir(dirname(p), { recursive: true });
  const steps = {};
  for (const s of STEPS) steps[s.key] = stepMode(plan, s.key);
  const tmp = p + '.tmp';
  await writeFile(tmp, JSON.stringify({ version: 1, steps }, null, 2) + '\n');
  await rename(tmp, p);
  return steps;
}
