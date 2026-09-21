// ============================================================
// realtimeMonitor.js — Honest Boost
// Coleta de métricas em tempo real: CPU, RAM, Disco, Rede, GPU, Temperatura
// issued entirely from Node.js (main process) — zero renderer dependency.
// ============================================================
'use strict';

const cim = require('./cim');
const os = require('os');
const { execFile, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// plataforma
const IS_WIN = process.platform === 'win32';
const SYS_ROOT = process.env.SystemRoot || 'C:\\Windows';

// ============================================================
// CPU
// ============================================================
function cpuTick() {
  const m = os.cpus();
  let idle = 0, total = 0;
  for (const core of m) {
    for (const t of Object.values(core.times)) total += t;
    idle += core.times.idle;
  }
  return { total, idle, cores: m.length };
}

let _prev = cpuTick();
let _prevTs = Date.now();

function cpuUsage() {
  const cur = cpuTick();
  const curTs = Date.now();
  const dt = curTs - _prevTs || 100;
  const dTotal = cur.total - _prev.total;
  const dIdle  = cur.idle  - _prev.idle;
  _prev = cur;
  _prevTs = curTs;
  const usage = dTotal > 0 ? ((dTotal - dIdle) / dTotal) * 100 : 0;
  return Math.min(100, Math.max(0, usage));
}

// Carga média do sistema (1/5/15 min)
function loadAverage() {
  if (IS_WIN) {
    try {
      const out = cimCsv('Win32_OperatingSystem', 'LoadPercentage');
      const lines = out.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return null;
      const m = lines[1].match(/LoadPercentage="?([^",]+)"?$/);
      return m ? parseInt(m[1], 10) : null;
    } catch { return null; }
  }
  return os.loadavg ? os.loadavg()[0] : null;
}

// ============================================================
// RAM
// ============================================================
function ramStats() {
  const mem = process.memoryUsage ? process.memoryUsage() : {};
  const total = os.totalmem();
  const free  = os.freemem();
  const used  = total - free;
  const pct   = (used / total) * 100;
  return {
    total,
    free,
    used,
    pct: Math.min(100, Math.max(0, pct)),
    nodeUsed: mem.heapUsed || 0,
    nodeTotal: mem.heapTotal || 0,
  };
}

// ============================================================
// Disco (escrita/leitura em tempo real via performance counters do Windows)
// ============================================================
let _diskPrev = null;

function diskIO() {
  if (!_diskPrev) _diskPrev = { read: 0, write: 0, ts: Date.now() };
  if (!IS_WIN) return { readMBps: 0, writeMBps: 0 };

  try {
    const out = execSync(
      'typeperf -sc 1 "\\PhysicalDisk(_Total)\\Disk Read Bytes/sec" "\\PhysicalDisk(_Total)\\Disk Write Bytes/sec"',
      { encoding: 'utf8', windowsHide: true, timeout: 5000 }
    );
    const lines = out.split('\n').filter(l => l.includes('Disk Read') || l.includes('Disk Write'));
    let read = 0, write = 0;
    for (const l of lines) {
      const m = l.match(/,"([^"]+)"/);
      if (m) {
        const v = parseFloat(m[1]);
        if (l.includes('Read')) read = isNaN(v) ? 0 : v;
        if (l.includes('Write')) write = isNaN(v) ? 0 : v;
      }
    }
    const now = Date.now();
    const dt = (now - _diskPrev.ts) / 1000 || 1;
    const readMBps = (read - _diskPrev.read) / 1_048_576 / dt;
    const writeMBps = (write - _diskPrev.write) / 1_048_576 / dt;
    _diskPrev = { read, write, ts: now };
    return {
      readMBps: Math.max(0, readMBps),
      writeMBps: Math.max(0, writeMBps),
    };
  } catch {
    return { readMBps: 0, writeMBps: 0 };
  }
}

// ============================================================
// Rede (throughput em tempo real)
// ============================================================
let _netPrev = null;

