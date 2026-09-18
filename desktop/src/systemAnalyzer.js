/**
 * desktop/src/systemAnalyzer.js — Análise completa do sistema
 * Coleta informações reais de hardware, Windows e gaming
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const { cimCsv } = require('./cim');

// ==================== CPU ====================
async function getCPUInfo() {
  try {
    const output = await cimCsv('Win32_Processor', 'Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed');
    const lines = output.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return null;
    
    const parts = lines[1].split(',');
    return {
      name: parts[1]?.trim() || 'Unknown',
      cores: parseInt(parts[2], 10) || os.cpus().length,
      threads: parseInt(parts[3], 10) || os.cpus().length,
      maxClock: parseInt(parts[4], 10) || 0,
      architecture: os.arch()
    };
  } catch {
    return {
      name: os.cpus()[0]?.model || 'Unknown',
      cores: os.cpus().length,
      threads: os.cpus().length,
      maxClock: 0,
      architecture: os.arch()
    };
  }
}

// ==================== GPU ====================
async function getGPUInfo() {
  try {
    const output = await cimCsv('Win32_VideoController', 'Name,AdapterRAM,DriverVersion');
    const lines = output.split(/\r?\n/).filter(l => l.trim());
    const gpus = [];
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 4) {
        gpus.push({
          name: parts[1]?.trim() || 'Unknown',
          vram: parseInt(parts[2], 10) || 0,
          driver: parts[3]?.trim() || 'Unknown'
        });
      }
    }
    return gpus;
  } catch {
    return [{ name: 'Unknown', vram: 0, driver: 'Unknown' }];
  }
}

// ==================== RAM ====================
async function getRAMInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  
  try {
    const output = await cimCsv('Win32_PhysicalMemory', 'Capacity,Speed,Manufacturer');
    const lines = output.split(/\r?\n/).filter(l => l.trim());
    const sticks = [];
    let totalCapacity = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 4) {
        const capacity = parseInt(parts[1], 10) || 0;
        totalCapacity += capacity;
        sticks.push({
          capacity,
          speed: parseInt(parts[2], 10) || 0,
          manufacturer: parts[3]?.trim() || 'Unknown'
        });
      }
    }
    
    return {
      total,
      free,
      used: total - free,
      totalGB: Math.round(total / 1024 / 1024 / 1024 * 10) / 10,
      freeGB: Math.round(free / 1024 / 1024 / 1024 * 10) / 10,
      usedGB: Math.round((total - free) / 1024 / 1024 / 1024 * 10) / 10,
      usagePercent: Math.round((total - free) / total * 100),
      sticks
    };
  } catch {
    return {
      total,
      free,
      used: total - free,
      totalGB: Math.round(total / 1024 / 1024 / 1024 * 10) / 10,
      freeGB: Math.round(free / 1024 / 1024 / 1024 * 10) / 10,
      usedGB: Math.round((total - free) / 1024 / 1024 / 1024 * 10) / 10,
      usagePercent: Math.round((total - free) / total * 100),
      sticks: []
    };
  }
}

// ==================== Storage ====================
async function getStorageInfo() {
  try {
    const output = await cimCsv('Win32_LogicalDisk', 'DeviceID,Size,FreeSpace,FileSystem', { filter: 'DriveType=3' });
    const lines = output.split(/\r?\n/).filter(l => l.trim());
    const drives = [];
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 5 && parts[1]) {
        const total = parseInt(parts[2], 10) || 0;
        const free = parseInt(parts[3], 10) || 0;
        drives.push({
          drive: parts[1].trim(),
          filesystem: parts[4]?.trim() || 'Unknown',
          total,
          free,
          used: total - free,
          totalGB: Math.round(total / 1024 / 1024 / 1024 * 10) / 10,
          freeGB: Math.round(free / 1024 / 1024 / 1024 * 10) / 10,
          usagePercent: total > 0 ? Math.round((total - free) / total * 100) : 0
        });
      }
    }
    return drives;
  } catch {
    return [];
  }
}

// ==================== Monitor ====================
async function getMonitorInfo() {
  try {
    const output = await cimCsv('Win32_VideoController', 'CurrentRefreshRate,CurrentHorizontalResolution,CurrentVerticalResolution');
    const lines = output.split(/\r?\n/).filter(l => l.trim());
    const monitors = [];
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 4) {
        monitors.push({
          refreshRate: parseInt(parts[1], 10) || 0,
          resolution: `${parts[2]?.trim() || '?'}x${parts[3]?.trim() || '?'}`
        });
      }
    }
    return monitors;
  } catch {
    return [{ refreshRate: 60, resolution: 'Unknown' }];
  }
}

// ==================== Windows ====================
async function getWindowsInfo() {
  const release = os.release();
  const build = release.split('.')[2] || 'Unknown';
  
  return {
    version: release,
    build,
    platform: os.platform(),
    hostname: os.hostname(),
    uptime: os.uptime(),
    username: os.userInfo().username
  };
}

// ==================== Power Plan ====================
async function getPowerPlan() {
  const { execFile: exec } = require('child_process');
  return new Promise((resolve) => {
    exec('C:\\Windows\\System32\\powercfg.exe', ['/getactivescheme'], { windowsHide: true }, (err, stdout) => {
      if (err) {
        resolve({ name: 'Unknown', guid: 'Unknown', isHighPerformance: false });
        return;
      }
      const match = stdout.match(/:\s+(.+?)\s+\(([a-f0-9-]+)\)/i);
      const name = match ? match[1].trim() : 'Unknown';
      const guid = match ? match[2] : 'Unknown';
      const isHighPerformance = /high performance|ultimate performance|alto desempenho|desempenho máximo/i.test(name);
      resolve({ name, guid, isHighPerformance });
    });
  });
}

// ==================== Game DVR Status ====================
async function getGameDVRStatus() {
  const { execFile: exec } = require('child_process');
  return new Promise((resolve) => {
    exec('C:\\Windows\\System32\\reg.exe', ['query', 'HKCU\\System\\GameConfigStore', '/v', 'GameDVR_Enabled'], { windowsHide: true }, (err, stdout) => {
      if (err) {
        resolve({ enabled: false, exists: false });
        return;
      }
      const match = stdout.match(/0x(\d+)/);
      const value = match ? parseInt(match[1], 16) : 0;
      resolve({ enabled: value !== 0, exists: true, value });
    });
  });
}

// ==================== Mouse Acceleration ====================
async function getMouseAcceleration() {
  const { execFile: exec } = require('child_process');
  return new Promise((resolve) => {
    exec('C:\\Windows\\System32\\reg.exe', ['query', 'HKCU\\Control Panel\\Mouse', '/v', 'MouseSpeed'], { windowsHide: true }, (err, stdout) => {
      if (err) {
        resolve({ enabled: false, exists: false });
        return;
      }
      const match = stdout.match(/0x(\d+)/);
      const value = match ? parseInt(match[1], 16) : 0;
      resolve({ enabled: value !== '0', exists: true, value });
    });
  });
}

// ==================== Full System Scan ====================
async function fullSystemScan() {
  const [
    cpu, gpu, ram, storage, monitors, windows,
    powerPlan, gameDVR, mouseAccel
  ] = await Promise.all([
    getCPUInfo(),
    getGPUInfo(),
    getRAMInfo(),
    getStorageInfo(),
    getMonitorInfo(),
    getWindowsInfo(),
    getPowerPlan(),
    getGameDVRStatus(),
    getMouseAcceleration()
  ]);

  return {
    timestamp: new Date().toISOString(),
    cpu,
    gpu,
    ram,
    storage,
    monitors,
    windows,
    powerPlan,
    gameDVR,
    mouseAccel
  };
}

module.exports = {
  getCPUInfo,
  getGPUInfo,
  getRAMInfo,
  getStorageInfo,
  getMonitorInfo,
  getWindowsInfo,
  getPowerPlan,
  getGameDVRStatus,
  getMouseAcceleration,
  fullSystemScan
};
