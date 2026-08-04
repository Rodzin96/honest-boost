/* preload.js — expõe API segura ao renderer via contextBridge */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hbDesktop', {
  getInfo: () => ipcRenderer.invoke('app:info'),
  disableMouseAccel: () => ipcRenderer.invoke('opt:disable-mouse-accel'),
  highPerfPower: () => ipcRenderer.invoke('opt:high-perf-power'),
  disableGameDVR: () => ipcRenderer.invoke('opt:disable-gamedvr'),
  visualEffects: () => ipcRenderer.invoke('opt:visual-effects'),
  cleanRAM: () => ipcRenderer.invoke('opt:clean-ram'),
  optimizeNetwork: () => ipcRenderer.invoke('opt:network'),
  monitorRefresh: () => ipcRenderer.invoke('opt:monitor-refresh'),
  pollingRate: () => ipcRenderer.invoke('opt:polling-rate'),
  applyAll: () => ipcRenderer.invoke('opt:apply-all')
});

