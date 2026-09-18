/**
 * desktop/src/benchmarkEngine.js — Motor de Benchmark
 * Mede performance real do sistema antes/depois das otimizações
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { cimCsv } = require('./cim');

let baselineData = null;
let afterData = null;

// ==================== CPU Benchmark ====================
async function measureCPU() {
  const startUsage = os.cpus();
  await new Promise(resolve => setTimeout(resolve, 1000));
  const endUsage = os.cpus();
  
  let totalIdle = 0;
  let totalTick = 0;
  
  for (let i = 0; i < startUsage.length; i++) {
    const start = startUsage[i];
    const end = endUsage[i];
    
    const idle = end.times.idle - start.times.idle;
    const tick = (end.times.user + end.times.nice + end.times.sys + end.times.idle + end.times.irq) -
                 (start.times.user + start.times.nice + start.times.sys + start.times.idle + start.times.irq);
    
    totalIdle += idle;
    totalTick += tick;
  }
  
  const usagePercent = totalTick > 0 ? Math.round((1 - totalIdle / totalTick) * 100) : 0;
  
  return {
    usagePercent,
    cores: os.cpus().length,
    speed: os.cpus()[0]?.speed || 0
  };
}

// ==================== RAM Benchmark ====================
async function measureRAM() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  
  return {
    totalGB: Math.round(total / 1024 / 1024 / 1024 * 10) / 10,
    usedGB: Math.round(used / 1024 / 1024 / 1024 * 10) / 10,
    freeGB: Math.round(free / 1024 / 1024 / 1024 * 10) / 10,
    usagePercent: Math.round(used / total * 100)
  };
}

// ==================== Disk Benchmark ====================
async function measureDisk() {
  try {
    const output = await cimCsv('Win32_LogicalDisk', 'Size,FreeSpace', { filter: 'DriveType=3' });
    const lines = output.split(/\r?\n/).filter(l => l.trim());
    
    let totalSize = 0;
    let totalFree = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 3) {
        totalSize += parseInt(parts[1], 10) || 0;
        totalFree += parseInt(parts[2], 10) || 0;
      }
    }
    
    return {
      totalGB: Math.round(totalSize / 1024 / 1024 / 1024 * 10) / 10,
      freeGB: Math.round(totalFree / 1024 / 1024 / 1024 * 10) / 10,
      usedGB: Math.round((totalSize - totalFree) / 1024 / 1024 / 1024 * 10) / 10
    };
  } catch {
    return { totalGB: 0, freeGB: 0, usedGB: 0 };
  }
}

// ==================== GPU Usage (basic WMI) ====================
async function measureGPU() {
  try {
    const output = await cimCsv('Win32_VideoController', 'Name,AdapterRAM');
    const lines = output.split(/\r?\n/).filter(l => l.trim());
    
    if (lines.length >= 2) {
      const parts = lines[1].split(',');
      return {
        name: parts[1]?.trim() || 'Unknown',
        vramMB: Math.round((parseInt(parts[2], 10) || 0) / 1024 / 1024)
      };
    }
  } catch {}
  
  return { name: 'Unknown', vramMB: 0 };
}

// ==================== Network Benchmark ====================
async function measureNetwork() {
  const { execFile: exec } = require('child_process');
  
  return new Promise((resolve) => {
    const start = Date.now();
    exec('C:\\Windows\\System32\\ping.exe', ['-n', '1', '-w', '3000', '1.1.1.1'], { windowsHide: true }, (err, stdout) => {
      const latency = Date.now() - start;
      
      if (err) {
        resolve({ ping: -1, jitter: 0, packetLoss: 100 });
        return;
      }
      
      // Parse ping output
      const timeMatch = stdout.match(/time[=<](\d+)ms/);
      const ping = timeMatch ? parseInt(timeMatch[1], 10) : latency;
      
      resolve({
        ping,
        jitter: 0, // Would need multiple pings
        packetLoss: stdout.match(/100% loss/) ? 100 : 0
      });
    });
  });
}

// ==================== Full Benchmark ====================
async function runBenchmark() {
  const [cpu, ram, disk, gpu, network] = await Promise.all([
    measureCPU(),
    measureRAM(),
    measureDisk(),
    measureGPU(),
    measureNetwork()
  ]);
  
  return {
    timestamp: new Date().toISOString(),
    cpu,
    ram,
    disk,
    gpu,
    network
  };
}

// ==================== Performance Score ====================
function calculateScore(data) {
  if (!data) return 0;
  
  // CPU: lower usage = better (inverted, max 25 points)
  const cpuScore = Math.max(0, 25 - Math.floor(data.cpu.usagePercent / 4));
  
  // RAM: lower usage = better (max 25 points)
  const ramScore = Math.max(0, 25 - Math.floor(data.ram.usagePercent / 4));
  
  // Disk: more free space = better (max 25 points)
  const diskScore = data.disk.totalGB > 0 
    ? Math.max(0, 25 - Math.floor((data.disk.usedGB / data.disk.totalGB) * 25))
    : 12;
  
  // Network: lower ping = better (max 25 points)
  const netScore = data.network.ping > 0 
    ? Math.max(0, 25 - Math.floor(data.network.ping / 10))
    : 12;
  
  return Math.min(100, cpuScore + ramScore + diskScore + netScore);
}

// ==================== Baseline / After Comparison ====================
async function captureBaseline() {
  baselineData = await runBenchmark();
  return baselineData;
}

async function captureAfter() {
  afterData = await runBenchmark();
  return afterData;
}

function getComparison() {
  if (!baselineData || !afterData) return null;
  
  return {
    cpu: {
      before: baselineData.cpu.usagePercent,
      after: afterData.cpu.usagePercent,
      delta: afterData.cpu.usagePercent - baselineData.cpu.usagePercent
    },
    ram: {
      before: baselineData.ram.usagePercent,
      after: afterData.ram.usagePercent,
      delta: afterData.ram.usagePercent - baselineData.ram.usagePercent
    },
    network: {
      before: baselineData.network.ping,
      after: afterData.network.ping,
      delta: afterData.network.ping - baselineData.network.ping
    },
    score: {
      before: calculateScore(baselineData),
      after: calculateScore(afterData),
      delta: calculateScore(afterData) - calculateScore(baselineData)
    }
  };
}

// ==================== History ====================
function historyFile() {
  return path.join(app.getPath('userData'), 'benchmark-history.json');
}

async function saveToHistory(entry) {
  try {
    const file = historyFile();
    let history = [];
    try {
      history = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    } catch {}
    
    history.push({
      ...entry,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 50 entries
    if (history.length > 50) history = history.slice(-50);
    
    await fs.promises.writeFile(file, JSON.stringify(history, null, 2), 'utf8');
  } catch {}
}

async function getHistory() {
  try {
    const file = historyFile();
    return JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } catch {
    return [];
  }
}

module.exports = {
  runBenchmark,
  calculateScore,
  captureBaseline,
  captureAfter,
  getComparison,
  saveToHistory,
  getHistory
};
