'use strict';
/**
 * Corrige mojibake (UTF-8 lido como Latin-1) em um arquivo.
 *
 * O defeito: "usuário" foi gravado como os caracteres "usuÃ¡rio", ou seja, os
 * bytes UTF-8 de "á" (C3 A1) foram interpretados como dois caracteres Latin-1.
 * A reversão é ler a string atual como Latin-1 e decodificar como UTF-8.
 *
 * Só grava se o resultado tiver MENOS marcadores de mojibake que o original,
 * para nunca piorar um arquivo já correto.
 */
const fs = require('fs');
const path = require('path');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node fix-encoding.js <arquivo>'); process.exit(2); }

const abs = path.resolve(alvo);
let buf = fs.readFileSync(abs);

// Prefixo corrompido no lugar do BOM: EF BF BD (U+FFFD). Remove os 3 bytes.
while (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBF && buf[2] === 0xBD) {
  buf = buf.slice(3);
  console.log('prefixo EF BF BD removido');
}
// BOM legítimo também sai: o Node recusa no topo de um script.
if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
  buf = buf.slice(3);
  console.log('BOM UTF-8 removido');
}

const original = buf.toString('utf8');

const contarMojibake = (s) => (s.match(/\u00c3[\u0080-\u00bf\u00a0-\u00bf]?/g) || []).length;
const antes = contarMojibake(original);

let corrigido;
try {
  corrigido = Buffer.from(original, 'latin1').toString('utf8');
} catch (e) {
  console.error('falha na conversao:', e.message);
  process.exit(1);
}

if (corrigido.charCodeAt(0) === 0xFEFF) corrigido = corrigido.slice(1);
corrigido = corrigido.replace(/^\u00ef\u00bb\u00bf/, '');

const depois = contarMojibake(corrigido);

console.log('arquivo        :', abs);
console.log('mojibake antes :', antes);
console.log('mojibake depois:', depois);

if (depois >= antes) {
  // Sem mojibake a corrigir: grava apenas se o prefixo foi limpo.
  if (buf.length !== fs.readFileSync(abs).length) {
    fs.writeFileSync(abs, original, 'utf8');
    console.log('gravado (somente remocao de prefixo)');
  } else {
    console.log('nada a fazer — arquivo NAO alterado');
  }
  process.exit(0);
}

fs.writeFileSync(abs, corrigido, 'utf8');
console.log('gravado com correcao');
