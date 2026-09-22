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

// Carga média do sistema — via cache da coleta lenta.
// (A versão anterior chamava cimCsv, que é async, de forma sync: o .split
// estourava, caía no catch e ainda gerava um powershell inútil por chamada.)
function loadAverage() {
  if (_slow.load !== null && _slow.load !== undefined) return _slow.load;
  if (!IS_WIN && os.loadavg) return os.loadavg()[0];
  return null;
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
  // Via cache da coleta lenta (PDH/adaptador).
  // (A versão anterior lia receiveBytes de os.networkInterfaces, campo que não
  // existe no Node → sempre 0,0.)
  if (!IS_WIN) return { rxMBps: 0, txMBps: 0 };
  _kickSlow();
  return { rxMBps: _slow.net.rxMBps, txMBps: _slow.net.txMBps };
}

// ============================================================
// GPU / temperatura / espaço — via cache da coleta lenta em background.
// (As versões anteriores chamavam cimCsv, que é async, de forma sync: sempre
// caíam no catch → GPU 'Desconhecida', disco [] ("não detectado") — além de
// gerar powershells inúteis a cada chamada. O cache resolve os dois.)
function gpuStats() {
  if (!IS_WIN) return { name: 'Desconhecida', vram: 0, usage: 0, temperature: null, memoryUsed: 0 };
  _kickSlow();
  return { ..._slow.gpu };
}

function gpuTemperature() {
  if (!IS_WIN) return null;
  _kickSlow();
  return _slow.gpuTemp;
}

