export function renderSidebar(container, tab) {
  const { map } = tab.data;
  container.innerHTML = '';
  container.appendChild(maturityPanel(map));
  container.appendChild(glossaryPanel(map));
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
  const counts = Object.fromEntries(order.map((k) => [k, 0]));
  for (const c of Object.values(map.capabilities || {})) {
    const m = (c.derived && c.derived.maturity) || 'vision';
    if (m in counts) counts[m]++;
  }
  const rows = order.map((k) => `<div class="mat-row"><span>${k}</span><b>${counts[k]}</b></div>`).join('');
  return panel('Maturity', rows);
}

function glossaryPanel(map) {
  const terms = Object.values(map.glossary || {});
  if (!terms.length) return panel('Glossary', '<p class="muted">No terms.</p>');
  const rows = terms.map((t) => `<tr><td>${esc(t.term || '')}</td><td>${esc(t.definition || '')}</td></tr>`).join('');
  return panel('Glossary', `<table>${rows}</table>`);
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
