/* main.js — Honest Boost Desktop (Electron) v2.0 */
const { app, BrowserWindow, ipcMain, shell, dialog, Notification, powerSaveBlocker, Menu } = require('electron');
const path = require('path');
const { exec, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');

// Auto-updater
const { autoUpdater } = require('electron-updater');

let mainWindow;
let powerSaveBlockerId = null;

// --- Utility: run command (returns Promise) ---
function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve((stdout || '').trim());
    });
  });
}

function isWindows() {
  return process.platform === 'win32';
}

// --- Stats Server Integration ---
const STATS_SERVER_URL = process.env.STATS_SERVER_URL || 'http://localhost:3001';

function postToStatsServer(path, data) {
  return new Promise((resolve) => {
    const url = new URL(path, STATS_SERVER_URL);
    const payload = JSON.stringify(data);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({ ok: true }); }
      });
    });
    
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.write(payload);
    req.end();
  });
}

function fetchStats() {
  return new Promise((resolve) => {
    const url = new URL('/api/stats', STATS_SERVER_URL);
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({}); }
      });
    }).on('error', () => resolve({}));
  });
}

// --- Windows Registry helpers ---
function regAdd(pathName, valueName, type, data) {
  return new Promise((resolve, reject) => {
    exec(`reg add "${pathName}" /v "${valueName}" /t ${type} /d "${data}" /f`, { windowsHide: true }, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

function regQuery(pathName, valueName) {
  return new Promise((resolve, reject) => {
    exec(`reg query "${pathName}" /v "${valueName}"`, { windowsHide: true }, (err, stdout) => {
      if (err) return reject(err);
      resolve((stdout || '').trim());
    });
  });
}

function regDelete(pathName, valueName) {
  return new Promise((resolve, reject) => {
    exec(`reg delete "${pathName}" /v "${valueName}" /f`, { windowsHide: true }, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

// --- Service control ---
function stopService(serviceName) {
  return run(`net stop "${serviceName}" /y`).catch(() => true);
}

function disableService(serviceName) {
  return run(`sc config "${serviceName}" start= disabled`).catch(() => true);
}

// --- OTIMIZAÇÕES ---

async function disableMouseAcceleration() {
  await regAdd('HKCU\\Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', '0');
  await regAdd('HKCU\\Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '0');
  await regAdd('HKCU\\Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '0');
  return true;
}

async function setPollingRate() {
  await disableMouseAcceleration();
  return true;
}

async function setMouseThreshold() {
  await regAdd('HKCU\\Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '0');
  await regAdd('HKCU\\Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '0');
  return true;
}

async function disableFullscreenOptimizations() {
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_FSEBehaviorMode', 'REG_DWORD', '2');
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_HonorUserFSEBehaviorMode', 'REG_DWORD', '1');
  const exe = process.execPath;
  if (exe) {
    const key = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers';
    await regAdd(key, exe, 'REG_SZ', '~ DISABLEFULLSCREENOPTIMIZATIONS');
  }
  return true;
}

async function setHighPerformancePowerPlan() {
  try {
    await run('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
    return true;
  } catch (e) {
    try {
      await run('powercfg /setactive e9a42b02-d5df-448d-aa00-03f14749eb61');
      return true;
    } catch (e2) {
      const out = await run('powercfg /list').catch(() => '');
      if (out && out.toLowerCase().includes('high performance')) {
        throw new Error('Não foi possível ativar o plano de alto desempenho.');
      }
      await run('powercfg -duplicatescheme 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
      await run('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
      return true;
    }
  }
}

async function disableCoreParking() {
  try {
    await run('powercfg /setacvalueindex scheme_current sub_processor CPMINCORES 100');
    await run('powercfg /setacvalueindex scheme_current sub_processor CPMAXCORES 100');
    await run('powercfg /setactive scheme_current');
    return true;
  } catch {
    await regAdd('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\0cc5b647-c1df-4637-891a-dec35c318583', 'ValueMax', 'REG_DWORD', '0');
    return true;
  }
}

async function optimizeCPUScheduler() {
  await regAdd('HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl', 'Win32PrioritySeparation', 'REG_DWORD', '38');
  return true;
}

async function disableGameDVR() {
  await regAdd('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 'REG_DWORD', '0');
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled', 'REG_DWORD', '0');
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_FSEBehaviorMode', 'REG_DWORD', '2');
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_HonorUserFSEBehaviorMode', 'REG_DWORD', '1');
  return true;
}

async function optimizeVisualEffects() {
  await regAdd('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', 'VisualFXSetting', 'REG_DWORD', '2');
  return true;
}

function runTool(exe) {
  return new Promise((resolve, reject) => {
    execFile(exe, [], { windowsHide: true }, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

async function cleanStandbyMemory() {
  const tool = 'C:\\Windows\\System32\\EmptyStandbyList.exe';
  if (fs.existsSync(tool)) {
    await runTool(tool);
    return true;
  }
  const ps = [
    '[System.GC]::Collect()',
    '[System.GC]::WaitForPendingFinalizers()',
    'Get-Process | Where-Object {$_.WorkingSet64 -gt 512MB} | ForEach-Object { $_.Refresh() }'
  ].join('; ');
  await run(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`);
  return true;
}

async function optimizeNetwork() {
  await run('netsh interface tcp set global autotuninglevel=normal');
  await run('netsh int tcp set global timestamps=disabled');
  await regAdd('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', 'MaxConnectionsPerServer', 'REG_DWORD', '16');
  return true;
}

async function setDNSCloudflare() {
  try {
    const ps = `
      $adapter = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1;
      if ($adapter) {
        Set-DnsClientServerIndex -InterfaceIndex ($adapter.ifIndex) -ServerAddresses ("1.1.1.1","1.0.0.1")
      }
    `;
    await run(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`);
    return true;
  } catch {
    await run('netsh interface ip set dns "Ethernet" static 1.1.1.1 primary');
    await run('netsh interface ip add dns "Ethernet" 1.0.0.1 index=2');
    return true;
  }
}

async function disableQoSThrottling() {
  await regAdd('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched', 'NonBestEffortLimit', 'REG_DWORD', '0');
  return true;
}

async function disableTelemetry() {
  await stopService('DiagTrack').catch(() => true);
  await stopService('dmwappushservice').catch(() => true);
  await disableService('DiagTrack').catch(() => true);
  await disableService('dmwappushservice').catch(() => true);
  await regAdd('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry', 'REG_DWORD', '0');
  await regAdd('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection', 'AllowTelemetry', 'REG_DWORD', '0');
  return true;
}

async function pauseWindowsUpdates() {
  await regAdd('HKLM\\SOFTWARE\\Microsoft\\WindowsUpdate\\UX', 'IsConclusiveUpdate', 'REG_DWORD', '0');
  await regAdd('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU', 'AUOptions', 'REG_DWORD', '2');
  await regAdd('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU', 'NoAutoUpdate', 'REG_DWORD', '0');
  return true;
}

async function setMonitorRefreshRate() {
  const ps = `
    Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public struct DEVMODE {
      [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
      public short dmSpecVersion; public short dmDriverVersion; public short dmSize;
      public short dmDriverExtra; public int dmFields;
      public int dmPositionX; public int dmPositionY; public int dmDisplayOrientation;
      public int dmDisplayFixedOutput; public short dmColor; public short dmDuplex;
      public short dmYResolution; public short dmTTOption; public short dmCollate;
      [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
      public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth;
      public int dmPelsHeight; public int dmDisplayFlags; public int dmDisplayFrequency;
      public int dmICMMethod; public int dmICMIntent; public int dmMediaType;
      public int dmDitherType; public int dmReserved1; public int dmReserved2;
      public int dmPanningWidth; public int dmPanningHeight;
    }
    public class Display {
      [DllImport("user32.dll")] static extern bool EnumDisplaySettings(string n, int m, ref DEVMODE d);
      [DllImport("user32.dll")] static extern int ChangeDisplaySettingsEx(string n, ref DEVMODE d, IntPtr p, int f, IntPtr x);
      public static int SetMaxRefresh() {
        DEVMODE d = new DEVMODE();
        d.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
        int best = 0, bestFreq = 0;
        for (int i = 0; EnumDisplaySettings(null, i, ref d); i++) {
          if (d.dmDisplayFrequency > bestFreq) { bestFreq = d.dmDisplayFrequency; best = i; }
        }
        if (bestFreq <= 0) return -1;
        DEVMODE target = new DEVMODE();
        EnumDisplaySettings(null, best, ref target);
        return ChangeDisplaySettingsEx(null, ref target, IntPtr.Zero, 0, IntPtr.Zero);
      }
    }
    "@
    [Display]::SetMaxRefresh()
  `;
  const out = await run(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`);
  if (out && out.trim() !== '0') {
    throw new Error('Não foi possível alterar o refresh rate automaticamente. Ajuste nas configurações do Windows.');
  }
  return true;
}

// --- Gaming Mode: Kill unnecessary processes ---
async function killGamingProcesses() {
  const processesToKill = [
    'OneDrive.exe', 'Teams.exe', 'Discord.exe', 'Spotify.exe',
    'Chrome.exe', 'FireFox.exe', 'Edge.exe', 'Steam.exe',
    'EpicGamesLauncher.exe', 'Battle.net.exe', 'Origin.exe',
    'Skype.exe', 'Zoom.exe', 'Teams.exe', 'Slack.exe',
    'AdobeCreativeCloud.exe', 'Creative Cloud.exe',
    'iTunes.exe', 'WhatsApp.exe', 'Telegram.exe'
  ];
  
  const killed = [];
  for (const proc of processesToKill) {
    try {
      await run(`taskkill /F /IM "${proc}" 2>nul`);
      killed.push(proc);
    } catch { /* process not running */ }
  }
  return killed;
}

// --- Gaming Mode: Full optimization ---
async function enableGamingMode() {
  const results = [];
  
  // 1. Block sleep
  powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  results.push({ name: 'Sleep Blocker', ok: true });
  
  // 2. Kill background processes
  const killed = await killGamingProcesses();
  results.push({ name: 'Processos fechados', ok: true, count: killed.length });
  
  // 3. Apply all optimizations
  const optResults = await applyAllOptimizations();
  results.push(...optResults);
  
  // 4. Set high priority for current process
  try {
    await run(`wmic process where name="node.exe" CALL setpriority "high priority"`);
  } catch { /* ignore */ }
  
  return results;
}

async function disableGamingMode() {
  if (powerSaveBlockerId !== null) {
    powerSaveBlocker.stop(powerSaveBlockerId);
    powerSaveBlockerId = null;
  }
  return { ok: true, message: 'Modo gaming desativado.' };
}

async function applyAllOptimizations() {
  const results = [];
  const tasks = [
    ['Aceleração do mouse', disableMouseAcceleration],
    ['Plano de energia', setHighPerformancePowerPlan],
    ['Core parking', disableCoreParking],
    ['Game DVR', disableGameDVR],
    ['Efeitos visuais', optimizeVisualEffects],
    ['Rede', optimizeNetwork],
    ['Telemetria', disableTelemetry]
  ];
  for (const [name, fn] of tasks) {
    try { await fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, message: String(e.message || e) }); }
  }
  return results;
}

// Guard for non-Windows platforms
function requireWindows(fn, fallbackMsg) {
  return async () => {
    if (!isWindows()) {
      return { ok: false, message: fallbackMsg || 'Otimização disponível apenas no Windows.' };
    }
    try {
      await fn();
      return { ok: true, message: 'Aplicado com sucesso.' };
    } catch (e) {
      let errMsg = String(e.message || e);
      
      if (errMsg.includes('Acesso negado') || errMsg.includes('Access is denied') || errMsg.includes('E_ACCESSDENIED')) {
        return { ok: false, message: 'Permissão negada. Execute como Administrador.' };
      }
      
      if (errMsg.includes('cannot find the file') || errMsg.includes('não pode encontrar o arquivo')) {
        return { ok: false, message: 'Arquivo não encontrado.' };
      }
      
      const lines = errMsg.split('\n');
      const lastLine = lines[lines.length - 1].trim();
      
      if (errMsg.length > 150) {
        return { ok: false, message: lastLine || 'Falha ao aplicar otimização.' };
      }
      
      return { ok: false, message: lastLine || 'Erro ao aplicar.' };
    }
  };
}

// --- Notifications ---
function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: path.join(__dirname, '..', 'public', 'logo.svg') }).show();
  }
}

// --- Auto Update ---
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
  
  // Check for updates every 30 minutes
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 30 * 60 * 1000);
}

// IPC handlers
ipcMain.handle('app:info', () => ({
  platform: process.platform,
  version: app.getVersion(),
  os: `${os.type()} ${os.release()}`,
  arch: os.arch(),
  windows: isWindows()
}));

ipcMain.handle('app:check-updates', async () => {
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('stats:fetch', async () => {
  return await fetchStats();
});

ipcMain.handle('stats:report', async (event, data) => {
  return await postToStatsServer('/api/optimizations', data);
});

// Original optimizations
ipcMain.handle('opt:disable-mouse-accel', requireWindows(disableMouseAcceleration, 'Desativar aceleração do mouse requer Windows.'));
ipcMain.handle('opt:high-perf-power', requireWindows(setHighPerformancePowerPlan, 'Plano de energia requer Windows.'));
ipcMain.handle('opt:disable-gamedvr', requireWindows(disableGameDVR, 'Desativar Game DVR requer Windows.'));
ipcMain.handle('opt:visual-effects', requireWindows(optimizeVisualEffects, 'Efeitos visuais requer Windows.'));
ipcMain.handle('opt:clean-ram', requireWindows(cleanStandbyMemory, 'Limpeza de RAM requer Windows.'));
ipcMain.handle('opt:network', requireWindows(optimizeNetwork, 'Otimização de rede requer Windows.'));
ipcMain.handle('opt:monitor-refresh', requireWindows(setMonitorRefreshRate, 'Ajuste de refresh rate requer Windows.'));
ipcMain.handle('opt:polling-rate', requireWindows(setPollingRate, 'Ajuste de polling rate requer Windows.'));

// New optimizations
ipcMain.handle('opt:cpu-core-parking', requireWindows(disableCoreParking, 'Core parking requer Windows.'));
ipcMain.handle('opt:cpu-scheduler', requireWindows(optimizeCPUScheduler, 'Scheduler requer Windows.'));
ipcMain.handle('opt:mouse-threshold', requireWindows(setMouseThreshold, 'Mouse threshold requer Windows.'));
ipcMain.handle('opt:disable-fullscreen-opt', requireWindows(disableFullscreenOptimizations, 'Fullscreen optimizations requer Windows.'));
ipcMain.handle('opt:dns-cloudflare', requireWindows(setDNSCloudflare, 'DNS requer Windows.'));
ipcMain.handle('opt:qos-disable', requireWindows(disableQoSThrottling, 'QoS requer Windows.'));
ipcMain.handle('opt:disable-telemetry', requireWindows(disableTelemetry, 'Telemetria requer Windows.'));
ipcMain.handle('opt:disable-updates', requireWindows(pauseWindowsUpdates, 'Updates requer Windows.'));

ipcMain.handle('opt:apply-all', async () => {
  const results = await applyAllOptimizations();
  
  // Report to stats server
  for (const r of results.filter(r => r.ok)) {
    await postToStatsServer('/api/optimizations', {
      name: r.name,
      game: 'system',
      category: 'performance',
      version: app.getVersion(),
      applied_by: 'desktop-user'
    });
  }
  
  // Show notification
  const successCount = results.filter(r => r.ok).length;
  showNotification('Honest Boost', `${successCount} otimizações aplicadas com sucesso!`);
  
  return results;
});

// Gaming mode
ipcMain.handle('gaming:enable', async () => {
  const results = await enableGamingMode();
  showNotification('Modo Gaming', 'PC otimizado para jogos! Processos desnecessários fechados.');
  return results;
});

ipcMain.handle('gaming:disable', async () => {
  return await disableGamingMode();
});

// Notification
ipcMain.handle('notify', (event, { title, body }) => {
  showNotification(title, body);
  return { ok: true };
});

// App authentication with site API
ipcMain.handle('app:auth', async (event, key) => {
  try {
    const response = await fetch(`${STATS_SERVER_URL.replace('3001', '3000')}/api/app/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, deviceInfo: 'desktop-app' })
    });
    const data = await response.json();
    return data;
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('app:logout', async () => {
  // Could call /api/app/logout here if we stored the key
  return { ok: true };
});

// --- Window ---
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
  
  // Prevent navigation to external URLs (open in system browser instead)
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
  
  // Setup auto-updater after window is created
  setupAutoUpdater();
  
  // Check for updates on startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 3000);
}

// Menu
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

// Check if running as admin (recommended for optimizations)
function isAdmin() {
  try {
    const { execSync } = require('child_process');
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Check if running as admin
function isAdmin() {
  try {
    const { execSync } = require('child_process');
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

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
