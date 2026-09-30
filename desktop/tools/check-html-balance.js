'use strict';
/**
 * Checagem simples de balanceamento de tags HTML em um arquivo.
 * Conta abertura/fechamento de div, section, article, p, ul, li e aponta
 * desequilíbrios. Não substitui um parser, mas pega o erro de </div> extra,
 * que é o que uma edição por script costuma introduzir.
 *
 * Uso: node desktop/tools/check-html-balance.js public/index.html
 */
const fs = require('fs');
const path = require('path');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node check-html-balance.js <arquivo.html>'); process.exit(2); }
const abs = path.resolve(alvo);
const src = fs.readFileSync(abs, 'utf8');

// Ignora <script> e <style> para não contar tags dentro de código/estilos.
const semScript = src
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '');

const tags = ['div', 'section', 'article', 'p', 'ul', 'li', 'form', 'header', 'footer', 'nav', 'main', 'aside', 'span'];
let problemas = 0;

console.log(`arquivo: ${abs}\n`);
for (const tag of tags) {
  const abre = (semScript.match(new RegExp(`<${tag}(\\s|>)`, 'gi')) || []).length;
  const fecha = (semScript.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
  const ok = abre === fecha;
  if (!ok) problemas++;
  console.log(`  ${ok ? 'OK  ' : 'ERRO'}  <${tag}>  abre=${abre} fecha=${fecha}${ok ? '' : `  diferenca=${abre - fecha}`}`);
}

// Checa também a ordem: em HTML, um fechamento antes da abertura correspondente
// indica sobreposição. Fazemos uma varredura de pilha para tags de bloco.
const pilha = [];
let ordemErro = 0;
const re = /<(\/)?(div|section|article)\b[^>]*>/gi;
let m;
while ((m = re.exec(semScript)) !== null) {
  const fechando = Boolean(m[1]);
  const nome = m[2].toLowerCase();
  if (!fechando) pilha.push({ nome, pos: m.index });
  else {
    const topo = pilha.pop();
    if (!topo || topo.nome !== nome) {
      ordemErro++;
      const linha = semScript.slice(0, m.index).split('\n').length;
      if (ordemErro <= 5) {
        console.log(`\n  ORDEM: </${nome}> na linha ~${linha} não fecha o topo da pilha (${topo ? '</' + topo.nome + '>' : 'pilha vazia'})`);
      }
    }
  }
}

console.log('');
if (pilha.length) {
  console.log(`  SOBRARAM ${pilha.length} tag(s) de bloco sem fechamento:`);
  for (const p of pilha.slice(-5)) {
    const linha = semScript.slice(0, p.pos).split('\n').length;
    console.log(`     <${p.nome}> aberta na linha ~${linha}`);
  }
  problemas++;
}
if (ordemErro) { console.log(`  ${ordemErro} fechamento(s) fora de ordem`); problemas++; }

console.log(problemas ? `\nRESULTADO: ${problemas} problema(s)` : '\nRESULTADO: balanceado');
process.exit(problemas ? 1 : 0);
