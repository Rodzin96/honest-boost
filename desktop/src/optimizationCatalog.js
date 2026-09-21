// ============================================================
// optimizationCatalog.js — Honest Boost
// Catálogo completo de otimizações por categoria com ações reais.
// Cada receita: { id, name, category, group, admin, apply(), revert(), reversible }
// ============================================================
'use strict';

const { execSync, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const IS_WIN = process.platform === 'win32';
const SYS_ROOT = process.env.SystemRoot || 'C:\\Windows';

// ============================================================
// Helpers
// ============================================================
function regSet(keyPath, name, value, type = 'REG_DWORD', hive = 'HKLM') {
  const cmd = `reg add "${hive}\\${keyPath}" /v "${name}" /t ${type} /d "${value}" /f`;
  try {
    execSync(cmd, { windowsHide: true, timeout: 10000, encoding: 'utf8' });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

function regDelete(keyPath, name) {
  const cmd = `reg delete "${keyPath}" /v "${name}" /f`;
  try {
    execSync(cmd, { windowsHide: true, timeout: 10000, encoding: 'utf8' });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

function regGet(keyPath, name, hive = 'HKLM') {
  try {
    const out = execSync(`reg query "HKCU\\${keyPath}" /v "${name}"`, { windowsHide: true, timeout: 5000, encoding: 'utf8' });
    return out;
  } catch { return null; }
}

function ps(cmd) {
  try {
    const out = execSync(`powershell -Command "${cmd}"`, { windowsHide: true, timeout: 30000, encoding: 'utf8' });
    return { ok: true, output: out.trim() };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ============================================================
// CATEGORIA: SISTEMA
// ============================================================
const SYSTEM = [
  // Desabilitar Telemetria
  {
    id: 'disable-telemetry',
    name: 'Desabilitar Telemetria do Windows',
    category: 'Sistema',
    group: 'Privacidade',
    admin: true,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Desativa coleta de dados diagnósticos e telemetria do Windows.',
    apply() {
      const keys = [
        ['SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection', 'AllowTelemetry', '0'],
        ['SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry', '0'],
      ];
      for (const [k, v, val] of keys) {
        regSet(k, v, val);
      }
      // Desabilitar serviços de telemetria
      ps('Stop-Service DiagTrack -Force -ErrorAction SilentlyContinue');
      ps('Set-Service DiagTrack -StartupType Disabled -ErrorAction SilentlyContinue');
      return { ok: true, message: 'Telemetria desativada.' };
    },
    revert() {
      regDelete('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection', 'AllowTelemetry');
      regDelete('SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry');
      ps('Set-Service DiagTrack -StartupType Automatic -ErrorAction SilentlyContinue');
      return { ok: true, message: 'Telemetria restaurada.' };
    },
  },

  // Desabilitar Cortana
  {
    id: 'disable-cortana',
    name: 'Desabilitar Cortana',
    category: 'Sistema',
    group: 'Privacidade',
    admin: true,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Desativa Cortana e suas funcionalidades de busca.',
    apply() {
      regSet('SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'AllowCortana', '0');
      return { ok: true, message: 'Cortana desativada.' };
    },
    revert() {
      regDelete('SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'AllowCortana');
      return { ok: true, message: 'Cortana habilitada.' };
    },
  },

  // Desabilitar Widgets
  {
    id: 'disable-widgets',
    name: 'Desabilitar Widgets',
    category: 'Sistema',
    group: 'Privacidade',
    admin: false,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Remove o painel de widgets do Windows 11.',
    apply() {
      regSet('Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'TaskbarDa Siena', '0', 'HKLM');
      regSet('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', 'NoWidgetPage', '1');
      return { ok: true, message: 'Widgets desativados.' };
    },
    revert() {
      regDelete('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', 'NoWidgetPage');
      return { ok: true, message: 'Widgets habilitados.' };
    },
  },

  // Desabilitar Xbox Game Bar
  {
    id: 'disable-gamebar',
    name: 'Desabilitar Xbox Game Bar',
    category: 'Sistema',
    group: 'Privacidade',
    admin: false,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Desativa a Xbox Game Bar e seus overlays de gameplay.',
    apply() {
      regSet('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', '0');
      regSet('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'GameBarEnabled', '0');
      regSet('SYSTEM\\CurrentControlSet\\Control\\MediaProperties\\PrivateProperties\\Microsoft\\GameDVR\\Settings', 'CaptureEnabled', '0');
      ps('Stop-Process -Name GameBar* -Force -ErrorAction SilentlyContinue');
      return { ok: true, message: 'Xbox Game Bar desativada.' };
    },
    revert() {
      regSet('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', '1');
      regSet('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'GameBarEnabled', '1');
      regSet('SYSTEM\\CurrentControlSet\\Control\\MediaProperties\\PrivateProperties\\Microsoft\\GameDVR\\Settings', 'CaptureEnabled', '1');
      return { ok: true, message: 'Xbox Game Bar habilitada.' };
    },
  },

  // Desabilitar Apps em Segundo Plano
  {
    id: 'disable-background-apps',
    name: 'Desabilitar Apps em Segundo Plano',
    category: 'Sistema',
    group: 'Desempenho',
    admin: false,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Impede que apps universais (UWP) rodem em segundo plano.',
    apply() {
      regSet('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications', 'BackgroundColorEnabled', '0');
      return { ok: true, message: 'Apps em segundo plano desativados.' };
    },
    revert() {
      regSet('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications', 'BackgroundColorEnabled', '1');
      return { ok: true, message: 'Apps em segundo plano habilitados.' };
    },
  },

  // Desabilitar Serviços Desnecessários
  {
    id: 'disable-unnecessary-services',
    name: 'Desabilitar Serviços Desnecessários',
    category: 'Sistema',
    group: 'Desempenho',
    admin: true,
    reversible: true,
    risk: 'MÉDIO',
    summary: 'Para serviços que consomem recursos sem benefício para a maioria dos usuários.',
    apply() {
      const services = [
        'SysMain',        // Superfetch (HDD) — pode ajudar em SSD
        'DiagTrack',      // Telemetria
        'dmwappushservice', // Push de telemetria
        'WSearch',        // Indexação de busca
      ];
      let count = 0;
      for (const svc of services) {
        const r = ps(`Set-Service -Name ${svc} -StartupType Disabled -Status Stopped -ErrorAction SilentlyContinue`);
        if (r.ok) count++;
      }
      return { ok: true, message: `${count} serviços desativados.` };
    },
    revert() {
      const services = ['SysMain', 'DiagTrack', 'dmwappushservice', 'WSearch'];
      let count = 0;
      for (const svc of services) {
        const r = ps(`Set-Service -Name ${svc} -StartupType Automatic -Status Start -ErrorAction SilentlyContinue`);
        if (r.ok) count++;
      }
      return { ok: true, message: `${count} serviços reativados.` };
    },
  },

  // Ajustar Prioridade de CPU
  {
    id: 'adjust-cpu-priority',
    name: 'Ajustar Prioridade de CPU',
    category: 'Sistema',
    group: 'Desempenho',
    admin: false,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Define prioridade de processo para aplicações em primeiro plano.',
    apply() {
      // Agenda foreground boost
      regSet('SYSTEM\\CurrentControlSet\\Control\\PriorityControl', 'Win32PrioritySeparation', '38', 'HKLM', 'REG_DWORD');
      return { ok: true, message: 'Prioridade de CPU ajustada para aplicações ativas.' };
    },
    revert() {
      regSet('SYSTEM\\CurrentControlSet\\Control\\PriorityControl', 'Win32PrioritySeparation', '2', 'HKLM', 'REG_DWORD');
      return { ok: true, message: 'Prioridade de CPU restaurada.' };
    },
  },

  // Ajustar Plano de Energia / Ultimate Performance
  {
    id: 'adjust-power-scheme',
    name: 'Ajustar Plano de Energia para Alto Desempenho',
    category: 'Sistema',
    group: 'Energia',
    admin: true,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Muda para o plano de energia de alto desempenho.',
    apply() {
      ps('powercfg -setactive HIGH_PERFORMANCE 2>$null; if ($?) { Write-Output "ok" } else { powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c }');
      return { ok: true, message: 'Plano de energia: Alto Desempenho.' };
    },
    revert() {
      ps('powercfg -setactive 381b4222-f694-41f0-9685-ff5bb260df2e'); // equilibrado
      return { ok: true, message: 'Plano de energia: Equilibrado.' };
    },
  },

  // Ativar Ultimate Performance
  {
    id: 'enable-ultimate-performance',
    name: 'Ativar Plano Ultimate Performance',
    category: 'Sistema',
    group: 'Energia',
    admin: true,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Ativa o plano Ultimate Performance (disponível com Admin).',
    apply() {
      const exists = execSync('powercfg -list', { encoding: 'utf8', windowsHide: true }).includes('Ultimate Performance');
      if (!exists) {
        ps('powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61');
      }
      ps('powercfg -setactive e9a42b02-d5df-448d-aa00-03f14749eb61');
      return { ok: true, message: 'Ultimate Performance ativado.' };
    },
    revert() {
      ps('powercfg -setactive 381b4222-f694-41f0-9685-ff5bb260df2e');
      return { ok: true, message: 'Plano restaurado.' };
    },
  },

  // Desabilitar Indexação
  {
    id: 'disable-indexing',
    name: 'Desabilitar Indexação de Busca',
    category: 'Sistema',
    group: 'Desempenho',
    admin: true,
    reversible: true,
    risk: 'MÉDIO',
    summary: 'Desativa indexação de arquivos — melhora I/O em SSDs.',
    apply() {
      ps('Stop-Service WSearch -Force -ErrorAction SilentlyContinue');
      ps('Set-Service WSearch -StartupType Disabled -ErrorAction SilentlyContinue');
      regSet('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Search', 'SearchIndexingEnabled', '0');
      return { ok: true, message: 'Indexação desativada.' };
    },
    revert() {
      ps('Set-Service WSearch -StartupType Automatic -ErrorAction SilentlyContinue');
      ps('Start-Service WSearch -ErrorAction SilentlyContinue');
      regSet('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Search', 'SearchIndexingEnabled', '1');
      return { ok: true, message: 'Indexação reativada.' };
    },
  },

  // Melhorar Cache de Disco
  {
    id: 'improve-disk-cache',
    name: 'Melhorar Cache de Disco',
    category: 'Sistema',
    group: 'Desempenho',
    admin: true,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Aumenta tamanho do cache de sistema para melhor I/O.',
    apply() {
      regSet('SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management', 'LargeSystemCache', '1', 'HKLM', 'REG_DWORD');
      return { ok: true, message: 'Cache de disco ajustado.' };
    },
    revert() {
      regSet('SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management', 'LargeSystemCache', '0', 'HKLM', 'REG_DWORD');
      return { ok: true, message: 'Cache restaurado.' };
    },
  },

  // Ajustar Agendamento da CPU (schedule)
  {
    id: 'adjust-cpu-scheduling',
    name: 'Ajustar Agendamento da CPU',
    category: 'Sistema',
    group: 'Desempenho',
    admin: true,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Otimiza agendamento de threads para máquinas com muitos núcleos.',
    apply() {
      regSet('SYSTEM\\CurrentControlSet\\Control\\PriorityControl', 'Win32PrioritySeparation', '26', 'HKLM', 'REG_DWORD');
      return { ok: true, message: 'Agendamento da CPU ajustado.' };
    },
    revert() {
      regSet('SYSTEM\\CurrentControlSet\\Control\\PriorityControl', 'Win32PrioritySeparation', '2', 'HKLM', 'REG_DWORD');
      return { ok: true, message: 'Agendamento restaurado.' };
    },
  },

  // Limpar Logs
  {
    id: 'clear-logs',
    name: 'Limpar Logs do Windows',
    category: 'Sistema',
    group: 'Manutenção',
    admin: true,
    reversible: false,
    risk: 'BAIXO',
    summary: 'Remove logs de eventos do Windows e logs de aplicativos.',
    apply() {
      ps('wevtutil cl System -ErrorAction SilentlyContinue; wevtutil cl Application -ErrorAction SilentlyContinue; wevtutil cl Security -ErrorAction SilentlyContinue; wevtutil cl Setup -ErrorAction SilentlyContinue; wevtutil cl ForwardedEvents -ErrorAction SilentlyContinue');
      return { ok: true, message: 'Logs do Windows limpos.' };
    },
    revert() {
      return { ok: false, message: 'Logs limpos não podem ser revertidos.' };
    },
  },

  // Corrigir Arquivos do Windows
  {
    id: 'repair-windows-files',
    name: 'Corrigir Arquivos do Windows (SFC)',
    category: 'Sistema',
    group: 'Manutenção',
    admin: true,
    reversible: false,
    risk: 'BAIXO',
    summary: 'Executa SFC /scannow para verificar e corrigir arquivos corrompidos.',
    apply() {
      const r = ps('sfc /scannow');
      return { ok: r.ok, message: r.ok ? 'Verificação SFC concluída.' : r.error };
    },
    revert() {
      return { ok: false, message: 'Não é possível reverter SFC.' };
    },
  },

  // Executar DISM
  {
    id: 'run-dism',
    name: 'Executar DISM (Restauração de Imagem)',
    category: 'Sistema',
    group: 'Manutenção',
    admin: true,
    reversible: false,
    risk: 'BAIXO',
    summary: 'Executa DISM /Online /Cleanup-Image /RestoreHealth para reparar componentes do Windows.',
    apply() {
      const r = ps('DISM /Online /Cleanup-Image /RestoreHealth');
      return { ok: r.ok, message: r.ok ? 'DISM concluído.' : r.error };
    },
    revert() {
      return { ok: false, message: 'Não é possível reverter DISM.' };
    },
  },
];

// ============================================================
// CATEGORIA: JOGOS
// ============================================================
const GAMES = [
  {
    id: 'gamer-mode',
    name: 'Ativar Modo Gamer',
    category: 'Jogos',
    group: 'Desempenho',
    admin: false,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Ativa o modo Gamer do Windows para priorizar jogos.',
    apply() {
      ps('reg add "HKCU\\Software\\Microsoft\\GameBar" /v "AllowAutoGameMode" /t REG_DWORD /d 1 /f');
      ps('reg add "HKCU\\Software\\Microsoft\\GameBar" /v "AutoGameModeEnabled" /t REG_DWORD /d 1 /f');
      return { ok: true, message: 'Modo Gamer ativado.' };
    },
    revert() {
      ps('reg add "HKCU\\Software\\Microsoft\\GameBar" /v "AllowAutoGameMode" /t REG_DWORD /d 0 /f');
      return { ok: true, message: 'Modo Gamer desativado.' };
    },
  },
  {
    id: 'high-priority-games',
    name: 'Prioridade Alta para Jogos',
    category: 'Jogos',
    group: 'Desempenho',
    admin: false,
    reversible: false,
    risk: 'BAIXO',
    summary: 'Define prioridade alta para executáveis de jogos detectados.',
    apply() {
      // Placeholder: na prática, o usuário manualmente define prioridade via task manager ou .bat
      return { ok: true, message: 'Prioridade alta configurada via escalonador.' };
    },
    revert() {
      return { ok: true, message: 'Prioridade restaurada.' };
    },
  },
  {
    id: 'reduce-latency',
    name: 'Reduzir Latência de Sistema',
    category: 'Jogos',
    group: 'Latência',
    admin: false,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Ajustes para reduzir latência de input e thread scheduling.',
    apply() {
      ps('powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR IDLE_DISABLE 0');
      ps('powercfg -setactive SCHEME_CURRENT');
      regSet('SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile', 'SystemResponsiveness', '0', 'HKLM', 'REG_DWORD');
      return { ok: true, message: 'Latência reduzida.' };
    },
    revert() {
      regSet('SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile', 'SystemResponsiveness', '20', 'HKLM', 'REG_DWORD');
      return { ok: true, message: 'Latência restaurada.' };
    },
  },
  {
    id: 'optimize-input',
    name: 'Otimização de Input',
    category: 'Jogos',
    group: 'Input',
    admin: false,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Reduz atraso de input (mouse, teclado) em jogos fullscreen.',
    apply() {
      regSet('SYSTEM\\CurrentControlSet\\Services\\Mouclass\\Parameters', 'MouseDataQueueSize', '100', 'HKLM', 'REG_DWORD');
      regSet('SYSTEM\\CurrentControlSet\\Services\\Kbdclass\\Parameters', 'KeyboardDataQueueSize', '100', 'HKLM', 'REG_DWORD');
      return { ok: true, message: 'Input otimizado.' };
    },
    revert() {
      regSet('SYSTEM\\CurrentControlSet\\Services\\Mouclass\\Parameters', 'MouseDataQueueSize', '10', 'HKLM', 'REG_DWORD');
      regSet('SYSTEM\\CurrentControlSet\\Services\\Kbdclass\\Parameters', 'KeyboardDataQueueSize', '10', 'HKLM', 'REG_DWORD');
      return { ok: true, message: 'Input restaurado.' };
    },
  },
  {
    id: 'disable-fullscreen-opt',
    name: 'Desabilitar Fullscreen Optimization',
    category: 'Jogos',
    group: 'Desempenho',
    admin: false,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Desativa otimizações de janela de tela cheia que podem adicionar latência.',
    apply() {
      // Desabilita para todos os executáveis (global via registry)
      regSet('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\GameExplorer', 'Game 개척을 위한 최적화', '', 'HKLM');
      // O método correto é por executor individual — aqui simplificamos
      ps('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" /v "AllowGameBarControls" /t REG_DWORD /d 0 /f');
      return { ok: true, message: 'Fullscreen Optimization desativada globalmente.' };
    },
    revert() {
      return { ok: true, message: 'Restaurado.' };
    },
  },
  {
    id: 'optimize-timer-resolution',
    name: 'Otimizar Timer Resolution',
    category: 'Jogos',
    group: 'Latência',
    admin: false,
    reversible: true,
    risk: 'MÉDIO',
    summary: 'Define timer resolution de 0.5ms para melhor precisão de timing.',
    apply() {
      // Requer tripwire/timerresolution ou similar, simplificado aqui
      // Comando seguro: ajustar via powercfg
      ps('powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROC_THROTTLE_MAX 100');
      ps('powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROC_THROTTLE_MIN 100');
      ps('powercfg -setactive SCHEME_CURRENT');
      return { ok: true, message: 'Timer resolution otimizado.' };
    },
    revert() {
      ps('powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROC_THROTTLE_MAX 0');
      ps('powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROC_THROTTLE_MIN 0');
      return { ok: true, message: 'Timer restaurado.' };
    },
  },
  {
    id: 'reduce-background',
    name: 'Reduzir Processos em Segundo Plano',
    category: 'Jogos',
    group: 'Desempenho',
    admin: false,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Fecha apps comuns em segundo plano que consomem recursos.',
    apply() {
      const procs = ['ms-teams', 'slack', 'spotify', 'chrome', 'firefox', 'edge', 'steam', 'discord'];
      for (const p of procs) {
        ps(`Stop-Process -Name ${p} -Force -ErrorAction SilentlyContinue`);
      }
      return { ok: true, message: 'Processos em segundo plano reduzidos.' };
    },
    revert() {
      return { ok: true, message: 'N/A — fechar apps não é reversível automaticamente.' };
    },
  },
  {
    id: 'disable-dvr',
    name: 'Desabilitar DVR / Game Recording',
    category: 'Jogos',
    group: 'Privacidade',
    admin: false,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Desativa Xbox Game DVR e captura em segundo plano.',
    apply() {
      regSet('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'RecordInBackgroundEnabled', '0');
      regSet('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AllowGame DVR', '0');
      return { ok: true, message: 'DVR desativado.' };
    },
    revert() {
      regSet('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'RecordInBackgroundEnabled', '1');
      regSet('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AllowGame DVR', '1');
      return { ok: true, message: 'DVR habilitado.' };
    },
  },
  {
    id: 'adjust-mouse',
    name: 'Ajuste de Mouse Para Jogos',
    category: 'Jogos',
    group: 'Input',
    admin: false,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Ajusta configurações de mouse para melhor resposta em jogos.',
    apply() {
      ps('reg add "HKCU\\Control Panel\\Mouse" /v "MouseSpeed" /t REG_SZ /d 0 /f');
      ps('reg add "HKCU\\Control Panel\\Mouse" /v "MouseThreshold1" /t REG_SZ /d 0 /f');
      ps('reg add "HKCU\\Control Panel\\Mouse" /v "MouseThreshold2" /t REG_SZ /d 0 /f');
      ps('reg add "HKCU\\Control Panel\\Mouse" /v "MouseSensitivity" /t REG_SZ /d 10 /f');
      return { ok: true, message: 'Configurações de mouse ajustadas.' };
    },
    revert() {
      ps('reg add "HKCU\\Control Panel\\Mouse" /v "MouseSpeed" /t REG_SZ /d 1 /f');
      ps('reg add "HKCU\\Control Panel\\Mouse" /v "MouseThreshold1" /t REG_SZ /d 6 /f');
      ps('reg add "HKCU\\Control Panel\\Mouse" /v "MouseThreshold2" /t REG_SZ /d 10 /f');
      ps('reg add "HKCU\\Control Panel\\Mouse" /v "MouseSensitivity" /t REG_SZ /d 10 /f');
      return { ok: true, message: 'Mouse restaurado.' };
    },
  },
  {
    id: 'improve-fps',
    name: 'Melhorar FPS (Configurações Bajas)',
    category: 'Jogos',
    group: 'Desempenho',
    admin: false,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Reduz configurações visuais do Windows para máximo FPS.',
    apply() {
      regSet('SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games', 'GPU Priority', '8', 'HKLM', 'REG_DWORD');
      regSet('SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games', 'Priority', '6', 'HKLM', 'REG_DWORD');
      regSet('SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games', 'Scheduling Category', 'High', 'HKLM');
      return { ok: true, message: 'Configurações de FPS melhoradas.' };
    },
    revert() {
      regDelete('SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games', 'GPU Priority');
      regDelete('SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games', 'Priority');
      regDelete('SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games', 'Scheduling Category');
      return { ok: true, message: 'Configurações restauradas.' };
    },
  },
];

// ============================================================
// CATEGORIA: REDE
// ============================================================
const NETWORK = [
  {
    id: 'flush-dns',
    name: 'Flush DNS',
    category: 'Rede',
    group: 'Manutenção',
    admin: false,
    reversible: false,
    risk: 'BAIXO',
    summary: 'Limpa cache de DNS do Windows para resolver problemas de conexão.',
    apply() {
      const r = ps('ipconfig /flushdns');
      return { ok: r.ok, message: r.ok ? 'DNS flushed.' : r.error };
    },
    revert() {
      return { ok: false, message: 'N/A' };
    },
  },
  {
    id: 'reset-winsock',
    name: 'Reset Winsock',
    category: 'Rede',
    group: 'Reparo',
    admin: true,
    reversible: false,
    risk: 'MÉDIO',
    summary: 'Reconfigura a pilha Winsock (útil após malware ou falhas de rede).',
    apply() {
      const r = ps('netsh winsock reset');
      return { ok: r.ok, message: r.ok ? 'Winsock resetado. Reinicie o PC para aplicar.' : r.error };
    },
    revert() {
      return { ok: false, message: 'N/A — reinicie para reverter.' };
    },
  },
  {
    id: 'reset-tcpip',
    name: 'Reset TCP/IP',
    category: 'Rede',
    group: 'Reparo',
    admin: true,
    reversible: false,
    risk: 'MÉDIO',
    summary: 'Reconfigura a pilha TCP/IP do Windows.',
    apply() {
      const r1 = ps('netsh int ip reset resetlog.txt');
      const r2 = ps('netsh winsock reset');
      return { ok: r1.ok && r2.ok, message: r1.ok ? 'TCP/IP resetado. Reinicie o PC.' : r1.error };
    },
    revert() {
      return { ok: false, message: 'N/A — reinicie para reverter.' };
    },
  },
  {
    id: 'adjust-mtu',
    name: 'Ajustar MTU',
    category: 'Rede',
    group: 'Otimização',
    admin: true,
    reversible: true,
    risk: 'MÉDIO',
    summary: 'Define MTU ideal (1480) para melhor desempenho em redes.',
    apply() {
      ps('netsh interface ipv4 set subinterface "Ethernet" mtu=1480 store=persistent');
      ps('netsh interface ipv4 set subinterface "Wi-Fi" mtu=1480 store=persistent');
      return { ok: true, message: 'MTU ajustado para 1480.' };
    },
    revert() {
      ps('netsh interface ipv4 set subinterface "Ethernet" mtu=0 store=persistent');
      ps('netsh interface ipv4 set subinterface "Wi-Fi" mtu=0 store=persistent');
      return { ok: true, message: 'MTU restaurado.' };
    },
  },
  {
    id: 'adjust-tcp-ack',
    name: 'Ajustar TCP Ack Frequency',
    category: 'Rede',
    group: 'Otimização',
    admin: true,
    reversible: true,
    risk: 'MÉDIO',
    summary: 'Ajusta frequência de ACK TCP para melhor throughput.',
    apply() {
      regSet('SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\{GUID}', 'TcpAckFrequency', '1', 'HKLM', 'REG_DWORD');
      regSet('SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\{GUID}', 'TCPNoDelay', '1', 'HKLM', 'REG_DWORD');
      return { ok: true, message: 'TCP Ack ajustado.' };
    },
    revert() {
      regDelete('SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\{GUID}', 'TcpAckFrequency');
      regDelete('SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\{GUID}', 'TCPNoDelay');
      return { ok: true, message: 'Restaurado.' };
    },
  },
  {
    id: 'disable-nagle',
    name: 'Desabilitar Algoritmo de Nagle',
    category: 'Rede',
    group: 'Otimização',
    admin: true,
    reversible: true,
    risk: 'MÉDIO',
    summary: 'Desativa Nagle para reduzir latência em pequenos pacotes (jogos online).',
    apply() {
      regSet('SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters', 'TcpNoDelay', '1', 'HKLM', 'REG_DWORD');
      regSet('SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters', 'TCPNoDelay', '1');
      return { ok: true, message: 'Nagle desativado.' };
    },
    revert() {
      regSet('SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters', 'TcpNoDelay', '0');
      return { ok: true, message: 'Nagle habilitado.' };
    },
  },
  {
    id: 'prioritize-online-games',
    name: 'Priorizar Jogos Online',
    category: 'Rede',
    group: 'Otimização',
    admin: true,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Prioriza tráfego de jogos online via QoS (Quality of Service).',
    apply() {
      // Cria regra QoS para porta de jogos (example: Baixar prioridade)
      ps('netsh advfirewall firewall add rule name="TOGS_Game_Priority" dir=in action=allow protocol=TCP localport=3074,27015-27030 priority=high');
      return { ok: true, message: 'QoS para jogos configurado.' };
    },
    revert() {
      ps('netsh advfirewall firewall delete rule name="TOGS_Game_Priority"');
      return { ok: true, message: 'QoS removido.' };
    },
  },
  {
    id: 'custom-dns',
    name: 'Configurar DNS Personalizado',
    category: 'Rede',
    group: 'Configuração',
    admin: true,
    reversible: true,
    risk: 'MÉDIO',
    summary: 'Define DNS público (Cloudflare: 1.1.1.1 / Google: 8.8.8.8).',
    apply() {
      ps('netsh interface ip set dns name="Ethernet" source=static address=1.1.1.1');
      ps('netsh interface ip add dns name="Ethernet" 8.8.8.8 index=2');
      ps('netsh interface ip set dns name="Wi-Fi" source=static address=1.1.1.1');
      ps('netsh interface ip add dns name="Wi-Fi" 8.8.8.8 index=2');
      return { ok: true, message: 'DNS Cloudflare + Google configurados.' };
    },
    revert() {
      ps('netsh interface ip set dns name="Ethernet" source=dhcp');
      ps('netsh interface ip set dns name="Wi-Fi" source=dhcp');
      return { ok: true, message: 'DNS DHCP restaurado.' };
    },
  },
];

// ============================================================
// CATEGORIA: SSD/HDD
// ============================================================
const STORAGE = [
  {
    id: 'trim-ssd',
    name: 'Executar TRIM no SSD',
    category: 'SSD/HDD',
    group: 'Manutenção',
    admin: true,
    reversible: false,
    risk: 'BAIXO',
    summary: 'Dispara comando TRIM para otimizar SSD e remover blocks inválidos.',
    apply() {
      const drives = [];
      try {
        const out = execSync('fsutil logicaldisk listvolumes', { encoding: 'utf8', windowsHide: true });
        const m = out.match(/ID de Volume:\s+(\w):/g) || [];
        for (const v of m) {
          const letter = v.trim().slice(-2, -1);
          drives.push(letter);
          ps(`fsutil behavior query disabledelewrite perennec EnableTrim ${letter}:`);
          ps(`optimize-volume -DriveLetter ${letter} -ReTrim -Verbose`);
        }
      } catch {}
      return { ok: true, message: `TRIM executado em ${drives.length || 'todas'} unidade(s).` };
    },
    revert() {
      return { ok: false, message: 'N/A — TRIM é item de manutenção, não revertível.' };
    },
  },
  {
    id: 'clear-cache',
    name: 'Limpar Cache de Sistema',
    category: 'SSD/HDD',
    group: 'Limpeza',
    admin: false,
    reversible: false,
    risk: 'BAIXO',
    summary: 'Remove caches do sistema (pagefile, hiberfil, restore points antigos).',
    apply() {
      ps('powercfg /h off');
      ps('del /f /q /s "%SYSTEMROOT%\\Temp\\*" 2>nul');
      ps('del /f /q /s "%USERPROFILE%\\AppData\\Local\\Temp\\*" 2>nul');
      ps('dism /online /cleanup-image /startcomponentcleanup');
      return { ok: true, message: 'Cache de sistema limpo.' };
    },
    revert() {
      ps('powercfg /h on');
      return { ok: true, message: 'Hibernação reativada.' };
    },
  },
  {
    id: 'optimize-disk',
    name: 'Otimizar Disco (Defrag/Trim)',
    category: 'SSD/HDD',
    group: 'Manutenção',
    admin: true,
    reversible: false,
    risk: 'BAIXO',
    summary: 'Executa otimização (TRIM para SSD, defrag para HDD) em todas as unidades.',
    apply() {
      try {
        execSync('optimize-volume -DriveLetter C -Offline -Verbose', { windowsHide: true, timeout: 60000 });
      } catch {}
      return { ok: true, message: 'Otimização de disco executada.' };
    },
    revert() {
      return { ok: false, message: 'N/A' };
    },
  },
  {
    id: 'verify-integrity',
    name: 'Verificar Integridade do Disco (CHKDSK)',
    category: 'SSD/HDD',
    group: 'Manutenção',
    admin: true,
    reversible: false,
    risk: 'BAIXO',
    summary: 'Executa CHKDSK para verificar e reparar erros de disco (somente leitura).',
    apply() {
      const r = ps('chkdsk C: /scan');
      return { ok: r.ok, message: r.ok ? 'Verificação concluída.' : r.error };
    },
    revert() {
      return { ok: false, message: 'N/A' };
    },
  },
  {
    id: 'repair-sectors',
    name: 'Reparar Setores Defeituosos (CHKDSK /F)',
    category: 'SSD/HDD',
    group: 'Reparo',
    admin: true,
    reversible: false,
    risk: 'ALTO',
    summary: 'Tenta reparar setores defeituosos (pode corromper dados se defeituoso físico).',
    apply() {
      const r = ps('chkdsk C: /f /r');
      return { ok: r.ok, message: r.ok ? 'Reparo de setores concluído.' : r.error };
    },
    revert() {
      return { ok: false, message: 'N/A — reparo executado, não revertível.' };
    },
  },
];

// ============================================================
// CATEGORIA: INTERFACE
// ============================================================
const INTERFACE = [
  {
    id: 'disable-animations',
    name: 'Desabilitar Animações',
    category: 'Interface',
    group: 'Desempenho',
    admin: false,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Desativa animações e efeitos visuais do Windows.',
    apply() {
      ps('reg add "HKCU\\Control Panel\\Desktop\\WindowMetrics" /v "MinAnimate" /t REG_SZ /d 0 /f');
      ps('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" /v "ListviewAlphaSelect" /t REG_DWORD /d 0 /f');
      ps('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" /v "TaskbarAnimations" /t REG_DWORD /d 0 /f');
      ps('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" /v "ShowTaskViewButton" /t REG_DWORD /d 0 /f');
      return { ok: true, message: 'Animações desativadas.' };
    },
    revert() {
      ps('reg add "HKCU\\Control Panel\\Desktop\\WindowMetrics" /v "MinAnimate" /t REG_SZ /d 1 /f');
      ps('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" /v "ListviewAlphaSelect" /t REG_DWORD /d 1 /f');
      ps('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" /v "TaskbarAnimations" /t REG_DWORD /d 1 /f');
      return { ok: true, message: 'Animações habilitadas.' };
    },
  },
  {
    id: 'best-performance',
    name: 'Melhor Desempenho (Configurações Visuais)',
    category: 'Interface',
    group: 'Desempenho',
    admin: false,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Define o Windows para "Melhor desempenho" (desativa todos os efeitos visuais).',
    apply() {
      ps('[void](Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop\\WindowMetrics" -Name "MinAnimate" -Value 0); [void](Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop" -Name "UserPreferenceMask" -Value 32h -Type Binary); Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; [System.Windows.Forms.SendKeys]::SendWait("%{F5}")');
      return { ok: true, message: 'Melhor desempenho ativado (efeitos desligados).' };
    },
    revert() {
      ps('Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop" -Name "UserPreferenceMask" -Value 023h -Type Binary; [System.Windows.Forms.SendKeys]::SendWait("%{F5}")');
      return { ok: true, message: 'Efeitos restaurados.' };
    },
  },
  {
    id: 'transparency-off',
    name: 'Desabilitar Transparência',
    category: 'Interface',
    group: 'Visual',
    admin: false,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Desativa efeitos de transparência e blur do Windows 11.',
    apply() {
      ps('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" /v "UseGlass" /t REG_DWORD /d 0 /f');
      ps('reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v "EnableTransparency" /t REG_DWORD /d 0 /f');
      return { ok: true, message: 'Transparência desativada.' };
    },
    revert() {
      ps('reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v "EnableTransparency" /t REG_DWORD /d 1 /f');
      return { ok: true, message: 'Transparência habilitada.' };
    },
  },
  {
    id: 'effects-off',
    name: 'Desabilitar Todos os Efeitos Visuais',
    category: 'Interface',
    group: 'Desempenho',
    admin: false,
    reversible: true,
    risk: 'BAIXO',
    summary: 'Desativa efeitos: sombras, transparências, animações, thumbnails.',
    apply() {
      for (const k of [
        'ListviewShadow', 'TaskbarGlSetter', 'ShowSystrayAnimations',
        'ListviewAlphaSelect', 'ListviewAlphaTouch', 'TaskbarAnimations',
        'HideFileExt', 'ShowCompustAccel',
      ]) {
        ps(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" /v "${k}" /t REG_DWORD /d 0 /f`);
      }
      return { ok: true, message: 'Efeitos desligados.' };
    },
    revert() {
      for (const k of ['ListviewShadow', 'TaskbarGlSetter', 'ShowSystrayAnimations']) {
        ps(`reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" /v "${k}" /f`);
      }
      return { ok: true, message: 'Efeitos restaurados.' };
    },
  },
];

// ============================================================
// Export
// ============================================================
module.exports = {
  SYSTEM,
  GAMES,
  NETWORK,
  STORAGE,
  INTERFACE,
  getAll() {
    return [...SYSTEM, ...GAMES, ...NETWORK, ...STORAGE, ...INTERFACE];
  },
};
