/**
 * preload.js — API segura exposta ao renderer
 * Honest Boost Desktop v3.0
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hbDesktop', {
  // App
  getInfo: () => ipcRenderer.invoke('app:info'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-updates'),
  authenticateWithKey: (key) => ipcRenderer.invoke('app:auth', key),
  logout: () => ipcRenderer.invoke('app:logout'),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  
  // System
  getDiagnostic: () => ipcRenderer.invoke('system:diagnostic'),
  getRecommendations: () => ipcRenderer.invoke('system:recommendations'),
  
  // Recovery
  getRecoveryStatus: () => ipcRenderer.invoke('recovery:status'),
  restoreRegistry: () => ipcRenderer.invoke('recovery:restore-registry'),
  
  // Processes
  getProcessClassification: () => ipcRenderer.invoke('processes:classification'),
  terminateProcess: (pid, name) => ipcRenderer.invoke('processes:terminate', { pid, name }),
  terminateSafeProcesses: () => ipcRenderer.invoke('processes:terminate-safe'),
  
  // Optimizations
  applyOptimization: (id) => ipcRenderer.invoke('opt:apply', id),
  applyAllOptimizations: (recommendations) => ipcRenderer.invoke('opt:apply-all', recommendations),
  
  // Benchmark
  runBenchmark: () => ipcRenderer.invoke('benchmark:run'),
  captureBaseline: () => ipcRenderer.invoke('benchmark:baseline'),
  captureAfter: () => ipcRenderer.invoke('benchmark:after'),
  getComparison: () => ipcRenderer.invoke('benchmark:comparison'),
  getBenchmarkHistory: () => ipcRenderer.invoke('benchmark:history'),
  
  // Games
  scanGames: () => ipcRenderer.invoke('games:scan'),
  getGameProfile: (gameId) => ipcRenderer.invoke('games:profile', gameId),
  getAllProfiles: () => ipcRenderer.invoke('games:all-profiles'),
  
  // Gaming mode
  enableGamingMode: () => ipcRenderer.invoke('gaming:enable'),
  disableGamingMode: () => ipcRenderer.invoke('gaming:disable')
});
