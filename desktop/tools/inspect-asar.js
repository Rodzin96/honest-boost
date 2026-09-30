'use strict';
/**
 * Inspeciona um app.asar e verifica o que NÃO deveria estar no pacote.
 *
 * Formato do asar:
 *   [0..3]  uint32 = 4                (tamanho do pickle do tamanho)
 *   [4..7]  uint32 = tamanho do pickle do header
 *   [8..11] uint32 = tamanho do JSON do header
 *   [12..15] uint32 = tamanho do JSON do header (repetido)
 *   [16..]  JSON do header
 *
 * Uso: node desktop/tools/inspect-asar.js <app.asar>
 */
const fs = require('fs');
const path = require('path');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node inspect-asar.js <app.asar>'); process.exit(2); }
const abs = path.resolve(alvo);
const buf = fs.readFileSync(abs);

const tamanhoJson = buf.readUInt32LE(12);
const inicio = 16;
const json = buf.slice(inicio, inicio + tamanhoJson).toString('utf8');

let indice;
try {
  indice = JSON.parse(json);
} catch (e) {
  console.error('falha ao ler o header do asar:', e.message);
  process.exit(2);
}

const arquivos = [];
(function andar(no, prefixo) {
  for (const [nome, info] of Object.entries(no.files || {})) {
    const caminho = prefixo ? `${prefixo}/${nome}` : nome;
    if (info.files) andar(info, caminho);
    else arquivos.push({ caminho, size: info.size || 0 });
  }
})(indice, '');

const total = arquivos.reduce((s, a) => s + a.size, 0);
console.log(`asar     : ${path.basename(abs)}`);
console.log(`entradas : ${arquivos.length}`);
console.log(`tamanho  : ${(total / 1024 / 1024).toFixed(2)} MB\n`);

console.log('=== arquivos do app (raiz) ===');
const raiz = arquivos.filter((a) => !a.caminho.includes('/'));
for (const r of raiz.sort((a, b) => a.caminho.localeCompare(b.caminho))) {
  console.log(`  ${r.caminho.padEnd(24)} ${(r.size / 1024).toFixed(1)} KB`);
}

const src = arquivos.filter((a) => a.caminho.startsWith('src/'));
console.log(`\n=== src/ (${src.length}) ===`);
src.forEach((s) => console.log(`  ${s.caminho.replace('src/', '').padEnd(26)} ${(s.size / 1024).toFixed(1)} KB`));

const proibidos = [
  ['audit-report.json (documento interno)', (c) => c === 'audit-report.json'],
  ['.npmrc', (c) => c === '.npmrc'],
  ['applyOptimization.js (CLI orfao)', (c) => c === 'applyOptimization.js'],
  ['src/optimizationCatalog.js (morto)', (c) => c === 'src/optimizationCatalog.js'],
  ['test/ (testes)', (c) => c.startsWith('test/')],
  ['tools/ (utilitarios)', (c) => c.startsWith('tools/')],
  ['logs (*.log)', (c) => /\.log$/i.test(c)],
  ['markdown (*.md)', (c) => /\.md$/i.test(c)],
  ['sourcemaps (*.map)', (c) => /\.map$/i.test(c)],
  ['segredos (.env / env.env)', (c) => /(^|\/)\.env/.test(c) || c === 'env.env'],
];
console.log('\n=== nao pode estar no pacote ===');
let vazou = 0;
for (const [rotulo, teste] of proibidos) {
  const achados = arquivos.filter((a) => teste(a.caminho));
  if (achados.length) {
    vazou += achados.length;
    console.log(`  VAZOU  ${rotulo}`);
    achados.slice(0, 6).forEach((a) => console.log(`           - ${a.caminho}`));
  } else {
    console.log(`  OK     ${rotulo}`);
  }
}

console.log(`\nRESULTADO: ${vazou ? `${vazou} arquivo(s) indevido(s)` : 'pacote limpo'}`);
process.exit(vazou ? 1 : 0);
