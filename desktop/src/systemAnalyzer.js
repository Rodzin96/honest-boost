/**
 * desktop/src/systemAnalyzer.js - Análise completa do sistema
 * Coleta informações reais de hardware, Windows e gaming
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { cimCsv } = require('./cim');

// Caminhos absolutos de System32: evita resolução pelo PATH (sequestro de binário
// por um executável homônimo em diretório gravável).
const SYSTEM32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const POWERCFG = path.join(SYSTEM32, 'powercfg.exe');
const REGEXE = path.join(SYSTEM32, 'reg.exe');
const POWERSHELL = path.join(SYSTEM32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const DISMEXE = path.join(SYSTEM32, 'Dism.exe');

// Helper para execução assíncrona de comandos shell
function runAsync(exe, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(exe, args, {
      windowsHide: true,
      timeout: opts.timeout || 30000,
      maxBuffer: 8 * 1024 * 1024,
      ...opts
    }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout || '', stderr: stderr || err?.message || '', code: err?.code });
    });
  });
}

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
      total: totalCapacity || total,
      free,
      sticks,
      totalGB: Math.round((totalCapacity || total) / 1024 / 1024 / 1024 * 10) / 10
    };
  } catch {
    return { total, free, sticks: [], totalGB: Math.round(total / 1024 / 1024 / 1024 * 10) / 10 };
  }
}

// ==================== Storage ====================
async function getStorageInfo() {
  try {
    const output = await cimCsv('Win32_LogicalDisk', 'DeviceID,Size,FreeSpace,FileSystem,VolumeName,DriveType');
    const lines = output.split(/\r?\n/).filter(l => l.trim());
    const drives = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 7) {
        const total = parseInt(parts[2], 10) || 0;
        const free = parseInt(parts[3], 10) || 0;
        if (total > 0) {
          drives.push({
            letter: parts[1].trim(),
            label: parts[6]?.trim() || '',
            type: parts[5] == '3' ? 'HDD' : parts[5] == '4' ? 'Network' : 'SSD',
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
  return new Promise((resolve) => {
    execFile(POWERCFG, ['/getactivescheme'], { windowsHide: true, timeout: 20000 }, (err, stdout) => {
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
  return new Promise((resolve) => {
    execFile(REGEXE, ['query', 'HKCU\\System\\GameConfigStore', '/v', 'GameDVR_Enabled'], { windowsHide: true, timeout: 15000 }, (err, stdout) => {
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
  return new Promise((resolve) => {
    execFile(REGEXE, ['query', 'HKCU\\Control Panel\\Mouse', '/v', 'MouseSpeed'], { windowsHide: true, timeout: 15000 }, (err, stdout) => {
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

// ==================== Game Scanner ====================
async function scanGames() {
  const games = [];
  const seen = new Set();

  // Helper: add game if not seen
  const addGame = (name, exe, dir, source, appId) => {
    const key = exe.toLowerCase();
    if (!seen.has(key) && fs.existsSync(exe)) {
      seen.add(key);
      games.push({ name, exe, dir, source, appId });
    }
  };

  // Helper: recursively find .exe files up to depth 3
  const findExes = (dir, depth = 0) => {
    if (depth > 3) return [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const exes = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith('.exe')) {
          exes.push(full);
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          exes.push(...findExes(full, depth + 1));
        }
      }
      return exes;
    } catch { return []; }
  };

  // -------- Helper: run reg query --------
  const regQuery = (key, value) => new Promise(resolve => {
    execFile('reg.exe', ['query', key, '/v', value], { windowsHide: true }, (err, stdout) => {
      const m = stdout?.match(/REG_\w+\s+(.*)$/m);
      resolve(m ? m[1].trim() : null);
    });
  });

  // -------- Helper: find exes recursively --------
  const findExesRecursive = (dir, maxDepth = 3) => {
    if (maxDepth <= 0) return [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const exes = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith('.exe')) {
          exes.push(full);
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          exes.push(...findExesRecursive(full, maxDepth - 1));
        }
      }
      return exes;
    } catch { return []; }
  };

  // -------- 1. Steam --------
  try {
    let steamPath = null;
    // Registry
    try {
      const reg = await regQuery('HKLMSOFTWAREValveSteam', 'InstallPath');
      steamPath = reg;
    } catch {}
    // Fallback: running process
    if (!steamPath) {
      const steamReg = await cimCsv('Win32_Process', 'ExecutablePath', "Name='steam.exe'");
      steamPath = steamReg.split(/\r?\n/)[1]?.split(',')[1]?.trim();
      if (steamPath) steamPath = path.dirname(steamPath);
    }
    if (steamPath && fs.existsSync(steamPath)) {
      const libraryFolders = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
      if (fs.existsSync(libraryFolders)) {
        const content = fs.readFileSync(libraryFolders, 'utf8');
        const paths = [...content.matchAll(/"path"\s+"([^"]+)"/g)].map(m => m[1].replace(/\\/g, '\\'));
        paths.push(steamPath);
        for (const lib of paths) {
          const steamApps = path.join(lib, 'steamapps');
          if (fs.existsSync(steamApps)) {
            const acfFiles = fs.readdirSync(steamApps).filter(f => f.endsWith('.acf'));
            for (const acf of acfFiles) {
              const acfContent = fs.readFileSync(path.join(steamApps, acf), 'utf8');
              const nameMatch = acfContent.match(/"name"\s+"([^"]+)"/);
              const appidMatch = acfContent.match(/"appid"\s+"(\d+)"/);
              const installdirMatch = acfContent.match(/"installdir"\s+"([^"]+)"/);
              if (nameMatch && appidMatch && installdirMatch) {
                const exeDir = path.join(steamApps, 'common', installdirMatch[1]);
                if (fs.existsSync(exeDir)) {
                  const exes = findExesRecursive(exeDir);
                  for (const exe of exes) {
                    const key = exe.toLowerCase();
                    if (!seen.has(key) && fs.existsSync(exe)) {
                      seen.add(key);
                      games.push({ name: nameMatch[1], appId: appidMatch[1], exe, dir: path.dirname(exe), source: 'steam' });
                    }
                  }
                }
              }
            }
          }
        }
      }
      // Userdata shortcuts (non-Steam games added to Steam) - binary VDF, skip for now
    }
  } catch (e) { console.log('Steam scan error:', e.message); }

  // -------- 2. Epic Games --------
  try {
    let epicRoot = null;
    try {
      epicRoot = await regQuery('HKLMSOFTWAREEpic GamesEpicGamesLauncher', 'AppDataPath');
    } catch {}
    const epicPaths = [
      epicRoot,
      path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Epic Games'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Epic Games')
    ].filter(Boolean);

    for (const root of epicPaths) {
      if (!root || !fs.existsSync(root)) continue;
      // Manifests
      const manifests = path.join(root, '.egstore', 'Manifests');
      if (fs.existsSync(manifests)) {
        const items = fs.readdirSync(manifests).filter(f => f.endsWith('.item'));
        for (const item of items) {
          try {
            const content = fs.readFileSync(path.join(manifests, item), 'utf8');
            const data = JSON.parse(content);
            if (data.InstallLocation && data.AppName) {
              const exes = findExesRecursive(data.InstallLocation);
              for (const exe of exes) {
                const key = exe.toLowerCase();
                if (!seen.has(key) && fs.existsSync(exe)) {
                  seen.add(key);
                  games.push({ name: data.AppName, appId: data.AppId || item.replace('.item',''), exe, dir: data.InstallLocation, source: 'epic' });
                }
              }
            }
          } catch {}
        }
      }
      // Fallback: direct scan
      const dirs = fs.readdirSync(root).filter(d => !d.startsWith('.'));
      for (const dir of dirs) {
        const gameDir = path.join(root, dir);
        if (fs.lstatSync(gameDir).isDirectory() && dir !== '.egstore') {
          const exes = findExesRecursive(gameDir);
          for (const exe of exes) {
            const key = exe.toLowerCase();
            if (!seen.has(key) && fs.existsSync(exe)) {
              seen.add(key);
              games.push({ name: dir, exe, dir: gameDir, source: 'epic' });
            }
          }
        }
      }
    }
  } catch (e) { console.log('Epic scan error:', e.message); }

  // -------- 3. EA App / Origin --------
  try {
    let eaRoot = null;
    try {
      eaRoot = await regQuery('HKLMSOFTWAREElectronic ArtsEA Desktop', 'InstallDir');
    } catch {}
    const eaPaths = [
      eaRoot,
      path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'EA Games'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'EA Games'),
      path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Origin Games'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Origin Games')
    ].filter(Boolean);

    for (const root of eaPaths) {
      if (!root || !fs.existsSync(root)) continue;
      const dirs = fs.readdirSync(root).filter(d => !d.startsWith('.'));
      for (const dir of dirs) {
        const gameDir = path.join(root, dir);
        if (fs.lstatSync(gameDir).isDirectory()) {
          const exes = findExesRecursive(gameDir);
          for (const exe of exes) {
            const key = exe.toLowerCase();
            if (!seen.has(key) && fs.existsSync(exe)) {
              seen.add(key);
              games.push({ name: dir, exe, dir: gameDir, source: 'ea' });
            }
          }
        }
      }
    }
  } catch (e) { console.log('EA scan error:', e.message); }

  // -------- 4. Ubisoft Connect --------
  try {
    let ubiRoot = null;
    try {
      ubiRoot = await regQuery('HKLMSOFTWAREUbisoftUbisoft Game Launcher', 'InstallDir');
    } catch {}
    const ubiPaths = [
      ubiRoot,
      path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Ubisoft', 'Ubisoft Game Launcher'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Ubisoft', 'Ubisoft Game Launcher')
    ].filter(Boolean);

    for (const root of ubiPaths) {
      if (!root || !fs.existsSync(root)) continue;
      const dirs = fs.readdirSync(root).filter(d => !d.startsWith('.'));
      for (const dir of dirs) {
        const gameDir = path.join(root, dir);
        if (fs.lstatSync(gameDir).isDirectory()) {
          const exes = findExesRecursive(gameDir);
          for (const exe of exes) {
            const key = exe.toLowerCase();
            if (!seen.has(key) && fs.existsSync(exe)) {
              seen.add(key);
              games.push({ name: dir, exe, dir: gameDir, source: 'ubisoft' });
            }
          }
        }
      }
    }
  } catch (e) { console.log('Ubisoft scan error:', e.message); }

  // -------- 5. GOG Galaxy --------
  try {
    let gogRoot = null;
    try {
      gogRoot = await regQuery('HKLMSOFTWAREGOG.comGalaxyClient', 'InstallPath');
    } catch {}
    const gogPaths = [
      gogRoot ? path.join(gogRoot, 'Games') : null,
      path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'GOG Galaxy', 'Games'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'GOG Galaxy', 'Games')
    ].filter(Boolean);

    for (const root of gogPaths) {
      if (!root || !fs.existsSync(root)) continue;
      const dirs = fs.readdirSync(root).filter(d => !d.startsWith('.'));
      for (const dir of dirs) {
        const gameDir = path.join(root, dir);
        if (fs.lstatSync(gameDir).isDirectory()) {
          const exes = findExesRecursive(gameDir);
          for (const exe of exes) {
            const key = exe.toLowerCase();
            if (!seen.has(key) && fs.existsSync(exe)) {
              seen.add(key);
              games.push({ name: dir, exe, dir: gameDir, source: 'gog' });
            }
          }
        }
      }
    }
  } catch (e) { console.log('GOG scan error:', e.message); }

  // -------- 6. Custom paths --------
  try {
    const commonPaths = [
      path.join(process.env['USERPROFILE'] || '', 'Games'),
      path.join(process.env['USERPROFILE'] || '', 'Desktop', 'Games'),
      'D:Games', 'E:Games', 'F:Games', 'G:Games'
    ];
    for (const gPath of commonPaths) {
      if (fs.existsSync(gPath)) {
        const dirs = fs.readdirSync(gPath).filter(d => !d.startsWith('.'));
        for (const dir of dirs) {
          const gameDir = path.join(gPath, dir);
          if (fs.lstatSync(gameDir).isDirectory()) {
            const exes = findExesRecursive(gameDir);
            for (const exe of exes) {
              const key = exe.toLowerCase();
              if (!seen.has(key) && fs.existsSync(exe)) {
                seen.add(key);
                games.push({ name: dir, exe, dir: gameDir, source: 'custom' });
              }
            }
          }
        }
      }
    }
  } catch (e) { console.log('Custom scan error:', e.message); }

  return games;
}

// ==================== Limpeza ====================
// ---------------------------------------------------------------------------
// Ações de limpeza - mapa único, reutilizado pelo classifyCleanItem() abaixo.
// ---------------------------------------------------------------------------
const CLEAN_ACTIONS = {
  'temp-files': () => deleteTempFiles(),
  'prefetch': () => deletePrefetch(),
  'wu-cache': () => deleteWindowsUpdateCache(),
  'thumbnails': () => deleteThumbnails(),
  'error-logs': () => clearEventLogs(),
  'dns-cache': () => flushDNS(),
  'clipboard': () => clearClipboard(),
  'recycle-bin': () => emptyRecycleBin(),
  'chrome-cache': () => deleteChromeCache(),
  'chrome-cookies': () => deleteChromeCookies(),
  'chrome-history': () => deleteChromeHistory(),
  'edge-cache': () => deleteEdgeCache(),
  'edge-cookies': () => deleteEdgeCookies(),
  'firefox-cache': () => deleteFirefoxCache(),
  'firefox-cookies': () => deleteFirefoxCookies(),
  'opera-cache': () => deleteOperaCache(),
  'brave-cache': () => deleteBraveCache(),
  'discord-cache': () => deleteDiscordCache(),
  'steam-cache': () => deleteSteamCache(),
  'epic-cache': () => deleteEpicCache(),
  'battlecache': () => deleteBattleNetCache(),
  'adobe-cache': () => deleteAdobeCache(),
  'office-cache': () => deleteOfficeCache(),
  'winsxs': () => cleanupWinsxs(),
  'component-store': () => cleanupComponentStore(),
  'user-temp': () => deleteUserTemp(),
  'system-temp': () => deleteSystemTemp(),
  'msi-cache': () => deleteMsiCache(),
  'delivery-opt': () => deleteDeliveryOptimization(),
  'directx-shader': () => deleteDirectXShaderCache(),
  'nvidia-cache': () => deleteNvidiaCache(),
  'amd-cache': () => deleteAmdCache(),
};

// Itens que exigem elevação: caminhos sob SystemRoot, logs de eventos,
// store de componentes do Windows.
const CLEAN_REQUIRES_ADMIN = new Set([
  'prefetch', 'wu-cache', 'error-logs', 'system-temp',
  'winsxs', 'component-store',
]);

// Itens destrutivos de dados do usuário. Exigem consentimento explícito do
// renderer (options.riskAccepted) - nunca disparar por um unico clique generico.
const CLEAN_RISKY = new Set([
  'chrome-cookies', 'chrome-history', 'edge-cookies',
  'firefox-cookies', 'clipboard', 'recycle-bin', 'office-cache',
  // Apaga os logs de eventos, inclusive o de Segurança: além de exigir
  // elevação, é destrutivo para auditoria e pede consentimento explícito.
  'error-logs',
]);

/**
 * Classifica um item de limpeza para que a camada IPC possa decidir.
 * @returns {{known: boolean, admin: boolean, risky: boolean}}
 */
