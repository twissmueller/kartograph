import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function loadSession(file) {
  try {
    const j = JSON.parse(await readFile(file, 'utf8'));
    return {
      openRoots: Array.isArray(j.openRoots) ? j.openRoots : [],
      recent: Array.isArray(j.recent) ? j.recent : [],
      activeRoot: typeof j.activeRoot === 'string' ? j.activeRoot : null,
      tabs: (j.tabs && typeof j.tabs === 'object') ? j.tabs : {},
    };
  } catch { return { openRoots: [], recent: [], activeRoot: null, tabs: {} }; }
}

export async function saveSession(file, state) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({
    openRoots: state.openRoots || [],
    recent: state.recent || [],
    activeRoot: state.activeRoot ?? null,
    tabs: state.tabs || {},
  }, null, 2));
}

// Pure: move root to the front, dedup, keep at most 10.
export function addRecent(recent, root) {
  return [root, ...(recent || []).filter((r) => r !== root)].slice(0, 10);
}
