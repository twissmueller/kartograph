import { watch } from 'node:fs';
import { stat } from 'node:fs/promises';
import { mapPath, isLayoutFile } from '../../workflows/lib/paths.js';

// Watch a project tree and call onChange() (debounced) when a relevant file changes.
// Mirrors server/serve.js: ignore our own kartograph.layout.json writes; only react to
// map/feature/decision/json changes; fall back to watching the map file if recursive
// watch is unsupported on this platform.
//
// Backstop: fs.watch — especially recursive on macOS — can silently stop delivering
// events over a long session or across sleep/wake, so an external write (e.g. a
// /karto-build in another process) would never reach the open app until it was
// restarted. We therefore also poll the map file's mtime; a change re-triggers the
// same debounced onChange, guaranteeing the live view catches up within `pollMs`
// even when the OS watcher has gone deaf.
export function watchProject(root, onChange, { pollMs = 2000 } = {}) {
  let timer = null;
  const notify = () => { clearTimeout(timer); timer = setTimeout(onChange, 100); };
  const handle = (_event, filename) => {
    if (isLayoutFile(filename)) return;
    if (!filename) return notify();
    if (/kartograph|\.feature$|decisions|\.json$/.test(filename)) notify();
  };
  let watcher = null;
  try {
    watcher = watch(root, { recursive: true }, handle);
  } catch {
    try { watcher = watch(mapPath(root), notify); } catch { watcher = null; }
  }

  // mtime-poll backstop, scoped to the map (the critical state behind the views).
  let lastMtime = null;
  stat(mapPath(root)).then((s) => { lastMtime = s.mtimeMs; }).catch(() => {});
  const poll = setInterval(async () => {
    try {
      const { mtimeMs } = await stat(mapPath(root));
      if (lastMtime !== null && mtimeMs !== lastMtime) notify();
      lastMtime = mtimeMs;
    } catch { /* map transiently absent (mid-rename) or missing; ignore */ }
  }, pollMs);
  if (typeof poll.unref === 'function') poll.unref(); // don't keep the process alive for the poll alone

  return { close: () => { clearTimeout(timer); clearInterval(poll); watcher?.close(); } };
}
