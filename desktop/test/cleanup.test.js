'use strict';
/* Verifica as correções de segurança do motor de limpeza:
 *  - caminhos absolutos corretos (sem barras perdidas)
 *  - guarda de administrador e de consentimento em cleanItem()
 *  - execFile com argumentos separados (sem shell)
 *  - preload não expõe função perigosa sem caminho dedicado
 *
 * Rodar:  node desktop/test/cleanup.test.js
 */
const Module = require('module');
const os = require('os');
const fs = require('fs');
const path = require('path');

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'electron') return '__electron_stub__';
  return origResolve.call(this, request, ...rest);
};
const stub = new Module('__electron_stub__');
stub.exports = { app: { getPath: () => os.tmpdir() } };
stub.loaded = true;
require.cache['__electron_stub__'] = stub;

const SRC = path.join(__dirname, '..', 'src', 'systemAnalyzer.js');
const source = fs.readFileSync(SRC, 'utf8');
const analyzer = require('../src/systemAnalyzer');

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

// --- caminhos --------------------------------------------------------------
check('todo caminho em exec()/execFile() usa caminho absoluto', () => {
  const { findRelativeExecutablePaths } = require('./path-detector');
  const hits = findRelativeExecutablePaths(source);
  assert(hits.length === 0,
    `${hits.length} ocorrencias: ${hits.map((h) => h.line + ': ' + h.target).join(' | ')}`);
  return 'limpo';
});

check('nenhum caminho Windows com a barra inicial perdida', () => {
  // 'C:\\Program Files' é válido; 'C:Windows' (sem barra) nunca é.
  // path.join('C:Program Files', ...) é "drive-relativo" e resolve contra o
  // diretório corrente — sob elevação vira C:\\Windows\\System32\\Program Files.
  const { findRelativeExecutablePaths } = require('./path-detector');
  const bad = findRelativeExecutablePaths(source).filter((h) => !/\.exe$/i.test(h.target));
  assert(bad.length === 0,
    `${bad.length} caminhos: ${bad.map((h) => h.line + ': ' + h.target).join(' | ')}`);
  return 'limpo';
});