function networkIO() {
  if (!_netPrev) {
    const ifs = Object.values(os.networkInterfaces());
    let rx = 0, tx = 0;
    for (const iface of ifs) {
      for (const addr of iface) {
        rx += addr ? (addr.receiveBytes || 0) : 0;
        tx += addr ? (addr.transmitBytes || 0) : 0;
      }
    }
    _netPrev = { rx, tx, ts: Date.now() };
    return { rxMBps: 0, txMBps: 0 };
  }

  const ifs = Object.values(os.networkInterfaces());
  let rx = 0, tx = 0;
  for (const iface of ifs) {
    for (const addr of iface) {
      rx += addr ? (addr.receiveBytes || 0) : 0;
      tx += addr ? (addr.transmitBytes || 0) : 0;
    }
  }

  const now = Date.now();
  const dt = (now - _netPrev.ts) / 1000 || 1;
  const rxMBps = (rx - _netPrev.rx) / 1_048_576 / dt;
  const txMBps = (tx - _netPrev.tx) / 1_048_576 / dt;
  _netPrev = { rx, tx, ts: now };
  return {
    rxMBps: Math.max(0, rxMBps),
    txMBps: Math.max(0, txMBps),
  };
}

// ============================================================
// GPU (via CIM — NVIDIA/AMD/Intel)
function gpuStats() {
  if (!IS_WIN) return { name: 'Desconhecida', vram: 0, usage: 0, temperature: null, memoryUsed: 0 };

  try {
    const out = cimCsv('Win32_VideoController', 'Name,DriverVersion,AdapterRAM');
    const lines = out.split(/\r?\n/).filter(l => l.trim());
    const nameM = lines[1]?.match(/Name="?([^",]+)"?$/);
    const vramM = lines[1]?.match(/AdapterRAM="?([0-9,]+)"?$/);
    const rawVRAM = vramM ? parseInt(vramM[1].replace(/,/g, ''), 10) : 0;
    const name = nameM ? nameM[1].trim() : 'Desconhecida';
    return { name, vram: rawVRAM, usage: 0, temperature: null, memoryUsed: 0 };
  } catch {
    return { name: 'Desconhecida', vram: 0, usage: 0, temperature: null, memoryUsed: 0 };
  }
}

// Temperatura das GPUs (via CIM MSAcpi_ThermalZoneTemperature)
function gpuTemperature() {
  if (!IS_WIN) return null;
  try {
    const out = cimCsv('MSAcpi_ThermalZoneTemperature', 'CurrentTemperature');
    const lines = out.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return null;
    const m = lines[1].match(/CurrentTemperature="?([0-9]+)"?$/);
    const kelvin = m ? parseInt(m[1], 10) : 0;
    const celsius = (kelvin / 10) - 273;
    return Math.max(0, Math.round(celsius));
  } catch {
    return null;
  }
}

// ============================================================
// Espaço em disco (por unidade)
function diskSpace() {
  if (!IS_WIN) {
    return [{ name: 'disk', total: os.totalmem(), free: os.freemem(), type: 'N/A' }];
  }
  try {
    const out = cimCsv('Win32_LogicalDisk', 'DeviceID,Size,FreeSpace,VolumeName', { filter: 'DriveType=3' });
    const lines = out.split(/\r?\n/).filter(l => l.trim());
    const drives = [];
    if (lines.length < 2) return drives;
    const header = lines[0].split(',');
    const get = (line) => {
      const parts = line.split(',');
      return {
        DeviceID: parts[0]?.replace(/^"|"$/g, '').trim() || '',
        Size: parts[1]?.replace(/^"|"$/g, '').trim() || '0',
        FreeSpace: parts[2]?.replace(/^"|"$/g, '').trim() || '0',
        VolumeName: parts[3]?.replace(/^"|"$/g, '').trim() || '',
      };
    };
    for (let i = 1; i < lines.length; i++) {
      const d = get(lines[i]);
      const total = parseInt(d.Size.replace(/,/g, ''), 10) || 0;
      const free = parseInt(d.FreeSpace.replace(/,/g, ''), 10) || 0;
      if (total > 0) {
        drives.push({
          device: d.DeviceID,
          size: total,
          free,
          label: d.VolumeName,
          type: 'SSD',
        });
      }
    }
    return drives;
  } catch {
    return [];
  }
}

