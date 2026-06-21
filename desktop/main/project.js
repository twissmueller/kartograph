import { dirname, basename, normalize, isAbsolute } from 'node:path';

// A picked kartograph.json defines the project: root = its folder, name = folder name.
export function resolveProjectFromPicked(filePath) {
  const root = dirname(filePath);
  return { root, name: basename(root) };
}

// Guard for readRaw: a project-relative path that stays inside the root.
// Pure ESM (no require): reject absolute paths and any '..' segment.
export function isSafeRelPath(rel) {
  if (typeof rel !== 'string' || !rel) return false;
  if (isAbsolute(rel)) return false;
  const parts = normalize(rel).split(/[\\/]/);
  return !parts.includes('..');
}
