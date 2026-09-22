/**
 * preload.js — API segura exposta ao renderer (Honest Boost Desktop v3.1)
 *
 * Contrato único: cada método espelha EXATAMENTE um handler no main.js.
 * Verificado por test/contract.test.js. Nada de Node é exposto ao renderer.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const hbDesktop = {
  // ===== App =====
  getInfo: () => ipcRenderer.invoke('app:info'),
  isAdmin: () => ipcRenderer.invoke('app:is-admin'),
  restartAsAdmin: () => ipcRenderer.invoke('app:restart-admin'),
  openPlans: () => ipcRenderer.invoke('app:open-plans'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-updates'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  onUpdateStatus: (cb) => {
    const listener = (_event, payload) => { try { cb(payload); } catch {} };
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
  authenticateWithKey: (key) => ipcRenderer.invoke('app:auth', key),
  logout: () => ipcRenderer.invoke('app:logout'),

  // ===== Notificação =====
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),

  // ===== Diagnóstico =====
  getDiagnostic: () => ipcRenderer.invoke('system:diagnostic'),

  // ===== Snapshot em tempo real =====
  getSnapshot: () => ipcRenderer.invoke('system:snapshot'),

  // ===== Análise de saúde =====
  getHealthAnalysis: () => ipcRenderer.invoke('system:health-analysis'),

  // ===== Catálogo (CATÁLOGO VALIDADO) =====
  getCatalog: () => ipcRenderer.invoke('catalog:list'),
  getRecommendationReport: () => ipcRenderer.invoke('catalog:report'),

  // ===== Aplicação de otimizações =====
  applyOptimization: (id) => ipcRenderer.invoke('opt:apply', id),
  applyBatch: (ids) => ipcRenderer.invoke('opt:apply-batch', ids),
  applyRecommended: () => ipcRenderer.invoke('opt:apply-recommended'),
  applyAll: () => ipcRenderer.invoke('opt:apply-all'),
  applyPreset: (presetId) => ipcRenderer.invoke('opt:apply-preset', presetId),
  removeOptimization: (id) => ipcRenderer.invoke('opt:remove', id),

  // ===== Limpeza =====
  cleanItem: (id) => ipcRenderer.invoke('clean:item', id),
  cleanSelected: (ids) => ipcRenderer.invoke('clean:selected', ids),

  // ===== RAM =====
  freeRam: () => ipcRenderer.invoke('system:free-ram'),

  // ===== Explorer =====
  restartExplorer: () => ipcRenderer.invoke('system:restart-explorer'),

  // ===== Rollback / Recuperação =====
  getRecoveryStatus: () => ipcRenderer.invoke('recovery:status'),
  restoreRegistry: () => ipcRenderer.invoke('recovery:restore-registry'),
  createRestorePoint: (description) => ipcRenderer.invoke('recovery:create-restore-point', description),
  backupSettings: () => ipcRenderer.invoke('recovery:backup-settings'),
  restoreBackup: () => ipcRenderer.invoke('recovery:restore-backup'),

  // ===== Jogos =====
  scanGames: () => ipcRenderer.invoke('games:scan'),
  getGameIcon: (exe) => ipcRenderer.invoke('games:icon', exe),

  // ===== Loja de Apps (instalação real via winget) =====
  installApp: (key) => ipcRenderer.invoke('apps:install', key),
  uninstallApp: (key) => ipcRenderer.invoke('apps:uninstall', key),
  upgradeApp: (key) => ipcRenderer.invoke('apps:upgrade', key),
  getAppsStatus: () => ipcRenderer.invoke('apps:status'),
  openAppPage: (key) => ipcRenderer.invoke('apps:open-page', key)
};

contextBridge.exposeInMainWorld('hbDesktop', hbDesktop);

// Listeners que o renderer pode assinar (menu -> UI) — reservado para o futuro.
const registry = {};
module.exports = { registry };
