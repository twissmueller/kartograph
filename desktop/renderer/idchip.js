// A subtle, monospace chip showing an item's locator ID. Clicking copies the full
// ID to the clipboard (via window.karto.copy) and briefly flips to a copied state.
// Pointer/click handlers stopPropagation so it never starts a map drag or toggles a row.
const COPY_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="12" height="12" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="2"/></svg>';

export function idChip(idText) {
  const el = document.createElement('span');
  el.className = 'idchip';
  el.title = 'Click to copy ID';
  const label = document.createElement('span');
  label.textContent = idText;
  el.innerHTML = COPY_SVG;
  el.appendChild(label);
  el.onpointerdown = (e) => e.stopPropagation();
  el.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await window.karto.copy(idText);
      el.classList.add('copied');
      setTimeout(() => el.classList.remove('copied'), 1000);
    } catch { /* best-effort copy */ }
  };
  return el;
}
