// Pure renderer: a validated Kartograph discovery survey -> a readable HTML document.
// No filesystem, no dependencies, no LLM. The explore command writes the result next to
// the survey JSON as <date>-<slug>.discovery.html.
//
// Style: a light, compact "tech doc" (GitHub-README feel) — names in the foreground,
// slugs as faint inline labels, sections separated by a thin rule rather than boxes.
//
// Every text value is HTML-escaped: survey content is LLM-generated free text.

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// A faint, un-boxed inline slug label.
function slug(text) {
  return `<span class="slug">${esc(text)}</span>`;
}

// A small category label (glossary type, placement kind) — not a slug.
function label(text) {
  return `<span class="label">${esc(text)}</span>`;
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

// A findings section. `items` is the array; `rowFn` renders one item to an <li>'s inner
// HTML. Returns '' when the array is empty/absent so empty sections are omitted entirely.
function section(title, items, rowFn) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const rows = items.map((it) => `<li>${rowFn(it)}</li>`).join('\n');
  return `<section>
  <h2>${esc(title)} <span class="count">(${items.length})</span></h2>
  <ul>
${rows}
  </ul>
</section>`;
}

// "name slug — definition" for subjects/events/actors.
function namedRow(item) {
  const def = item.definition ? ` <span class="dash">—</span> ${esc(item.definition)}` : '';
  return `<span class="name">${esc(item.name)}</span> ${slug(item.slug)}${def}`;
}

export function renderSurveyHtml(doc) {
  const d = doc || {};
  const f = d.findings || {};
  const sources = d.sources || {};
  const title = sources.description || d.slug || 'Survey';

  const metaBits = [esc(d.date), slug(d.slug)];
  if (sources.issue) metaBits.push(`<a href="${esc(sources.issue)}">${esc(sources.issue)}</a>`);

  const summary = d.conversationSummary
    ? `<section class="summary">
  <h2>Conversation Summary</h2>
  ${paragraphs(d.conversationSummary)}
</section>`
    : '';

  const subjects = section('Subjects', f.subjects, namedRow);
  const events = section('Events', f.events, namedRow);
  const actors = section('Actors', f.actors, namedRow);

  const rules = section('Rules', f.rules, (r) => {
    const subj = r.subject ? ` ${slug(r.subject)}` : '';
    return `<span class="name">${esc(r.name)}</span>${subj}<div class="sub">${esc(r.statement)}</div>`;
  });

  const affected = Array.isArray(f.affectedCapabilities) && f.affectedCapabilities.length
    ? `<section>
  <h2>Affected Capabilities <span class="count">(${f.affectedCapabilities.length})</span></h2>
  <p class="inline-slugs">${f.affectedCapabilities.map(slug).join(', ')}</p>
</section>`
    : '';

  const candidates = section('Capability Candidates', f.capabilityCandidates, (c) =>
    `<span class="name">${esc(c.name)}</span> ${slug(c.slug)} <span class="in">in</span> ${slug(c.context)}<div class="sub">${esc(c.definition)}</div>`);

  const dependencies = section('Dependencies', f.dependencies, (dep) => {
    const reason = dep.reason ? `<div class="sub">${esc(dep.reason)}</div>` : '';
    const feats = Array.isArray(dep.features) && dep.features.length
      ? `<div class="meta-line">features: ${dep.features.map(slug).join(', ')}</div>` : '';
    return `<span class="name">${slug(dep.from)} <span class="arrow">→</span> ${slug(dep.to)}</span>${reason}${feats}`;
  });

  const glossary = section('Glossary Additions', f.glossaryAdditions, (g) => {
    const aliases = Array.isArray(g.aliasesToAvoid) && g.aliasesToAvoid.length
      ? `<div class="meta-line">aliases to avoid: ${g.aliasesToAvoid.map((a) => esc(a)).join(', ')}</div>` : '';
    return `<span class="name">${esc(g.term)}</span> ${label(g.type)}<div class="sub">${esc(g.definition)}</div>${aliases}`;
  });

  const adrs = section('ADR Candidates', f.adrCandidates, (a) => {
    const ctx = Array.isArray(a.contexts) && a.contexts.length
      ? `<div class="meta-line">contexts: ${a.contexts.map(slug).join(', ')}</div>` : '';
    const caps = Array.isArray(a.capabilities) && a.capabilities.length
      ? `<div class="meta-line">capabilities: ${a.capabilities.map(slug).join(', ')}</div>` : '';
    return `<span class="name">${esc(a.title)}</span><div class="sub">${esc(a.rationale)}</div>${ctx}${caps}`;
  });

  const placement = section('Placement', f.placement, (p) => {
    const ctx = p.context ? ` <span class="in">in</span> ${slug(p.context)}` : '';
    return `${label(p.kind)} ${slug(p.slug)}${ctx}`;
  });

  const questions = section('Open Questions', f.openQuestions, (q) => {
    const ctx = q.context ? ` <span class="meta-line">(${esc(q.context)})</span>` : '';
    return `${esc(q.question)}${ctx}`;
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
:root {
  --ink: #1f2328; --muted: #57606a; --faint: #8c959f; --line: #d8dee4;
  --accent: #0969da; --bg: #ffffff; --label-bg: #eef1f4;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; }
main { max-width: 760px; margin: 0 auto; padding: 44px 24px 96px; }
h1 { font-size: 24px; font-weight: 600; margin: 0 0 5px; letter-spacing: -0.01em; }
.meta { color: var(--muted); font-size: 13px; margin: 0 0 32px;
  display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
.meta a { color: var(--accent); text-decoration: none; }
.meta a:hover { text-decoration: underline; }
section { margin: 0 0 28px; }
h2 { font-size: 15px; font-weight: 600; color: var(--ink); margin: 0 0 10px;
  padding-bottom: 6px; border-bottom: 1px solid var(--line); }
h2 .count { color: var(--faint); font-weight: 400; }
.summary p { margin: 0 0 10px; }
.summary p:last-child { margin: 0; }
ul { list-style: none; margin: 0; padding: 0; }
li { position: relative; padding: 4px 0 4px 18px; }
li::before { content: "·"; position: absolute; left: 4px; color: var(--faint);
  font-weight: 700; }
.name { font-weight: 600; }
.slug { color: var(--faint); font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px; }
.dash, .in, .arrow { color: var(--faint); }
.in { font-style: normal; }
.sub { color: var(--muted); margin-top: 1px; }
.meta-line { color: var(--faint); font-size: 12.5px; margin-top: 1px; }
.inline-slugs { margin: 0; }
.label { display: inline-block; background: var(--label-bg); color: var(--muted);
  border-radius: 4px; padding: 0 6px; font-size: 11px; font-weight: 500;
  text-transform: uppercase; letter-spacing: 0.03em; vertical-align: 1px; }
</style>
</head>
<body>
<main>
<header>
  <h1>${esc(title)}</h1>
  <div class="meta">${metaBits.join('<span class="sep">·</span>')}</div>
</header>
${body}
</main>
</body>
</html>
`;
}
