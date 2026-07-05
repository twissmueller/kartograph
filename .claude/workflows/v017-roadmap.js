export const meta = {
  name: 'v017-roadmap',
  description: 'Implement the v0.17 roadmap workstreams (WS1-WS11) sequentially: one implementer + one reviewer per workstream, fix loop on findings, stop on failure.',
  whenToUse: 'Run from the kartograph repo on branch feat/v0.17-roadmap after reading docs/handover/2026-07-05-v0.17-roadmap.md. Args: { startAt?: "WS3", only?: ["WS4","WS5"] } to resume or cherry-pick.',
  phases: [
    { title: 'WS1' }, { title: 'WS2' }, { title: 'WS3' }, { title: 'WS4' },
    { title: 'WS5' }, { title: 'WS6' }, { title: 'WS7' }, { title: 'WS8' },
    { title: 'WS9' }, { title: 'WS10' }, { title: 'WS11' },
  ],
}

// Defensive: a mis-caller may pass args as a JSON-stringified string (same guard as
// workflows/internal/*).
let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch { a = {} } }
a = a || {}

const HANDOVER = 'docs/handover/2026-07-05-v0.17-roadmap.md'
const REPO = '/Users/tobias.wissmueller/projects/kartograph'

const WORKSTREAMS = [
  { id: 'WS1', title: 'CI for this repo' },
  { id: 'WS2', title: 'Remove browser viewer; desktop is the UI' },
  { id: 'WS3', title: 'Consolidate artifacts under .kartograph/' },
  { id: 'WS4', title: 'scenarioNotes foundation' },
  { id: 'WS5', title: '/karto-walk acceptance command' },
  { id: 'WS6', title: 'Re-walk candidates after build' },
  { id: 'WS7', title: 'Revise flow' },
  { id: 'WS8', title: 'Spec-friction rule in build' },
  { id: 'WS9', title: 'Superpowers decoupling' },
  { id: 'WS10', title: 'Repo hygiene' },
  { id: 'WS11', title: 'Consumer CI (validate + reconcile --check)' },
]

const REPORT = {
  type: 'object', additionalProperties: false,
  required: ['status', 'commits', 'testSummary', 'summary'],
  properties: {
    status: { enum: ['done', 'blocked'] },
    commits: { type: 'array', items: { type: 'string' }, description: 'short SHAs, oldest first' },
    testSummary: { type: 'string', description: 'e.g. "241/241 passing"' },
    summary: { type: 'string' },
    concerns: { type: 'string' },
  },
}

const VERDICT = {
  type: 'object', additionalProperties: false,
  required: ['approved', 'findings'],
  properties: {
    approved: { type: 'boolean', description: 'true only if no Critical/Important findings' },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['severity', 'issue'],
        properties: {
          severity: { enum: ['critical', 'important', 'minor'] },
          file: { type: 'string' }, issue: { type: 'string' }, fix: { type: 'string' },
        },
      },
    },
  },
}

const CONSTRAINTS = `Global constraints (from the handover — binding):
- Vanilla ESM, Node built-ins + ajv only. NO new dependencies, NO framework, NO build step.
- Three-layer write rule: commands = prose + atomic swap; scripts/ + workflows/lib/ = all
  deterministic logic, unit-tested (pure fn + import.meta.url-guarded CLI); workflows/internal/
  never mutate the map and keep the stringified-args JSON.parse guard.
- Any new map block needs BOTH gates: JSON Schema in schemas/v1/ AND a referential-integrity
  check in scripts/validate-kartograph.js.
- No fallbacks to old file locations. No version bumps (that is WS13, not yours).
- npm test must be green before your final commit. Commit conventionally (feat/fix/chore).
- You cannot launch the Electron GUI (no display): verify JS with node --check + unit tests,
  and state clearly in your report when GUI verification is deferred to the human.`

function implementerPrompt(ws) {
  return `You are implementing one workstream of the kartograph v0.17 roadmap.

Repo: ${REPO} (work here; you are on branch feat/v0.17-roadmap — verify with git branch --show-current; if not on it, stop and report blocked).

Read your requirements FIRST and follow them exactly:
1. ${REPO}/${HANDOVER} — section "## ${ws.id} — ${ws.title}" is YOUR workstream. Also read
   "Global constraints" and "Ordering & why" at the top. Decisions in the doc are final.
2. ${REPO}/CLAUDE.md — repo conventions.

${CONSTRAINTS}

Your job:
1. Implement exactly the "${ws.id}" section. Where it says "verify by grep" or "verify
   semantics first", actually do it before coding.
2. Write/update the unit tests the section requires. Run npm test (full suite) before your
   final commit.
3. Tick the "${ws.id}" checkbox in the Ledger section of ${HANDOVER} (change "- [ ] ${ws.id}"
   to "- [x] ${ws.id}") and include that edit in your final commit.
4. Commit your work (one or a few conventional commits).

If a requirement is impossible as written or you need a decision the doc does not make,
STOP and return status "blocked" with the specifics in summary — do not improvise a design.

Your final message is consumed by an orchestration script (not a human): return the
structured report only.`
}

