// A compact icon-only copy button for an item's locator ID. The slug itself is
// not shown (it ate too much row width) — it lives on hover via `title`, is
// copied to the clipboard on click (via window.karto.copy), and the icon flips
// to a ✓ briefly to confirm. Pointer/click handlers stopPropagation so it never
// starts a map drag or toggles a tree row.
const COPY_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="12" height="12" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="2"/></svg>';
const CHECK_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function idChip(idText) {
  const el = document.createElement('span');
  el.className = 'idchip';
  el.title = 'Copy ' + idText;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', 'Copy ' + idText);
  el.innerHTML = COPY_SVG;
  el.onpointerdown = (e) => e.stopPropagation();
  el.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await window.karto.copy(idText);
      el.classList.add('copied');
      el.innerHTML = CHECK_SVG;
      clearTimeout(el._copiedTimer);
      el._copiedTimer = setTimeout(() => { el.classList.remove('copied'); el.innerHTML = COPY_SVG; }, 1000);
    } catch { /* best-effort copy */ }
  };
  return el;
}
