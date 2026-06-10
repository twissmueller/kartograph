// DOM wiring for the scenario board. Pure grouping lives in board.js; this module fetches
// /board, renders four columns of draggable cards with a capability filter, and writes a
// card's new progress back via POST /board. No unit test (DOM) — verified by running the viewer.
import { BOARD_COLUMNS, boardColumns } from '/lib/board.js';

const COL_LABEL = { open: 'Open', wip: 'In Progress', test: 'Test', done: 'Done' };

let container = null;
let getContextColor = () => ({});
let scenarios = [];
const capFilter = new Set();   // empty = show all
let dragging = null;           // the scenario object being dragged
let lastDragEnd = 0;           // timestamp of the last dragend, to suppress the click it may emit
let selectedKey = null;        // the clicked card, highlighted; stays put across re-renders

// Stable identity for a scenario card: capability + feature file + scenario name.
function cardKey(o) {
  return `${o.capability}::${o.feature}::${o.scenario ?? o.name}`;
}

export function initBoard(opts) {
  container = opts.container;
  getContextColor = opts.getContextColor || getContextColor;
}

export async function loadBoard() {
  try {
    const res = await fetch('/board', { cache: 'no-store' });
    scenarios = res.ok ? (await res.json()).scenarios || [] : [];
  } catch { scenarios = []; }
  render();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function visibleScenarios() {
  return capFilter.size ? scenarios.filter((s) => capFilter.has(s.capability)) : scenarios;
}

function render() {
  if (!container) return;
  const colors = getContextColor() || {};
  const caps = [...new Map(scenarios.map((s) => [s.capability, s.capabilityName])).entries()];
  const cols = boardColumns(visibleScenarios());

  const chips = caps.map(([slug, name]) =>
    `<button type="button" class="board-chip${capFilter.has(slug) ? ' on' : ''}" data-cap="${esc(slug)}">${esc(name)}</button>`).join('');

  const card = (s) => {
    const color = colors[s.context] || '#666666';
    const cls = s.class ? `<span class="bc-cls">${esc(s.class)}</span>` : '';
    const key = cardKey(s);
    return `<div class="board-card${selectedKey === key ? ' selected' : ''}" draggable="true" style="border-left-color:${color}"
      data-context="${esc(s.context)}" data-cap="${esc(s.capability)}"
      data-feature="${esc(s.feature)}" data-scn="${esc(s.name)}" data-key="${esc(key)}">
      <div class="bc-name">${esc(s.name)}</div>
      <div class="bc-meta"><span class="bc-cap">${esc(s.capabilityName)}</span>${cls}</div>
    </div>`;
  };

  const colHtml = BOARD_COLUMNS.map((key) => {
    // Within a column, group cards by their feature (capability + feature file), keeping
    // first-seen order. The heading is the Feature: title (falls back to the filename).
    const groups = new Map();
    for (const s of cols[key]) {
      const gkey = `${s.capability}::${s.feature}`;
      if (!groups.has(gkey)) groups.set(gkey, { label: s.featureName || s.feature, cards: [] });
      groups.get(gkey).cards.push(s);
    }
    const body = cols[key].length
      ? [...groups.values()].map((g) =>
          `<div class="board-group"><div class="board-group-h">${esc(g.label)}</div>${g.cards.map(card).join('')}</div>`).join('')
      : '<div class="board-empty">—</div>';
    return `<div class="board-col" data-col="${key}">
      <div class="board-col-head"><span>${COL_LABEL[key]}</span><span>${cols[key].length}</span></div>
      <div class="board-col-body">${body}</div>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div class="board-filter"><span class="flbl">Capability:</span>${chips || '<span class="board-empty">no capabilities</span>'}</div>
    <div class="board-cols">${colHtml}</div>`;
  wireEvents();
}

function wireEvents() {
  for (const chip of container.querySelectorAll('.board-chip')) {
    chip.addEventListener('click', () => {
      const cap = chip.dataset.cap;
      if (capFilter.has(cap)) capFilter.delete(cap); else capFilter.add(cap);
      render();
    });
  }
  for (const card of container.querySelectorAll('.board-card')) {
    card.addEventListener('dragstart', () => {
      dragging = {
        context: card.dataset.context, capability: card.dataset.cap,
        feature: card.dataset.feature, scenario: card.dataset.scn,
      };
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); dragging = null; lastDragEnd = Date.now(); });
    card.addEventListener('click', () => {
      if (Date.now() - lastDragEnd < 200) return; // ignore the click an aborted drag can emit
      selectedKey = card.dataset.key;            // highlight this card; stay on the board
      for (const c of container.querySelectorAll('.board-card')) c.classList.toggle('selected', c === card);
    });
  }
  for (const col of container.querySelectorAll('.board-col')) {
    col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.classList.add('drop'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop'));
    col.addEventListener('drop', (ev) => {
      ev.preventDefault();
      col.classList.remove('drop');
      if (dragging) moveScenario(dragging, col.dataset.col);
    });
  }
}

async function moveScenario(card, progress) {
  const s = scenarios.find((x) =>
    x.capability === card.capability && x.feature === card.feature && x.name === card.scenario);
  if (!s || s.progress === progress) return;
  const prev = s.progress;
  s.progress = progress;     // optimistic
  render();
  try {
    const res = await fetch('/board', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...card, progress }),
    });
    if (!res.ok) throw new Error(await res.text());
  } catch {
    s.progress = prev;       // roll back
    render();
  }
}
