// Render a Kartograph discovery survey to a readable, self-contained HTML file written
// next to the JSON. Called by /karto-explore after the survey JSON is saved.
//
// CLI: node scripts/survey-to-html.js <discovery.json>

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderSurveyHtml } from '../workflows/lib/survey-html.js';

// Read the discovery JSON, render the HTML, write the sibling .discovery.html.
// Returns the path of the HTML file written.
export async function writeSurveyHtml(jsonPath) {
  const doc = JSON.parse(await readFile(jsonPath, 'utf8'));
  const htmlPath = jsonPath.replace(/\.discovery\.json$/, '.discovery.html');
  await writeFile(htmlPath, renderSurveyHtml(doc), 'utf8');
  return htmlPath;
}

// CLI: node scripts/survey-to-html.js <file>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('usage: survey-to-html.js <discovery.json>'); process.exit(2); }
  try {
    const htmlPath = await writeSurveyHtml(file);
    console.log(`OK: ${htmlPath}`);
    process.exit(0);
  } catch (err) {
    console.error(`FAILED: ${file}`);
    console.error('  - ' + err.message);
    process.exit(1);
  }
}