function diskSpace() {
  if (!IS_WIN) {
    return [{ name: 'disk', total: os.totalmem(), free: os.freemem(), type: 'N/A' }];
  }
  _kickSlow();
  return _slow.space.slice();
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
  // Sem /FO (sintaxe inválida), sem && (uma chave ausente matava as outras),
  // uma query por hive com parser tolerante (usa RUN_KEYS/_parseRegRun abaixo).
  const seen = new Set();
  const items = [];
  let anyOk = false;
  for (const key of RUN_KEYS) {
    try {
      const out = execSync(`reg query "${key}"`, { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      anyOk = true;
      for (const name of _parseRegRun(out)) {
        if (!seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); items.push(name); }
      }
    } catch { /* chave inexistente — próxima */ }
  }
  if (!items.length && !anyOk) return _slow.startup.slice();
  return items.slice(0, 20);
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
// Camada LENTA assíncrona — coleta pesada SEM bloquear o event loop
// ------------------------------------------------------------
// Diagnóstico: systemSnapshot() rodava a cada 1.5s no IPC e cada chamada
// disparava ~7 processos filhos (typeperf sync ~1s, tasklist, reg×2, sc,
// + 4× powershell via CIM), a maioria SYNC (execSync trava o main process
// e congela cliques/IPC/janela). Resultado: navegação engasgada.
// Correção: snapshot rápido (só syscalls baratas, <5ms) + coleta lenta em
// background assíncrona (execFile, paralela) a cada 6s com cache.
// O contrato do snapshot (chaves/formatos) permanece idêntico.
// ============================================================
const _POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

function _runAsync(exe, args, timeout = 12000) {
  return new Promise((resolve) => {
    execFile(exe, args, { windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? '' : String(stdout || ''));
    });
  });
}
function _psAsync(script, timeout = 15000) {
  return _runAsync(_POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], timeout);
}
function _cimScript(className, properties, filter) {
  const propList = Array.isArray(properties) ? properties.join(',') : String(properties);
  let s = `Get-CimInstance ${className}`;
  if (filter) s += ` -Filter "${String(filter).replace(/"/g, "'")}"`;
  return `${s} | Select-Object @{n='Node';e={$env:COMPUTERNAME}},${propList} | ConvertTo-Csv -NoTypeInformation`;
}
// CSV com respeito a aspas (valores CIM podem conter vírgulas, ex: "C:, volume").
// Retorna { header: string[], rows: string[][] } com cabeçalho normalizado.
function _csvParse(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  if (!rows.length) return { header: [], rows: [] };
  return { header: rows[0].map(h => h.replace(/^"|"$/g, '').trim()), rows: rows.slice(1) };
}
function _col(parsed, row, name) {
  const i = parsed.header.indexOf(name);
  return i >= 0 ? (row[i] ?? '').replace(/^"|"$/g, '').trim() : '';
}
// Chaves Run do Windows (HKCU + HKLM 64/32 bits). Saída padrão do reg.exe:
//     Nome    REG_SZ    dados   (SEM /FO — "/FO LIST" dá "sintaxe inválida"
//     neste reg.exe e quebrava a detecção: sempre 0 startups).
const RUN_KEYS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run',
];
function _parseRegRun(out) {
  const items = [];
  const seen = new Set();
  for (const raw of String(out).split('\n')) {
    const l = raw.replace(/\r$/, '');
    if (!l.trim() || /^HKEY_/i.test(l.trim()) || /^ERROR:/i.test(l.trim())) continue;
    const m = l.match(/^\s*(\S.*?)\s+REG_\w+\s*(.*)$/);
    if (m) {
      const name = m[1].trim();
      if (name && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); items.push(name); }
    }
  }
  return items;
}
// Preserva stdout mesmo com exit != 0 (chave inexistente = exit 1, sem saída útil;
// mas saída parcial válida não pode ser descartada como o _runAsync faz).
function _runReg(key) {
  return new Promise((resolve) => {
    execFile(path.join(SYS_ROOT, 'System32', 'reg.exe'), ['query', key], { windowsHide: true, timeout: 10000, maxBuffer: 1 * 1024 * 1024 }, (err, stdout) => {
      resolve({ ok: !err, out: String(stdout || '') });
    });
  });
}
// typeperf com múltiplos contadores retorna 1 linha de cabeçalho + 1 de dados,
// com N colunas citadas ("..." , "..."). O parse antigo filtrava linhas por nome
// e lia a 1ª coluna citada — que no cabeçalho é o caminho do contador (NaN → 0).
// Aqui o parse é por índice do cabeçalho: correto para disco, rede e GPU.
function _pdhFields(line) {
  const cols = [];
  const re = /"([^"]*)"/g;
  let m;
  while ((m = re.exec(line)) !== null) cols.push(m[1]);
  return cols;
}
function _parseTypeperf(out) {
  const res = { diskRead: 0, diskWrite: 0, netRx: 0, netTx: 0, gpuSum: 0, hasDisk: false, hasNet: false, hasGpu: false };
  try {
    const lines = String(out).split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return res;
    const hdr = _pdhFields(lines[0]);
    if (hdr.length < 2) return res;
    let data = null;
    for (let i = lines.length - 1; i >= 1; i--) {
      const cols = _pdhFields(lines[i]);
      if (cols.length === hdr.length) { data = cols; break; }
    }
    if (!data) return res;
    const num = (s) => { const v = parseFloat(s); return isNaN(v) ? 0 : v; };
    for (let i = 1; i < hdr.length; i++) {
      const h = hdr[i];
      const v = num(data[i]);
      if (h.includes('Disk Read Bytes/sec')) { res.diskRead = v; res.hasDisk = true; }
      else if (h.includes('Disk Write Bytes/sec')) { res.diskWrite = v; res.hasDisk = true; }
      else if (h.includes('Bytes Received/sec')) {
        if (!/loopback|isatap|teredo|pseudo/i.test(h)) { res.netRx += v; res.hasNet = true; }
      }
      else if (h.includes('Bytes Sent/sec')) {
        if (!/loopback|isatap|teredo|pseudo/i.test(h)) { res.netTx += v; res.hasNet = true; }
      }
      else if (h.includes('Utilization Percentage')) { res.gpuSum += v; res.hasGpu = true; }
    }
  } catch {}
  return res;
}

// Cache da coleta lenta (valores iniciais = mesmos fallbacks das funções sync)
const _slow = {
  load: null,
  diskIO: { readMBps: 0, writeMBps: 0 },
  space: [],
  net: { rxMBps: 0, txMBps: 0, _rx: 0, _tx: 0, _ts: 0 },
  gpu: { name: 'Desconhecida', vram: 0, usage: 0, usageOk: false, temperature: null, memoryUsed: 0 },
  gpuTemp: null,
  processes: { count: 0 },
  startup: [],
  windows: { state: 'desconhecido', 보안: 'N/A' },
};
let _slowInFlight = false;
let _slowLastOk = 0;