function classifyCleanItem(id) {
  return {
    known: Object.prototype.hasOwnProperty.call(CLEAN_ACTIONS, id),
    admin: CLEAN_REQUIRES_ADMIN.has(id),
    risky: CLEAN_RISKY.has(id),
  };
}

/**
 * Executa a limpeza de um item.
 * @param {string} id
 * @param {{admin?: boolean, riskAccepted?: boolean}} [options]
 */
async function cleanItem(id, options = {}) {
  const info = classifyCleanItem(id);
  if (!info.known) return { ok: false, error: `Ação não reconhecida: ${id}` };
  if (info.admin && !options.admin) {
    return { ok: false, error: 'Esta limpeza requer execução como administrador.' };
  }
  if (info.risky && !options.riskAccepted) {
    return { ok: false, error: 'Esta limpeza apaga dados do usuário e exige confirmação explícita.' };
  }
  try {
    await CLEAN_ACTIONS[id]();
    return { ok: true, message: `Item "${id}" limpo com sucesso.` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function deleteTempFiles() {
  const tmpPaths = [
    '%TEMP%',
    '%USERPROFILE%AppDataLocalTemp',
    '%SYSTEMROOT%Temp',
  ];
  for (const p of tmpPaths) {
    await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `Get-ChildItem -Path '${p.replace(/%([^%]+)%/g, (_, g) => process.env[g] || '')}' -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue`], { timeout: 30000 });
  }
}

async function deletePrefetch() {
  const dir = path.join(process.env.SystemRoot || 'C:\\Windows', 'Prefetch');
  await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `Remove-Item -Path '${dir.replace(/'/g, "''")}\\*' -Force -Recurse -ErrorAction SilentlyContinue`], { timeout: 15000 });
}

