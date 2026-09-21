/**
 * desktop/src/recommendationEngine.js — Recomendações baseadas no catálogo VALIDADO
 * Group ordered: RECOMMENDED (16) → OPTIONAL (17)
 * Each item carries a live status computed from the real system.
 */
const catalog = require('./catalog');
const { fullSystemScan } = require('./systemAnalyzer');

const LEVEL_LABELS = {
  APPLIED: 'Aplicado',
  OFF: 'Não aplicado',
  MANUAL: 'Guia',
  NA: 'N/A',
  UNKNOWN: 'Indeterminado',
  CONDITIONAL: 'Condicional'
};

async function computeStatus(recipe, system) {
  if (recipe.kind === 'guide') {
    return { level: 'MANUAL', label: LEVEL_LABELS.MANUAL, detail: 'Aplicação manual — abra o guia.' };
  }

  if (recipe.condition && !recipe.condition(system)) {
    return { level: 'NA', label: LEVEL_LABELS.NA, detail: 'Não aplicável a este hardware.' };
  }

  if (recipe.reversible === false) {
    return { level: 'NA', label: LEVEL_LABELS.NA, detail: 'Ação pontual de manutenção.' };
  }

  if (typeof recipe.status !== 'function') {
    return { level: 'UNKNOWN', label: LEVEL_LABELS.UNKNOWN, detail: 'Sem diagnóstico.' };
  }

  try {
    const status = await recipe.status(system);
    return {
      level: status.level || 'UNKNOWN',
      label: LEVEL_LABELS[status.level] || status.label || 'Desconhecido',
      detail: status.detail || ''
    };
  } catch (error) {
    return { level: 'UNKNOWN', label: LEVEL_LABELS.UNKNOWN, detail: `Falha no diagnóstico: ${error.message}` };
  }
}

async function getCatalog() {
  const system = await fullSystemScan();

  const withStatus = async (recipe) => ({
    id: recipe.id,
    name: recipe.name,
    tier: recipe.tier,
    kind: recipe.kind,
    category: recipe.category,
    admin: recipe.admin,
    risk: recipe.risk,
    reversible: recipe.reversible !== false,
    summary: recipe.summary,
    evidence: recipe.evidence,
    steps: recipe.steps || [],
    links: recipe.links || [],
    status: await computeStatus(recipe, system)
  });

  const recommended = [];
  const optional = [];

  for (const recipe of catalog.RECOMMENDED) recommended.push(await withStatus(recipe));
  for (const recipe of catalog.OPTIONAL) optional.push(await withStatus(recipe));

  const countApplied = (list) => list.filter(i => i.status.level === 'APPLIED').length;

  return {
    timestamp: system.timestamp,
    recommended,
    optional,
    summary: {
      recommendedTotal: recommended.length,
      recommendedApplied: countApplied(recommended),
      optionalTotal: optional.length,
      optionalApplied: countApplied(optional)
    }
  };
}

async function getRecommendationReport() {
  const data = await getCatalog();
  const all = [...data.recommended, ...data.optional];
  return {
    total: all.length,
    applied: all.filter(i => i.status.level === 'APPLIED').length,
    off: all.filter(i => i.status.level === 'OFF').length,
    manual: all.filter(i => i.status.level === 'MANUAL').length,
    notApplicable: all.filter(i => i.status.level === 'NA').length,
    byCategory: all.reduce((acc, i) => {
      acc[i.category] = (acc[i.category] || 0) + 1;
      return acc;
    }, {})
  };
}

module.exports = {
  getCatalog,
  getRecommendationReport
};