import { app, BrowserWindow, Menu } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { registerIpc, closeAllWatchers } from './ipc.js';
import { firstProjectArg, resolveProjectFromDir } from './project.js';
import { mapPath } from '../../workflows/lib/paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// A project directory may be passed on the command line (e.g. `npm start -- /path`,
// which /karto-show uses to open the current project). Resolve it only when it is a
// real directory holding a `.kartograph/kartograph.json`; otherwise ignore it.
function initialProjectFromArgv(argv) {
  const arg = firstProjectArg(argv);
  if (!arg) return null;
  try {
    if (statSync(arg).isDirectory() && existsSync(mapPath(arg))) {
      return resolveProjectFromDir(arg);
    }
  } catch { /* not a readable directory — ignore */ }
  return null;
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Kartograph Desktop',
    webPreferences: {
      preload: join(__dirname, '../preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(join(__dirname, '../renderer/index.html'));
  win.on('closed', () => { win = null; });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project…',
          accelerator: 'CmdOrCtrl+O',
          click: () => win?.webContents.send('menu:open-project'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  registerIpc(initialProjectFromArgv(process.argv));
  buildMenu();
  createWindow();
});

app.on('before-quit', () => closeAllWatchers());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
