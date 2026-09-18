/**
 * main.js — Honest Boost Desktop v3.0 (Refatorado)
 * Arquitetura modular com separação de responsabilidades
 */
const { app, BrowserWindow, ipcMain, shell, dialog, Notification, powerSaveBlocker, Menu } = require('electron');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

// Módulos próprios
const registry = require('./src/registry');
const processes = require('./src/processes');
const systemAnalyzer = require('./src/systemAnalyzer');
const recommendationEngine = require('./src/recommendationEngine');
const optimizationEngine = require('./src/optimizationEngine');
const benchmarkEngine = require('./src/benchmarkEngine');
const gameDetector = require('./src/gameDetector');

// Auto-updater
const { autoUpdater } = require('electron-updater');

let mainWindow;
let powerSaveBlockerId = null;
const API_BASE_URL = (process.env.HONEST_BOOST_API_BASE_URL || 'https://laudable-creation-production-e8e9.up.railway.app').replace(/\/$/, '');

// ==================== Utility ====================
function isWindows() {
  return process.platform === 'win32';
}

function postJson(url, data, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = Buffer.from(JSON.stringify(data || {}));
    const transport = target.protocol === 'https:' ? https : http;
    let settled = false;
    
    const done = (fn, arg) => {
      if (settled) return;
      settled = true;
      fn(arg);
    };
    
    const req = transport.request({
      method: 'POST',
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length
      },
      timeout: timeoutMs
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        let payload = null;
        const text = Buffer.concat(chunks).toString('utf8');
        try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
        done(resolve, { statusCode: res.statusCode || 0, payload });
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      done(reject, new Error('Tempo esgotado ao conectar ao servidor.'));
    });
    
    req.on('error', (err) => done(reject, err));
    req.end(body);
  });
}

// ==================== Admin Check ====================
function isAdmin() {
  try {
    const { execSync } = require('child_process');
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ==================== Notifications ====================
function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: path.join(__dirname, '..', 'public', 'logo.svg') }).show();
  }
}

// ==================== IPC Handlers ====================

// App info
ipcMain.handle('app:info', () => ({
  platform: process.platform,
  version: app.getVersion(),
  os: `${os.type()} ${os.release()}`,
  arch: os.arch(),
  windows: isWindows(),
  admin: isAdmin()
}));

// System diagnostic
ipcMain.handle('system:diagnostic', async () => {
  try {
    return { ok: true, diagnostic: await systemAnalyzer.fullSystemScan() };
  } catch (e) {
    return { ok: false, error: 'Não foi possível concluir o diagnóstico.' };
  }
});

