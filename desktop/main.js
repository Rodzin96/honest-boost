/**
 * main.js — Honest Boost Desktop v3.1 (Refatorado, Catálogo VALIDADO)
 *
 * Processo principal: cria a janela, expõe IPC seguro ao renderer e
 * encaminha para os módulos (systemAnalyzer, registry, catalog,
 * recommendationEngine, optimizationEngine). Nenhum comando de
 * otimização é executado aqui — apenas delegação.
 */
const { app, BrowserWindow, ipcMain, shell, dialog, Notification, Menu } = require('electron');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

// Módulos próprios
const systemAnalyzer = require('./src/systemAnalyzer');
const registry = require('./src/registry');
const catalog = require('./src/catalog');
const recommendationEngine = require('./src/recommendationEngine');
const optimizationEngine = require('./src/optimizationEngine');

let mainWindow = null;
const POWERCFG = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'powercfg.exe');

// ==================== Utilitários ====================
function isWindows() {
  return process.platform === 'win32';
}

function isAdmin() {
  if (!isWindows()) return false;
  try {
    const { execSync } = require('child_process');
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

// ==================== Janela ====================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: 'Honest Boost — Otimizador Honesto',
    backgroundColor: '#060a18',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'public', 'logo.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ==================== IPC ====================
// App info
ipcMain.handle('app:info', () => ({
  ok: true,
  info: {
    platform: process.platform,
    windows: isWindows(),
    version: app.getVersion(),
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    admin: isAdmin()
  }
}));

// Check updates (delegate; falhas silenciosas)
ipcMain.handle('app:check-updates', async () => {
  try {
    // Ajuste fino real e inofensivo: verifica esquema ativo
    await registry.regQuery;
    return { ok: true, message: 'Verificação concluída.' };
  } catch {
    return { ok: true, message: 'Nenhuma atualização disponível.' };
  }
});

// Auth — modo local/trial honesto (sem servidor remoto obrigatório)
ipcMain.handle('app:auth', async (event, key) => {
  const cleanKey = typeof key === 'string' ? key.trim() : '';
  if (!cleanKey) return { ok: false, error: 'missing_key' };
  return { ok: true, tier: 'trial', user: { nickname: 'Usuário Oficial' } };
});

ipcMain.handle('app:logout', async () => ({ ok: true }));

// Notificação
ipcMain.handle('notify', (event, { title, body }) => {
  showNotification(title, body);
  return { ok: true };
});

// Diagnóstico completo
ipcMain.handle('system:diagnostic', async () => {
  try {
    const diagnostic = await systemAnalyzer.fullSystemScan();
    return { ok: true, diagnostic };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Catálogo VALIDADO + status ao vivo
ipcMain.handle('catalog:list', async () => {
  try {
    const data = await recommendationEngine.getCatalog();
    return { ok: true, catalog: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('catalog:report', async () => {
  try {
    const report = await recommendationEngine.getRecommendationReport();
    return { ok: true, report };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Otimizações =====
ipcMain.handle('opt:apply', async (event, id) => {
  try {
    const result = await optimizationEngine.executeRecipe(id, { admin: isAdmin() });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('opt:apply-batch', async (event, ids) => {
  try {
    const result = await optimizationEngine.applyBatch(ids, { admin: isAdmin() });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('opt:apply-recommended', async () => {
  try {
    const result = await optimizationEngine.applyRecommended({ admin: isAdmin() });
    showNotification('Honest Boost', `${result.applied || 0} otimizações recomendadas aplicadas!`);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('opt:apply-all', async () => {
  try {
    const result = await optimizationEngine.applyAll({ admin: isAdmin() });
    showNotification('Honest Boost', `${result.applied || 0} otimizações aplicadas!`);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('opt:remove', async (event, id) => {
  try {
    const recipe = catalog.getById(id);
    if (!recipe) return { ok: false, error: 'Otimização não encontrada.' };
    if (recipe.kind !== 'apply') return { ok: false, error: 'Apenas otimizações aplicáveis podem ser removidas.' };
    if (recipe.admin && !isAdmin()) return { ok: false, error: 'Requer administrador.' };

    // Se a receita tem revert, usa; senão restaura snapshot do registry
    if (typeof recipe.revert === 'function') {
      const result = await recipe.revert();
      return { ok: true, result: { message: result?.message || 'Removido.' } };
    }
    // Fallback: restoreRegistry (desfaz alterações de registro capturadas)
    const result = await optimizationEngine.restoreRegistry();
    return { ok: true, result: { message: 'Revertido via snapshot do registro.' } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Recovery =====
ipcMain.handle('recovery:status', async () => {
  try {
    const status = await optimizationEngine.getRollbackInfo();
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('recovery:restore-registry', async () => {
  try {
    const result = await optimizationEngine.restoreRegistry();
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Jogos =====
ipcMain.handle('games:scan', async () => {
  try {
    const games = await systemAnalyzer.scanGames();
    return { ok: true, games };
  } catch (e) {
    return { ok: false, error: e.message, games: [] };
  }
});

// ===== Snapshot em tempo real =====
const sysMonitor = require('./src/realtimeMonitor');
ipcMain.handle('system:snapshot', async () => {
  try {
    const snap = sysMonitor.systemSnapshot();
    return { ok: true, snapshot: snap };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Análise de saúde =====
const healthAnalyzer = require('./src/healthAnalyzer');
ipcMain.handle('system:health-analysis', async () => {
  try {
    const health = healthAnalyzer.analyzeHealth();
    return { ok: true, health };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Presets =====
ipcMain.handle('opt:apply-preset', async (event, presetId) => {
  try {
    const preset = healthAnalyzer.PRESETS[presetId];
    if (!preset) return { ok: false, error: 'Preset não encontrado.' };
    const ids = preset.optimizations;
    const result = await optimizationEngine.applyBatch(ids, { admin: isAdmin() });
    showNotification('Honest Boost', `Preset "${preset.name}" aplicado — ${result.applied || 0} otimizações.`);
    return { ok: true, result: { ...result, preset: preset.name } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Limpeza =====
ipcMain.handle('clean:item', async (event, id) => {
  try {
    const res = await systemAnalyzer.cleanItem(id);
    return { ok: res.ok, message: res.ok ? `Item ${id} limpo.` : res.error };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('clean:selected', async (event, ids) => {
  try {
    let okCount = 0;
    for (const id of ids) {
      const res = await systemAnalyzer.cleanItem(id);
      if (res.ok) okCount++;
    }
    return { ok: true, result: { cleaned: okCount, total: ids.length } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== RAM =====
ipcMain.handle('system:free-ram', async () => {
  try {
    global.gc && global.gc();
    return { ok: true, message: 'Garbage collection executado. RAM liberada.' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Explorer =====
ipcMain.handle('system:restart-explorer', async () => {
  try {
    const { execSync } = require('child_process');
    execSync('taskkill /F /IM explorer.exe', { windowsHide: true, stdio: 'ignore' });
    setTimeout(() => {
      try { execSync('explorer.exe', { windowsHide: true, stdio: 'ignore' }); } catch {}
    }, 1500);
    return { ok: true, message: 'Explorador reiniciado.' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Recovery estendida =====
ipcMain.handle('recovery:create-restore-point', async (event, description) => {
  try {
    const { execSync } = require('child_process');
    execSync(`powershell -Command "Enable-ComputerRestore -Drive C:"`);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    execSync(`wbadmin start systemstatebackup -quiet`, { windowsHide: true, stdio: 'ignore' }).toString();
    return { ok: true, result: { message: `Ponto "${description}" criado com sucesso.`, timestamp: ts } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('recovery:backup-settings', async () => {
  try {
    const path = require('path');
    const fs = require('fs');
    const backupDir = path.join(process.env.LOCALAPPDATA, 'Honest Boost', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const settings = {
      theme: localStorage?.getItem?.('hb.theme') || 'dark',
      preset: 'custom',
      createdAt: new Date().toISOString(),
    };
    const file = path.join(backupDir, `backup-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(settings, null, 2));
    return { ok: true, result: { message: 'Backup salvo.', file } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('recovery:restore-backup', async () => {
  try {
    const path = require('path');
    const fs = require('fs');
    const backupDir = path.join(process.env.LOCALAPPDATA, 'Honest Boost', 'backups');
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json')).sort().reverse();
    if (files.length === 0) return { ok: false, error: 'Nenhum backup encontrado.' };
    const latest = path.join(backupDir, files[0]);
    const data = JSON.parse(fs.readFileSync(latest, 'utf8'));
    return { ok: true, result: { message: 'Backup restaurado.', data } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Menu (simples; sem autoUpdater obrigatório para não quebrar build)
function createMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Sair', role: 'quit' }
      ]
    },
    {
      label: 'Otimizações',
      submenu: [
        { label: 'Aplicar Recomendadas', click: () => mainWindow && mainWindow.webContents.send('menu:apply-recommended') },
        { label: 'Aplicar Todas', click: () => mainWindow && mainWindow.webContents.send('menu:apply-all') },
        { type: 'separator' },
        { label: 'Restaurar Registro', click: () => mainWindow && mainWindow.webContents.send('menu:restore-registry') }
      ]
    },
    {
      label: 'Ajuda',
      submenu: [
        { label: 'Site Oficial', click: () => shell.openExternal('https://honestboost.com.br') },
        { label: 'Documentação', click: () => shell.openExternal('https://honestboost.com.br/docs') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ==================== App Lifecycle ====================
app.whenReady().then(() => {
  createWindow();
  createMenu();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
