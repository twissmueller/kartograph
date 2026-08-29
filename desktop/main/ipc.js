import { ipcMain, dialog, BrowserWindow, app, clipboard } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { buildBoard } from '../../workflows/lib/board-data.js';
import { readCapabilityFeatures, listFeatureTree, isSlug, isFeatureName } from '../../workflows/lib/feature-read.js';
import { parseFeature } from '../../workflows/lib/gherkin.js';
import { setScenarioState, STATES } from '../../workflows/lib/tracking.js';
import { readMap, writeMap } from '../../workflows/lib/map-store.js';
import { scenarioId } from '../../workflows/lib/ids.js';
import { resolveProjectFromDir, isSafeRelPath } from './project.js';
import { mapPath, layoutPath } from '../../workflows/lib/paths.js';
import { readBundle, buildIndex } from '../../workflows/lib/knowledge.js';
import { loadSession, saveSession, addRecent } from './session.js';
import { watchProject } from './watcher.js';

const watchers = new Map(); // root -> { close }

const sessionFile = () => join(app.getPath('userData'), 'session.json');

const RAW_EXT = new Set(['.feature', '.json', '.md']);

export function registerIpc(initialProject = null) {
  // A project passed on the command line (see main.js) to open as the active tab on
  // launch, in addition to the restored session. Null when none was given.
  ipcMain.handle('initial-project', () => initialProject);

  ipcMain.handle('open-project', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const r = await dialog.showOpenDialog(win, {
      title: 'Open project folder',
      message: 'Choose a project folder containing a .kartograph map',
      properties: ['openDirectory'],
    });
    if (r.canceled || !r.filePaths.length) return null;
    return resolveProjectFromDir(r.filePaths[0]);
  });

  ipcMain.handle('read-map', async (_e, root) => {
    const map = JSON.parse(await readFile(mapPath(root), 'utf8'));
    let layout = {};
    try { layout = JSON.parse(await readFile(layoutPath(root), 'utf8')); }
    catch { layout = {}; }
    return { map, layout };
  });

  // The glossary lives on disk in the OKF bundle, never in the map — so the sidebar reads
  // it from there. Returns the derived index (status and trust are computed, not stored).
  ipcMain.handle('read-knowledge', async (_e, root, bundle) => {
    const { concepts } = await readBundle(root, bundle || undefined);
    return [...buildIndex(concepts).values()];
  });

  ipcMain.handle('read-board', (_e, root) => buildBoard(root));
  ipcMain.handle('list-features', (_e, root) => listFeatureTree(root));
  ipcMain.handle('read-features', (_e, root, context, slug) => readCapabilityFeatures(root, context, slug));

  ipcMain.handle('read-raw', async (_e, root, relPath) => {
    if (!isSafeRelPath(relPath) || !RAW_EXT.has(extname(relPath))) throw new Error('invalid path');
    return { text: await readFile(join(root, relPath), 'utf8') };
  });

  ipcMain.handle('set-board-progress', async (_e, p) => {
    if (!isSlug(p.context) || !isSlug(p.capability) || !isFeatureName(p.feature)
        || typeof p.scenario !== 'string' || !p.scenario || !STATES.includes(p.progress)) {
      throw new Error('invalid request');
    }
    // Confirm the scenario exists, then record its state in kartograph.json (not the .feature).
    const file = join(p.root, 'features', p.context, p.capability, p.feature);
    const src = await readFile(file, 'utf8');
    if (!parseFeature(src).scenarios.some((s) => s.name === p.scenario)) throw new Error('scenario not found');
    const map = await readMap(p.root);
    await writeMap(p.root, setScenarioState(map, scenarioId(p.capability, p.feature, p.scenario), p.progress));
    return { ok: true };
  });

  ipcMain.handle('save-layout', async (_e, root, layout) => {
    await writeFile(layoutPath(root), JSON.stringify(layout, null, 2));
    return { ok: true };
  });

  ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text ?? '')); return { ok: true }; });

  ipcMain.handle('session:load', () => loadSession(sessionFile()));
  ipcMain.handle('session:save', async (_e, state) => {
    const cur = await loadSession(sessionFile()); // merge so a partial save preserves other fields (e.g. recent)
    await saveSession(sessionFile(), { ...cur, ...state });
    return { ok: true };
  });
  ipcMain.handle('session:add-recent', async (_e, root) => {
    const s = await loadSession(sessionFile());
    const recent = addRecent(s.recent, root);
    await saveSession(sessionFile(), { ...s, recent });
    return recent;
  });

  ipcMain.handle('watch:start', (event, root) => {
    if (watchers.has(root)) return { ok: true };
    const sender = event.sender;
    watchers.set(root, watchProject(root, () => {
      if (!sender.isDestroyed()) sender.send('file-change', root);
    }));
    return { ok: true };
  });
  ipcMain.handle('watch:stop', (_e, root) => {
    watchers.get(root)?.close();
    watchers.delete(root);
    return { ok: true };
  });
}

export function closeAllWatchers() {
  for (const w of watchers.values()) w.close();
  watchers.clear();
}
