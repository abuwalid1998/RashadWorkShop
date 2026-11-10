'use strict';
const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only bridge between the page and the system: one function that asks
 * the main process to run a named operation. The allow-list lives in ipc.js.
 */
contextBridge.exposeInMainWorld('workshop', {
  call: (method, payload) => ipcRenderer.invoke('api', method, payload),
  onMenuAction: (listener) => {
    const handler = (_event, action) => listener(action);
    ipcRenderer.on('menu-action', handler);
    return () => ipcRenderer.removeListener('menu-action', handler);
  },
});