function reviewerPrompt(ws, impl) {
  const first = impl.commits[0]
  const last = impl.commits[impl.commits.length - 1]
  return `You are reviewing one implemented workstream of the kartograph v0.17 roadmap.
Read-only: do not modify the working tree, index, or branches.

Repo: ${REPO}

What was required: ${REPO}/${HANDOVER} — section "## ${ws.id} — ${ws.title}" (also read the
"Global constraints" block; they bind this work).

Implementer's claims (unverified): status=${impl.status}; tests: ${impl.testSummary};
summary: ${impl.summary}

Diff under review: run
  git -C ${REPO} diff ${first}^..${last}
and
  git -C ${REPO} log --oneline ${first}^..${last}
That diff is your view of the change; read files in full only when a hunk you must judge is
cut off.

Judge:
1. SPEC: every requirement of the ${ws.id} section implemented? Anything extra/out of scope?
   Acceptance criteria met (run the section's grep checks yourself)? Ledger checkbox ticked?
2. QUALITY: pure-fn+CLI split respected; tests test real behavior; both write gates present
   for any new map block; no new deps (check package.json in the diff); no forbidden files
   touched (.superpowers/, version fields).
Do NOT re-run the full test suite (implementer reported it); run at most one focused test if
a specific doubt arises.

approved=true ONLY if there are no critical or important findings. Minor findings do not
block. Return the structured verdict only.`
}

function fixerPrompt(ws, findings) {
  const list = findings
    .filter((f) => f.severity !== 'minor')
    .map((f) => `- [${f.severity}] ${f.file || ''}: ${f.issue}${f.fix ? ' — fix: ' + f.fix : ''}`)
    .join('\n')
  return `You are fixing review findings on the "${ws.id} — ${ws.title}" workstream of the
kartograph v0.17 roadmap. Repo: ${REPO}, branch feat/v0.17-roadmap.

Requirements context: ${REPO}/${HANDOVER} section "## ${ws.id}" + its Global constraints.

Findings to fix (ALL of them; minors were excluded):
${list}

${CONSTRAINTS}

Fix, re-run the tests covering what you changed plus npm test once, commit conventionally.
Return the structured report only (commits = your new commits, oldest first).`
}

const startIdx = a.startAt ? WORKSTREAMS.findIndex((w) => w.id === a.startAt) : 0
if (a.startAt && startIdx === -1) return { error: `unknown startAt: ${a.startAt}` }
const selected = WORKSTREAMS.filter((w, i) => i >= startIdx && (!a.only || a.only.includes(w.id)))

const completed = []
for (const ws of selected) {
  phase(ws.id)
  log(`${ws.id}: implementing — ${ws.title}`)
  let impl = await agent(implementerPrompt(ws), { label: `impl:${ws.id}`, phase: ws.id, schema: REPORT })
  if (!impl) return { completed, stoppedAt: ws.id, reason: 'implementer died/skipped' }
  if (impl.status !== 'done' || impl.commits.length === 0) {
    return { completed, stoppedAt: ws.id, reason: 'implementer blocked', detail: impl }
  }

  log(`${ws.id}: reviewing ${impl.commits.length} commit(s)`)
  let verdict = await agent(reviewerPrompt(ws, impl), { label: `review:${ws.id}`, phase: ws.id, schema: VERDICT })
  if (!verdict) return { completed, stoppedAt: ws.id, reason: 'reviewer died', detail: impl }

  if (!verdict.approved) {
    log(`${ws.id}: findings — dispatching fixer`)
    const fix = await agent(fixerPrompt(ws, verdict.findings), { label: `fix:${ws.id}`, phase: ws.id, schema: REPORT })
    if (!fix || fix.status !== 'done') {
      return { completed, stoppedAt: ws.id, reason: 'fixer blocked', findings: verdict.findings, detail: fix }
    }
    const allCommits = impl.commits.concat(fix.commits)
    verdict = await agent(
      reviewerPrompt(ws, { ...impl, commits: allCommits, testSummary: fix.testSummary, summary: impl.summary + ' + fixes: ' + fix.summary }),
      { label: `re-review:${ws.id}`, phase: ws.id, schema: VERDICT },
    )
    if (!verdict || !verdict.approved) {
      return { completed, stoppedAt: ws.id, reason: 'still not approved after one fix round', findings: verdict ? verdict.findings : null }
    }
    impl = { ...impl, commits: allCommits }
  }

  const minors = (verdict.findings || []).filter((f) => f.severity === 'minor')
  completed.push({ id: ws.id, commits: impl.commits, tests: impl.testSummary, minorFindings: minors })
  log(`${ws.id}: complete (${impl.commits.join(', ')})`)
}

return {
  completed,
  next: 'All selected workstreams done. WS12 (dogfood) and WS13 (release v0.17.0) run in the main session with the human — see the handover. Collect minorFindings above into the WS13 review.',
}
