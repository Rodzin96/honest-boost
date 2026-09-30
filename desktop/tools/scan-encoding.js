'use strict';
/* Varre o projeto por dois defeitos de codificação introduzidos por
 * Set-Content do PowerShell: mojibake (Ã©, Ã¡) e BOM/caractere de substituição. */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..', '..');
const alvos = [];
function coletar(dir, profundidade) {
  if (profundidade > 2) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) coletar(p, profundidade + 1);
    else if (/\.(js|html|css|json|yml|yaml|md)$/.test(e.name)) alvos.push(p);
  }
}
coletar(raiz, 0);

let problemas = 0;
for (const p of alvos) {
  const buf = fs.readFileSync(p);
  const rel = path.relative(raiz, p);
  const texto = buf.toString('utf8');
  const mojibake = (texto.match(/\u00c3[\u0080-\u00bf]/g) || []).length;
  const temBom = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  const temSubstituto = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBF && buf[2] === 0xBD;
  if (mojibake || temBom || temSubstituto) {
    problemas++;
    const marcas = [];
    if (mojibake) marcas.push(`mojibake=${mojibake}`);
    if (temBom) marcas.push('BOM');
    if (temSubstituto) marcas.push('U+FFFD no topo');
    console.log(`${rel}: ${marcas.join(', ')}`);
  }
}
console.log(`\narquivos varridos: ${alvos.length} | com problema: ${problemas}`);