async function deleteWindowsUpdateCache() {
  const dir = path.join(process.env.SystemRoot || 'C:\\Windows', 'SoftwareDistribution', 'Download');
  await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `Remove-Item -Path '${dir.replace(/'/g, "''")}\\*' -Force -Recurse -ErrorAction SilentlyContinue`], { timeout: 15000 });
}

async function deleteThumbnails() {
  const dir = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Explorer');
  await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `Remove-Item -Path '${dir.replace(/'/g, "''")}\\thumbcache_*.db' -Force -ErrorAction SilentlyContinue`], { timeout: 15000 });
}

async function clearEventLogs() {
  await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', 'wevtutil cl System; wevtutil cl Application; wevtutil cl Setup; wevtutil cl Security; wevtutil cl ForwardedEvents'], { timeout: 15000 });
}

async function flushDNS() {
  await runAsync('ipconfig', ['/flushdns']);
}

async function clearClipboard() {
  await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', '[System.Windows.Clipboard]::Clear()'], { timeout: 5000 });
}

async function emptyRecycleBin() {
  await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', 'Clear-RecycleBin -Force -ErrorAction SilentlyContinue'], { timeout: 30000 });
}

function getAppDataPaths(appName) {
  const base = process.env.LOCALAPPDATA || '';
  const paths = {};
  if (appName === 'chrome' || appName === 'chrome-cache' || appName === 'chrome-cookies' || appName === 'chrome-history') {
    paths.cache = path.join(base, 'Google', 'Chrome', 'User Data', 'Default', 'Cache');
    paths.cookies = path.join(base, 'Google', 'Chrome', 'User Data', 'Default', 'Network', 'Cookies');
    paths.history = path.join(base, 'Google', 'Chrome', 'User Data', 'Default', 'History');
  }
  if (appName === 'edge' || appName === 'edge-cache' || appName === 'edge-cookies') {
    paths.cache = path.join(base, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache');
    paths.cookies = path.join(base, 'Microsoft', 'Edge', 'User Data', 'Default', 'Network', 'Cookies');
  }
  if (appName === 'firefox' || appName === 'firefox-cache' || appName === 'firefox-cookies') {
    const profiles = path.join(base, 'Mozilla', 'Firefox', 'Profiles');
    if (fs.existsSync(profiles)) {
      const prof = fs.readdirSync(profiles).find(f => f.endsWith('.default') || f.endsWith('.default-release') || f.includes('profile'));
      if (prof) {
        paths.cache = path.join(profiles, prof, 'cache2', 'entries');
        paths.cookies = path.join(profiles, prof, 'cookies.sqlite');
      }
    }
  }
  if (appName === 'opera' || appName === 'opera-cache') {
    paths.cache = path.join(base, 'Opera Software', 'Opera Stable', 'Cache');
  }
  if (appName === 'brave' || appName === 'brave-cache') {
    paths.cache = path.join(base, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Cache');
  }
  if (appName === 'discord-cache') {
    paths.cache = path.join(base, 'Discord', 'Cache');
    paths['app-data'] = path.join(base, 'Discord', 'app-0', 'Cache');
  }
  if (appName === 'steam-cache') {
    paths.cache = path.join(base, 'Steam', 'appcache');
    paths['shader'] = path.join(base, 'Steam', 'shader');
  }
  if (appName === 'epic-cache') {
    paths.cache = path.join(base, 'Epic Games', 'UnrealEngineLauncher', 'Cache');
  }
  if (appName === 'battlecache') {
    paths.cache = path.join(base, 'Battle.net', 'Cache');
  }
  if (appName === 'adobe-cache') {
    paths.cache = path.join(base, 'Adobe', 'Common', 'Media Cache Files');
  }
  if (appName === 'office-cache') {
    paths.cache = path.join(base, 'Microsoft', 'Office', '16.0', 'OfficeFileCache');
  }
  return paths;
}

async function deleteBrowserCache(appName, subpath) {
  const paths = getAppDataPaths(appName);
  const target = paths[subpath] || paths.cache;
  if (!target) return;
  try {
    await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `Remove-Item -Path '${target.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue`], { timeout: 30000 });
  } catch {}
}

