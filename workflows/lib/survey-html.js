// Pure renderer: a validated Kartograph discovery survey -> a self-contained, readable
// HTML document. No filesystem, no dependencies, no LLM. The explore command writes the
// result next to the survey JSON as <date>-<slug>.discovery.html.
//
// Every text value is HTML-escaped: survey content is LLM-generated free text.

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function chip(text) {
  return `<span class="chip">${esc(text)}</span>`;
}

// Render conversationSummary prose: split on blank lines into paragraphs.
function paragraphs(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

// A findings section. `items` is the array; `rowFn` renders one item to an HTML string.
// Returns '' when the array is empty/absent so empty sections are omitted entirely.
function section(title, items, rowFn) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const rows = items.map(rowFn).join('\n');
  return `<section class="card">
  <h2>${esc(title)} <span class="count">${items.length}</span></h2>
  ${rows}
</section>`;
}

// A "named" item: name, slug chip, optional definition.
function namedRow(item) {
  const def = item.definition ? `<div class="def">${esc(item.definition)}</div>` : '';
  return `<div class="item"><div class="item-head"><strong>${esc(item.name)}</strong> ${chip(item.slug)}</div>${def}</div>`;
}

export function renderSurveyHtml(doc) {
  const d = doc || {};
  const f = d.findings || {};
  const sources = d.sources || {};
  const title = sources.description || d.slug || 'Survey';

  const issueLink = sources.issue
    ? `<a class="issue" href="${esc(sources.issue)}">${esc(sources.issue)}</a>`
    : '';

  const summary = d.conversationSummary
    ? `<section class="card">
  <h2>Conversation Summary</h2>
  ${paragraphs(d.conversationSummary)}
</section>`
    : '';

  const subjects = section('Subjects', f.subjects, namedRow);
  const events = section('Events', f.events, namedRow);
  const actors = section('Actors', f.actors, namedRow);

  const rules = section('Rules', f.rules, (r) => {
    const subj = r.subject ? ` <span class="muted">on ${chip(r.subject)}</span>` : '';
    return `<div class="item"><div class="item-head"><strong>${esc(r.name)}</strong>${subj}</div><div class="def">${esc(r.statement)}</div></div>`;
  });

  const affected = Array.isArray(f.affectedCapabilities) && f.affectedCapabilities.length
    ? `<section class="card">
  <h2>Affected Capabilities <span class="count">${f.affectedCapabilities.length}</span></h2>
  <div class="chips">${f.affectedCapabilities.map(chip).join(' ')}</div>
</section>`
    : '';

  const candidates = section('Capability Candidates', f.capabilityCandidates, (c) =>
    `<div class="item"><div class="item-head"><strong>${esc(c.name)}</strong> ${chip(c.slug)} <span class="muted">in ${chip(c.context)}</span></div><div class="def">${esc(c.definition)}</div></div>`);

  const dependencies = section('Dependencies', f.dependencies, (dep) => {
    const reason = dep.reason ? `<div class="def">${esc(dep.reason)}</div>` : '';
    const feats = Array.isArray(dep.features) && dep.features.length
      ? `<div class="muted">features: ${dep.features.map(chip).join(' ')}</div>` : '';
    return `<div class="item"><div class="item-head">${chip(dep.from)} <span class="arrow">→</span> ${chip(dep.to)}</div>${reason}${feats}</div>`;
  });

  const glossary = section('Glossary Additions', f.glossaryAdditions, (g) => {
    const aliases = Array.isArray(g.aliasesToAvoid) && g.aliasesToAvoid.length
      ? `<div class="muted">aliases to avoid: ${g.aliasesToAvoid.map((a) => esc(a)).join(', ')}</div>` : '';
    return `<div class="item"><div class="item-head"><strong>${esc(g.term)}</strong> <span class="badge">${esc(g.type)}</span></div><div class="def">${esc(g.definition)}</div>${aliases}</div>`;
  });

  const adrs = section('ADR Candidates', f.adrCandidates, (a) => {
    const ctx = Array.isArray(a.contexts) && a.contexts.length
      ? `<div class="muted">contexts: ${a.contexts.map(chip).join(' ')}</div>` : '';
    const caps = Array.isArray(a.capabilities) && a.capabilities.length
      ? `<div class="muted">capabilities: ${a.capabilities.map(chip).join(' ')}</div>` : '';
    return `<div class="item"><div class="item-head"><strong>${esc(a.title)}</strong></div><div class="def">${esc(a.rationale)}</div>${ctx}${caps}</div>`;
  });

  const placement = section('Placement', f.placement, (p) => {
    const ctx = p.context ? ` <span class="muted">in ${chip(p.context)}</span>` : '';
    return `<div class="item"><div class="item-head"><span class="badge">${esc(p.kind)}</span> ${chip(p.slug)}${ctx}</div></div>`;
  });

  const questions = section('Open Questions', f.openQuestions, (q) => {
    const ctx = q.context ? ` <span class="muted">(${chip(q.context)})</span>` : '';
    return `<div class="item"><div class="item-head">${esc(q.question)}${ctx}</div></div>`;
  });

  const body = [
    summary, subjects, events, actors, rules, affected, candidates,
    dependencies, glossary, adrs, placement, questions,
  ].filter(Boolean).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Survey · ${esc(title)}</title>
<style>
:root { --bg: #1a1d21; --panel: #23272e; --ink: #e6e6e6; --muted: #9aa0a6; --accent: #7aa2f7; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.6 -apple-system, system-ui, sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 32px 20px 64px; }
header { margin-bottom: 24px; }
header h1 { font-size: 22px; margin: 0 0 6px; }
.meta { color: var(--muted); font-size: 13px; display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; }
.issue { color: var(--accent); text-decoration: none; }
.issue:hover { text-decoration: underline; }
.card { background: var(--panel); border-radius: 10px; padding: 16px 18px; margin: 0 0 16px; }
.card h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.03em;
  color: var(--muted); margin: 0 0 12px; display: flex; align-items: baseline; gap: 8px; }
.card p { margin: 0 0 10px; }
.card p:last-child { margin-bottom: 0; }
.count { color: var(--ink); background: #ffffff14; border-radius: 10px;
  font-size: 11px; padding: 1px 7px; font-weight: 600; }
.item { padding: 8px 0; border-top: 1px solid #ffffff0f; }
.item:first-of-type { border-top: none; padding-top: 0; }
.item-head { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.def { color: var(--ink); opacity: 0.85; margin-top: 3px; font-size: 14px; }
.muted { color: var(--muted); font-size: 13px; }
.chip { display: inline-block; background: #ffffff14; color: var(--ink); border-radius: 6px;
  padding: 1px 7px; font-size: 12px; font-family: ui-monospace, SFMono-Regular, monospace; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.badge { display: inline-block; background: var(--accent); color: #0b0f17; border-radius: 6px;
  padding: 1px 7px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
.arrow { color: var(--muted); }
</style>
</head>
<body>
<main>
<header>
  <h1>${esc(title)}</h1>
  <div class="meta">
    <span>${esc(d.date)}</span>
    <span>${chip(d.slug)}</span>
    ${issueLink}
  </div>
</header>
${body}
</main>
</body>
</html>
`;
}
