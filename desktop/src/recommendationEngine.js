/**
 * desktop/src/recommendationEngine.js — Motor de Recomendações
 * Analisa o sistema e gera recomendações baseadas em evidências
 */

// Classificação das otimizações
const OPTIMIZATION_CATALOG = [
  {
    id: 'mouse-accel',
    name: 'Desativar Aceleração do Mouse',
    category: 'input',
    confidence: 'HIGH',
    risk: 'LOW',
    reversible: true,
    evidence: 'Movimento 1:1 melhora consistência em FPS competitivos.',
    condition: (system) => system.mouseAccel?.enabled === true,
    description: 'Desliga o "Aprimorar precisão do ponteiro" para movimento consistente.'
  },
  {
    id: 'game-dvr',
    name: 'Desativar Game DVR',
    category: 'gaming',
    confidence: 'HIGH',
    risk: 'LOW',
    reversible: true,
    evidence: 'Remove overhead de gravação em background que pode causar stuttering.',
    condition: (system) => system.gameDVR?.enabled === true,
    description: 'Desativa gravação em segundo plano do Xbox Game Bar.'
  },
  {
    id: 'power-plan',
    name: 'Ativar Plano de Alto Desempenho',
    category: 'power',
    confidence: 'HIGH',
    risk: 'LOW',
    reversible: true,
    evidence: 'Previne throttling de CPU em sistemas com planos balanceados.',
    condition: (system) => system.powerPlan?.isHighPerformance === false,
    description: 'Ativa o plano de energia de alto desempenho.'
  },
  {
    id: 'fullscreen-opt',
    name: 'Desativar Fullscreen Optimizations',
    category: 'gaming',
    confidence: 'MEDIUM',
    risk: 'LOW',
    reversible: true,
    evidence: 'Pode reduzir input lag em alguns jogos, especialmente em Windows 10/11.',
    condition: () => true,
    description: 'Desativa otimizações de tela cheia para menor input lag.'
  },
  {
    id: 'visual-effects',
    name: 'Otimizar Efeitos Visuais',
    category: 'performance',
    confidence: 'MEDIUM',
    risk: 'LOW',
    reversible: true,
    evidence: 'Reduz uso de GPU/CPU com animações do Windows.',
    condition: () => true,
    description: 'Ajusta o Windows para melhor desempenho visual.'
  },
  {
    id: 'telemetry',
    name: 'Reduzir Telemetria',
    category: 'privacy',
    confidence: 'MEDIUM',
    risk: 'LOW',
    reversible: true,
    evidence: 'Reduz atividade em background dos serviços de telemetria.',
    condition: () => true,
    description: 'Desativa coleta de dados e telemetria do Windows.'
  },
  {
    id: 'background-processes',
    name: 'Gerenciar Processos em Background',
    category: 'performance',
    confidence: 'MEDIUM',
    risk: 'MEDIUM',
    reversible: true,
    evidence: 'Fechar aplicativos não essenciais libera RAM e CPU.',
    condition: (system) => system.ram?.usagePercent > 70,
    description: 'Identifica e permite fechar processos não essenciais consumindo recursos.'
  },
  {
    id: 'storage-cleanup',
    name: 'Limpar Arquivos Temporários',
    category: 'maintenance',
    confidence: 'LOW',
    risk: 'LOW',
    reversible: false,
    evidence: 'Libera espaço em disco, mas não impacta performance diretamente.',
    condition: (system) => system.storage?.some(d => d.usagePercent > 85),
    description: 'Remove arquivos temporários para liberar espaço.'
  }
];

// Otimizações removidas (placebo)
const REMOVED_OPTIMIZATIONS = [
  { id: 'polling-rate', reason: 'Não altera polling rate de hardware — apenas registry placebo.' },
  { id: 'qos-throttling', reason: 'Windows NÃO limita banda por default desde XP SP2.' },
  { id: 'cpu-scheduler', reason: 'Win32PrioritySeparation=38 não tem evidência de ganho para gaming.' },
  { id: 'core-parking', reason: 'Windows 10/11 já gerencia core parking eficientemente.' },
  { id: 'gpu-power-mode', reason: 'Registry nvlddmkm não é documentado e não funciona.' },
  { id: 'dns-cloudflare', reason: 'Assume adaptador Ethernet — falha em Wi-Fi.' },
  { id: 'network-timestamps', reason: 'Desativar timestamps pode causar problemas de performance.' },
  { id: 'prefetch-clean', reason: 'Limpar Prefetch é prejudicial para boot e load times.' },
  { id: 'windows-updates-pause', reason: 'Registry ignorado pelo Windows Update moderno.' }
];

function analyzeSystem(systemData) {
  const recommendations = [];
  const notRecommended = [];
  
  for (const opt of OPTIMIZATION_CATALOG) {
    try {
      const shouldRecommend = opt.condition(systemData);
      if (shouldRecommend) {
        recommendations.push({
          id: opt.id,
          name: opt.name,
          category: opt.category,
          confidence: opt.confidence,
          risk: opt.risk,
          reversible: opt.reversible,
          evidence: opt.evidence,
          description: opt.description
        });
      }
    } catch (err) {
      // Skip recommendations that fail to evaluate
    }
  }
  
  // Ordenar por confiança (HIGH > MEDIUM > LOW)
  const confidenceOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  recommendations.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);
  
  return {
    recommendations,
    notRecommended: REMOVED_OPTIMIZATIONS,
    summary: {
      total: recommendations.length,
      highConfidence: recommendations.filter(r => r.confidence === 'HIGH').length,
      mediumConfidence: recommendations.filter(r => r.confidence === 'MEDIUM').length,
      lowConfidence: recommendations.filter(r => r.confidence === 'LOW').length
    }
  };
}

function getOptimizationById(id) {
  return OPTIMIZATION_CATALOG.find(o => o.id === id) || null;
}

function getAllOptimizations() {
  return OPTIMIZATION_CATALOG;
}

module.exports = {
  analyzeSystem,
  getOptimizationById,
  getAllOptimizations,
  REMOVED_OPTIMIZATIONS
};
