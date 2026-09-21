// ============================================================
// healthAnalyzer.js — Honest Boost
// Sistema de análise inteligente: pontuação de saúde (0–100)
// e recomendações automatizadas baseadas em hardware e estado do sistema.
// ============================================================
'use strict';

const os = require('os');
const { execSync, execFile } = require('child_process');
const sys = require('./realtimeMonitor');

const IS_WIN = process.platform === 'win32';

// ============================================================
// Pontuação: cada check retorna { points, label, severity, fixId }
// ============================================================
function analyzeHealth() {
  const checks = [];
  const cpu = sys.cpuUsage();
  const ram = sys.ramStats();
  const space = sys.diskSpace();
  const procs = sys.processCount();
  const startup = sys.startupApps();
  const gpu = sys.gpuStats();
  const gpuTemp = sys.gpuTemperature();
  const net = sys.networkIO();
  const uptime = sys.uptime();
  const win = sys.windowsStatus();

  // CPU usage — ideal < 80%
  const cpuScore = cpu < 30 ? 15 : cpu < 50 ? 12 : cpu < 70 ? 8 : cpu < 85 ? 5 : 2;
  checks.push({
    id: 'cpu-usage',
    points: cpuScore,
    label: `Uso de CPU: ${cpu.toFixed(1)}%`,
    severity: cpu > 85 ? 'high' : cpu > 70 ? 'medium' : 'low',
    desc: cpu > 70 ? 'CPU em uso elevado — pode impactar performance de jogos.' : 'CPU dentro de limites normais.',
  });

  // RAM usage — ideal < 75%
  const ramPct = ram.pct;
  const ramScore = ramPct < 40 ? 15 : ramPct < 60 ? 12 : ramPct < 80 ? 6 : 2;
  checks.push({
    id: 'ram-usage',
    points: ramScore,
    label: `RAM: ${ramPct.toFixed(0)}% usado`,
    severity: ramPct > 80 ? 'high' : ramPct > 60 ? 'medium' : 'low',
    desc: ramPct > 75 ? 'Muita RAM ocupada — considere fechar apps em segundo plano.' : 'Uso de RAM adequado.',
  });

  // Espaço em disco (C:) — ideal > 20% livre
  let diskScore = 10;
  const cDrive = space.find(d => d.device === 'C:');
  if (cDrive) {
    const pctFree = (cDrive.free / cDrive.size) * 100;
    if (pctFree < 10) { diskScore = 2; }
    else if (pctFree < 20) { diskScore = 5; }
    else if (pctFree < 30) { diskScore = 7; }
    else { diskScore = 10; }
    checks.push({
      id: 'disk-space',
      points: diskScore,
      label: `Disco C: ${((cDrive.size - cDrive.free) / 1e9).toFixed(1)} GB usados`,
      severity: pctFree < 15 ? 'high' : pctFree < 25 ? 'medium' : 'low',
      desc: pctFree < 20 ? 'Disco quase cheio — libere espaço urgentemente.' : 'Espaço em disco adequado.',
    });
  } else {
    checks.push({ id: 'disk-space', points: 5, label: 'Espaço em disco: não detectado', severity: 'medium', desc: '' });
  }

  // Processos em excesso
  let procScore = 10;
  if (procs.count > 200) procScore = 4;
  else if (procs.count > 150) procScore = 6;
  else if (procs.count > 100) procScore = 8;
  checks.push({
    id: 'process-count',
    points: procScore,
    label: `Processos: ${procs.count}`,
    severity: procs.count > 150 ? 'high' : procs.count > 100 ? 'medium' : 'low',
    desc: procs.count > 150 ? 'Muitos processos ativos — possível acúmulo de apps parados.' : 'Quantidade de processos normal.',
  });

  // Apps de startup
  let startupScore = Math.max(0, 5 - startup.length);
  if (startup.length > 6) startupScore = 0;
  else if (startup.length > 3) startupScore = 2;
  checks.push({
    id: 'startup-count',
    points: startupScore,
    label: `Apps iniciando: ${startup.length}`,
    severity: startup.length > 6 ? 'high' : startup.length > 3 ? 'medium' : 'low',
    desc: startup.length > 5 ? 'Vários apps inicializados automaticamente — desabilite os que não usa.' : 'Startup equilibrado.',
  });

  // Temperatura GPU (se disponível)
  let tempScore = 5;
  if (gpuTemp !== null) {
    if (gpuTemp > 85) tempScore = 1;
    else if (gpuTemp > 75) tempScore = 2;
    else if (gpuTemp > 65) tempScore = 3;
    else tempScore = 5;
    checks.push({
      id: 'gpu-temp',
      points: tempScore,
      label: `GPU Temp: ${gpuTemp}°C`,
      severity: gpuTemp > 80 ? 'high' : gpuTemp > 70 ? 'medium' : 'low',
      desc: gpuTemp > 75 ? 'Temperatura da GPU elevada — verifique ventilação.' : 'Temperatura normal.',
    });
  } else {
    checks.push({ id: 'gpu-temp', points: 3, label: 'GPU Temp: não detectada', severity: 'low', desc: 'Sensor de temperatura não disponível neste hardware.' });
  }

  // Status do Windows Defender / serviços essenciais
  let securityScore = win.보안 === 'Ativado' ? 10 : 3;
  checks.push({
    id: 'security-status',
    points: securityScore,
    label: `Proteção do Windows: ${win.보안}`,
    severity: win.보안 !== 'Ativado' ? 'high' : 'low',
    desc: win.보안 === 'Ativado' ? 'Proteção ativa.' : 'Windows Defender desativado — ative para segurança.',
  });

  // Net throughput (indicador de saúde de rede — sem métrica crítica, apenas informativo)
  checks.push({
    id: 'network-health',
    points: Math.min(5, Math.floor((net.rxMBps + net.txMBps) * 0.5)),
    label: `Rede: ${(net.rxMBps + net.txMBps).toFixed(2)} MB/s`,
    severity: 'low',
    desc: 'Estado de rede ok.',
  });

  // Tempo ligado (quanto mais tempo, mais sujeito a vazamento de memória / acúmulo)
  let uptimeScore = Math.min(5, Math.max(0, 5 - Math.floor(uptime.days / 3)));
  checks.push({
    id: 'uptime',
    points: uptimeScore,
    label: `Uptime: ${uptime.label}`,
    severity: uptime.days > 15 ? 'medium' : 'low',
    desc: uptime.days > 10 ? 'Sistema ligado há muitos dias — reiniciar pode melhorar performance.' : 'Uptime razoável.',
  });

  // G GPU detectada? Bom indicador de hardware gamer
  const hasGPU = gpu.name !== 'Desconhecida' && gpu.vram > 0;

  const totalPoints = checks.reduce((s, c) => s + c.points, 0);
  const maxPoints = 100; // normalizar
  const healthScore = Math.min(100, Math.round((totalPoints / maxPoints) * 100));

  // Recomendações baseadas nos checks com severity alta e média e baixa points
  const recommendations = checks
    .filter(c => c.severity !== 'low' && c.points < 8)
    .sort((a, b) => b.severity === 'high' ? 1 : -1)
    .map(c => ({
      id: c.id,
      label: c.label,
      desc: c.desc,
      priority: c.severity === 'high' ? 'alta' : 'média',
    }));

  return {
    score: Math.max(0, Math.min(100, healthScore)),
    checks,
    recommendations,
    hardware: {
      cpu: { name: os.cpus()[0]?.model, cores: os.cpus().length },
      ram: { totalGB: (ram.total / 1e9).toFixed(1) },
      disk: cDrive ? { totalGB: (cDrive.size / 1e9).toFixed(1), freeGB: (cDrive.free / 1e9).toFixed(1), label: cDrive.label } : null,
      gpu: hasGPU ? { name: gpu.name, vramGB: (gpu.vram / 1e9).toFixed(1) } : null,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================
// Presets de otimização — mapeamento para o CATÁLOGO VALIDADO (catalog.js)
// ============================================================
const PRESETS = {
  'max-performance': {
    name: 'Performance Máxima',
    icon: '🚀',
    desc: 'Todas as otimizações recomendadas aplicadas. Ideal para máquinas dedicadas a jogos.',
    optimizations: [
      'telemetry',
      'visual-effects',
      'services-safe-disable',
      'ndu-disable',
      'power-plan-ultimate',
      'hibernation-off',
      'perfboost-mode',
      'game-dvr',
      'cs2-cvars',
      'system-responsiveness',
      'flushdns',
      'spacesniffer',
      'process-lasso',
      'runtimes-throttlestop',
    ],
    cleaning: ['temp-files', 'prefetch', 'wu-cache', 'thumbnails', 'dns-cache', 'clipboard', 'logs', 'error-reports'],
  },
  'balanced': {
    name: 'Equilibrado',
    icon: '⚖️',
    desc: 'Otimizações seguras que melhoram desempenho sem afetar funcionalidade do Windows.',
    optimizations: [
      'telemetry',
      'visual-effects',
      'services-safe-disable',
      'power-plan-ultimate',
      'game-dvr',
      'flushdns',
      'temp-cleanup',
    ],
    cleaning: ['temp-files', 'prefetch', 'wu-cache', 'thumbnails', 'dns-cache'],
  },
  'streaming': {
    name: 'Streaming',
    icon: '📺',
    desc: 'Otimizado para transmitir jogos — mais CPU/RAM para o encoder.',
    optimizations: [
      'telemetry',
      'visual-effects',
      'services-safe-disable',
      'power-plan-ultimate',
      'flushdns',
      'temp-cleanup',
    ],
    cleaning: ['temp-files', 'prefetch', 'wu-cache', 'thumbnails', 'dns-cache'],
  },
  'competitive': {
    name: 'Jogos Competitivos',
    icon: '🏆',
    desc: 'Latência mínima e prioridade máxima para jogos competitivos.',
    optimizations: [
      'telemetry',
      'visual-effects',
      'services-safe-disable',
      'power-plan-ultimate',
      'game-dvr',
      'cs2-cvars',
      'system-responsiveness',
      'mpo-disable',
      'games-task-gpu31',
      'perfboost-mode',
      'flushdns',
      'process-lasso',
      'runtimes-throttlestop',
    ],
    cleaning: ['temp-files', 'prefetch', 'wu-cache', 'thumbnails', 'dns-cache', 'clipboard', 'logs'],
  },
  'laptop': {
    name: 'Notebook',
    icon: '💻',
    desc: 'Equilíbrio entre desempenho e consumo em notebooks.',
    optimizations: [
      'telemetry',
      'visual-effects',
      'services-safe-disable',
      'power-plan-ultimate',
      'flushdns',
      'temp-cleanup',
      'igpu-vram',
    ],
    cleaning: ['temp-files', 'prefetch', 'wu-cache', 'thumbnails', 'dns-cache'],
  },
  'custom': {
    name: 'Personalizado',
    icon: '⚙️',
    desc: 'Sem preset aplicado — escolha manualmente.',
    optimizations: [],
    cleaning: [],
  },
};

// ============================================================
// Mapeamento: ID simbólico → IDs do catálogo atual (catalog.js)
// Usado pelo recommendationEngine para converter recomendações em lotes de otimização
// ============================================================
const REC_TO_OPTIM = {
  'disable-telemetry':      ['telemetry'],
  'disable-widgets':        [],
  'disable-gamebar':        ['game-dvr'],
  'disable-background-apps': [],
  'disable-unnecessary-services': ['services-safe-disable'],
  'adjust-cpu-priority':    [],
  'adjust-power-scheme':    ['power-plan-ultimate'],
  'enable-ultimate-performance': ['power-plan-ultimate'],
  'disable-indexing':       [],
  'improve-disk-cache':     [],
  'adjust-cpu-scheduling':  [],
  'gamer-mode':             [],
  'high-priority-games':    [],
  'reduce-latency':         ['system-responsiveness'],
  'optimize-input':         [],
  'disable-fullscreen-opt': [],
  'optimize-timer-resolution': ['dynamic-tick'],
  'reduce-background':      [],
  'disable-dvr':            ['game-dvr'],
  'adjust-mouse':           ['mouse-accel-off'],
  'improve-fps':            [],
  'flush-dns':              ['flushdns'],
  'reset-winsock':          [],
  'reset-tcpip':            [],
  'adjust-mtu':             [],
  'adjust-tcp-ack':         [],
  'disable-nagle':          [],
  'prioritize-online-games': [],
  'custom-dns':             [],
  'trim-ssd':               ['temp-cleanup'],
  'clear-cache':            ['temp-cleanup'],
  'optimize-disk':          ['temp-cleanup'],
  'verify-integrity':       ['sfc-dism'],
  'repair-sectors':         ['sfc-dism'],
  'disable-animations':     ['visual-effects'],
  'best-performance':       ['visual-effects'],
  'transparency-off':       [],
  'effects-off':            ['visual-effects'],
};

module.exports = {
  analyzeHealth,
  PRESETS,
  REC_TO_OPTIM,
};
