'use strict';
/**
 * Runner da suíte de testes do desktop.
 *
 * Executa cada arquivo de teste em um processo separado com stdio HERDADO.
 * Motivo: o sandbox de arquivos bloqueia spawn com stdout canalizado (EPERM),
 * então não capturamos a saída — cada suíte imprime o próprio relatório e
 * devolve o exit code, que é o que agregamos aqui.
 *
 * Rodar:  node desktop/test/run-all.js
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
// Arquivos executáveis de teste. Os que contêm apenas utilitários
// (path-detector, clean-groups) também rodam sozinhos por autoteste.
const suites = fs.readdirSync(dir)
  .filter((f) => f.endsWith('.js'))
  .filter((f) => f !== 'run-all.js' && f !== 'fix-encoding.js' && f !== 'scan-encoding.js')
  .sort();

if (!suites.length) {
  console.error('nenhuma suíte encontrada em', dir);
  process.exit(1);
}

console.log('=== SUÍTE DE TESTES DO DESKTOP ===\n');

const resultado = [];
for (const suite of suites) {
  console.log(`--- ${suite} ---`);
  const r = spawnSync(process.execPath, [path.join(dir, suite)], {
    stdio: 'inherit',
    cwd: path.join(dir, '..'),
  });
  const ok = r.status === 0;
  resultado.push({ suite, ok, status: r.status, erro: r.error ? r.error.code : null });
  console.log('');
}

const falhas = resultado.filter((r) => !r.ok);
console.log('=== RESUMO ===');
for (const r of resultado) {
  const motivo = r.ok ? '' : (r.erro ? ` (${r.erro})` : ` (exit ${r.status})`);
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.suite}${motivo}`);
}
console.log(`\n${resultado.length - falhas.length}/${resultado.length} suítes passaram`);

if (falhas.some((f) => f.erro === 'EPERM')) {
  console.log('\nOBS: EPERM indica bloqueio do sandbox a spawn com stdio canalizado.');
  console.log('Rode as suítes individualmente, ou fora do sandbox, para o resultado completo.');
}

process.exit(falhas.length ? 1 : 0);