check('System32 é resolvido por constantes, não por literal', () => {
  assert(/const SYSTEM32 = path\.join\(/.test(source), 'sem constante SYSTEM32');
  for (const c of ['POWERCFG', 'REGEXE', 'POWERSHELL', 'DISMEXE']) {
    assert(new RegExp(`const ${c} =`).test(source), `${c} nao definido`);
  }
  return '4 constantes definidas';
});

check('nenhuma chamada a binário por nome relativo (PATH)', () => {
  const bad = [];
  source.split(/\r?\n/).forEach((l, i) => {
    if (/runAsync\(\s*'(powershell|DISM|reg|powercfg)'/i.test(l)) bad.push(`${i + 1}`);
  });
  assert(bad.length === 0, `linhas: ${bad.join(', ')}`);
  return 'todas usam caminho absoluto';
});

check('getPowerPlan/getGameDVRStatus/getMouseAcceleration usam execFile', () => {
  for (const fn of ['getPowerPlan', 'getGameDVRStatus', 'getMouseAcceleration']) {
    const body = analyzer[fn].toString();
    assert(/execFile\(/.test(body), `${fn} nao usa execFile`);
    assert(!/\bexec\(/.test(body.replace(/execFile\(/g, '')), `${fn} ainda usa exec()`);
  }
  return 'ok';
});

check('chaves de registro com barras corretas', () => {
  // No arquivo-fonte o separador aparece escapado (\\), então comparamos o
  // literal de origem, não a string já interpretada.
  for (const key of ['HKCU\\\\System\\\\GameConfigStore', 'HKCU\\\\Control Panel\\\\Mouse']) {
    assert(source.includes(key), `chave ausente no fonte: ${key}`);
  }
  return 'ok';
});

check('existe apenas um module.exports', () => {
  const n = (source.match(/^module\.exports\s*=/gm) || []).length;
  assert(n === 1, `encontrados ${n}`);
  return '1';
});

// --- classificação e guardas ----------------------------------------------
check('classifyCleanItem marca os itens de admin', () => {
  const must = ['prefetch', 'wu-cache', 'error-logs', 'system-temp', 'winsxs', 'component-store'];
  for (const id of must) {
    assert(analyzer.classifyCleanItem(id).admin === true, `${id} deveria exigir admin`);
  }
  return `${must.length} itens`;
});

check('classifyCleanItem marca os itens destrutivos', () => {
  const must = ['chrome-cookies', 'chrome-history', 'edge-cookies', 'firefox-cookies', 'clipboard', 'recycle-bin', 'office-cache'];
  for (const id of must) {
    assert(analyzer.classifyCleanItem(id).risky === true, `${id} deveria ser destrutivo`);
  }
  return `${must.length} itens`;
});

check('a lista de risco espelha os itens "dangerous" da UI', () => {
  // Todo item marcado como perigoso na UI precisa ter alguma barreira real no
  // backend: exigir elevação OU exigir consentimento explícito. Um item
  // "dangerous" apenas decorativo seria a falha que este teste previne.
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
  const { extractDangerousCleanItems } = require('./clean-groups');
  const naUI = extractDangerousCleanItems(renderer);
  assert(naUI.size > 0, 'nenhum item dangerous encontrado na UI');
  const semBarreira = [];
  for (const id of naUI) {
    const c = analyzer.classifyCleanItem(id);
    if (!c.admin && !c.risky) semBarreira.push(id);
  }
  assert(semBarreira.length === 0,
    `sem barreira no backend: ${semBarreira.join(', ')}`);
  return `${naUI.size} itens da UI cobertos`;
});

check('itens inofensivos não exigem admin nem confirmação', () => {
  for (const id of ['dns-cache', 'thumbnails', 'user-temp', 'msi-cache']) {
    const i = analyzer.classifyCleanItem(id);
    assert(i.known && !i.admin && !i.risky, `${id}: ${JSON.stringify(i)}`);
  }
  return 'ok';
});

check('classifyCleanItem rejeita id desconhecido', () => {
  assert(analyzer.classifyCleanItem('nao-existe').known === false, 'deveria ser desconhecido');
  return 'ok';
});

async function main() {
  await checkAsync('cleanItem bloqueia item de admin sem elevação', async () => {
    const r = await analyzer.cleanItem('prefetch', { admin: false });
    assert(r.ok === false, 'deveria bloquear');
    assert(/administrador/i.test(r.error), `erro inesperado: ${r.error}`);
    return r.error;
  });

  await checkAsync('cleanItem bloqueia item destrutivo sem consentimento', async () => {
    const r = await analyzer.cleanItem('chrome-cookies', { admin: true, riskAccepted: false });
    assert(r.ok === false, 'deveria bloquear');
    assert(/confirm/i.test(r.error), `erro inesperado: ${r.error}`);
    return r.error;
  });

  await checkAsync('cleanItem rejeita id desconhecido', async () => {
    const r = await analyzer.cleanItem('inventado', { admin: true, riskAccepted: true });
    assert(r.ok === false, 'deveria falhar');
    return r.error;
  });

  check('main.js decide admin/consentimento pela classificação do backend', () => {
    const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    assert(/classifyCleanItem\(String\(id\)\)/.test(main), 'nao consulta classifyCleanItem');
    assert(/riskAccepted: info\.risky/.test(main), 'nao deriva riskAccepted da classificacao');
    assert(/admin: isAdmin\(\)/.test(main), 'nao deriva admin de isAdmin()');
    assert(/ipcMain\.handle\('clean:risky'/.test(main), 'sem handler clean:risky');
    assert(/ipcMain\.handle\('clean:classify'/.test(main), 'sem handler clean:classify');
    return 'ok';
  });

  check('renderer usa a classificação do backend, com fallback local', () => {
    const renderer = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
    assert(/classifyClean\(/.test(renderer), 'renderer nao busca a classificacao');
    assert(/function isRiskyClean/.test(renderer), 'sem isRiskyClean');
    assert(/cleanRisky\(id\)/.test(renderer), 'nao roteia para cleanRisky');
    return 'ok';
  });

  check('preload expõe cleanRisky e classifyClean', () => {
    const pre = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
    assert(/cleanRisky: \(id\) => ipcRenderer\.invoke\('clean:risky', id\)/.test(pre),
      'cleanRisky nao exposto');
    assert(/classifyClean: \(ids\) => ipcRenderer\.invoke\('clean:classify', ids\)/.test(pre),
      'classifyClean nao exposto');
    return 'ok';
  });
}

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
