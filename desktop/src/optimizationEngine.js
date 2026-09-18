/**
 * desktop/src/optimizationEngine.js — Motor de Otimizações REAIS
 * Apenas otimizações com evidência comprovada
 */
const { regAdd, regQuery, regDelete } = require('./registry');
const { execFile } = require('child_process');

const POWERCFG = 'C:\\Windows\\System32\\powercfg.exe';

// ==================== Mouse Acceleration ====================
async function disableMouseAcceleration() {
  await regAdd('HKCU\\Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', '0');
  await regAdd('HKCU\\Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '0');
  await regAdd('HKCU\\Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '0');
  return { ok: true, name: 'Aceleração do mouse' };
}

// ==================== Game DVR ====================
async function disableGameDVR() {
  await regAdd('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 'REG_DWORD', '0');
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled', 'REG_DWORD', '0');
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_FSEBehaviorMode', 'REG_DWORD', '2');
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_HonorUserFSEBehaviorMode', 'REG_DWORD', '1');
  return { ok: true, name: 'Game DVR' };
}

// ==================== Power Plan ====================
async function setHighPerformancePowerPlan() {
  return new Promise((resolve, reject) => {
    execFile(POWERCFG, ['/setactive', '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'], { windowsHide: true }, (err) => {
      if (err) {
        // Try Ultimate Performance
        execFile(POWERCFG, ['/setactive', 'e9a42b02-d5df-448d-aa00-03f14749eb61'], { windowsHide: true }, (err2) => {
          if (err2) {
            // Create high performance plan
            execFile(POWERCFG, ['-duplicatescheme', '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'], { windowsHide: true }, (err3) => {
              if (err3) return reject(new Error('Não foi possível ativar o plano de alto desempenho.'));
              execFile(POWERCFG, ['/setactive', '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'], { windowsHide: true }, (err4) => {
                if (err4) return reject(new Error('Não foi possível ativar o plano.'));
                resolve({ ok: true, name: 'Plano de energia' });
              });
            });
          } else {
            resolve({ ok: true, name: 'Plano de energia' });
          }
        });
      } else {
        resolve({ ok: true, name: 'Plano de energia' });
      }
    });
  });
}

// ==================== Fullscreen Optimizations ====================
async function disableFullscreenOptimizations() {
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_FSEBehaviorMode', 'REG_DWORD', '2');
  await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_HonorUserFSEBehaviorMode', 'REG_DWORD', '1');
  
  // Apply to current executable
  const exe = process.execPath;
  if (exe) {
    const key = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers';
    await regAdd(key, exe, 'REG_SZ', '~ DISABLEFULLSCREENOPTIMIZATIONS');
  }
  return { ok: true, name: 'Fullscreen Optimizations' };
}

// ==================== Visual Effects ====================
async function optimizeVisualEffects() {
  await regAdd('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', 'VisualFXSetting', 'REG_DWORD', '2');
  return { ok: true, name: 'Efeitos visuais' };
}

// ==================== Telemetry ====================
async function disableTelemetry() {
  // Stop services
  await execFile('C:\\Windows\\System32\\net.exe', ['stop', 'DiagTrack', '/y'], { windowsHide: true }).catch(() => {});
  await execFile('C:\\Windows\\System32\\net.exe', ['stop', 'dmwappushservice', '/y'], { windowsHide: true }).catch(() => {});
  
  // Disable services
  await execFile('C:\\Windows\\System32\\sc.exe', ['config', 'DiagTrack', 'start=', 'disabled'], { windowsHide: true }).catch(() => {});
  await execFile('C:\\Windows\\System32\\sc.exe', ['config', 'dmwappushservice', 'start=', 'disabled'], { windowsHide: true }).catch(() => {});
  
  // Registry
  await regAdd('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry', 'REG_DWORD', '0');
  await regAdd('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection', 'AllowTelemetry', 'REG_DWORD', '0');
  
  return { ok: true, name: 'Telemetria' };
}

// ==================== Apply Single Optimization ====================
async function applyOptimization(id) {
  switch (id) {
    case 'mouse-accel':
      return disableMouseAcceleration();
    case 'game-dvr':
      return disableGameDVR();
    case 'power-plan':
      return setHighPerformancePowerPlan();
    case 'fullscreen-opt':
      return disableFullscreenOptimizations();
    case 'visual-effects':
      return optimizeVisualEffects();
    case 'telemetry':
      return disableTelemetry();
    default:
      return { ok: false, name: id, error: 'Otimização não encontrada' };
  }
}

// ==================== Apply All Recommended ====================
async function applyAll(recommendations) {
  const results = [];
  
  for (const rec of recommendations) {
    try {
      const result = await applyOptimization(rec.id);
      results.push(result);
    } catch (err) {
      results.push({ ok: false, name: rec.name, error: err.message });
    }
  }
  
  return results;
}

module.exports = {
  disableMouseAcceleration,
  disableGameDVR,
  setHighPerformancePowerPlan,
  disableFullscreenOptimizations,
  optimizeVisualEffects,
  disableTelemetry,
  applyOptimization,
  applyAll
};
