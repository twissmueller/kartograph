import { basename, normalize, isAbsolute } from 'node:path';

// A picked project directory defines the project: root = the directory, name =
// its basename. Kartograph's map is found at `<root>/.kartograph/kartograph.json`.
export function resolveProjectFromDir(dirPath) {
  return { root: dirPath, name: basename(dirPath) };
}

// The desktop app can be launched with a project directory to open on start
// (e.g. `/karto-show` runs `npm start -- /path/to/project`, forwarded to
// `electron . /path`). Given process.argv, return the first non-flag argument
// that names such a directory — skipping the Electron binary (argv[0]) and the
// app-path marker '.'. Returns null when no candidate argument is present.
export function firstProjectArg(argv) {
  if (!Array.isArray(argv)) return null;
  for (const a of argv.slice(1)) {
    if (typeof a !== 'string' || !a) continue;
    if (a === '.' || a.startsWith('-')) continue;
    return a;
  }
  return null;
}

// Guard for readRaw: a project-relative path that stays inside the root.
// Pure ESM (no require): reject absolute paths and any '..' segment.
export function isSafeRelPath(rel) {
  if (typeof rel !== 'string' || !rel) return false;
  if (isAbsolute(rel)) return false;
  const parts = normalize(rel).split(/[\\/]/);
  return !parts.includes('..');
}
