// A subtle, monospace chip showing an item's locator ID. Clicking it copies the full
// ID to the clipboard (via window.karto.copy) and briefly flashes. Its pointer/click
// handlers stopPropagation so clicking it never starts a map drag or toggles a tree row.
export function idChip(idText) {
  const el = document.createElement('span');
  el.className = 'idchip';
  el.textContent = idText;
  el.title = 'Click to copy ID';
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
