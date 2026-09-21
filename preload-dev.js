
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('hbDesktop', {
  getInfo: () => Promise.resolve({ ok: true, app: 'Honest Boost', version: '2.0.0' }),
  authenticateWithKey: () => Promise.resolve({ ok: true, info: { name: 'Usuário', plan: 'Trial' } }),
  logout: () => Promise.resolve({ ok: true }),
  notify: () => Promise.resolve(),
  getDiagnostic: () => Promise.resolve({ ok: true }),
  getSnapshot: () => Promise.resolve({ ok: true, snapshot: {
    cpu: { usage: 12, load: '0.42', cores: 8, model: 'CPU Genérico' },
    ram: { pct: 45, used: 7.5e9, total: 16e9, nodeUsed: 200e6 },
    gpu: { name: 'GPU Genérica', usage: 30, vram: 4e9 },
    gpuTemp: 62,
    disk: { space: [{ device: 'C:', size: 500e9, free: 200e9 }], io: { readMBps: 2, writeMBps: 1 } },
    network: { rxMBps: 1.2, txMBps: 0.8 },
    windows: { state: 'Ativo' },
    os: { uptime: { label: '12h 34m' }, hostname: 'DESKTOP-ABC123', arch: 'x64', type: 'Windows', release: '10' },
    processes: { count: 187 },
    startup: []
  }}),
  getHealthAnalysis: () => Promise.resolve({ ok: true, health: { score: 78, recommendations: ['Limpeza de arquivos temporários', 'Verificar programas de inicialização'] } }),
  getCatalog: () => Promise.resolve({ ok: true, catalog: { applied: [] } }),
  applyOptimization: () => Promise.resolve({ ok: true, message: 'Otimização aplicada' }),
  applyBatch: () => Promise.resolve({ ok: true }),
  applyRecommended: () => Promise.resolve({ ok: true, result: { applied: 5 } }),
  applyAll: () => Promise.resolve({ ok: true }),
  applyPreset: () => Promise.resolve({ ok: true }),
  removeOptimization: () => Promise.resolve({ ok: true }),
  cleanItem: () => Promise.resolve({ ok: true, message: 'Item limpo' }),
  cleanSelected: () => Promise.resolve({ ok: true }),
  freeRam: () => Promise.resolve({ ok: true }),
  restartExplorer: () => Promise.resolve({ ok: true }),
  getRecoveryStatus: () => Promise.resolve({ ok: true }),
  restoreRegistry: () => Promise.resolve({ ok: true }),
  createRestorePoint: () => Promise.resolve({ ok: true }),
  backupSettings: () => Promise.resolve({ ok: true }),
  restoreBackup: () => Promise.resolve({ ok: true }),
  scanGames: () => Promise.resolve({ ok: true, games: [] })
});
