const COLUMNS = [
  { key: 'open', label: 'Open' },
  { key: 'wip', label: 'WIP' },
  { key: 'test', label: 'Test' },
  { key: 'done', label: 'Done' },
];

export function renderBoard(container, tab) {
  const { scenarios } = tab.data.board;
  container.innerHTML = '<div class="board"></div>';
  const board = container.querySelector('.board');

  for (const col of COLUMNS) {
    const colEl = document.createElement('div');
    colEl.className = 'board-col';
    colEl.dataset.progress = col.key;
    colEl.innerHTML = `<h3>${col.label}</h3>`;
    colEl.ondragover = (e) => { e.preventDefault(); colEl.classList.add('drop'); };
    colEl.ondragleave = () => colEl.classList.remove('drop');
    colEl.ondrop = (e) => { e.preventDefault(); colEl.classList.remove('drop'); onDrop(e, col.key, tab); };

    for (const s of scenarios.filter((x) => x.progress === col.key)) {
      const card = document.createElement('div');
      card.className = `card class-${s.class || 'none'}`;
      card.draggable = true;
      card.innerHTML = `<div class="card-title">${esc(s.name)}</div>
        <div class="card-meta">${esc(s.capabilityName)} · ${esc(s.feature)}</div>`;
      card.ondragstart = (e) => e.dataTransfer.setData('text/plain', JSON.stringify({
        context: s.context, capability: s.capability, feature: s.feature, scenario: s.name,
      }));
      colEl.appendChild(card);
    }
    board.appendChild(colEl);
  }
}

async function onDrop(e, progress, tab) {
  let p;
  try { p = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
  try {
    await window.karto.setBoardProgress({ root: tab.data.root, ...p, progress });
    tab.data.board = await window.karto.readBoard(tab.data.root);
    renderBoard(document.querySelector('.project-main'), tab);
  } catch (err) {
    alert('Could not update scenario: ' + (err.message || err));
  }
}

function esc(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
