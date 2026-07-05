import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { rewalkCandidates } from '../workflows/lib/rewalk.js';
import { isSlug } from '../workflows/lib/feature-read.js';
import { mapPath as defaultMapPath } from '../workflows/lib/paths.js';

const USAGE = 'usage: rewalk-candidates.js <projectRoot> <capability>';

// CLI: after (re)building <capability>, print the Accepted scenarios of its direct
// dependents — the behaviour that may now need re-walking. Prints the machine-
// readable JSON list first, then a one-line human summary on stderr. Read-only.
//   node scripts/rewalk-candidates.js <projectRoot> <capability>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || process.cwd();
  const capability = process.argv[3];
  if (!capability || !isSlug(capability)) {
    console.error(USAGE);
    process.exit(2);
  }
  let map;
  try { map = JSON.parse(await readFile(defaultMapPath(root), 'utf8')); }
  catch { map = {}; }
  const candidates = rewalkCandidates(map, capability);
  console.log(JSON.stringify(candidates, null, 2));
  if (candidates.length) {
    const caps = [...new Set(candidates.map((c) => c.capability))];
    console.error(
      `${candidates.length} accepted scenario(s) in ${caps.length} dependent capabilit${caps.length === 1 ? 'y' : 'ies'} (${caps.join(', ')}) may need re-walking after building '${capability}'.`,
    );
  } else {
    console.error(`No accepted scenarios in dependents of '${capability}' need re-walking.`);
  }
}
