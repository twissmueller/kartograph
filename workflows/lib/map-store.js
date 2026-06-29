import { readFile, writeFile, rename } from 'node:fs/promises';
import { mapPath } from './paths.js';

// Read and parse a project's kartograph.json. Throws if missing/garbled — callers that
// must tolerate that (board-data, feature-read) read it themselves.
export async function readMap(projectRoot) {
  return JSON.parse(await readFile(mapPath(projectRoot), 'utf8'));
}

// Write the map back atomically (temp file + rename) so it is never half-written —
// the same discipline reconcile.js uses for the CLI write.
export async function writeMap(projectRoot, map) {
  const p = mapPath(projectRoot);
  const tmp = p + '.store.tmp';
  await writeFile(tmp, JSON.stringify(map, null, 2) + '\n');
  await rename(tmp, p);
}
