/* preload.js — expõe API segura ao renderer via contextBridge */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hbDesktop', {
  getInfo: () => ipcRenderer.invoke('app:info'),
  getDiagnostic: () => ipcRenderer.invoke('system:diagnostic'),
  getRecoveryStatus: () => ipcRenderer.invoke('recovery:status'),
  restoreRegistry: () => ipcRenderer.invoke('recovery:restore-registry'),
  
  // Stats integration
  fetchStats: () => ipcRenderer.invoke('stats:fetch'),
  reportOptimization: (data) => ipcRenderer.invoke('stats:report', data),
  
  // Original optimizations
  disableMouseAccel: () => ipcRenderer.invoke('opt:disable-mouse-accel'),
  highPerfPower: () => ipcRenderer.invoke('opt:high-perf-power'),
  disableGameDVR: () => ipcRenderer.invoke('opt:disable-gamedvr'),
  visualEffects: () => ipcRenderer.invoke('opt:visual-effects'),
  cleanRAM: () => ipcRenderer.invoke('opt:clean-ram'),
  optimizeNetwork: () => ipcRenderer.invoke('opt:network'),
  monitorRefresh: () => ipcRenderer.invoke('opt:monitor-refresh'),
  pollingRate: () => ipcRenderer.invoke('opt:polling-rate'),
  
  // New optimizations
  cpuCoreParking: () => ipcRenderer.invoke('opt:cpu-core-parking'),
  cpuScheduler: () => ipcRenderer.invoke('opt:cpu-scheduler'),
  mouseThreshold: () => ipcRenderer.invoke('opt:mouse-threshold'),
  disableFullscreenOpt: () => ipcRenderer.invoke('opt:disable-fullscreen-opt'),
  dnsCloudflare: () => ipcRenderer.invoke('opt:dns-cloudflare'),
  qosDisable: () => ipcRenderer.invoke('opt:qos-disable'),
  disableTelemetry: () => ipcRenderer.invoke('opt:disable-telemetry'),
  disableUpdates: () => ipcRenderer.invoke('opt:disable-updates'),
  
  // Apply all
  applyAll: () => ipcRenderer.invoke('opt:apply-all'),
  
  // Ultra Blaster
  ultraBlaster: () => ipcRenderer.invoke('ultra:blaster'),
  
  // Gaming mode
  enableGamingMode: () => ipcRenderer.invoke('gaming:enable'),
  disableGamingMode: () => ipcRenderer.invoke('gaming:disable'),
  
  // Notifications
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  
  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('app:check-updates'),
  
  // Auth with token
  authenticateWithKey: (key) => ipcRenderer.invoke('app:auth', key),
  logout: () => ipcRenderer.invoke('app:logout')
});
