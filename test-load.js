const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  console.log('APP READY');
  const win = new BrowserWindow({
    width: 400, height: 300, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'desktop', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'desktop', 'index.html'));
  console.log('LOAD FILE CALLED');
  win.webContents.on('did-finish-load', () => {
    console.log('PAGE LOADED OK');
    win.destroy();
    app.quit();
  });
  win.webContents.on('did-fail-load', (e, code, desc) => {
    console.log('LOAD FAILED:', code, desc);
    win.destroy();
    app.quit();
  });
  setTimeout(() => {
    console.log('TIMEOUT - forcando close');
    win.destroy();
    app.quit();
  }, 8000);
}).catch(e => {
  console.log('WHENREADY ERROR:', e.message);
  process.exit(1);
});
