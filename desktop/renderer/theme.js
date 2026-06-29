// Light/dark theme: attribute on <html>, persisted in localStorage. A plain
// attribute toggle re-resolves every CSS var() (no remount needed in vanilla DOM).
const KEY = 'karto.theme';

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function initTheme() {
  let saved = 'light';
  try { const v = localStorage.getItem(KEY); if (v === 'dark' || v === 'light') saved = v; } catch { /* ignore */ }
  document.documentElement.setAttribute('data-theme', saved);
  return saved;
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  return next;
}
