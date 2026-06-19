import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('karto', {
  openProject: () => ipcRenderer.invoke('open-project'),
  readMap: (root) => ipcRenderer.invoke('read-map', root),
  readBoard: (root) => ipcRenderer.invoke('read-board', root),
  listFeatures: (root) => ipcRenderer.invoke('list-features', root),
  readFeatures: (root, context, slug) => ipcRenderer.invoke('read-features', root, context, slug),
  readRaw: (root, relPath) => ipcRenderer.invoke('read-raw', root, relPath),
  setBoardProgress: (p) => ipcRenderer.invoke('set-board-progress', p),
  saveLayout: (root, layout) => ipcRenderer.invoke('save-layout', root, layout),
  onFileChange: (cb) => ipcRenderer.on('file-change', (_e, root) => cb(root)),
  onMenuOpenProject: (cb) => ipcRenderer.on('menu:open-project', () => cb()),
});
