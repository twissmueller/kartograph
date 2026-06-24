import { basename, normalize, isAbsolute } from 'node:path';

// A picked project directory defines the project: root = the directory, name =
// its basename. Kartograph's map is found at `<root>/.kartograph/kartograph.json`.
export function resolveProjectFromDir(dirPath) {
  return { root: dirPath, name: basename(dirPath) };
}

// Guard for readRaw: a project-relative path that stays inside the root.
// Pure ESM (no require): reject absolute paths and any '..' segment.
export function isSafeRelPath(rel) {
  if (typeof rel !== 'string' || !rel) return false;
  if (isAbsolute(rel)) return false;
  const parts = normalize(rel).split(/[\\/]/);
  return !parts.includes('..');
}