// Recommendations
ipcMain.handle('system:recommendations', async () => {
  try {
    const systemData = await systemAnalyzer.fullSystemScan();
    return { ok: true, recommendations: recommendationEngine.analyzeSystem(systemData) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Registry recovery
ipcMain.handle('recovery:status', async () => registry.getSnapshotStatus());
ipcMain.handle('recovery:restore-registry', async () => registry.restoreSnapshot());

// Process management
ipcMain.handle('processes:classification', async () => {
  try {
    return { ok: true, processes: await processes.getProcessClassification() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('processes:terminate', async (event, { pid, name }) => {
  try {
    return { ok: true, result: await processes.terminateProcess(pid, name) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('processes:terminate-safe', async () => {
  try {
    return { ok: true, results: await processes.terminateSafeProcesses() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Optimization
ipcMain.handle('opt:apply', async (event, id) => {
  try {
    const result = await optimizationEngine.applyOptimization(id);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('opt:apply-all', async (event, recommendations) => {
  try {
    const results = await optimizationEngine.applyAll(recommendations);
    const successCount = results.filter(r => r.ok).length;
    showNotification('Honest Boost', `${successCount} otimizações aplicadas com sucesso!`);
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Benchmark
ipcMain.handle('benchmark:run', async () => {
  try {
    return { ok: true, data: await benchmarkEngine.runBenchmark() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('benchmark:baseline', async () => {
  try {
    return { ok: true, data: await benchmarkEngine.captureBaseline() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('benchmark:after', async () => {
  try {
    return { ok: true, data: await benchmarkEngine.captureAfter() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('benchmark:comparison', async () => {
  try {
    return { ok: true, data: benchmarkEngine.getComparison() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('benchmark:history', async () => {
  try {
    return { ok: true, data: await benchmarkEngine.getHistory() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Game detection
ipcMain.handle('games:scan', async () => {
  try {
    return { ok: true, games: await gameDetector.scanInstalledGames() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('games:profile', async (event, gameId) => {
  try {
    return { ok: true, profile: gameDetector.getGameProfile(gameId) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('games:all-profiles', async () => {
  try {
    return { ok: true, profiles: gameDetector.getAllProfiles() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Gaming mode
ipcMain.handle('gaming:enable', async () => {
  try {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    const results = await processes.terminateSafeProcesses();
    showNotification('Modo Gaming', 'PC otimizado para jogos! Processos seguros fechados.');
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('gaming:disable', async () => {
  if (powerSaveBlockerId !== null) {
    powerSaveBlocker.stop(powerSaveBlockerId);
    powerSaveBlockerId = null;
  }
  return { ok: true, message: 'Modo gaming desativado.' };
});

// Notifications
ipcMain.handle('notify', (event, { title, body }) => {
  showNotification(title, body);
  return { ok: true };
});

// Auto-updater
ipcMain.handle('app:check-updates', async () => {
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Auth com timeout
ipcMain.handle('app:auth', async (event, key) => {
  const cleanKey = typeof key === 'string' ? key.trim() : '';
  if (!cleanKey) return { ok: false, error: 'missing_key' };
  
  // Tentar auth via servidor com timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    const { statusCode, payload } = await postJson(`${API_BASE_URL}/api/app/auth`, {
      key: cleanKey,
      deviceInfo: {
        hostname: os.hostname(),
        platform: process.platform,
        arch: os.arch(),
        appVersion: app.getVersion()
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    if (statusCode >= 200 && statusCode < 300 && payload && payload.ok) return payload;
    return { ok: false, error: payload?.error || 'invalid_key' };
  } catch (error) {
    // Servidor offline — permitir modo trial local
    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
      return { ok: true, offline: true, tier: 'trial', user: { nickname: 'Offline User' } };
    }
    return { ok: false, error: 'server_unavailable', message: error.message };
  }
});

ipcMain.handle('app:logout', async () => {
  return { ok: true };
});

// ==================== Auto Update ====================
function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });
  
  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Atualização Disponível',
      message: `Honest Boost v${info.version} está disponível. Deseja baixar?`,
      detail: 'A atualização será instalada automaticamente quando o app for reiniciado.',
      buttons: ['Baixar Agora', 'Mais Tarde'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });
  
  autoUpdater.on('update-not-available', () => {
    console.log('App is up to date');
  });
  
  autoUpdater.on('download-progress', (progress) => {
    console.log(`Download progress: ${progress.percent}%`);
    if (mainWindow) {
      mainWindow.setProgressBar(progress.percent / 100);
    }
  });
  
  autoUpdater.on('update-downloaded', () => {
    console.log('Update downloaded');
    if (mainWindow) {
      mainWindow.setProgressBar(-1);
    }
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Atualização Pronta',
      message: 'A atualização foi baixada. Deseja reiniciar o app para instalar?',
      buttons: ['Reiniciar Agora', 'Mais Tarde'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });
  
  autoUpdater.on('error', (err) => {
    console.error('Update error:', err.message);
  });
  
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 30 * 60 * 1000);
}

// ==================== Window ====================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    title: 'Honest Boost — Otimizador',
    backgroundColor: '#030512',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'public', 'logo.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
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
  
  setupAutoUpdater();
  
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 3000);
}

// ==================== Menu ====================
function createMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Verificar Atualizações', click: () => autoUpdater.checkForUpdates() },
        { type: 'separator' },
        { label: 'Sair', role: 'quit' }
      ]
    },
    {
      label: 'Otimizações',
      submenu: [
        { label: 'Aplicar Tudo', click: () => mainWindow?.webContents.send('menu-apply-all') },
        { type: 'separator' },
        { label: 'Ativar Modo Gaming', click: () => mainWindow?.webContents.send('menu-gaming-on') },
        { label: 'Desativar Modo Gaming', click: () => mainWindow?.webContents.send('menu-gaming-off') }
      ]
    },
    {
      label: 'Ajuda',
      submenu: [
        { label: 'Site Oficial', click: () => shell.openExternal('https://honestboost.com.br') },
        { label: 'Suporte', click: () => shell.openExternal('https://honestboost.com.br/contato') }
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
