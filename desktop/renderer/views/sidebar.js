export function renderSidebar(container, tab) {
  const { map, knowledge } = tab.data;
  container.innerHTML = '';
  container.appendChild(maturityPanel(map));
  container.appendChild(glossaryPanel(knowledge));
  container.appendChild(adrPanel(map));
  container.appendChild(questionsPanel(map));
}

function panel(title, bodyHtml) {
  const sec = document.createElement('section');
  sec.className = 'panel';
  sec.innerHTML = `<h2>${esc(title)}</h2><div class="panel-body">${bodyHtml}</div>`;
  return sec;
}

function maturityPanel(map) {
  const order = ['vision', 'sketched', 'building', 'usable', 'stable'];
  const swatch = {
    vision: 'var(--border-strong)', sketched: 'var(--blue-300)', building: 'var(--blue-500)',
    usable: 'var(--happy-fg)', stable: 'var(--acc-dot)',
  };
  const counts = Object.fromEntries(order.map((k) => [k, 0]));
  for (const c of Object.values(map.capabilities || {})) {
    const m = (c.derived && c.derived.maturity) || 'vision';
    if (m in counts) counts[m]++;
  }
  const rows = order.map((k) =>
    `<div class="mat-row"><span><span class="mat-swatch" style="background:${swatch[k]}"></span>${k}</span><b>${counts[k]}</b></div>`
  ).join('');
  return panel('Maturity', rows);
}

// Terms come from the knowledge bundle on disk (one OKF concept per term), not from the
// map. `status` and `trust` are derived on read — a term Kartograph wrote but no human has
// confirmed shows as draft/unverified, which is the point of surfacing them here.
function glossaryPanel(knowledge) {
  const terms = (knowledge || []).filter((t) => t.status !== 'deprecated');
  if (!terms.length) return panel('Glossary', '<p class="muted">No terms.</p>');
  const flag = (t) => {
    const bits = [];
    if (t.status === 'draft') bits.push('draft');
    if (t.trust === 'human-reviewed') bits.push('reviewed');
    return bits.length ? ` <span class="muted">(${esc(bits.join(', '))})</span>` : '';
  };
  const rows = terms
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((t) => `<tr><td>${esc(t.title)}${flag(t)}</td><td>${esc(t.description)}</td></tr>`)
    .join('');
  return panel(`Glossary (${terms.length})`, `<table>${rows}</table>`);
}

function adrPanel(map) {
  const adrs = Object.values(map.adrs || {});
  if (!adrs.length) return panel('Decisions (ADR)', '<p class="muted">No decisions.</p>');
  const rows = adrs.map((a) => `<tr><td>${esc(a.id || '')}</td><td>${esc(a.title || '')}</td><td>${esc(a.status || '')}</td></tr>`).join('');
  return panel('Decisions (ADR)', `<table>${rows}</table>`);
}

function questionsPanel(map) {
  const q = map.openQuestions || [];
  const flat = Array.isArray(q) ? q : Object.values(q).flat();
  if (!flat.length) return panel('Open Questions', '<p class="muted">No open questions.</p>');
  const items = flat.map((x) => `<li>${esc(typeof x === 'string' ? x : x.question || '')}</li>`).join('');
  return panel(`Open Questions (${flat.length})`, `<ul>${items}</ul>`);
}

function esc(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
