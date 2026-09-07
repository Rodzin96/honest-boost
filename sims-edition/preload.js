/* preload.js — Honest Boost: Sims Edition */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hbSims', {
  optimize: () => ipcRenderer.invoke('opt:sims4'),
  getSystemInfo: () => ipcRenderer.invoke('sys:info'),
  getVersion: () => ipcRenderer.invoke('app:version')
});
