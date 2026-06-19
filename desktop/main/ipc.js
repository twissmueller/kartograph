import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { buildBoard } from '../../workflows/lib/board-data.js';
import { readCapabilityFeatures, listFeatureTree, isSlug, isFeatureName } from '../../workflows/lib/feature-read.js';
import { setScenarioProgress } from '../../workflows/lib/gherkin.js';
import { resolveProjectFromPicked, isSafeRelPath } from './project.js';

const RAW_EXT = new Set(['.feature', '.json', '.md']);

export function registerIpc() {
  ipcMain.handle('open-project', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const r = await dialog.showOpenDialog(win, {
      title: 'Open kartograph.json',
      properties: ['openFile'],
      filters: [{ name: 'Kartograph map', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePaths.length) return null;
    return resolveProjectFromPicked(r.filePaths[0]);
  });

  ipcMain.handle('read-map', async (_e, root) => {
    const map = JSON.parse(await readFile(join(root, 'kartograph.json'), 'utf8'));
    let layout = {};
    try { layout = JSON.parse(await readFile(join(root, 'kartograph.layout.json'), 'utf8')); }
    catch { layout = {}; }
    return { map, layout };
  });

  ipcMain.handle('read-board', (_e, root) => buildBoard(root));
  ipcMain.handle('list-features', (_e, root) => listFeatureTree(root));
  ipcMain.handle('read-features', (_e, root, context, slug) => readCapabilityFeatures(root, context, slug));

  ipcMain.handle('read-raw', async (_e, root, relPath) => {
    if (!isSafeRelPath(relPath) || !RAW_EXT.has(extname(relPath))) throw new Error('invalid path');
    return { text: await readFile(join(root, relPath), 'utf8') };
  });

  ipcMain.handle('set-board-progress', async (_e, p) => {
    const VALID = ['open', 'wip', 'test', 'done'];
    if (!isSlug(p.context) || !isSlug(p.capability) || !isFeatureName(p.feature)
        || typeof p.scenario !== 'string' || !p.scenario || !VALID.includes(p.progress)) {
      throw new Error('invalid request');
    }
    const file = join(p.root, 'features', p.context, p.capability, p.feature);
    const src = await readFile(file, 'utf8');
    const updated = setScenarioProgress(src, p.scenario, p.progress);
    await writeFile(file, updated);
    return { ok: true };
  });

  ipcMain.handle('save-layout', async (_e, root, layout) => {
    await writeFile(join(root, 'kartograph.layout.json'), JSON.stringify(layout, null, 2));
    return { ok: true };
  });
}
