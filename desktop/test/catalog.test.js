'use strict';
/* Verificação das correções em desktop/src/catalog.js.
 * Injeta um stub de 'electron' no cache de módulos para carregar registry.js
 * fora do processo do Electron. Não altera registro, serviços ou energia.
 *
 * Rodar:  node desktop/test/catalog.test.js
 */

const Module = require('module');
const os = require('os');
const fs = require('fs');
const path = require('path');

// --- stub de electron ------------------------------------------------------
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'electron') return '__electron_stub__';
  return origResolve.call(this, request, ...rest);
};
const stub = new Module('__electron_stub__');
stub.exports = { app: { getPath: () => os.tmpdir() } };
stub.loaded = true;
require.cache['__electron_stub__'] = stub;

const CATALOG_SRC = path.join(__dirname, '..', 'src', 'catalog.js');
const ENGINE_SRC = path.join(__dirname, '..', 'src', 'optimizationEngine.js');

const results = [];
function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, pass: true, detail: detail === undefined ? '' : String(detail) });
  } catch (err) {
    results.push({ name, pass: false, detail: `${err.name}: ${err.message}` });
  }
}
async function checkAsync(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, pass: true, detail: detail === undefined ? '' : String(detail) });
  } catch (err) {
    results.push({ name, pass: false, detail: `${err.name}: ${err.message}` });
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const catalog = require('../src/catalog');

// --- estrutura -------------------------------------------------------------
check('catalog.js carrega sem erro', () => `${catalog.ALL.length} receitas`);
check('RECOMMENDED/OPTIONAL preenchidos', () =>
  `recommended=${catalog.RECOMMENDED.length} optional=${catalog.OPTIONAL.length}`);
check('todo id é único', () => {
  const seen = new Set();
  for (const r of catalog.ALL) {
    assert(!seen.has(r.id), `id duplicado: ${r.id}`);
    seen.add(r.id);
  }
  return `${seen.size} ids únicos`;
});
check('receitas têm chaves obrigatórias', () => {
  for (const r of catalog.ALL) {
    for (const k of ['id', 'name', 'category', 'risk', 'reversible']) {
      assert(r[k] !== undefined, `${r.id} sem "${k}"`);
    }
    assert(typeof r.status === 'function', `${r.id} sem status()`);
  }
  return 'ok';
});
check('guias têm apply nulo; executáveis têm apply()', () => {
  for (const r of catalog.ALL) {
    if (r.kind === 'guide') assert(r.apply === null, `guia ${r.id} com apply não-nulo`);
    else assert(typeof r.apply === 'function', `${r.id} sem apply()`);
  }
  return 'ok';
});

// --- bug 1: regDelete importado -------------------------------------------
check('bug 1 — regDelete importado e revert do CS2 checa o retorno', () => {
  const line = fs.readFileSync(CATALOG_SRC, 'utf8')
    .split(/\r?\n/).find((l) => l.includes("require('./registry')"));
  assert(/regDelete/.test(line), 'regDelete não está na importação');
  assert(/return \{ message: r \?/.test(catalog.getById('cs2-cvars').revert.toString()),
    'revert não verifica o retorno');
  return line.trim();
});

// --- bug 2: DISM sem aspas literais ---------------------------------------
check('bug 2 — recall-off sem aspas literais', () => {
  for (const fn of ['apply', 'revert', 'status']) {
    const src = catalog.getById('recall-off')[fn].toString();
    assert(!/"recall"/.test(src), `${fn} ainda tem aspas`);
    assert(/FeatureName:recall/.test(src), `${fn} sem FeatureName:recall`);
  }
  return 'apply/revert/status limpos';
});

// --- bug 3: parser de pacote contra nomes REAIS ---------------------------
check('bug 3 — parsePackageName aceita os nomes reais do Windows', () => {
  const base = 'Microsoft-Windows-GroupPolicy-ClientTools-Package';
  const reais = [
    'Microsoft-Windows-GroupPolicy-ClientTools-Package~31bf3856ad364e35~amd64~pt-BR~10.0.26100.9168.mum',
    'Microsoft-Windows-GroupPolicy-ClientTools-Package~31bf3856ad364e35~amd64~~10.0.26100.1591.mum'
  ];
  for (const f of reais) {
    const info = catalog.parsePackageName(f, base);
    assert(info, `não interpretou: ${f}`);
    assert(/^\d+(\.\d+)*$/.test(info.version), `versão inválida: ${info.version}`);
  }
  const neutro = catalog.parsePackageName(reais[1], base);
  assert(neutro.locale === '', `locale neutro deveria ser vazio, veio "${neutro.locale}"`);
  const localizado = catalog.parsePackageName(reais[0], base);
  assert(localizado.locale === 'pt-BR', `locale veio "${localizado.locale}"`);
  return `${reais.length} nomes reais interpretados`;
});

check('bug 3 — parsePackageName rejeita o que não é o pacote pedido', () => {
  const base = 'Microsoft-Windows-GroupPolicy-ClientTools-Package';
  const alheios = [
    'Microsoft-Windows-GroupPolicy-ClientTools-WOW64-Package~31bf3856ad364e35~amd64~~10.0.26100.8972.mum',
    'Microsoft-Windows-GroupPolicy-ClientTools-merged-Package~31bf3856ad364e35~amd64~~10.0.26100.9168.mum',
    'Microsoft-Windows-GroupPolicy-ClientExtensions-Package~31bf3856ad364e35~amd64~~10.0.26100.8972.mum',
    'algum-arquivo.txt'
  ];
  for (const f of alheios) {
    assert(catalog.parsePackageName(f, base) === null, `aceitou indevidamente: ${f}`);
  }
  return 'rejeitou variantes WOW64/merged/Extensions';
});

async function main() {
  await checkAsync('bug 3 — findPackageMum escolhe a MAIOR versão em disco (dados reais)', async () => {
    const dir = 'C:\\Windows\\servicing\\Packages';
    if (!fs.existsSync(dir)) return 'diretório ausente — pulado';
    const base = 'Microsoft-Windows-GroupPolicy-ClientTools-Package';
    const got = await catalog.findPackageMum(base);
    assert(got, 'findPackageMum devolveu null');
    const chosen = path.basename(got);
    assert(fs.existsSync(got), `caminho devolvido não existe: ${got}`);
    const info = catalog.parsePackageName(chosen, base);
    const pa = info.version.split('.').map(Number);
    for (const entry of fs.readdirSync(dir)) {
      const cand = catalog.parsePackageName(entry, base);
      if (!cand) continue;
      const pb = cand.version.split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0) { assert(d > 0, `escolheu ${info.version} mas ${cand.version} é maior`); break; }
      }
    }
    return `escolheu v${info.version}`;
  });

  check('bug 3 — gpedit apply/revert coerentes', () => {
    const apply = catalog.getById('gpedit-enable').apply.toString();
    assert(!/PackagePath:.*\*\.mum/.test(apply), 'ainda usa curinga');
    assert(/findPackageMum/.test(apply), 'não resolve o .mum real');
    assert(/ok: failed < GPEDIT_PACKAGES\.length/.test(apply), 'não reporta falha');
    const revert = catalog.getById('gpedit-enable').revert.toString();
    assert(/Get-Packages/.test(revert), 'revert não consulta os pacotes');
    assert(/PackageName:\$\{name\}/.test(revert), 'revert não usa o nome instalado');
    return 'apply/revert/status coerentes';
  });

  // --- bug 4: plano de energia --------------------------------------------
  check('bug 4 — apply salva o plano anterior', () => {
    const src = catalog.getById('power-plan-ultimate').apply.toString();
    assert(/savePowerPlanSnapshot/.test(src), 'apply não salva snapshot');
    return 'snapshot chamado no apply';
  });

  check('bug 4 — revert restaura o anterior, não o Equilibrado', () => {
    const src = catalog.getById('power-plan-ultimate').revert.toString();
    assert(!/setactive', '381b4222/.test(src), 'ainda fixa o GUID do Equilibrado');
    assert(/readPowerPlanSnapshot/.test(src), 'não lê o snapshot');
    assert(/previous \|\| BALANCED_GUID/.test(src), 'snapshot não tem prioridade');
    return 'restaura o anterior';
  });

  check('bug 4 — snapshot não sobrescreve o existente', () => {
    const src = fs.readFileSync(CATALOG_SRC, 'utf8');
    assert(/if \(await readPowerPlanSnapshot\(\)\) return;/.test(src),
      'savePowerPlanSnapshot não protege contra sobrescrita');
    return 'guarda de sobrescrita presente';
  });

  // --- bug 5 e engine -----------------------------------------------------
  check('bug 5 — optimizationCatalog.js removido', () => {
    assert(!fs.existsSync(path.join(__dirname, '..', 'src', 'optimizationCatalog.js')),
      'arquivo ainda existe');
    return 'removido';
  });

  check('optimizationEngine respeita ok:false da receita', () => {
    const src = fs.readFileSync(ENGINE_SRC, 'utf8');
    assert(/result\.ok === false/.test(src), 'não trata ok:false');
    return 'ok';
  });

  check('código morto removido (REGEXE, INTELLIGENT_NAME, cimCsv)', () => {
    const src = fs.readFileSync(CATALOG_SRC, 'utf8');
    for (const dead of ['REGEXE', 'INTELLIGENT_NAME', 'cimCsv']) {
      assert(!src.includes(dead), `${dead} ainda presente`);
    }
    assert(!/\.catch\(\(\) => \{\}\)/.test(src), 'ainda há .catch inócuo em run()');
    return 'limpo';
  });
}

// --- relatório -------------------------------------------------------------
function report() {
  let failed = 0;
  for (const r of results) {
    if (!r.pass) failed++;
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  ->  ' + r.detail : ''}`);
  }
  console.log(`\nRESULTADO: ${results.length - failed}/${results.length} passaram`);
  return failed;
}

main()
  .then(() => process.exit(report() ? 1 : 0))
  .catch((err) => { console.error('ERRO FATAL:', err); process.exit(2); });
