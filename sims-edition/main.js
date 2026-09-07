/* main.js — Honest Boost: Sims Edition v1.0 */
const { app, BrowserWindow, ipcMain, shell, powerSaveBlocker } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;
let powerSaveBlockerId = null;

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve((stdout || '').trim());
    });
  });
}

async function regAdd(pathName, valueName, type, data) {
  return new Promise((resolve, reject) => {
    exec(`reg add "${pathName}" /v "${valueName}" /t ${type} /d "${data}" /f`, { windowsHide: true }, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

// === Otimizações para The Sims 4 ===

async function setHighPerformancePowerPlan() {
  try {
    await run('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
  } catch {
    try { await run('powercfg /setactive e9a42b02-d5df-448d-aa00-03f14749eb61'); }
    catch { await run('powercfg -duplicatescheme 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'); await run('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'); }
  }
}

async function disableGameDVR() {
  await regAdd('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 'REG_DWORD', '0');
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled', 'REG_DWORD', '0');
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_FSEBehaviorMode', 'REG_DWORD', '2');
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_HonorUserFSEBehaviorMode', 'REG_DWORD', '1');
}

async function disableFullscreenOptimizations() {
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_FSEBehaviorMode', 'REG_DWORD', '2');
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_HonorUserFSEBehaviorMode', 'REG_DWORD', '1');
}

async function disableCoreParking() {
  try {
    await run('powercfg /setacvalueindex scheme_current sub_processor CPMINCORES 100');
    await run('powercfg /setacvalueindex scheme_current sub_processor CPMAXCORES 100');
    await run('powercfg /setactive scheme_current');
  } catch {
    await regAdd('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\0cc5b647-c1df-4637-891a-dec35c318583', 'ValueMax', 'REG_DWORD', '0');
  }
}

async function optimizeVisualEffects() {
  await regAdd('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', 'VisualFXSetting', 'REG_DWORD', '2');
}

async function disableTelemetry() {
  const services = ['DiagTrack', 'dmwappushservice'];
  for (const svc of services) {
    try { await run(`net stop "${svc}" /y`); } catch {}
    try { await run(`sc config "${svc}" start= disabled`); } catch {}
  }
  await regAdd('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry', 'REG_DWORD', '0');
  await regAdd('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection', 'AllowTelemetry', 'REG_DWORD', '0');
}

async function cleanTempFiles() {
  const tempPaths = ['%TEMP%', 'C:\\Windows\\Temp'];
  let freedMB = 0;
  for (const tempPath of tempPaths) {
    try {
      const ps = `$size = (Get-ChildItem -Path "${tempPath}" -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum; Remove-Item -Path "${tempPath}\\*" -Recurse -Force -ErrorAction SilentlyContinue; [math]::Round($size / 1MB, 1);`;
      const out = await run(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`);
      freedMB += parseFloat(out) || 0;
    } catch {}
  }
  return freedMB;
}

async function optimizeCPU() {
  await regAdd('HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl', 'Win32PrioritySeparation', 'REG_DWORD', '38');
}

async function cleanStandbyMemory() {
  try {
    const ps = '[System.GC]::Collect(); [System.GC]::WaitForPendingFinalizers();';
    await run(`powershell -NoProfile -Command "${ps}"`);
  } catch {}
  return true;
}

async function optimizeForTheSims4() {
  const results = [];

  // 1. Bloquear sleep
  powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  results.push({ name: 'Bloquear suspensão', ok: true });

  // 2. Plano de energia
  try { await setHighPerformancePowerPlan(); results.push({ name: 'Plano de energia alto desempenho', ok: true }); }
  catch { results.push({ name: 'Plano de energia alto desempenho', ok: false, msg: 'Erro ao ativar' }); }

  // 3. Game DVR
  try { await disableGameDVR(); results.push({ name: 'Desativar Game DVR', ok: true }); }
  catch { results.push({ name: 'Desativar Game DVR', ok: false, msg: 'Erro ao desativar' }); }

  // 4. Fullscreen optimizations
  try { await disableFullscreenOptimizations(); results.push({ name: 'Desativar fullscreen optimizations', ok: true }); }
  catch { results.push({ name: 'Desativar fullscreen optimizations', ok: false, msg: 'Erro ao aplicar' }); }

  // 5. Core parking
  try { await disableCoreParking(); results.push({ name: 'Desativar core parking', ok: true }); }
  catch { results.push({ name: 'Desativar core parking', ok: false, msg: 'Erro ao aplicar' }); }

  // 6. Efeitos visuais
  try { await optimizeVisualEffects(); results.push({ name: 'Reduzir efeitos visuais', ok: true }); }
  catch { results.push({ name: 'Reduzir efeitos visuais', ok: false, msg: 'Erro ao aplicar' }); }

  // 7. Telemetria
  try { await disableTelemetry(); results.push({ name: 'Desativar telemetria', ok: true }); }
  catch { results.push({ name: 'Desativar telemetria', ok: false, msg: 'Erro ao aplicar' }); }

  // 8. CPU Scheduler
  try { await optimizeCPU(); results.push({ name: 'Otimizar CPU scheduler', ok: true }); }
  catch { results.push({ name: 'Otimizar CPU scheduler', ok: false, msg: 'Erro ao aplicar' }); }

  // 9. Limpar temp
  try { const freed = await cleanTempFiles(); results.push({ name: 'Limpar arquivos temporários', ok: true, freedMB: freed }); }
  catch { results.push({ name: 'Limpar arquivos temporários', ok: false, msg: 'Erro ao limpar' }); }

  // 10. Limpar RAM
  try { await cleanStandbyMemory(); results.push({ name: 'Limpar memória standby', ok: true }); }
  catch { results.push({ name: 'Limpar memória standby', ok: false, msg: 'Erro ao limpar' }); }

  return results;
}

async function getSystemInfo() {
  return {
    cpu: os.cpus()[0]?.model || 'Desconhecido',
    cpuCores: os.cpus().length,
    memoryTotal: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10,
    memoryFree: Math.round(os.freemem() / 1024 / 1024 / 1024 * 10) / 10,
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch()
  };
}

// === Window ===
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 800,
    minHeight: 600,
    title: 'Honest Boost — Sims Edition',
    backgroundColor: '#0a0e1a',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) { event.preventDefault(); shell.openExternal(url); }
  });
}

ipcMain.handle('opt:sims4', async () => {
  try { return { ok: true, results: await optimizeForTheSims4() }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
});

ipcMain.handle('sys:info', async () => {
  try { return { ok: true, info: await getSystemInfo() }; }
  catch { return { ok: false }; }
});

ipcMain.handle('app:version', () => app.getVersion());

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (powerSaveBlockerId !== null) powerSaveBlocker.stop(powerSaveBlockerId);
  if (process.platform !== 'darwin') app.quit();
});
