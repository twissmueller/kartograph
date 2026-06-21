import { watch } from 'node:fs';
import { join } from 'node:path';

// Watch a project tree and call onChange() (debounced) when a relevant file changes.
// Mirrors server/serve.js: ignore our own kartograph.layout.json writes; only react to
// map/feature/decision/json changes; fall back to watching kartograph.json if recursive
// watch is unsupported on this platform.
export function watchProject(root, onChange) {
  let timer = null;
  const notify = () => { clearTimeout(timer); timer = setTimeout(onChange, 100); };
  const handle = (_event, filename) => {
    if (filename === 'kartograph.layout.json') return;
    if (!filename) return notify();
    if (/kartograph|\.feature$|decisions|\.json$/.test(filename)) notify();
  };
  let watcher = null;
  try {
    watcher = watch(root, { recursive: true }, handle);
  } catch {
    try { watcher = watch(join(root, 'kartograph.json'), notify); } catch { watcher = null; }
  }
  return { close: () => { clearTimeout(timer); watcher?.close(); } };
}