async function deleteChromeCache() { await deleteBrowserCache('chrome', 'cache'); }
async function deleteChromeCookies() { await deleteBrowserCache('chrome', 'cookies'); }
async function deleteChromeHistory() {
  const paths = getAppDataPaths('chrome');
  if (paths.history) {
    try {
      await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `Remove-Item -Path '${paths.history.replace(/'/g, "''")}' -Force -ErrorAction SilentlyContinue`], { timeout: 10000 });
    } catch {}
  }
}

function deleteChromeDownloads() {
  throw new Error('Ação desativada por segurança.');
}

async function deleteEdgeCache() { await deleteBrowserCache('edge', 'cache'); }
async function deleteEdgeCookies() { await deleteBrowserCache('edge', 'cookies'); }
async function deleteFirefoxCache() { await deleteBrowserCache('firefox', 'cache'); }
async function deleteFirefoxCookies() { await deleteBrowserCache('firefox', 'cookies'); }
async function deleteOperaCache() { await deleteBrowserCache('opera', 'cache'); }
async function deleteBraveCache() { await deleteBrowserCache('brave', 'cache'); }

async function deleteDiscordCache() {
  const paths = getAppDataPaths('discord-cache');
  for (const t of [paths.cache, paths['app-data']]) {
    if (t && fs.existsSync(t)) {
      try {
        await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `Remove-Item -Path '${t.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue`], { timeout: 30000 });
      } catch {}
    }
  }
}

