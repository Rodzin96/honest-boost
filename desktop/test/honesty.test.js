'use strict';
/**
 * Regressão: a UI não pode voltar a exibir métrica de performance inventada.
 *
 * Contexto: a regra central do produto é nunca apresentar um número como ganho
 * sem medição. O app já exibiu "FPS Boost" calculado a partir do uso de CPU,
 * "Espaço Recuperável" vindo de um mapa fixo de bytes e "Tempo Estimado"
 * derivado desse mapa — nenhum deles medido.
 *
 * Rodar:  node desktop/test/honesty.test.js
 */
const fs = require('fs');
const path = require('path');

const RENDERER_RAW = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Comentários explicam o que foi removido e citam os nomes antigos; a checagem
// deve olhar apenas o código executável, não a documentação.
const semComentarios = (s) => s
  .split(/\r?\n/)
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n');
const RENDERER = semComentarios(RENDERER_RAW);

const results = [];
function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, pass: true, detail: detail === undefined ? '' : String(detail) });
  } catch (err) {
    results.push({ name, pass: false, detail: `${err.name}: ${err.message}` });
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// --- FPS fabricado ---------------------------------------------------------
check('nenhuma fórmula de "FPS" a partir do uso de CPU', () => {
  assert(!/fpsBoost/.test(RENDERER), 'referência a fpsBoost ainda presente');
  assert(!/\*\s*0\.15/.test(RENDERER), 'multiplicador 0.15 (formula antiga) presente');
  return 'removido';
});

check('rótulos de FPS não prometem ganho', () => {
  const proibidos = [/Est\.\s*FPS\s*Boost/i, /FPS\s*Boost\s*est/i, /Boost estimado de FPS/i];
  for (const re of proibidos) {
    assert(!re.test(INDEX), `rótulo ainda presente no index.html: ${re}`);
    assert(!re.test(RENDERER), `rótulo ainda presente no renderer.js: ${re}`);
  }
  return 'sem promessa de FPS';
});

// --- Espaço/bytes fabricados ----------------------------------------------
check('mapa fixo de bytes por item foi removido', () => {
  assert(!/CLEAN_SIZE_MAP/.test(RENDERER) || !/const CLEAN_SIZE_MAP\s*=\s*\{/.test(RENDERER),
    'CLEAN_SIZE_MAP ainda definido com valores fixos');
  assert(!/estimateTotalSpace/.test(RENDERER), 'estimateTotalSpace ainda existe');
  assert(!/estimateTime\s*\(/.test(RENDERER), 'estimateTime ainda existe');
  assert(!/estimateGroupSpace/.test(RENDERER), 'estimateGroupSpace ainda existe');
  return 'removido';
});

check('não anuncia "Espaço Recuperável"/"Tempo Estimado"', () => {
  assert(!/Espaço Recuperável/i.test(RENDERER), 'renderer ainda mostra "Espaço Recuperável"');
  assert(!/Tempo Estimado/i.test(RENDERER), 'renderer ainda mostra "Tempo Estimado"');
  assert(!/Recuper[áa]vel/i.test(INDEX), 'index.html ainda mostra "Recuperável"');
  return 'sem estimativa exibida';
});

check('limpeza não alega bytes recuperados', () => {
  assert(!/recuperados/i.test(RENDERER), 'ainda afirma bytes "recuperados"');
  return 'relata apenas contagem de itens';
});

check('"Limpeza Rápida" não promete ~2 GB', () => {
  assert(!/~2\s*GB/i.test(INDEX), 'promessa de ~2 GB ainda presente');
  return 'removido';
});

// --- Versão coerente -------------------------------------------------------
check('versão da UI vem do pacote, não de literal', () => {
  assert(!/v3\.1/i.test(INDEX), '"v3.1 validado" ainda na UI');
  assert(/id="about-engine"/.test(INDEX), 'Elemento about-engine ausente');
  assert(/state\.appVersion/.test(RENDERER), 'renderer nao usa a versao do pacote');
  return 'ok';
});

// --- relatório -------------------------------------------------------------
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  ->  ' + r.detail : ''}`);
}
console.log(`\nRESULTADO: ${results.length - failed}/${results.length} passaram`);
process.exit(failed ? 1 : 0);
