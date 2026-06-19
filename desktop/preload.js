import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('karto', {
  ping: () => 'pong',
});