async function deleteSteamCache() {
  const paths = getAppDataPaths('steam-cache');
  for (const t of [paths.cache, paths['shader']]) {
    if (t && fs.existsSync(t)) {
      try {
        await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `Remove-Item -Path '${t.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue`], { timeout: 30000 });
      } catch {}
    }
  }
}

async function deleteEpicCache() { await deleteBrowserCache('epic-cache', 'cache'); }
async function deleteBattleNetCache() { await deleteBrowserCache('battlecache', 'cache'); }
async function deleteAdobeCache() { await deleteBrowserCache('adobe-cache', 'cache'); }
async function deleteOfficeCache() { await deleteBrowserCache('office-cache', 'cache'); }

async function cleanupWinsxs() {
  await runAsync(DISMEXE, ['/Online', '/Cleanup-Image', '/StartComponentCleanup', '/ResetBase'], { timeout: 300000 });
}

async function cleanupComponentStore() {
  await runAsync(DISMEXE, ['/Online', '/Cleanup-Image', '/StartComponentCleanup'], { timeout: 300000 });
}

async function deleteUserTemp() {
  await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', 'Remove-Item -Path "$env:TEMP*" -Recurse -Force -ErrorAction SilentlyContinue'], { timeout: 30000 });
}

async function deleteSystemTemp() {
  const dir = path.join(process.env.SystemRoot || 'C:\\Windows', 'Temp');
  await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `Remove-Item -Path '${dir.replace(/'/g, "''")}\\*' -Recurse -Force -ErrorAction SilentlyContinue`], { timeout: 30000 });
}