async function _refreshSlow() {
  if (_slowInFlight || !IS_WIN) return;
  _slowInFlight = true;
  try {
    const [tasklist, regHKCU, regW64, regW32, scOut, typeperf, smi, cimOS, cimGPU, cimTemp, cimDisk, netStats] = await Promise.all([
      _runAsync(path.join(SYS_ROOT, 'System32', 'tasklist.exe'), ['/FO', 'CSV', '/NH']),
      _runReg(RUN_KEYS[0]),
      _runReg(RUN_KEYS[1]),
      _runReg(RUN_KEYS[2]),
      _runAsync(path.join(SYS_ROOT, 'System32', 'sc.exe'), ['query', 'WinDefend']),
      _runAsync(path.join(SYS_ROOT, 'System32', 'typeperf.exe'), ['-sc', '1', '\\PhysicalDisk(_Total)\\Disk Read Bytes/sec', '\\PhysicalDisk(_Total)\\Disk Write Bytes/sec', '\\Network Interface(*)\\Bytes Received/sec', '\\Network Interface(*)\\Bytes Sent/sec', '\\GPU Engine(*)\\Utilization Percentage'], 20000),
      _runAsync('nvidia-smi', ['--query-gpu=temperature.gpu,utilization.gpu', '--format=csv,noheader,nounits'], 8000),
      _psAsync(_cimScript('Win32_OperatingSystem', 'LoadPercentage')),
      _psAsync(_cimScript('Win32_VideoController', 'Name,DriverVersion,AdapterRAM')),
      _psAsync(_cimScript('MSAcpi_ThermalZoneTemperature', 'CurrentTemperature')),
      _psAsync(_cimScript('Win32_LogicalDisk', 'DeviceID,Size,FreeSpace,VolumeName', 'DriveType=3')),
      _psAsync(`Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Get-NetAdapterStatistics -ErrorAction SilentlyContinue | Select-Object ReceivedBytes,SentBytes | ConvertTo-Csv -NoTypeInformation`),
    ]);

    // Processos
    const procLines = tasklist.trim().split('\n').filter(Boolean);
    if (procLines.length) _slow.processes = { count: procLines.length };

    // Startup: 3 hives independentes (sem && — se uma chave não existe as
    // outras ainda contam). Só sobrescreve com [] se ao menos uma respondeu.
    try {
      const outs = [regHKCU, regW64, regW32].map((r) => (r && r.out) || '');
      const anyOk = [regHKCU, regW64, regW32].some((r) => r && r.ok);
      const seen = new Set();
      const items = [];
      for (const out of outs) {
        for (const name of _parseRegRun(out)) {
          if (!seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); items.push(name); }
        }
      }
      if (items.length || anyOk) _slow.startup = items.slice(0, 20);
    } catch {}

    // Defender
    if (scOut) _slow.windows = { state: scOut.includes('RUNNING') ? 'ativo' : 'parado', 보안: scOut.includes('RUNNING') ? 'Ativado' : 'Desativado' };

    // Disco / rede / uso GPU via PDH (typeperf já retorna taxas por segundo).
    // nvidia-smi (quando existe) é mais preciso para temp e uso da GPU.
    const pdh = _parseTypeperf(typeperf);
    if (pdh.hasDisk) {
      _slow.diskIO = { readMBps: Math.max(0, pdh.diskRead / 1048576), writeMBps: Math.max(0, pdh.diskWrite / 1048576) };
    }
    let smiTemp = null, smiUtil = null;
    try {
      const parts = String(smi).split('\n')[0].replace(/"/g, '').split(',');
      const t = parseFloat(parts[0]), u = parseFloat(parts[1]);
      if (!isNaN(t) && t > 0 && t < 120) smiTemp = Math.round(t);
      if (!isNaN(u) && u >= 0 && u <= 100) smiUtil = u;
    } catch {}
    if (smiTemp !== null) _slow.gpuTemp = smiTemp;
    _slow.gpu.usage = smiUtil !== null ? smiUtil : Math.max(0, Math.min(100, pdh.gpuSum));
    _slow.gpu.usageOk = smiUtil !== null || pdh.hasGpu;
    if (pdh.hasNet) {
      _slow.net.rxMBps = Math.max(0, pdh.netRx / 1048576);
      _slow.net.txMBps = Math.max(0, pdh.netTx / 1048576);
    }

    // CPU load (CIM, async de verdade — busca por nome da coluna,
    // pois a 1ª coluna é "Node" e o nome da GPU pode conter vírgulas)
    try {
      const p = _csvParse(cimOS);
      if (p.rows.length) {
        const v = parseInt(_col(p, p.rows[0], 'LoadPercentage'), 10);
        if (!isNaN(v)) _slow.load = v;
      }
    } catch {}

    // GPU (preserva uso/usageOk medidos acima)
    try {
      const p = _csvParse(cimGPU);
      if (p.rows.length) {
        const name = _col(p, p.rows[0], 'Name');
        const rawVRAM = parseInt(_col(p, p.rows[0], 'AdapterRAM').replace(/,/g, ''), 10) || 0;
        if (name) _slow.gpu = { name, vram: rawVRAM, usage: _slow.gpu.usage, usageOk: _slow.gpu.usageOk, temperature: null, memoryUsed: 0 };
      }
    } catch {}
    // Temperatura: nvidia-smi já aplicada acima quando existe; CIM é fallback
    // (MSAcpi_ThermalZoneTemperature nem sempre existe / nem sempre é a GPU)
    if (smiTemp === null) {
      try {
        const p = _csvParse(cimTemp);
        if (p.rows.length) {
          const k = parseInt(_col(p, p.rows[0], 'CurrentTemperature'), 10);
          if (!isNaN(k) && k > 0) _slow.gpuTemp = Math.max(0, Math.round((k / 10) - 273));
        }
      } catch {}
    }

    // Espaço em disco (colunas por nome: Node vem primeiro!)
    try {
      const p = _csvParse(cimDisk);
      const drives = [];
      for (const row of p.rows) {
        const device = _col(p, row, 'DeviceID');
        const total = parseInt(_col(p, row, 'Size').replace(/,/g, ''), 10) || 0;
        const free = parseInt(_col(p, row, 'FreeSpace').replace(/,/g, ''), 10) || 0;
        if (device && total > 0) {
          drives.push({ device, size: total, free, label: _col(p, row, 'VolumeName'), type: 'SSD' });
        }
      }
      if (drives.length) _slow.space = drives;
    } catch {}

    // Rede: typeperf (PDH) é a fonte primária; estatísticas do adaptador
    // (cumulativas) são fallback quando o PDH não retorna interfaces.
    // (A versão sync antiga lia receiveBytes de os.networkInterfaces, que não
    // existe no Node → sempre 0.)
    if (!pdh.hasNet) {
      try {
        let rx = 0, tx = 0;
        for (const l of String(netStats).split('\n').slice(1)) {
          const m = l.replace(/"/g, '').split(',');
          if (m.length >= 2) { rx += parseInt(m[0], 10) || 0; tx += parseInt(m[1], 10) || 0; }
        }
        const now = Date.now();
        if (_slow.net._ts && (rx || tx)) {
          const dt = (now - _slow.net._ts) / 1000 || 1;
          if (dt > 1 && rx >= _slow.net._rx && tx >= _slow.net._tx) {
            _slow.net.rxMBps = Math.max(0, (rx - _slow.net._rx) / 1048576 / dt);
            _slow.net.txMBps = Math.max(0, (tx - _slow.net._tx) / 1048576 / dt);
          }
        }
        if (rx || tx) { _slow.net._rx = rx; _slow.net._tx = tx; _slow.net._ts = now; }
      } catch {}
    }

    _slowLastOk = Date.now();
  } finally {
    _slowInFlight = false;
  }
}

const SLOW_INTERVAL_MS = 6000;
let _slowTimer = null;
function _kickSlow() {
  if (!IS_WIN) return;
  const stale = Date.now() - _slowLastOk > SLOW_INTERVAL_MS;
  if (stale && !_slowInFlight) _refreshSlow();
  if (!_slowTimer) _slowTimer = setInterval(() => { if (!_slowInFlight) _refreshSlow(); }, SLOW_INTERVAL_MS);
}
// Aquece o cache no boot (fire-and-forget, sem bloquear)
setImmediate(_kickSlow);

// ============================================================
// Snapshot completo (para dashboard)
// FAST: só syscalls baratas (<5ms, zero spawn) — roda a cada 1.5s no IPC.
// SLOW: vem do cache atualizado em background a cada 6s.
// ============================================================
function systemSnapshot() {
  _kickSlow();
  const cpus = os.cpus();
  return {
    timestamp: Date.now(),
    cpu: {
      usage: cpuUsage(),
      load: _slow.load,
      cores: cpus.length,
      model: cpus[0]?.model || 'N/A',
    },
    ram: ramStats(),
    disk: {
      io: { readMBps: _slow.diskIO.readMBps, writeMBps: _slow.diskIO.writeMBps },
      space: _slow.space,
    },
    network: { rxMBps: _slow.net.rxMBps, txMBps: _slow.net.txMBps },
    gpu: { ..._slow.gpu },
    gpuTemp: _slow.gpuTemp,
    os: {
      platform: process.platform,
      arch: os.arch(),
      uptime: uptime(),
      hostname: os.hostname(),
      type: os.type(),
      release: os.release(),
    },
    processes: { ..._slow.processes },
    startup: _slow.startup.slice(),
    windows: { ..._slow.windows },
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
