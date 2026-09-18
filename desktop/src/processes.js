/**
 * desktop/src/processes.js — Módulo SEGURO de Processos
 * NÃO usa taskkill /F — classifica processos antes de qualquer ação
 */
const { execFile } = require('child_process');
const { cimCsv } = require('./cim');

const TASKKILL = 'C:\\Windows\\System32\\taskkill.exe';

// Processos que NUNCA devem ser terminados
const CRITICAL_PROCESSES = new Set([
  'System', 'Registry', 'smss.exe', 'csrss.exe', 'wininit.exe',
  'services.exe', 'lsass.exe', 'svchost.exe', 'winlogon.exe',
  'dwm.exe', 'explorer.exe', 'taskhostw.exe', 'RuntimeBroker.exe',
  'Memory Compression', 'Secure System', 'fontdrvhost.exe',
  'WmiPrvSE.exe', 'dllhost.exe', 'conhost.exe', 'audiodg.exe',
  'SearchIndexer.exe', 'SearchHost.exe', 'StartMenuExperienceHost.exe',
  'ShellExperienceHost.exe', 'LockApp.exe', 'TextInputHost.exe',
  'sihost.exe', 'ctfmon.exe', 'spoolsv.exe', 'LsaIso.exe'
]);

// Processos seguros para fechar (user-initiated, sem risco de perda de dados)
const SAFE_TO_TERMINATE = new Set([
  'Discord.exe', 'Spotify.exe', 'Steam.exe', 'EpicGamesLauncher.exe',
  'Battle.net.exe', 'Origin.exe', 'EAConnect_microsoft.exe',
  'Uplay.exe', 'RiotClientServices.exe', 'LeagueClient.exe',
  'Teams.exe', 'Slack.exe', 'Zoom.exe', 'Skype.exe',
  'WhatsApp.exe', 'Telegram.exe', 'iTunes.exe',
  'AdobeCreativeCloud.exe', 'Creative Cloud.exe',
  'OneDrive.exe', 'Dropbox.exe', 'GoogleDriveSync.exe',
  'Chrome.exe', 'FireFox.exe', 'Edge.exe', 'Brave.exe',
  'Opera.exe', 'Vivaldi.exe', 'msedge.exe'
]);

// Processos que requerem confirmação do usuário
const NEEDS_CONFIRMATION = new Set([
  'OBS.exe', 'Streamlabs OBS.exe', 'XSplit.exe',
  'NVIDIA Share.exe', 'nvcontainer.exe', 'GeForceExperience.exe',
  'RadeonSoftware.exe', 'AMDRSServ.exe'
]);

async function getRunningProcesses() {
  try {
    const output = await cimCsv('Win32_Process', 'Name,ProcessId,WorkingSetSize');
    const lines = output.split(/\r?\n/).filter(l => l.trim());
    const processes = [];
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 4) {
        processes.push({
          node: parts[0],
          name: parts[1],
          pid: parseInt(parts[2], 10),
          workingSet: parseInt(parts[3], 10)
        });
      }
    }
    return processes;
  } catch {
    return [];
  }
}

function classifyProcess(processName) {
  if (CRITICAL_PROCESSES.has(processName)) return 'CRITICAL';
  if (SAFE_TO_TERMINATE.has(processName)) return 'SAFE';
  if (NEEDS_CONFIRMATION.has(processName)) return 'CONFIRM';
  return 'UNKNOWN';
}

async function getProcessClassification() {
  const processes = await getRunningProcesses();
  const classified = {
    critical: [],
    safe: [],
    confirm: [],
    unknown: []
  };
  
  for (const proc of processes) {
    const classification = classifyProcess(proc.name);
    proc.classification = classification;
    
    switch (classification) {
      case 'CRITICAL':
        classified.critical.push(proc);
        break;
      case 'SAFE':
        classified.safe.push(proc);
        break;
      case 'CONFIRM':
        classified.confirm.push(proc);
        break;
      default:
        classified.unknown.push(proc);
    }
  }
  
  return classified;
}

async function terminateProcess(pid, name) {
  const classification = classifyProcess(name);
  
  if (classification === 'CRITICAL') {
    return { ok: false, error: 'Processo crítico do sistema — não pode ser terminado.' };
  }
  
  return new Promise((resolve) => {
    execFile(TASKKILL, ['/PID', String(pid), '/F'], { windowsHide: true }, (err) => {
      if (err) {
        resolve({ ok: false, error: err.message });
      } else {
        resolve({ ok: true, name, pid });
      }
    });
  });
}

async function terminateSafeProcesses() {
  const classified = await getProcessClassification();
  const results = [];
  
  for (const proc of classified.safe) {
    const result = await terminateProcess(proc.pid, proc.name);
    results.push(result);
  }
  
  return results;
}

module.exports = {
  getRunningProcesses,
  getProcessClassification,
  classifyProcess,
  terminateProcess,
  terminateSafeProcesses,
  CRITICAL_PROCESSES,
  SAFE_TO_TERMINATE
};
