import { join, basename } from 'node:path';

// Kartograph keeps its JSON state in a hidden `.kartograph/` subdirectory of the
// project root — never loose in the root. Surveys, decisions and features keep
// their own existing top-level locations (`kartograph/surveys`,
// `kartograph/decisions`, `features/`); only the map and the viewer layout live
// under `.kartograph/`.
export const KARTO_DIR = '.kartograph';

// Absolute path to a project's map / layout, given the project root directory.
export const mapPath = (projectRoot) => join(projectRoot, KARTO_DIR, 'kartograph.json');
export const layoutPath = (projectRoot) => join(projectRoot, KARTO_DIR, 'kartograph.layout.json');

// True if a watch-event filename (which may be a path relative to the watched
// dir, e.g. `.kartograph/kartograph.layout.json`) refers to the layout file we
// write ourselves — used to suppress self-triggered live reloads.
export const isLayoutFile = (filename) =>
  typeof filename === 'string' && basename(filename) === 'kartograph.layout.json';
