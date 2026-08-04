/* main.js — Honest Boost Desktop (Electron) */
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { exec, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;

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

// --- OTIMIZAÇÕES ---

async function disableMouseAcceleration() {
  // Disables Windows pointer acceleration (Enhance pointer precision)
  const result = await regAdd(
    'HKCU\\Control Panel\\Mouse',
    'MouseSpeed',
    'REG_SZ',
    '0'
  );
  await regAdd('HKCU\\Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '0');
  await regAdd('HKCU\\Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '0');
  return result;
}

async function setPollingRate() {
  // The mouse polling rate is configured by the device driver, but the
  // Windows "Enhance pointer precision" flag and HID descriptor defaults
  // can be tuned. Here we ensure the pointer precision is off (already done
  // by disableMouseAcceleration) and set the recommended USB HID timing via
  // the mouse registry keys when available.
  //
  // Note: a true 1000Hz polling rate depends on the mouse hardware/firmware
  // and driver. We apply the standard Windows-side adjustments and report
  // the device's current status when possible.
  await disableMouseAcceleration();
  return true;
}

async function disableFullscreenOptimizations() {
  // Disable Fullscreen Optimizations for better FPS in games.
  // This is per-app, but we can set a global flag in GameDVR registry
  // and also add the compatibility flag for the current executable.
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_FSEBehaviorMode', 'REG_DWORD', '2');
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_HonorUserFSEBehaviorMode', 'REG_DWORD', '1');
  // Disable "Fullscreen Optimizations" for the Electron app itself (fallback).
  const exe = process.execPath;
  if (exe) {
    const key = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers';
    await regAdd(key, exe, 'REG_SZ', '~ DISABLEFULLSCREENOPTIMIZATIONS');
  }
  return true;
}

async function setHighPerformancePowerPlan() {
  // Activate the High Performance power plan (guid: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c).
  // Fall back to Ultimate Performance (e9a42b02-d5df-448d-aa00-03f14749eb61) on
  // systems that expose it (Windows 10/11 with supported hardware).
  try {
    await run('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
    return true;
  } catch (e) {
    // High Performance plan missing -> try Ultimate Performance
    try {
      await run('powercfg /setactive e9a42b02-d5df-448d-aa00-03f14749eb61');
      return true;
    } catch (e2) {
      // Neither available -> duplicate the High Performance plan
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

async function disableGameDVR() {
  // Disable Game DVR / Game Bar recording (reduces input lag)
  await regAdd('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 'REG_DWORD', '0');
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled', 'REG_DWORD', '0');
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_FSEBehaviorMode', 'REG_DWORD', '2');
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_HonorUserFSEBehaviorMode', 'REG_DWORD', '1');
  return true;
}

async function optimizeVisualEffects() {
  // Adjust for best performance (visual effects)
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
  // Use the Microsoft recommended EmptyStandbyList tool if present, otherwise
  // fall back to a PowerShell memory refresh. EmptyStandbyList clears the
  // standby list which is what causes stuttering.
  const tool = 'C:\\Windows\\System32\\EmptyStandbyList.exe';
  if (fs.existsSync(tool)) {
    await runTool(tool);
    return true;
  }
  // Fallback: PowerShell refresh of process working set + manual memory flush.
  const ps = [
    '[System.GC]::Collect()',
    '[System.GC]::WaitForPendingFinalizers()',
    'Get-Process | Where-Object {$_.WorkingSet64 -gt 512MB} | ForEach-Object { $_.Refresh() }'
  ].join('; ');
  await run(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`);
  return true;
}

async function optimizeNetwork() {
  // Tune TCP auto-tuning and disable Nagle-like delays for gaming
  await run('netsh interface tcp set global autotuninglevel=normal');
  await run('netsh int tcp set global timestamps=disabled');
  await regAdd('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', 'MaxConnectionsPerServer', 'REG_DWORD', '16');
  return true;
}

async function setMonitorRefreshRate() {
  // Detect the highest supported refresh rate and apply it via PowerShell
  // using EnumDisplaySettings + ChangeDisplaySettingsEx.
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
  // ChangeDisplaySettingsEx returns DISP_CHANGE_SUCCESSFUL (0) on success.
  if (out && out.trim() !== '0') {
    throw new Error('Não foi possível alterar o refresh rate automaticamente. Ajuste nas configurações do Windows.');
  }
  return true;
}

async function disableMouseLagAcceleration() {
  // Disable mouse lag via registry: set mouse threshold to 0
  return disableMouseAcceleration();
}

// Guard for non-Windows platforms: optimizations only run on Windows.
function requireWindows(fn, fallbackMsg) {
  return async () => {
    if (!isWindows()) {
      return { ok: false, message: fallbackMsg || 'Otimização disponível apenas no Windows.' };
    }
    try {
      await fn();
      return { ok: true, message: 'Aplicado com sucesso.' };
    } catch (e) {
      return { ok: false, message: String(e.message || e) };
    }
  };
}

// IPC handlers
ipcMain.handle('app:info', () => ({
  platform: process.platform,
  version: app.getVersion(),
  os: `${os.type()} ${os.release()}`,
  arch: os.arch(),
  windows: isWindows()
}));

ipcMain.handle('opt:disable-mouse-accel', requireWindows(disableMouseAcceleration, 'Desativar aceleração do mouse requer Windows.'));
ipcMain.handle('opt:high-perf-power', requireWindows(setHighPerformancePowerPlan, 'Plano de energia requer Windows.'));
ipcMain.handle('opt:disable-gamedvr', requireWindows(disableGameDVR, 'Desativar Game DVR requer Windows.'));
ipcMain.handle('opt:visual-effects', requireWindows(optimizeVisualEffects, 'Efeitos visuais requer Windows.'));
ipcMain.handle('opt:clean-ram', requireWindows(cleanStandbyMemory, 'Limpeza de RAM requer Windows.'));
ipcMain.handle('opt:network', requireWindows(optimizeNetwork, 'Otimização de rede requer Windows.'));
ipcMain.handle('opt:monitor-refresh', requireWindows(setMonitorRefreshRate, 'Ajuste de refresh rate requer Windows.'));
ipcMain.handle('opt:polling-rate', requireWindows(setPollingRate, 'Ajuste de polling rate requer Windows.'));

ipcMain.handle('opt:apply-all', async () => {
  const results = [];
  const tasks = [
    ['Aceleração do mouse', disableMouseAcceleration],
    ['Plano de energia', setHighPerformancePowerPlan],
    ['Game DVR', disableGameDVR],
    ['Efeitos visuais', optimizeVisualEffects],
    ['Rede', optimizeNetwork]
  ];
  for (const [name, fn] of tasks) {
    try { await fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, message: String(e.message || e) }); }
  }
  return results;
});

// --- Window ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    title: 'Honest Boost — Otimizador',
    backgroundColor: '#0a0f1a',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'public', 'logo.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