async function deleteMsiCache() {
  await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', 'Remove-Item -Path "$env:TEMP\\*.msi" -Force -ErrorAction SilentlyContinue'], { timeout: 15000 });
}

async function deleteDeliveryOptimization() {
  await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', 'Remove-Item -Path "$env:LOCALAPPDATA\\Microsoft\\DeliveryOptimization\\*" -Recurse -Force -ErrorAction SilentlyContinue'], { timeout: 15000 });
}

async function deleteDirectXShaderCache() {
  const dxCache = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'DirectX', 'ShaderCache');
  if (fs.existsSync(dxCache)) {
    await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `Remove-Item -Path '${dxCache.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue`], { timeout: 15000 });
  }
}

async function deleteNvidiaCache() {
  const nvPaths = [
    path.join(process.env.LOCALAPPDATA || '', 'NVIDIA', 'NVStreamTemp'),
    path.join(process.env.LOCALAPPDATA || '', 'NVIDIA', 'GeForce Experience', 'Cache'),
  ];
  for (const p of nvPaths) {
    if (fs.existsSync(p)) {
      await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `Remove-Item -Path '${p.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue`], { timeout: 15000 });
    }
  }
}

async function deleteAmdCache() {
  const amdPaths = [
    path.join(process.env.LOCALAPPDATA || '', 'AMD', 'CN', 'Temp'),
    path.join(process.env.LOCALAPPDATA || '', 'AMD', 'CN', 'Logs'),
  ];
  for (const p of amdPaths) {
    if (fs.existsSync(p)) {
      await runAsync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `Remove-Item -Path '${p.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue`], { timeout: 15000 });
    }
  }
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
  fullSystemScan,
  scanGames,
  cleanItem,
  classifyCleanItem,
};
