// start-desktop.js — Inicia o servidor web e o Electron Desktop
const { spawn } = require('child_process');
const path = require('path');

console.log('Iniciando Honest Boost Desktop...');

// 1. Iniciar servidor web
const server = spawn('node', ['server.js'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: false
});

// 2. Aguardar 2s e iniciar o Electron
setTimeout(() => {
  console.log('Iniciando Electron...');
  const electron = spawn('npx', ['electron', '--expose-gc', '.'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: false
  });
  
  electron.on('close', () => {
    console.log('Electron encerrado. Finalizando servidor...');
    server.kill();
    process.exit(0);
  });
}, 2000);

server.on('close', (code) => {
  console.log(`Servidor encerrado com código ${code}`);
  process.exit(code || 0);
});
