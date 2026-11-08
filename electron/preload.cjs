const { contextBridge, ipcRenderer } = require('electron');

// Minimal secure context bridge exposing only strictly necessary methods to renderer
contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:version'),
  openExternal: (url) => {
    if (typeof url === 'string' && (url.startsWith('http:') || url.startsWith('https:'))) {
      return ipcRenderer.invoke('shell:openExternal', url);
    }
    return Promise.reject(new Error('Invalid URL protocol'));
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
});
