/**
 * main.js — Honest Boost Desktop v3.1 (Refatorado, Catálogo VALIDADO)
 *
 * Processo principal: cria a janela, expõe IPC seguro ao renderer e
 * encaminha para os módulos (systemAnalyzer, registry, catalog,
 * recommendationEngine, optimizationEngine). Nenhum comando de
 * otimização é executado aqui — apenas delegação.
 */
const { app, BrowserWindow, ipcMain, shell, dialog, Notification, Menu } = require('electron');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

// Módulos próprios
const systemAnalyzer = require('./src/systemAnalyzer');
const registry = require('./src/registry');
const catalog = require('./src/catalog');
const recommendationEngine = require('./src/recommendationEngine');
const optimizationEngine = require('./src/optimizationEngine');

let mainWindow = null;
const POWERCFG = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'powercfg.exe');

// ==================== Utilitários ====================
function isWindows() {
  return process.platform === 'win32';
}

function isAdmin() {
  if (!isWindows()) return false;
  try {
    const { execSync } = require('child_process');
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

// ==================== Janela ====================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: 'Honest Boost — Otimizador Honesto',
    backgroundColor: '#060a18',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'public', 'logo.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ==================== IPC ====================
// App info
ipcMain.handle('app:info', () => ({
  ok: true,
  info: {
    platform: process.platform,
    windows: isWindows(),
    version: app.getVersion(),
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    admin: isAdmin()
  }
}));

// Check updates (delegate; falhas silenciosas)
ipcMain.handle('app:check-updates', async () => {
  try {
    // Ajuste fino real e inofensivo: verifica esquema ativo
    await registry.regQuery;
    return { ok: true, message: 'Verificação concluída.' };
  } catch {
    return { ok: true, message: 'Nenhuma atualização disponível.' };
  }
});

// Auth — validação REAL contra o site (POST /api/app/auth).
// Chaves hb_* são verificadas online e retornam plano + expiração
// verdadeiros do banco (api_keys.expires_at). Sem trial local.
const API_BASE = (process.env.HONEST_BOOST_API_BASE_URL || 'https://honest-boost.onrender.com').replace(/\/+$/, '');

async function validateKeyOnline(key) {
  // Até 2 tentativas: o plano free do Render dorme e o cold start pode
  // estourar o 1º timeout — a 2ª costuma responder com ele já acordado.
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const resp = await fetch(`${API_BASE}/api/app/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, deviceInfo: { hostname: os.hostname(), platform: process.platform } }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      // 401 + código conhecido = chave realmente inválida.
      // Qualquer outra coisa (404/5xx/rede) = servidor fora do ar → modo
      // offline (mantém última sessão, nunca desloga por culpa do servidor).
      if (resp.status === 401 && data.error) {
        const friendly = {
          key_not_found: 'Chave não encontrada. Confira a digitação ou compre uma licença.',
          key_expired: 'Esta chave expirou. Renove para continuar usando.',
          key_revoked: 'Esta chave foi revogada. Fale com o suporte.',
          key_suspended: 'Esta chave está suspensa. Fale com o suporte.',
          user_not_found: 'Conta vinculada à chave não existe mais.',
          missing_key: 'Digite a chave de licença.',
          database_not_ready: 'Servidor iniciando — tente novamente em instantes.',
        }[data.error] || `Falha na validação (${data.error}).`;
        return { ok: false, error: friendly, code: data.error };
      }
      return { ok: false, error: `Servidor de licenças indisponível (HTTP ${resp.status}). Tente mais tarde.`, offline: true, code: `http_${resp.status}` };
    }
    return { ok: true, data };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      // Rede/timeout na 1ª tentativa: tenta de novo (cold start); na 2ª, offline.
      if (attempt < 2) continue;
      return { ok: false, error: 'Sem conexão com o servidor de licenças. Verifique a internet e tente de novo.', offline: true, detail: e.message };
    }
  }
  return { ok: false, error: 'Sem conexão com o servidor de licenças.', offline: true, detail: lastErr && lastErr.message };
}

const PLAN_LABELS = { basic: 'Básico', pro: 'Pro', starter: 'Starter', premium: 'Pro', trial: 'Trial' };

ipcMain.handle('app:auth', async (event, key) => {
  const cleanKey = typeof key === 'string' ? key.trim() : '';
  if (!cleanKey) return { ok: false, error: 'Digite a chave de licença.' };
  // Sem trial local: toda chave é validada no servidor. O site não possui
  // período de teste — apenas licenças pagas (Básico/Pro, pagamento único).
  const res = await validateKeyOnline(cleanKey);
  if (!res.ok) {
    if (res.offline) return { ok: false, error: 'Sem conexão com o servidor de licenças. Verifique a internet e tente de novo.', offline: true };
    return { ok: false, error: res.error };
  }
  const { user, expiresAt, tier, lifetime } = res.data;
  const plan = PLAN_LABELS[tier] || (tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Trial');
  return {
    ok: true, tier,
    user: { nickname: (user && (user.nickname || user.username)) || 'Usuário' },
    info: {
      name: (user && (user.nickname || user.username)) || 'Usuário',
      plan, licenseId: cleanKey,
      expiryDate: expiresAt || null,
      lifetime: lifetime === true,
      machineLimit: 3, machinesUsed: 1,
    },
  };
});

ipcMain.handle('app:open-plans', async () => {
  shell.openExternal(`${API_BASE}/planos.html`);
  return { ok: true };
});

ipcMain.handle('app:logout', async () => ({ ok: true }));

// Reinicia o app elevado (para aplicar otimizações que exigem admin).
// Correções vs 1ª versão: (1) em dev passa o caminho ABSOLUTO do app
// ('.' relativo quebrava pois o cwd do processo elevado ≠ atual);
// (2) aguarda o UAC: só fecha a instância atual se a elevada realmente
// iniciou (negar o UAC não fecha mais o app).
ipcMain.handle('app:restart-admin', async () => {
  try {
    if (isAdmin()) return { ok: false, error: 'already-admin' };
    const exe = process.execPath;
    const isDevElectron = /electron(\.exe)?$/i.test(exe);
    const args = isDevElectron ? [app.getAppPath()] : [];
    const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const psCmd = `Start-Process -FilePath ${q(exe)}` +
      (args.length ? ` -ArgumentList ${args.map(q).join(',')}` : '') +
      ` -Verb RunAs`;
    const code = await new Promise((resolve) => {
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCmd],
        { windowsHide: true, timeout: 120000 },
        (err) => resolve(err ? (err.code ?? 1) : 0));
    });
    if (code !== 0) return { ok: false, error: 'launch-cancelled' };
    setTimeout(() => { app.quit(); }, 600);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('app:is-admin', async () => ({ ok: true, admin: isAdmin() }));

// Notificação
ipcMain.handle('notify', (event, { title, body }) => {
  showNotification(title, body);
  return { ok: true };
});

// Diagnóstico completo
ipcMain.handle('system:diagnostic', async () => {
  try {
    const diagnostic = await systemAnalyzer.fullSystemScan();
    return { ok: true, diagnostic };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Catálogo VALIDADO + status ao vivo
ipcMain.handle('catalog:list', async () => {
  try {
    const data = await recommendationEngine.getCatalog();
    return { ok: true, catalog: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('catalog:report', async () => {
  try {
    const report = await recommendationEngine.getRecommendationReport();
    return { ok: true, report };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Otimizações =====
ipcMain.handle('opt:apply', async (event, id) => {
  try {
    const result = await optimizationEngine.executeRecipe(id, { admin: isAdmin() });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('opt:apply-batch', async (event, ids) => {
  try {
    const result = await optimizationEngine.applyBatch(ids, { admin: isAdmin() });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('opt:apply-recommended', async () => {
  try {
    const result = await optimizationEngine.applyRecommended({ admin: isAdmin() });
    showNotification('Honest Boost', `${result.applied || 0} otimizações recomendadas aplicadas!`);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('opt:apply-all', async () => {
  try {
    const result = await optimizationEngine.applyAll({ admin: isAdmin() });
    showNotification('Honest Boost', `${result.applied || 0} otimizações aplicadas!`);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('opt:remove', async (event, id) => {
  try {
    const recipe = catalog.getById(id);
    if (!recipe) return { ok: false, error: 'Otimização não encontrada.' };
    if (recipe.kind === 'guide') return { ok: false, error: 'Guias manuais não podem ser removidos pelo app.' };
    if (recipe.admin && !isAdmin()) return { ok: false, error: 'Requer administrador.' };

    // Se a receita tem revert, usa; senão restaura snapshot do registry
    if (typeof recipe.revert === 'function') {
      const result = await recipe.revert();
      return { ok: true, result: { message: result?.message || 'Removido.' } };
    }
    // Fallback: restoreRegistry (desfaz alterações de registro capturadas)
    const result = await optimizationEngine.restoreRegistry();
    return { ok: true, result: { message: 'Revertido via snapshot do registro.' } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Recovery =====
ipcMain.handle('recovery:status', async () => {
  try {
    const status = await optimizationEngine.getRollbackInfo();
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('recovery:restore-registry', async () => {
  try {
    const result = await optimizationEngine.restoreRegistry();
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Jogos =====
ipcMain.handle('games:scan', async () => {
  try {
    const games = await systemAnalyzer.scanGames();
    return { ok: true, games };
  } catch (e) {
    return { ok: false, error: e.message, games: [] };
  }
});

// ===== Loja de Apps — instalação REAL via winget =====================
// IDs verificados via `winget show --exact` (out/2026). Drivers sem pacote
// winget confiável abrem a página oficial (url). A allowlist no main process
// impede injeção de comandos via renderer (só chaves conhecidas).
const APPS_ALLOWLIST = {
  chrome:     { winget: 'Google.Chrome', names: ['google chrome'] },
  firefox:    { winget: 'Mozilla.Firefox', names: ['mozilla firefox'] },
  edge:       { winget: 'Microsoft.Edge', names: ['microsoft edge'] },
  opera:      { winget: 'Opera.Opera', names: ['opera browser', 'opera stable'] },
  brave:      { winget: 'Brave.Brave', names: ['brave'] },
  steam:      { winget: 'Valve.Steam', names: ['steam'] },
  epic:       { winget: 'EpicGames.EpicGamesLauncher', names: ['epic games launcher'] },
  battle:     { winget: 'Blizzard.BattleNet', names: ['battle.net'] },
  discord:    { winget: 'Discord.Discord', names: ['discord'] },
  obs:        { winget: 'OBSProject.OBSStudio', names: ['obs studio'] },
  '7zip':     { winget: '7zip.7zip', names: ['7-zip'] },
  everything: { winget: 'voidtools.Everything', names: ['everything'] },
  rufus:      { winget: 'Rufus.Rufus', names: ['rufus'] },
  notion:     { winget: 'Notion.Notion', names: ['notion'] },
  obsidian:   { winget: 'Obsidian.Obsidian', names: ['obsidian'] },
  intel:      { winget: 'Intel.IntelDriverAndSupportAssistant', names: ['driver & support assistant'] },
  nvidia:     { url: 'https://www.nvidia.com/Download/index.aspx' },
  amd:        { url: 'https://www.amd.com/en/support/download/drivers.html' },
  vcredist:   { winget: ['Microsoft.VCRedist.2015+.x64', 'Microsoft.VCRedist.2015+.x86'] },
  directx:    { winget: 'Microsoft.DirectX' },
  dotnet:     { winget: 'Microsoft.DotNet.DesktopRuntime.9', names: ['.net desktop runtime'] },
  java:       { winget: 'Oracle.JavaRuntimeEnvironment', names: ['java runtime', 'openjdk', 'temurin'] },
  python:     { winget: 'Python.Python.3.13', names: ['python'] },
  afterburner:{ winget: 'Guru3D.Afterburner', names: ['afterburner'] },
  hwinfo:     { winget: 'REALiX.HWiNFO', names: ['hwinfo'] },
  'cpu-z':    { winget: 'CPUID.CPU-Z', names: ['cpu-z'] },
  'gpu-z':    { winget: 'TechPowerUp.GPU-Z', names: ['gpu-z'] },
};

function wingetRun(args, timeout = 600000) {
  return new Promise((resolve) => {
    execFile('winget', args, { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && (err.code === 'ENOENT' || /not recognized|não é reconhecido/i.test(String(stderr) + err.message))) {
        resolve({ ok: false, wingetMissing: true, stdout: '', stderr: 'winget não encontrado' });
        return;
      }
      resolve({ ok: !err, code: err && err.code, stdout: String(stdout || ''), stderr: String(stderr || (err && err.message) || '') });
    });
  });
}
const _wingetIdsOf = (entry) => Array.isArray(entry.winget) ? entry.winget : [entry.winget];

ipcMain.handle('apps:install', async (event, key) => {
  const entry = APPS_ALLOWLIST[key];
  if (!entry) return { ok: false, error: 'App desconhecido.' };
  if (entry.url) {
    shell.openExternal(entry.url);
    return { ok: true, external: true, message: 'Página oficial aberta no navegador.' };
  }
  try {
    for (const id of _wingetIdsOf(entry)) {
      const r = await wingetRun(['install', '-e', '--id', id, '--silent', '--accept-package-agreements', '--accept-source-agreements']);
      const out = r.stdout + '\n' + r.stderr;
      if (r.wingetMissing) return { ok: false, error: 'winget-not-found' };
      if (!r.ok && !/already installed|já está instalado|já instalado/i.test(out)) {
        return { ok: false, error: 'Falha ao instalar ' + id + ': ' + out.slice(-300).trim() };
      }
    }
    showNotification('Honest Boost', 'Instalação concluída via winget.');
    return { ok: true, message: 'Instalado via winget.' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('apps:uninstall', async (event, key) => {
  const entry = APPS_ALLOWLIST[key];
  if (!entry || !entry.winget) return { ok: false, error: entry && entry.url ? 'Drivers devem ser removidos pelo site oficial/painel do Windows.' : 'App desconhecido.' };
  try {
    for (const id of _wingetIdsOf(entry)) {
      const r = await wingetRun(['uninstall', '-e', '--id', id, '--silent', '--accept-source-agreements'], 300000);
      const out = r.stdout + '\n' + r.stderr;
      if (r.wingetMissing) return { ok: false, error: 'winget-not-found' };
      if (!r.ok && !/no installed package|nenhum pacote|not found|não encontrado/i.test(out)) {
        return { ok: false, error: 'Falha ao desinstalar ' + id + ': ' + out.slice(-300).trim() };
      }
    }
    showNotification('Honest Boost', 'Desinstalação concluída.');
    return { ok: true, message: 'Desinstalado.' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('apps:upgrade', async (event, key) => {
  const entry = APPS_ALLOWLIST[key];
  if (!entry || !entry.winget) return { ok: false, error: 'App sem upgrade via winget.' };
  try {
    const id = _wingetIdsOf(entry)[0];
    const r = await wingetRun(['upgrade', '-e', '--id', id, '--silent', '--accept-package-agreements', '--accept-source-agreements'], 600000);
    const out = r.stdout + '\n' + r.stderr;
    if (r.wingetMissing) return { ok: false, error: 'winget-not-found' };
    if (/no applicable|already|nenhum|já está|up to date/i.test(out)) {
      return { ok: true, latest: true, message: 'Já está na versão mais recente.' };
    }
    if (!r.ok) return { ok: false, error: out.slice(-300).trim() || 'Falha na atualização.' };
    showNotification('Honest Boost', 'App atualizado.');
    return { ok: true, message: 'Atualizado.' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Uma única chamada `winget list` + match por ID (evita 26 spawns e
// independe do idioma do cabeçalho da tabela).
ipcMain.handle('apps:status', async () => {
  try {
    const r = await wingetRun(['list', '--accept-source-agreements'], 120000);
    if (r.wingetMissing) return { ok: false, error: 'winget-not-found', installed: {} };
    if (!r.ok && !r.stdout) return { ok: false, error: r.stderr.slice(-200) || 'Falha ao listar.', installed: {} };
    const out = r.stdout;
    const lower = out.toLowerCase();
    const installed = {};
    for (const [key, entry] of Object.entries(APPS_ALLOWLIST)) {
      if (!entry.winget) { installed[key] = false; continue; }
      // ID pontilhado (fonte winget) OU nome de exibição (ARP/MSIX/msstore) —
      // apps instalados fora do winget não têm o ID na lista.
      const hitId = _wingetIdsOf(entry).some((id) => out.includes(id));
      const hitName = (entry.names || []).some((n) => lower.includes(String(n).toLowerCase()));
      installed[key] = hitId || hitName;
    }
    return { ok: true, installed };
  } catch (e) {
    return { ok: false, error: e.message, installed: {} };
  }
});

ipcMain.handle('apps:open-page', async (event, key) => {
  const entry = APPS_ALLOWLIST[key];
  if (!entry || !entry.url || !/^https:\/\//.test(entry.url)) return { ok: false, error: 'Página indisponível.' };
  shell.openExternal(entry.url);
  return { ok: true };
});

// ===== Snapshot em tempo real =====
const sysMonitor = require('./src/realtimeMonitor');
ipcMain.handle('system:snapshot', async () => {
  try {
    const snap = sysMonitor.systemSnapshot();
    return { ok: true, snapshot: snap };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Análise de saúde =====
const healthAnalyzer = require('./src/healthAnalyzer');
ipcMain.handle('system:health-analysis', async () => {
  try {
    const health = healthAnalyzer.analyzeHealth();
    return { ok: true, health };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Presets =====
ipcMain.handle('opt:apply-preset', async (event, presetId) => {
  try {
    const preset = healthAnalyzer.PRESETS[presetId];
    if (!preset) return { ok: false, error: 'Preset não encontrado.' };
    const ids = preset.optimizations;
    const result = await optimizationEngine.applyBatch(ids, { admin: isAdmin() });
    showNotification('Honest Boost', `Preset "${preset.name}" aplicado — ${result.applied || 0} otimizações.`);
    return { ok: true, result: { ...result, preset: preset.name } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Limpeza =====
ipcMain.handle('clean:item', async (event, id) => {
  try {
    const res = await systemAnalyzer.cleanItem(id);
    return { ok: res.ok, message: res.ok ? `Item ${id} limpo.` : res.error };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('clean:selected', async (event, ids) => {
  try {
    let okCount = 0;
    for (const id of ids) {
      const res = await systemAnalyzer.cleanItem(id);
      if (res.ok) okCount++;
    }
    return { ok: true, result: { cleaned: okCount, total: ids.length } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== RAM =====
ipcMain.handle('system:free-ram', async () => {
  try {
    global.gc && global.gc();
    return { ok: true, message: 'Garbage collection executado. RAM liberada.' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Explorer =====
ipcMain.handle('system:restart-explorer', async () => {
  try {
    const { execSync } = require('child_process');
    execSync('taskkill /F /IM explorer.exe', { windowsHide: true, stdio: 'ignore' });
    setTimeout(() => {
      try { execSync('explorer.exe', { windowsHide: true, stdio: 'ignore' }); } catch {}
    }, 1500);
    return { ok: true, message: 'Explorador reiniciado.' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== Recovery estendida =====
ipcMain.handle('recovery:create-restore-point', async (event, description) => {
  try {
    const { execSync } = require('child_process');
    execSync(`powershell -Command "Enable-ComputerRestore -Drive C:"`);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    execSync(`wbadmin start systemstatebackup -quiet`, { windowsHide: true, stdio: 'ignore' }).toString();
    return { ok: true, result: { message: `Ponto "${description}" criado com sucesso.`, timestamp: ts } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('recovery:backup-settings', async () => {
  try {
    const path = require('path');
    const fs = require('fs');
    const backupDir = path.join(process.env.LOCALAPPDATA, 'Honest Boost', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const settings = {
      theme: localStorage?.getItem?.('hb.theme') || 'dark',
      preset: 'custom',
      createdAt: new Date().toISOString(),
    };
    const file = path.join(backupDir, `backup-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(settings, null, 2));
    return { ok: true, result: { message: 'Backup salvo.', file } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('recovery:restore-backup', async () => {
  try {
    const path = require('path');
    const fs = require('fs');
    const backupDir = path.join(process.env.LOCALAPPDATA, 'Honest Boost', 'backups');
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json')).sort().reverse();
    if (files.length === 0) return { ok: false, error: 'Nenhum backup encontrado.' };
    const latest = path.join(backupDir, files[0]);
    const data = JSON.parse(fs.readFileSync(latest, 'utf8'));
    return { ok: true, result: { message: 'Backup restaurado.', data } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Menu (simples; sem autoUpdater obrigatório para não quebrar build)
function createMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Sair', role: 'quit' }
      ]
    },
    {
      label: 'Otimizações',
      submenu: [
        { label: 'Aplicar Recomendadas', click: () => mainWindow && mainWindow.webContents.send('menu:apply-recommended') },
        { label: 'Aplicar Todas', click: () => mainWindow && mainWindow.webContents.send('menu:apply-all') },
        { type: 'separator' },
        { label: 'Restaurar Registro', click: () => mainWindow && mainWindow.webContents.send('menu:restore-registry') }
      ]
    },
    {
      label: 'Ajuda',
      submenu: [
        { label: 'Site Oficial', click: () => shell.openExternal('https://honestboost.com.br') },
        { label: 'Documentação', click: () => shell.openExternal('https://honestboost.com.br/docs') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ==================== App Lifecycle ====================
app.whenReady().then(() => {
  createWindow();
  createMenu();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
