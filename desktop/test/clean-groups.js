'use strict';
/* Extrai os itens de CLEAN_GROUPS marcados como `dangerous: true` direto do
 * renderer.js. Feito por varredura de linhas (não por regex ganancioso) para
 * nunca confundir o `id` do GRUPO com o `id` de um ITEM. */

/**
 * @param {string} source conteúdo de renderer.js
 * @returns {Set<string>} ids dos itens perigosos
 */
function extractDangerousCleanItems(source) {
  const ids = new Set();
  const linhas = source.split(/\r?\n/);
  for (const linha of linhas) {
    if (!/dangerous:\s*true/.test(linha)) continue;
    // Um item é um objeto de uma linha: { id: 'x', title: ..., dangerous: true },
    // e NÃO contém `items:` (isso seria o objeto de um grupo).
    if (/\bitems\s*:/.test(linha)) continue;
    const m = linha.match(/^\s*\{\s*id:\s*'([a-z0-9-]+)'/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

module.exports = { extractDangerousCleanItems };

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
  const ids = extractDangerousCleanItems(src);
  console.log('itens dangerous na UI:', ids.size);
  console.log([...ids].sort().join(', '));
  const suspeitos = [...ids].filter((i) => i === 'advanced' || i === 'windows' || i === 'browsers');
  if (suspeitos.length) {
    console.log('ERRO: ids de grupo capturados:', suspeitos.join(', '));
    process.exit(1);
  }
  console.log('OK: nenhum id de grupo capturado');
}