// ============================================================
// Processos e startup
// ============================================================
function processCount() {
  if (!IS_WIN) return { count: os.processIds ? os.processIds().length : 0 };
  try {
    const out = execSync('tasklist /FO CSV /NH', { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const lines = out.trim().split('\n').filter(Boolean);
    return { count: lines.length };
  } catch { return { count: 0 }; }
}

function startupApps() {
  if (!IS_WIN) return [];
  try {
    const HKCU = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    const HKLM = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run';
    const items = [];
    const cmd = (key) => `reg query "${key}" /S /FO LIST 2>nul`;
    const out = execSync(cmd(HKCU) + ' && ' + cmd(HKLM), { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const seen = new Set();
    for (const l of out.split('\n')) {
      const m = l.match(/^REG_SZ\\s+(.+)/i);
      if (m && !seen.has(m[1])) { seen.add(m[1]); items.push(m[1]); }
    }
    return items.slice(0, 20);
  } catch { return []; }
}

// ============================================================
// Tempo ligado
// ============================================================
function uptime() {
  const sec = os.uptime();
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return { seconds: sec, days: d, hours: h, minutes: m, label: d > 0 ? `${d}d ${h}h` : `${h}h ${m}min` };
}

// ============================================================
// Status do Windows (ATIVADO / BLOQUEADO / SENHA)
// ============================================================
function windowsStatus() {
  if (!IS_WIN) return { state: 'offline', 에디션: 'N/A' };
  try {
    const out = execSync('sc query WinDefend', { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const running = out.includes('RUNNING');
    return { state: running ? 'ativo' : 'parado', 보안: running ? 'Ativado' : 'Desativado' };
  } catch { return { state: 'desconhecido', 보안: 'N/A' }; }
}

// ============================================================
// Snapshot completo (para dashboard)
// ============================================================
function systemSnapshot() {
  return {
    timestamp: Date.now(),
    cpu: {
      usage: cpuUsage(),
      load: loadAverage(),
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || 'N/A',
    },
    ram: ramStats(),
    disk: {
      io: diskIO(),
      space: diskSpace(),
    },
    network: networkIO(),
    gpu: gpuStats(),
    gpuTemp: gpuTemperature(),
    os: {
      platform: process.platform,
      arch: os.arch(),
      uptime: uptime(),
      hostname: os.hostname(),
      type: os.type(),
      release: os.release(),
    },
    processes: processCount(),
    startup: startupApps(),
    windows: windowsStatus(),
    freemem: os.freemem(),
    totalmem: os.totalmem(),
  };
}

// ============================================================
// Histograma para gráficos (últimos N pontos)
// ============================================================
class MetricHistory {
  constructor(maxPoints = 60) {
    this.maxPoints = maxPoints;
    this.cpu = [];
    this.ram = [];
    this.diskRead = [];
    this.diskWrite = [];
    this.netRx = [];
    this.netTx = [];
    this.gpuUsage = [];
    this.gpuTemp = [];
    this.ts = [];
  }

  push(snap) {
    const t = snap.timestamp || Date.now();
    this.cpu.push({ t, v: snap.cpu.usage });
    this.ram.push({ t, v: snap.ram.pct });
    this.diskRead.push({ t, v: snap.disk.io.readMBps });
    this.diskWrite.push({ t, v: snap.disk.io.writeMBps });
    this.netRx.push({ t, v: snap.network.rxMBps });
    this.netTx.push({ t, v: snap.network.txMBps });
    this.gpuUsage.push({ t, v: snap.gpu.usage || 0 });
    this.gpuTemp.push({ t, v: snap.gpuTemp ?? null });
    this.ts.push(t);
    if (this.cpu.length > this.maxPoints) {
      this.cpu.shift(); this.ram.shift(); this.diskRead.shift();
      this.diskWrite.shift(); this.netRx.shift(); this.netTx.shift();
      this.gpuUsage.shift(); this.gpuTemp.shift(); this.ts.shift();
    }
  }

  toPayload() {
    return {
      cpu:    this.cpu,
      ram:    this.ram,
      diskRead:  this.diskRead,
      diskWrite: this.diskWrite,
      netRx: this.netRx,
      netTx: this.netTx,
      gpuUsage: this.gpuUsage,
      gpuTemp: this.gpuTemp,
      ts: this.ts,
    };
  }
}

let history = new MetricHistory(60);

function tickAndRecord() {
  const snap = systemSnapshot();
  history.push(snap);
  return snap;
}

// ============================================================
// Export
// ============================================================
module.exports = {
  systemSnapshot,
  tickAndRecord,
  history,
  cpuUsage,
  ramStats,
  diskIO,
  networkIO,
  gpuStats,
  gpuTemperature,
  diskSpace,
  processCount,
  startupApps,
  uptime,
  windowsStatus,
};
