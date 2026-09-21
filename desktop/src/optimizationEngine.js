/**
 * desktop/src/optimizationEngine.js — Aplica otimizações do catálogo VALIDADO
 * executeRecipe: calls the recipe's apply(), honoring admin requirement & conditions.
 * applyRecommended / applyAll: batch applies with per-item results.
 */
const catalog = require('./catalog');
const { fullSystemScan } = require('./systemAnalyzer');
const registry = require('./registry');

async function executeRecipe(id, options = {}) {
  const recipe = catalog.getById(id);
  if (!recipe) return { ok: false, id, message: 'Otimização não encontrada no catálogo.' };

  if (recipe.kind !== 'apply') {
    return { ok: false, id, message: `“${recipe.name}” é um guia/ferramenta externa — aplique manualmente.` };
  }

  if (recipe.admin && !options.admin) {
    return { ok: false, id, message: 'Esta otimização requer execução como administrador.' };
  }

  if (recipe.condition) {
    try {
      const system = await fullSystemScan();
      if (!recipe.condition(system)) {
        return { ok: false, id, message: 'Não aplicável a este hardware/sistema.' };
      }
    } catch {
      // condição não verificável — prossegue com o apply
    }
  }

  if (typeof recipe.apply !== 'function') {
    return { ok: false, id, message: 'Receita sem implementação disponível.' };
  }

  try {
    const result = await recipe.apply() || {};
    return {
      ok: true,
      id,
      name: recipe.name,
      message: result.message || 'Otimização aplicada com sucesso.'
    };
  } catch (error) {
    return { ok: false, id, message: `Falha ao aplicar: ${error.message}` };
  }
}

async function applyBatch(ids, options = {}) {
  const results = [];
  for (const id of ids) {
    results.push(await executeRecipe(id, options));
  }
  return {
    ok: results.every(r => r.ok),
    applied: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results
  };
}

async function applyRecommended(options = {}) {
  return applyBatch(
    catalog.RECOMMENDED.filter(r => r.kind === 'apply').map(r => r.id),
    options
  );
}

async function applyAll(options = {}) {
  return applyBatch(
    catalog.ALL.filter(r => r.kind === 'apply').map(r => r.id),
    options
  );
}

// Rollback via snapshot de registros (receitas de alta reversibilidade não-registradas ficam manuais)
async function restoreRegistry() {
  const status = await registry.restoreSnapshot();
  return status;
}

async function getRollbackInfo() {
  return registry.getSnapshotStatus();
}

module.exports = {
  executeRecipe,
  applyBatch,
  applyRecommended,
  applyAll,
  restoreRegistry,
  getRollbackInfo
};