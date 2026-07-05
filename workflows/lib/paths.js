import { join, basename } from 'node:path';

// Kartograph keeps its JSON state, surveys and decisions in a hidden
// `.kartograph/` subdirectory of the project root — never loose in the root.
// The map, layout, surveys (`.kartograph/surveys`) and decisions
// (`.kartograph/decisions`) all live under `.kartograph/`. Only `features/`
// stays top-level — it is the product's living spec, deliberately visible.
export const KARTO_DIR = '.kartograph';

// Absolute path to a project's map / layout, given the project root directory.
export const mapPath = (projectRoot) => join(projectRoot, KARTO_DIR, 'kartograph.json');
export const layoutPath = (projectRoot) => join(projectRoot, KARTO_DIR, 'kartograph.layout.json');

// Absolute path to a project's surveys / decisions directories.
export const surveysDir = (projectRoot) => join(projectRoot, KARTO_DIR, 'surveys');
export const decisionsDir = (projectRoot) => join(projectRoot, KARTO_DIR, 'decisions');

// True if a watch-event filename (which may be a path relative to the watched
// dir, e.g. `.kartograph/kartograph.layout.json`) refers to the layout file we
// write ourselves — used to suppress self-triggered live reloads.
export const isLayoutFile = (filename) =>
  typeof filename === 'string' && basename(filename) === 'kartograph.layout.json';
