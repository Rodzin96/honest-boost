/**
 * desktop/src/optimizationEngine.js — Aplica otimizações do catálogo VALIDADO
 * executeRecipe: calls the recipe's apply(), honoring admin requirement & conditions.
 * applyRecommended / applyAll: batch applies with per-item results.
 */
const catalog = require('./catalog');
const { fullSystemScan } = require('./systemAnalyzer');
const registry = require('./registry');

function isApplicable(recipe) {
  // Convenção real do catalog.js: guias usam kind:'guide' (apply nulo);
  // todo o resto com apply() é executável (kind:'apply' ou indefinido).
  return !!recipe && recipe.kind !== 'guide' && typeof recipe.apply === 'function';
}

async function executeRecipe(id, options = {}) {
  const recipe = catalog.getById(id);
  if (!recipe) return { ok: false, id, message: 'Otimização não encontrada no catálogo.' };

  if (!isApplicable(recipe)) {
    return { ok: false, id, manual: true, message: `“${recipe.name}” é um guia/ferramenta externa — aplique manualmente.` };
  }

  if (recipe.admin && !options.admin) {
    return { ok: false, id, admin: true, message: 'Esta otimização requer execução como administrador.' };
  }

  if (recipe.condition) {
    try {
      // applyBatch injeta um único scan compartilhado; chamada isolada escaneia.
      const system = options.system || await fullSystemScan();
      if (!recipe.condition(system)) {
        return { ok: false, id, skipped: true, message: 'Não aplicável a este hardware/sistema.' };
      }
    } catch {
      // condição não verificável — prossegue com o apply
    }
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
  // Um único scan compartilhado para todas as conditions (antes: 1 scan
  // completo por receita → "Otimizar Agora" levava minutos).
  let sharedSystem = options.system || null;
  const needsScan = !sharedSystem && ids.some((id) => {
    const r = catalog.getById(id);
    return r && r.condition;
  });
  if (needsScan) {
    try { sharedSystem = await fullSystemScan(); } catch { sharedSystem = null; }
  }
  const results = [];
  for (const id of ids) {
    results.push(await executeRecipe(id, { ...options, system: sharedSystem }));
  }
  const okCount = results.filter(r => r.ok).length;
  return {
    ok: results.every(r => r.ok),
    applied: okCount,
    failed: results.length - okCount,
    adminBlocked: results.filter(r => !r.ok && r.admin).length,
    skipped: results.filter(r => !r.ok && r.skipped).length,
    results
  };
}

async function applyRecommended(options = {}) {
  return applyBatch(
    catalog.RECOMMENDED.filter(isApplicable).map(r => r.id),
    options
  );
}

async function applyAll(options = {}) {
  return applyBatch(
    catalog.ALL.filter(isApplicable).map(r => r.id),
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