'use strict';
/**
 * Detecta o defeito real observado em systemAnalyzer.js:
 *
 *   exec('C:WindowsSystem32powercfg.exe', ...)   <-- QUEBRADO
 *   path.join('C:Program Files', 'Epic Games')   <-- funciona, mas depende do
 *                                                    diretório corrente do drive
 *   'C:\\Windows'                                 <-- correto
 *
 * O que nunca pode acontecer é um EXECUTÁVEL referenciado sem separador depois
 * do "C:" — ele vira um nome relativo ao diretório atual e o execFile falha
 * silenciosamente, fazendo a feature reportar estado inventado.
 *
 * Usado por cleanup.test.js como teste de regressão.
 */
function findRelativeExecutablePaths(source) {
  const hits = [];
  const seen = new Set();
  const add = (linha, target, text) => {
    const chave = `${linha}|${target}`;
    if (seen.has(chave)) return;
    seen.add(chave);
    hits.push({ line: linha, target, text: text.trim().slice(0, 90) });
  };
  source.split(/\r?\n/).forEach((line, idx) => {
    for (const call of line.matchAll(/\b(?:execFile|exec)\s*\(\s*'([^']*)'/g)) {
      const target = call[1];
      for (let i = 0; i < target.length - 1; i++) {
        if (target[i] !== 'C' || target[i + 1] !== ':') continue;
        // Já faz parte de um caminho absoluto? Ex.: 'C:\\Windows'.
        if (target[i - 1] === '\\' || target[i - 1] === '/') continue;
        const after = target.slice(i + 2);
        // 'C:Windows...' -> executável relativo: defeito.
        if (/^[A-Za-z_]/.test(after)) add(idx + 1, target, line);
      }
    }
    // Detecta também caminhos absolutos colados dentro de comandos PowerShell,
    // onde a barra sumiu de vez. Exige continuidade alfanumérica após a letra
    // (C:Windows, C:Temp), o que distingue de um "drive-relativo" legítimo
    // como C:Program Files — este separa na primeira letra por causa do espaço.
    for (const m of line.matchAll(/\bC:(?!\\)[A-Za-z_][A-Za-z0-9_]{3,}/g)) {
      add(idx + 1, m[0], line);
    }
  });
  return hits;
}

module.exports = { findRelativeExecutablePaths };

if (require.main === module) {
  const casos = [
    ["execFile('C:\\\\Windows\\\\System32\\\\powercfg.exe', ['/getactivescheme'])", 0, 'correto: caminho absoluto'],
    ["exec('C:WindowsSystem32powercfg.exe', ['/getactivescheme'], cb)", 2, 'QUEBRADO: exec relativo + caminho PS sem barra'],
    ["path.join('C:Program Files', 'Epic Games')", 1, 'drive-relativo: resolve contra o cwd'],
    ["Remove-Item -Path C:WindowsPrefetch* -Force", 1, 'QUEBRADO: caminho PS sem barra'],
    ["execFile(POWERCFG, ['/getactivescheme'])", 0, 'correto: constante'],
    ["x = 'C:\\\\Windows\\\\Temp'", 0, 'correto: barra dupla'],
  ];
  let fail = 0;
  for (const [src, esperado, desc] of casos) {
    const n = findRelativeExecutablePaths(src).length;
    const ok = n === esperado;
    if (!ok) fail++;
    console.log(`${ok ? 'OK  ' : 'ERRO'}  esperado=${esperado} obtido=${n}  ${desc}`);
  }
  console.log(`\n${casos.length - fail}/${casos.length} corretos`);
  process.exit(fail ? 1 : 0);
}
