/**
 * renderer.js — Honest Boost v2.0
 * UI Expandida: Dashboard, Otimizações, Limpeza, Restauração,
 * Apps Store, Configurações, Autenticação, Histórico, Gráficos.
 */
'use strict';

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  info: null,
  catalog: null,
  health: null,
  snapshot: null,
  selectedOpt: new Set(),
  selectedClean: new Set(),
  selectedPreset: 'custom',
  history: [],
  notifications: [],
  _histCpu: [],
  _histRam: [],
  _histDiskRead: [],
  _histDiskWrite: [],
};

// ============================================================
// Utilidades
// ============================================================
const toastTimer = { current: null };
function toast(message, type = 'info') {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.className = 'toast show';
  el.dataset.type = type;
  clearTimeout(toastTimer.current);
  toastTimer.current = setTimeout(() => { el.className = 'toast'; }, 3500);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const CAT_ICON_MAP = { 'Sistema': '🖥️', 'Jogos': '🎮', 'Rede': '🌐', 'SSD/HDD': '💾', 'Interface': '🎨', 'Privacidade': '🛡️', 'Desempenho': '⚡', 'Energia': '🔋', 'Manutenção': '🧹', 'Input': '⌨️', 'Latência': '⏱️', 'Reparo': '🔧', 'Visual': '🎨' };
function catIcon(cat) { return CAT_ICON_MAP[cat] || '⚙️'; }

function daysRemaining(expiryDate) {
  if (!expiryDate) return 0;
  return Math.max(0, Math.floor((new Date(expiryDate) - new Date()) / 86400000));
}

// ============================================================
// Sidebar
// ============================================================
function buildSidebar() {
  const nav = $('sidebar-nav');
  if (!nav) return;
  const items = [
    { id: 'dashboard', icon: '📊', label: 'Painel' },
    { id: 'optimizations', icon: '⚡', label: 'Otimizações' },
    { id: 'cleaning', icon: '🧹', label: 'Limpeza' },
    { id: 'restoration', icon: '🛡', label: 'Restauração' },
    { id: 'apps', icon: '📦', label: 'Apps' },
    { id: 'settings', icon: '⚙️', label: 'Configurações' },
    { id: 'auth', icon: '🔐', label: 'Autenticação' },
  ];
  nav.innerHTML = items.map(i => `
    <button class="nav-item" data-id="${i.id}">
      <span class="nav-icon">${i.icon}</span>
      <span class="nav-label">${esc(i.label)}</span>
    </button>
  `).join('');
  nav.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.id)));
}

function navigate(id) {
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.id === id));
  $$('.panel').forEach(el => el.classList.remove('active'));
  const panel = $(`panel-${id}`);
  if (panel) panel.classList.add('active');
  $$('.tab-panel').forEach(el => el.classList.remove('active'));
  switch (id) {
    case 'dashboard': renderDashboard(); break;
    case 'optimizations': renderOptimizations(); break;
    case 'cleaning': renderCleaning(); break;
    case 'restoration': renderRestoration(); break;
    case 'apps': renderApps(); break;
    case 'settings': renderSettings(); break;
    case 'auth': renderAuth(); break;
  }
  $('quick-actions').classList.add('hidden');
}

function initSidebar() {
  const btn = $('btn-toggle-sidebar');
  const shell = $('app-shell');
  const qa = $('quick-actions');
  if (btn && shell) {
    btn.addEventListener('click', () => {
      const expanded = shell.classList.toggle('sidebar-expanded');
      shell.classList.toggle('sidebar-collapsed', !expanded);
      if (!expanded) qa.classList.add('hidden');
    });
  }
  const closeBtn = $('btn-close-quick');
  if (closeBtn) closeBtn.addEventListener('click', () => {
    shell.classList.remove('sidebar-expanded');
    shell.classList.add('sidebar-collapsed');
    qa.classList.add('hidden');
  });
}

// ============================================================
// Catalogo (carregado via IPC do main process — veja init())
// ============================================================
let OPT_CATALOG = { SYSTEM: [], GAMES: [], NETWORK: [], STORAGE: [], INTERFACE: [] };

function renderDashboard() {
  const statsGrid = $('stats-grid');
  const chartsGrid = $('charts-grid');
  const infoGrid = $('system-info-grid');
  const legend = $('stats-legend');
  if (!statsGrid || !chartsGrid || !infoGrid) return;

  const s = state.snapshot;
  if (!s) {
    statsGrid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-title">Sem dados</div><div class="empty-state-desc">Aguardando primeiro snapshot...</div></div>';
    chartsGrid.innerHTML = '';
    infoGrid.innerHTML = '';
    return;
  }

  // Se os stat cards ainda não existem, faz render completo (primeira vez)
  const existingCards = document.querySelectorAll('.stat-card[data-type]');
  if (existingCards.length < 6) {
    // Render completo — primeira vez ou após reconstrução
    statsGrid.innerHTML = `
      <div class="stat-card" data-type="cpu">
        <div class="stat-card-icon">🖥️</div>
        <div class="stat-card-label">Uso da CPU</div>
        <div class="stat-card-value">${cpuPct.toFixed(1)}<span class="stat-card-unit">%</span></div>
        <div class="stat-card-sub">Load: ${s.cpu.load !== null ? s.cpu.load : '—'} | ${s.cpu.cores} núcleos | ${esc(s.cpu.model || '')}</div>
        <div class="stat-card-bar"><div class="stat-card-bar-fill" style="width:${Math.min(100,cpuPct)}%;background:var(--accent-primary);"></div></div>
      </div>
      <div class="stat-card" data-type="gpu">
        <div class="stat-card-icon">🎮</div>
        <div class="stat-card-label">Uso da GPU</div>
        <div class="stat-card-value">${gpuUsage.toFixed(1)}<span class="stat-card-unit">%</span></div>
        <div class="stat-card-sub">${gpuName} | VRAM: ${(s.gpu && s.gpu.vram ? (s.gpu.vram / 1e9).toFixed(1) : 'N/A')} GB</div>
        <div class="stat-card-bar"><div class="stat-card-bar-fill" style="width:${Math.min(100,gpuUsage)}%;background:var(--purple);"></div></div>
      </div>
      <div class="stat-card" data-type="ram">
        <div class="stat-card-icon">🧠</div>
        <div class="stat-card-label">Uso da RAM</div>
        <div class="stat-card-value">${ramPct.toFixed(1)}<span class="stat-card-unit">%</span></div>
        <div class="stat-card-sub">${(s.ram.used/1e9).toFixed(1)} / ${(s.ram.total/1e9).toFixed(1)} GB | Node: ${(s.ram.nodeUsed/1e6).toFixed(0)} MB</div>
        <div class="stat-card-bar"><div class="stat-card-bar-fill" style="width:${Math.min(100,ramPct)}%;background:var(--cyan);"></div></div>
      </div>
      <div class="stat-card" data-type="ssd">
        <div class="stat-card-icon">💾</div>
        <div class="stat-card-label">Disco (C:)</div>
        <div class="stat-card-value">${diskFreeGB}<span class="stat-card-unit">GB livres</span></div>
        <div class="stat-card-sub">${((cDrive ? cDrive.size - cDrive.free : 0) / 1e9).toFixed(1)} / ${diskTotalGB} GB usados</div>
        <div class="stat-card-bar"><div class="stat-card-bar-fill" style="width:${diskPctUsed}%;background:var(--green);"></div></div>
      </div>
      <div class="stat-card" data-type="network">
        <div class="stat-card-icon">🌐</div>
        <div class="stat-card-label">Throughput de Rede</div>
        <div class="stat-card-value">↓${netRx}<span class="stat-card-unit"> MB/s</span></div>
        <div class="stat-card-sub">↑${netTx} MB/s</div>
        <div class="stat-card-bar"><div class="stat-card-bar-fill" style="width:${Math.min(100, parseFloat(netRx) * 2)}%;background:var(--amber);"></div></div>
      </div>
      <div class="stat-card" data-type="temperature">
        <div class="stat-card-icon">🌡️</div>
        <div class="stat-card-label">Temperatura GPU</div>
        <div class="stat-card-value" style="color:${tempColor};">${tempVal}</div>
        <div class="stat-card-sub">Status: ${tempStatus}</div>
        <div class="stat-card-bar"><div class="stat-card-bar-fill" style="width:${gpuTemp !== null ? Math.min(100, gpuTemp * 1.2) : 0}%;background:${tempColor};"></div></div>
      </div>
    `;
    // Charts (criar canvas)
    chartsGrid.innerHTML = `
      <div class="chart-card"><div class="chart-card-header"><span class="chart-card-title">CPU</span><span class="chart-card-value" style="color:var(--accent-primary);">${cpuPct.toFixed(1)}%</span></div><div class="chart-canvas-wrap"><canvas class="chart-canvas" id="chart-cpu"></canvas></div></div>
      <div class="chart-card"><div class="chart-card-header"><span class="chart-card-title">RAM</span><span class="chart-card-value" style="color:var(--cyan);">${ramPct.toFixed(1)}%</span></div><div class="chart-canvas-wrap"><canvas class="chart-canvas" id="chart-ram"></canvas></div></div>
      <div class="chart-card"><div class="chart-card-header"><span class="chart-card-title">Disco I/O</span><span class="chart-card-value" style="color:var(--green);">${(s.disk.io.readMBps + s.disk.io.writeMBps).toFixed(2)} MB/s</span></div><div class="chart-canvas-wrap"><canvas class="chart-canvas" id="chart-disk"></canvas></div></div>
    `;
    drawChart('chart-cpu', state._histCpu.slice(), '#3B82F6');
    drawChart('chart-ram', state._histRam.slice(), '#06B6D4');
    const diskCombined = state._histDiskRead.slice().map((v, i) => v + (state._histDiskWrite[i] || 0));
    drawChart('chart-disk', diskCombined, '#10B981');
    if (legend) {
      legend.innerHTML = `
        <div class="stats-legend-item"><div class="stats-legend-dot" style="background:var(--accent-primary);"></div>CPU</div>
        <div class="stats-legend-item"><div class="stats-legend-dot" style="background:var(--cyan);"></div>RAM</div>
        <div class="stats-legend-item"><div class="stats-legend-dot" style="background:var(--green);"></div>Disco</div>
      `;
    }
    // Info grid
    infoGrid.innerHTML = `
      <div class="sys-info-card"><div class="sys-info-label">Status do Windows</div><div class="sys-info-value">${esc(s.windows ? s.windows.state : 'N/A')}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Tempo Ligado</div><div class="sys-info-value">${esc(s.os.uptime ? s.os.uptime.label : 'N/A')}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Processos Ativos</div><div class="sys-info-value">${s.processes ? s.processes.count : '—'}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Apps de Start</div><div class="sys-info-value">${s.startup ? s.startup.length : 0}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Espaço Livre C:</div><div class="sys-info-value">${diskFreeGB} GB</div></div>
      <div class="sys-info-card"><div class="sys-info-label">FPS Boost Est.</div><div class="sys-info-value" style="color:var(--green);">+${(Math.max(0, Math.round((100 - cpuPct) * 0.15))).toString()}%</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Hostname</div><div class="sys-info-value">${esc(s.os.hostname || 'N/A')}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Arquitetura</div><div class="sys-info-value">${esc(s.os.arch || 'N/A')}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Sistema</div><div class="sys-info-value">${esc(s.os.type || '')} ${esc(s.os.release || '')}</div></div>
    `;
  } else {
    // Atualização incremental — só altera valores, sem reconstruir HTML
    updateStatCardValues(s);
    updateCharts();
    // Atualiza info grid (o HTML é pequeno, reconstruir aqui é aceitável)
    infoGrid.innerHTML = `
      <div class="sys-info-card"><div class="sys-info-label">Status do Windows</div><div class="sys-info-value">${esc(s.windows ? s.windows.state : 'N/A')}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Tempo Ligado</div><div class="sys-info-value">${esc(s.os.uptime ? s.os.uptime.label : 'N/A')}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Processos Ativos</div><div class="sys-info-value">${s.processes ? s.processes.count : '—'}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Apps de Start</div><div class="sys-info-value">${s.startup ? s.startup.length : 0}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Espaço Livre C:</div><div class="sys-info-value">${diskFreeGB} GB</div></div>
      <div class="sys-info-card"><div class="sys-info-label">FPS Boost Est.</div><div class="sys-info-value" style="color:var(--green);">+${(Math.max(0, Math.round((100 - cpuPct) * 0.15))).toString()}%</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Hostname</div><div class="sys-info-value">${esc(s.os.hostname || 'N/A')}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Arquitetura</div><div class="sys-info-value">${esc(s.os.arch || 'N/A')}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Sistema</div><div class="sys-info-value">${esc(s.os.type || '')} ${esc(s.os.release || '')}</div></div>
    `;
  }

  // Health score (atualiza sempre — é só 4 elementos)
  const health = state.health;
  if (health) {
    const hs = $('health-value');
    const hn = $('health-number');
    const circle = $('health-circle');
    if (hs) hs.textContent = health.score;
    if (hn) hn.textContent = health.score;
    if (circle) {
      const color = health.score >= 80 ? 'var(--green)' : health.score >= 50 ? 'var(--amber)' : 'var(--red)';
      circle.style.setProperty('--card-accent', color);
    }
    const title = $('health-title');
    const desc = $('health-desc');
    const healthScoreEl = $('health-score');
    if (title) title.textContent = health.score >= 80 ? 'Excelente!' : health.score >= 50 ? 'Precisa de atenção' : 'Requer otimização urgente';
    if (desc) desc.textContent = health.recommendations.length > 0
      ? `${health.recommendations.length} recomendações baseadas no seu hardware.`
      : 'Sistema saudável. Nenhuma ação crítica necessária.';
    if (healthScoreEl) healthScoreEl.style.borderColor = health.score >= 80 ? 'rgba(16,185,129,0.3)' : health.score >= 50 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)';
  }
}

// ============================================================
// Canvas Charts
// ============================================================
function drawChart(canvasId, data, color) {
  const canvas = $(canvasId);
  if (!canvas || !data || data.length === 0) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const vals = data.map(v => typeof v === 'number' ? v : (v.v ?? 0));
  const maxV = Math.max(...vals, 1);
  const len = vals.length;
  const step = len > 1 ? w / (len - 1) : w;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  vals.forEach((v, i) => {
    const x = i * step;
    const y = h - (v / maxV) * (h - 6) - 3;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + '55');
  grad.addColorStop(1, color + '00');
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
}

// ============================================================
// Snapshot polling
// ============================================================
let snapshotTimer = null;
let lastSnapshot = null;
function startSnapshotPolling(periodMs = 1500) {
  stopSnapshotPolling();
  snapshotTimer = setInterval(async () => {
    try {
      const res = await window.hbDesktop.getSnapshot();
      if (res.ok && res.snapshot) {
        lastSnapshot = res.snapshot;
        state.snapshot = res.snapshot;
        state._histCpu.push(res.snapshot.cpu.usage);
        state._histRam.push(res.snapshot.ram.pct);
        state._histDiskRead.push(res.snapshot.disk.io.readMBps);
        state._histDiskWrite.push(res.snapshot.disk.io.writeMBps);
        if (state._histCpu.length > 40) { state._histCpu.shift(); state._histRam.shift(); state._histDiskRead.shift(); state._histDiskWrite.shift(); }
        // Atualiza apenas os valore nos stat cards (sem reconstruir HTML)
        updateStatCardValues(res.snapshot);
        // Redesenha charts com novos dados (canvas reutilizado)
        if (document.querySelector('.panel.active')?.id === 'panel-dashboard') {
          updateCharts();
        }
      }
    } catch (e) { /* silent */ }
  }, periodMs);
}
function stopSnapshotPolling() {
  if (snapshotTimer) { clearInterval(snapshotTimer); snapshotTimer = null; }
}

// Atualiza apenas os valores nos stat cards existentes (sem reconstruir HTML)
function updateStatCardValues(snap) {
  const cpuPct = snap.cpu.usage;
  const ramPct = snap.ram.pct;
  const gpuUsage = (snap.gpu && snap.gpu.usage) || 0;
  const gpuName = (snap.gpu && snap.gpu.name) ? esc(snap.gpu.name) : 'N/A';
  const gpuTemp = snap.gpuTemp;
  const cDrive = snap.disk.space.find(d => d.device === 'C:');
  const diskFreeGB = cDrive ? (cDrive.free / 1e9).toFixed(1) : 'N/A';
  const diskTotalGB = cDrive ? (cDrive.size / 1e9).toFixed(1) : 'N/A';
  const diskPctUsed = cDrive ? Math.min(100, ((cDrive.size - cDrive.free) / cDrive.size) * 100) : 0;
  const netRx = snap.network.rxMBps.toFixed(1);
  const netTx = snap.network.txMBps.toFixed(1);

  const cards = document.querySelectorAll('.stat-card');
  if (cards.length >= 6) {
    const targets = {
      cpu:  { value: cpuPct.toFixed(1) + '%',  sub: `Load: ${snap.cpu.load !== null ? snap.cpu.load : '—'} | ${snap.cpu.cores} núcleos | ${esc(snap.cpu.model || '')}`, pct: cpuPct },
      gpu:  { value: gpuUsage.toFixed(1) + '%', sub: `${gpuName} | VRAM: ${(snap.gpu && snap.gpu.vram ? (snap.gpu.vram / 1e9).toFixed(1) : 'N/A')} GB`, pct: gpuUsage },
      ram:  { value: ramPct.toFixed(1) + '%',  sub: `${(snap.ram.used/1e9).toFixed(1)} / ${(snap.ram.total/1e9).toFixed(1)} GB | Node: ${(snap.ram.nodeUsed/1e6).toFixed(0)} MB`, pct: ramPct },
      ssd:  { value: diskFreeGB + 'GB livres', sub: `${((cDrive ? cDrive.size - cDrive.free : 0) / 1e9).toFixed(1)} / ${diskTotalGB} GB usados`, pct: diskPctUsed },
      network: { value: `↓${netRx} MB/s`, sub: `↑${netTx} MB/s`, pct: Math.min(100, parseFloat(netRx) * 2) },
      temperature: { value: gpuTemp !== null ? `${gpuTemp}°C` : 'N/A', sub: gpuTemp !== null ? (gpuTemp > 80 ? 'Crítica' : gpuTemp > 65 ? 'Normal' : 'Baixa') : 'N/A', pct: gpuTemp !== null ? Math.min(100, gpuTemp * 1.2) : 0, tempColor: gpuTemp !== null ? (gpuTemp > 80 ? 'var(--red)' : gpuTemp > 65 ? 'var(--amber)' : 'var(--green)') : 'var(--text-muted)' },
    };
    for (const [type, t] of Object.entries(targets)) {
      const card = document.querySelector(`.stat-card[data-type="${type}"]`);
      if (!card) continue;
      const valEl = card.querySelector('.stat-card-value');
      const subEl = card.querySelector('.stat-card-sub');
      const barEl = card.querySelector('.stat-card-bar-fill');
      if (valEl) valEl.innerHTML = t.value;
      if (subEl) subEl.textContent = t.sub;
      if (barEl) {
        barEl.style.width = Math.min(100, t.pct) + '%';
        if (type === 'temperature') {
          barEl.style.background = t.tempColor || 'var(--text-muted)';
        }
      }
    }
  }

  // Atualiza info grid (sistema)
  const infoGrid = document.querySelector('.system-info-grid');
  if (infoGrid) {
    const fpsBoost = Math.max(0, Math.round((100 - cpuPct) * 0.15));
    infoGrid.innerHTML = `
      <div class="sys-info-card"><div class="sys-info-label">Status do Windows</div><div class="sys-info-value">${esc(snap.windows ? snap.windows.state : 'N/A')}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Tempo Ligado</div><div class="sys-info-value">${esc(snap.os.uptime ? snap.os.uptime.label : 'N/A')}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Processos Ativos</div><div class="sys-info-value">${snap.processes ? snap.processes.count : '—'}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Apps de Start</div><div class="sys-info-value">${snap.startup ? snap.startup.length : 0}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Espaço Livre C:</div><div class="sys-info-value">${diskFreeGB} GB</div></div>
      <div class="sys-info-card"><div class="sys-info-label">FPS Boost Est.</div><div class="sys-info-value" style="color:var(--green);">+${fpsBoost}%</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Hostname</div><div class="sys-info-value">${esc(snap.os.hostname || 'N/A')}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Arquitetura</div><div class="sys-info-value">${esc(snap.os.arch || 'N/A')}</div></div>
      <div class="sys-info-card"><div class="sys-info-label">Sistema</div><div class="sys-info-value">${esc(snap.os.type || '')} ${esc(snap.os.release || '')}</div></div>
    `;
  }
}

// Redesenha charts com dados existentes (canvas já criado)
function updateCharts() {
  const cpuCvs = document.getElementById('chart-cpu');
  const ramCvs = document.getElementById('chart-ram');
  const diskCvs = document.getElementById('chart-disk');
  if (cpuCvs) drawChart('chart-cpu', state._histCpu.slice(), '#3B82F6');
  if (ramCvs) drawChart('chart-ram', state._histRam.slice(), '#06B6D4');
  if (diskCvs) {
    const diskCombined = state._histDiskRead.slice().map((v, i) => v + (state._histDiskWrite[i] || 0));
    drawChart('chart-disk', diskCombined, '#10B981');
  }
  // Atualiza os valores dos charts
  const cpuChartVal = document.querySelector('.chart-card-title + .chart-card-value');
  // (os valores dos charts são atualizados via renderDashboard completo só no health scan)
}

// ============================================================
// Health scan
// ============================================================
async function runHealthScan() {
  const btn = $('btn-run-health-scan');
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Escaneando...';
  try {
    const res = await window.hbDesktop.getHealthAnalysis();
    if (res.ok && res.health) {
      state.health = res.health;
      renderDashboard();
      toast(`Pontuação de saúde: ${res.health.score}/100`, res.health.score >= 70 ? 'success' : 'warning');
    }
  } catch (e) { toast('Erro na varredura: ' + e.message, 'error'); }
  finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> Executar Varredura';
  }
}

// ============================================================
// Otimizações
// ============================================================
const OPT_GROUPS = [
  { id: 'system', label: 'Sistema', icon: '🖥️' },
  { id: 'games', label: 'Jogos', icon: '🎮' },
  { id: 'network', label: 'Rede', icon: '🌐' },
  { id: 'storage', label: 'SSD/HDD', icon: '💾' },
  { id: 'interface', label: 'Interface', icon: '🎨' },
];

function renderOptimizations() {
  const tabsBar = $('opt-tabs-bar');
  const content = $('opt-content');
  const applyBtn = $('btn-apply-selected-opt');
  if (!tabsBar || !content) return;

  tabsBar.innerHTML = `
    <button class="tab-btn active" data-opttab="all">Todas (${totalOptCount()})</button>
    ${OPT_GROUPS.map(g => `<button class="tab-btn" data-opttab="${g.id}">${g.icon} ${g.label}</button>`).join('')}
  `;

  tabsBar.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tabsBar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderOptCategory(btn.dataset.opttab);
    });
  });

  const recommendedBtn = $('btn-apply-recommended');
  if (recommendedBtn) recommendedBtn.onclick = applyRecommended;

  if (applyBtn) applyBtn.disabled = state.selectedOpt.size === 0;
  renderOptCategory('all');
}

function totalOptCount() {
  const c = OPT_CATALOG;
  return (c.SYSTEM?.length || 0) + (c.GAMES?.length || 0) + (c.NETWORK?.length || 0) + (c.STORAGE?.length || 0) + (c.INTERFACE?.length || 0);
}

function renderOptCategory(tabId) {
  const content = $('opt-content');
  if (!content) return;

  let items = [];
  if (tabId === 'all') {
    const c = OPT_CATALOG;
    items = [
      ...((c.SYSTEM || []).map(o => ({ ...o, group: 'Sistema', cat: o.category || 'Sistema' }))),
      ...((c.GAMES || []).map(o => ({ ...o, group: 'Jogos', cat: o.category || 'Jogos' }))),
      ...((c.NETWORK || []).map(o => ({ ...o, group: 'Rede', cat: o.category || 'Rede' }))),
      ...((c.STORAGE || []).map(o => ({ ...o, group: 'SSD/HDD', cat: o.category || 'SSD/HDD' }))),
      ...((c.INTERFACE || []).map(o => ({ ...o, group: 'Interface', cat: o.category || 'Interface' }))),
    ];
  } else {
    const map = { system: OPT_CATALOG.SYSTEM, games: OPT_CATALOG.GAMES, network: OPT_CATALOG.NETWORK, storage: OPT_CATALOG.STORAGE, interface: OPT_CATALOG.INTERFACE };
    const labelMap = { system: 'Sistema', games: 'Jogos', network: 'Rede', storage: 'SSD/HDD', interface: 'Interface' };
    items = (map[tabId] || []).map(o => ({ ...o, group: labelMap[tabId], cat: o.category || labelMap[tabId] }));
  }

  const groups = {};
  items.forEach(item => {
    if (!groups[item.group]) groups[item.group] = [];
    groups[item.group].push(item);
  });

  let html = '';
  for (const [grp, grpItems] of Object.entries(groups)) {
    html += `<div class="opt-section"><div class="opt-section-title">${catIcon(grp)} ${esc(grp)} (${grpItems.length})</div><div class="opt-grid">`;
    grpItems.forEach(item => {
      const applied = isOptApplied(item.id);
      const selected = state.selectedOpt.has(item.id);
      html += `
        <div class="opt-card ${selected ? 'selected' : ''}" data-optid="${item.id}">
          <div class="opt-card-header">
            <span class="opt-card-icon">${catIcon(item.cat)}</span>
            <div class="opt-card-name">${esc(item.name)}</div>
          </div>
          <div class="opt-card-desc">${esc(item.summary || '')}</div>
          <div class="opt-card-tags">
            <span class="opt-card-status ${applied ? 'applied' : 'pending'}">${applied ? '✔ Aplicado' : 'Pendente'}</span>
            <span class="badge-sm">${esc(item.risk || 'MÉDIO')} risco</span>
            ${item.admin ? '<span class="badge-sm">admin</span>' : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" data-apply="${item.id}" ${applied ? 'disabled' : ''}>Aplicar</button>
            <button class="btn btn-ghost btn-sm" data-remove="${item.id}" ${!applied ? 'disabled' : ''}>Remover</button>
          </div>
        </div>
      `;
    });
    html += '</div></div>';
  }
  content.innerHTML = html;

  content.querySelectorAll('[data-apply]').forEach(btn => btn.addEventListener('click', async () => { await doApply(btn.dataset.apply); }));
  content.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', async () => { await doRemove(btn.dataset.remove); }));

  if (applyBtn) applyBtn.disabled = state.selectedOpt.size === 0;
}

function isOptApplied(id) {
  const applied = state.catalog?.applied || [];
  return applied.includes(id);
}

async function doApply(id) {
  try {
    const res = await window.hbDesktop.applyOptimization(id);
    if (!res.ok) throw new Error(res.error || 'Falha');
    toast('✔ ' + (res.message || 'Aplicado'), 'success');
    addHistory('apply', id, 'success');
    await refreshCatalog();
  } catch (e) { toast('Erro: ' + e.message, 'error'); addHistory('apply', id, 'error'); }
}

async function doRemove(id) {
  try {
    const res = await window.hbDesktop.removeOptimization(id);
    if (!res.ok) throw new Error(res.error || 'Falha');
    toast('✔ ' + (res.message || 'Removido'), 'success');
    addHistory('remove', id, 'success');
    await refreshCatalog();
  } catch (e) { toast('Erro: ' + e.message, 'error'); addHistory('remove', id, 'error'); }
}

async function applyRecommended() {
  try {
    const res = await window.hbDesktop.applyRecommended();
    if (!res.ok) throw new Error(res.error || 'Falha');
    const n = res.result?.applied || 0;
    toast(`✔ ${n} otimizações recomendadas aplicadas`, 'success');
    addHistory('recommended', '', 'success');
    await refreshCatalog();
    renderOptimizations();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
}

const PRESET_NAMES = {
  'max-performance': 'Performance Máxima',
  'balanced': 'Equilibrado',
  'streaming': 'Streaming',
  'competitive': 'Jogos Competitivos',
  'laptop': 'Notebook',
  'custom': 'Personalizado',
};

async function applyPreset(presetId) {
  try {
    const res = await window.hbDesktop.applyPreset(presetId);
    if (!res.ok) throw new Error(res.error || 'Falha');
    toast(`✔ Preset "${PRESET_NAMES[presetId] || presetId}" aplicado`, 'success');
    addHistory('preset', presetId, 'success');
    await refreshCatalog();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
}

// ============================================================
// Limpeza
// ============================================================
const CLEAN_GROUPS = [
  {
    id: 'windows', label: 'Windows', icon: '🖥️',
    items: [
      { id: 'temp-files', title: 'Arquivos Temporários', desc: 'Pasta %TEMP% e C:\\Windows\\Temp', size: '1–5 GB' },
      { id: 'prefetch', title: 'Prefetch', desc: 'Arquivos de prefetch do Windows', size: '50–200 MB' },
      { id: 'wu-cache', title: 'Windows Update', desc: 'Cache de instaladores do WU', size: '1–10 GB' },
      { id: 'thumbnails', title: 'Miniaturas', desc: 'Cache de thumbnails do Explorador', size: '50–500 MB' },
      { id: 'error-logs', title: 'Logs de Erro', desc: 'Logs de aplicativos e sistema', size: '10–100 MB' },
      { id: 'dns-cache', title: 'Cache DNS', desc: 'Limpar cache de DNS do Windows', size: 'Pequeno' },
      { id: 'clipboard', title: 'Clipboard', desc: 'Histórico da área de transferência', size: 'Variável' },
      { id: 'recycle-bin', title: 'Lixeira ⚠️', desc: 'Esvaziar a lixeira do Windows (irreversível)', size: 'Variável', dangerous: true },
    ]
  },
  {
    id: 'browsers', label: 'Navegadores', icon: '🌐',
    items: [
      { id: 'chrome-cache', title: 'Chrome — Cache', desc: 'Cache de páginas e assets', size: 'Variável' },
      { id: 'chrome-cookies', title: 'Chrome — Cookies', desc: 'Cookies e dados de site', size: 'Variável' },
      { id: 'chrome-history', title: 'Chrome — Histórico', desc: 'Histórico de navegação', size: 'Variável' },
      { id: 'chrome-downloads', title: 'Chrome — Downloads', desc: 'Lista de downloads', size: 'Pequeno' },
      { id: 'edge-cache', title: 'Edge — Cache', desc: 'Cache do Microsoft Edge', size: 'Variável' },
      { id: 'edge-cookies', title: 'Edge — Cookies', desc: 'Cookies e dados de site', size: 'Variável' },
      { id: 'firefox-cache', title: 'Firefox — Cache', desc: 'Cache do Mozilla Firefox', size: 'Variável' },
      { id: 'firefox-cookies', title: 'Firefox — Cookies', desc: 'Cookies e dados de site', size: 'Variável' },
      { id: 'opera-cache', title: 'Opera — Cache', desc: 'Cache do Opera', size: 'Variável' },
      { id: 'brave-cache', title: 'Brave — Cache', desc: 'Cache do Brave Browser', size: 'Variável' },
    ]
  },
  {
    id: 'apps', label: 'Aplicativos', icon: '📦',
    items: [
      { id: 'discord-cache', title: 'Discord — Cache', desc: 'Mídia e assets em cache', size: '100 MB – 2 GB' },
      { id: 'steam-cache', title: 'Steam — Cache', desc: 'Shader cache e arquivos temp', size: '1–4 GB' },
      { id: 'epic-cache', title: 'Epic — Cache', desc: 'Arquivos temp do Epic Games', size: '500 MB – 1 GB' },
      { id: 'battlecache', title: 'Battle.net — Cache', desc: 'Cache do launcher Battle.net', size: '100–500 MB' },
      { id: 'adobe-cache', title: 'Adobe — Cache', desc: 'Cache do Creative Cloud', size: '500 MB – 2 GB' },
      { id: 'office-cache', title: 'Office — Cache', desc: 'Cache de auto.save e temp', size: '100–500 MB' },
    ]
  },
  {
    id: 'advanced', label: 'Avançado', icon: '⚙️',
    items: [
      { id: 'winsxs', title: 'WinSxS', desc: 'Component Store (pode economizar GBs)', size: '2–10 GB', admin: true },
      { id: 'component-store', title: 'Component Store', desc: 'Sistema de componentes do Windows', size: '1–5 GB', admin: true },
      { id: 'user-temp', title: 'Temp do Usuário', desc: 'Todas as pastas temp do usuário', size: 'Variável' },
      { id: 'system-temp', title: 'Temp do Sistema', desc: 'Temp do Windows e arquivos de programa', size: '1–5 GB', admin: true },
      { id: 'msi-cache', title: 'MSI Cache', desc: 'Arquivos de instalação MSI', size: '50–500 MB', admin: true },
      { id: 'delivery-opt', title: 'Delivery Optimization', desc: 'Cache de distribuição do WU', size: '100 MB – 2 GB', admin: true },
      { id: 'directx-shader', title: 'DirectX Shader Cache', desc: 'Shader cache do DirectX', size: '100 MB – 2 GB' },
      { id: 'nvidia-cache', title: 'NVIDIA Cache', desc: 'Cache e logs da Control Panel', size: '50–500 MB' },
      { id: 'amd-cache', title: 'AMD Cache', desc: 'Cache de drivers AMD', size: '50–300 MB' },
    ]
  },
];

const CLEAN_SIZE_MAP = {
  'temp-files': 5e9, 'prefetch': 1e8, 'wu-cache': 5e9, 'thumbnails': 3e8,
  'error-logs': 5e7, 'dns-cache': 1e6, 'clipboard': 1e7, 'recycle-bin': 1e9,
  'chrome-cache': 5e8, 'chrome-cookies': 1e8, 'chrome-history': 1e8, 'chrome-downloads': 1e7,
  'edge-cache': 5e8, 'edge-cookies': 1e8,
  'firefox-cache': 5e8, 'firefox-cookies': 1e8,
  'opera-cache': 5e8, 'brave-cache': 5e8,
  'discord-cache': 1e9, 'steam-cache': 3e9, 'epic-cache': 8e8, 'battlecache': 3e8,
  'adobe-cache': 1e9, 'office-cache': 3e8,
  'winsxs': 5e9, 'component-store': 3e9, 'user-temp': 2e9, 'system-temp': 3e9,
  'msi-cache': 2e8, 'delivery-opt': 1e8, 'directx-shader': 1e8, 'nvidia-cache': 2e8, 'amd-cache': 1e8,
};

function renderCleaning() {
  const tabsBar = $('clean-tabs-bar');
  const content = $('clean-content');
  const spaceEl = $('space-recovered');
  const spaceVal = $('space-value');
  const cleanBtn = $('btn-clean-selected');
  if (!tabsBar || !content) return;

  tabsBar.innerHTML = CLEAN_GROUPS.map(g => `
    <button class="tab-btn active" data-cleantab="${g.id}">${g.icon} ${g.label}</button>
  `).join('');

  tabsBar.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tabsBar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCleanCategory(btn.dataset.cleantab);
    });
  });

  const totalBytes = estimateTotalSpace();
  if (spaceEl && spaceVal) {
    if (totalBytes > 0) { spaceEl.style.display = 'flex'; spaceVal.textContent = formatBytes(totalBytes); }
    else { spaceEl.style.display = 'none'; }
  }
  if (cleanBtn) cleanBtn.disabled = state.selectedClean.size === 0;

  renderCleanCategory('windows');
}

function estimateTotalSpace() {
  let total = 0;
  CLEAN_GROUPS.forEach(g => g.items.forEach(item => {
    if (state.selectedClean.has(item.id)) total += CLEAN_SIZE_MAP[item.id] || 0;
  }));
  return total;
}

function renderCleanCategory(tabId) {
  const content = $('clean-content');
  if (!content) return;

  const group = CLEAN_GROUPS.find(g => g.id === tabId);
  if (!group) return;

  let html = `
    <div class="cleaning-group">
      <div class="cleaning-group-header">
        <div>
          <div class="cleaning-group-title">${group.icon} ${group.label}</div>
          <div class="cleaning-group-count">${group.items.length} itens</div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);">${state.selectedClean.size > 0 ? `${state.selectedClean.size} selecionados` : 'Nenhum selecionado'}</div>
      </div>
      <div class="cleaning-group-sub">Selecione os itens abaixo para limpar. Itens com ⚠️ são irreversíveis.</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
  `;

  group.items.forEach(item => {
    const selected = state.selectedClean.has(item.id);
    const status = getCleanStatus(item.id);
    const dangerTag = item.danger ? ' ⚠️' : '';
    const adminTag = item.admin ? ' <span class="badge-sm" style="background:var(--amber-bg);color:var(--amber);">admin</span>' : '';
    html += `
      <div class="cleaning-item ${selected ? 'selected' : ''}" data-cleanid="${item.id}">
        <div class="cleaning-check" data-check="${item.id}"></div>
        <div class="cleaning-item-info">
          <div class="cleaning-item-title">${esc(item.title)}${dangerTag}</div>
          <div class="cleaning-item-desc">${esc(item.desc)}</div>
        </div>
        ${adminTag}
        <div class="cleaning-item-size">${esc(item.size)}</div>
        <div class="cleaning-item-status ${status === 'done' ? 'done' : ''}">${status || '—'}</div>
      </div>
    `;
  });

  html += '</div></div>';

  // Painel de resumo para grupo avançado
  if (tabId === 'advanced') {
    const totalBytes = estimateTotalSpace();
    html += `
      <div class="cleaning-group" style="margin-top:12px;">
        <div class="cleaning-group-header"><div class="cleaning-group-title">📊 Resumo da Limpeza</div></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
          <div style="background:var(--bg-primary);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:12px;">
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Espaço Recuperável</div>
            <div style="font-size:18px;font-weight:700;font-family:var(--font-mono);color:var(--green);margin-top:4px;">${formatBytes(totalBytes)}</div>
          </div>
          <div style="background:var(--bg-primary);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:12px;">
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Tempo Estimado</div>
            <div style="font-size:18px;font-weight:700;font-family:var(--font-mono);margin-top:4px;">${estimateTime(totalBytes)}</div>
          </div>
          <div style="background:var(--bg-primary);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:12px;">
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Itens Selecionados</div>
            <div style="font-size:18px;font-weight:700;font-family:var(--font-mono);margin-top:4px;">${state.selectedClean.size} de ${group.items.length}</div>
          </div>
        </div>
      </div>
    `;
  }

  content.innerHTML = html;

  content.querySelectorAll('.cleaning-check').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.check;
      if (state.selectedClean.has(id)) state.selectedClean.delete(id);
      else state.selectedClean.add(id);
      el.closest('.cleaning-item').classList.toggle('selected', state.selectedClean.has(id));
      const cleanBtn = $('btn-clean-selected');
      if (cleanBtn) cleanBtn.disabled = state.selectedClean.size === 0;
      const spaceVal = $('space-value');
      const spaceEl = $('space-recovered');
      if (spaceVal && spaceEl) {
        const total = estimateTotalSpace();
        if (total > 0) { spaceEl.style.display = 'flex'; spaceVal.textContent = formatBytes(total); }
        else { spaceEl.style.display = 'none'; }
      }
    });
  });

  // Botão limpar individual em cada item
  content.querySelectorAll('.cleaning-item').forEach(el => {
    const id = el.dataset.cleanid;
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-sm';
    btn.style.marginLeft = 'auto';
    btn.textContent = 'Limpar';
    btn.addEventListener('click', async () => await doCleanItem(id));
    el.appendChild(btn);
  });

  if (cleanBtn) cleanBtn.disabled = state.selectedClean.size === 0;
}

function getCleanStatus(id) {
  const entry = (state.history || []).find(h => h.type === 'clean' && h.id === id);
  if (!entry) return '';
  return entry.status === 'success' ? '✔ Limpo' : '✖ Falha';
}

function formatBytes(bytes) {
  if (bytes < 1e6) return (bytes / 1e3).toFixed(0) + ' KB';
  if (bytes < 1e9) return (bytes / 1e6).toFixed(1) + ' MB';
  return (bytes / 1e9).toFixed(1) + ' GB';
}

function estimateTime(bytes) {
  const secs = bytes / (50e6);
  if (secs < 1) return '< 1 min';
  if (secs < 60) return Math.round(secs) + ' s';
  if (secs < 3600) return Math.round(secs / 60) + ' min';
  return Math.round(secs / 3600) + ' h';
}

function estimateGroupSpace(groupId) {
  const sizeMap = {
    'winsxs': 5e9, 'component-store': 3e9, 'user-temp': 2e9, 'system-temp': 3e9,
    'msi-cache': 2e8, 'delivery-opt': 1e8, 'directx-shader': 1e8, 'nvidia-cache': 2e8, 'amd-cache': 1e8,
  };
  let total = 0;
  CLEAN_GROUPS.find(g => g.id === groupId)?.items.forEach(item => {
    if (state.selectedClean.has(item.id)) total += sizeMap[item.id] || 0;
  });
  return total;
}

async function doCleanItem(id) {
  try {
    const res = await window.hbDesktop.cleanItem(id);
    if (!res.ok) throw new Error(res.error || 'Falha');
    toast('✔ ' + (res.message || 'Limpado'), 'success');
    addHistory('clean', id, 'success');
    renderCleaning();
  } catch (e) { toast('Erro: ' + e.message, 'error'); addHistory('clean', id, 'error'); }
}

async function doCleanSelected() {
  if (state.selectedClean.size === 0) { toast('Nenhum item selecionado', 'warning'); return; }
  const ids = Array.from(state.selectedClean);
  const totalBytes = estimateTotalSpace();

  const overlay = $('progress-overlay');
  const bar = $('progress-bar');
  const text = $('progress-text');
  const detail = $('progress-detail');
  const progressTitle = $('progress-title');
  if (overlay && bar && text && detail && progressTitle) {
    overlay.classList.remove('hidden');
    progressTitle.textContent = 'Limpeza em andamento';
    text.textContent = 'Iniciando...';
    detail.textContent = '';
  }

  let completed = 0;
  for (const id of ids) {
    text.textContent = `Limpeza ${completed + 1}/${ids.length}: ${id}`;
    detail.textContent = formatBytes(totalBytes * ((completed + 1) / ids.length)) + ' recuperados estimados';
    if (bar) bar.style.width = ((completed / ids.length) * 100) + '%';
    try {
      const res = await window.hbDesktop.cleanItem(id);
      if (res.ok) addHistory('clean', id, 'success');
      else { addHistory('clean', id, 'error'); toast('Erro em: ' + id, 'error'); }
    } catch (e) { addHistory('clean', id, 'error'); }
    completed++;
  }

  if (bar) bar.style.width = '100%';
  text.textContent = 'Concluído!';
  detail.textContent = `${ids.length} itens processados` + (totalBytes > 0 ? ` — ${formatBytes(totalBytes)} recuperados` : '');

  setTimeout(() => {
    if (overlay) overlay.classList.add('hidden');
    state.selectedClean = new Set();
    renderCleaning();
    toast(`✔ Limpeza concluída${totalBytes > 0 ? ` — ${formatBytes(totalBytes)} recuperados` : ''}`, 'success');
  }, 1500);
}

// ============================================================
// Restauração
// ============================================================
function renderRestoration() {
  const tabsBar = $('restore-tabs-bar');
  const content = $('restore-content');
  if (!tabsBar || !content) return;

  tabsBar.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tabsBar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      const target = $(`tab-${btn.dataset.tab}`);
      if (target) target.classList.add('active');
      if (btn.dataset.tab === 'sys-restore') renderSystemRestore();
      if (btn.dataset.tab === 'togs-backup') renderTogsBackup();
    });
  });

  renderSystemRestore();
  renderTogsBackup();
}

function renderSystemRestore() {
  const list = $('restore-list');
  const createBtn = $('btn-create-restore');
  if (!list) return;

  list.innerHTML = `
    <div class="restore-point">
      <div class="restore-point-icon">📅</div>
      <div class="restore-point-info">
        <div class="restore-point-name">Ponto automático — ${new Date().toLocaleDateString('pt-BR')}</div>
        <div class="restore-point-date">${new Date().toLocaleString('pt-BR')} • Criado por Honest Boost</div>
      </div>
      <div class="restore-point-actions">
        <button class="btn btn-secondary btn-sm" id="btn-restore-selected">Restaurar</button>
        <button class="btn btn-ghost btn-sm">Excluir</button>
      </div>
    </div>
    <div class="restore-point" style="opacity:0.6;">
      <div class="restore-point-icon">📅</div>
      <div class="restore-point-info">
        <div class="restore-point-name">Ponto anterior — ${new Date(Date.now() - 86400000).toLocaleDateString('pt-BR')}</div>
        <div class="restore-point-date">${new Date(Date.now() - 86400000).toLocaleString('pt-BR')}</div>
      </div>
      <div class="restore-point-actions">
        <button class="btn btn-secondary btn-sm">Restaurar</button>
        <button class="btn btn-ghost btn-sm">Excluir</button>
      </div>
    </div>
  `;

  list.querySelector('#btn-restore-selected')?.addEventListener('click', async () => {
    toast('Restaurando ponto de restauração...', 'info');
    try {
      const res = await window.hbDesktop.restoreRegistry();
      if (res.ok) toast('✔ Sistema restaurado com sucesso', 'success');
      else toast('Erro: ' + res.error, 'error');
    } catch (e) { toast('Erro: ' + e.message, 'error'); }
  });

  if (createBtn) createBtn.addEventListener('click', async () => {
    createBtn.disabled = true;
    createBtn.innerHTML = '<span class="spinner"></span> Criando...';
    try {
      const res = await window.hbDesktop.createRestorePoint('Honest Boost - ' + new Date().toLocaleDateString('pt-BR'));
      if (res.ok) toast('✔ Ponto de restauração criado', 'success');
      else toast('Erro: ' + res.error, 'error');
    } catch (e) { toast('Erro: ' + e.message, 'error'); }
    finally { if (createBtn) { createBtn.disabled = false; createBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg> Criar Ponto de Restauração'; } }
  });
}

function renderTogsBackup() {
  const list = $('togs-backup-list');
  const backupBtn = $('btn-backup-togs');
  const restoreBtn = $('btn-restore-togs');
  if (!list) return;

  list.innerHTML = `
    <div class="backup-item">
      <span style="font-size:20px;">📦</span>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);">Backup Automático</div>
        <div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);">${new Date().toLocaleString('pt-BR')}</div>
      </div>
      <span class="badge-sm" style="background:var(--green-bg);color:var(--green);">Ativo</span>
      <button class="btn btn-secondary btn-sm">Restaurar</button>
    </div>
  `;

  if (backupBtn) backupBtn.addEventListener('click', async () => {
    backupBtn.disabled = true;
    backupBtn.innerHTML = '<span class="spinner"></span> Criando Backup...';
    try {
      await window.hbDesktop.backupSettings();
      toast('✔ Backup das configurações criado', 'success');
      renderTogsBackup();
    } catch (e) { toast('Erro: ' + e.message, 'error'); }
    finally { if (backupBtn) { backupBtn.disabled = false; backupBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Criar Backup'; } }
  });

  if (restoreBtn) restoreBtn.addEventListener('click', async () => {
    restoreBtn.disabled = true;
    restoreBtn.innerHTML = '<span class="spinner"></span> Restaurando...';
    try {
      const res = await window.hbDesktop.restoreBackup();
      if (res.ok) { toast('✔ Backup restaurado com sucesso', 'success'); renderTogsBackup(); }
      else toast('Erro: ' + res.error, 'error');
    } catch (e) { toast('Erro: ' + e.message, 'error'); }
    finally { if (restoreBtn) { restoreBtn.disabled = false; restoreBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle><polyline points="23 4 23 10 17 10"></polyline></svg> Restaurar Backup'; } }
  });
}

// ============================================================
// Apps Store
// ============================================================
const APPS_CATALOG = [
  { category: 'Navegadores', icon: '🌐', items: [
    { id: 'chrome', name: 'Google Chrome', desc: 'Navegador mais usado do mundo', icon: '🌐', size: '110 MB', install: () => toast('Chrome — instalação simulada', 'info') },
    { id: 'firefox', name: 'Mozilla Firefox', desc: 'Navegador open-source da Mozilla', icon: '🦊', size: '90 MB', install: () => toast('Firefox — instalação simulada', 'info') },
    { id: 'edge', name: 'Microsoft Edge', desc: 'Navegador baseado em Chromium', icon: '🌐', size: '120 MB', install: () => toast('Edge — instalação simulada', 'info') },
    { id: 'opera', name: 'Opera Browser', desc: 'Navegador com VPN integrada', icon: '🔴', size: '85 MB', install: () => toast('Opera — instalação simulada', 'info') },
    { id: 'brave', name: 'Brave Browser', desc: 'Navegador focado em privacidade', icon: '🦁', size: '80 MB', install: () => toast('Brave — instalação simulada', 'info') },
  ]},
  { category: 'Jogos', icon: '🎮', items: [
    { id: 'steam', name: 'Steam', desc: 'Plataforma de jogos mais popular', icon: '🎮', size: '30 MB', install: () => toast('Steam — instalação simulada', 'info') },
    { id: 'epic', name: 'Epic Games Launcher', desc: 'Jogos gratuitos semanais', icon: '🏰', size: '50 MB', install: () => toast('Epic — instalação simulada', 'info') },
    { id: 'battle', name: 'Battle.net', desc: 'Launcher da Blizzard Entertainment', icon: '⚔️', size: '25 MB', install: () => toast('Battle.net — instalação simulada', 'info') },
    { id: 'discord', name: 'Discord', desc: 'Comunicação para gamers', icon: '🎤', size: '70 MB', install: () => toast('Discord — instalação simulada', 'info') },
    { id: 'obs', name: 'OBS Studio', desc: 'Gravação e streaming de jogos', icon: '📹', size: '100 MB', install: () => toast('OBS — instalação simulada', 'info') },
  ]},
  { category: 'Utilitários', icon: '🧰', items: [
    { id: '7zip', name: '7-Zip', desc: 'Compactador open-source', icon: '📦', size: '2 MB', install: () => toast('7-Zip — instalação simulada', 'info') },
    { id: 'everything', name: 'Everything', desc: 'Busca de arquivos instantânea', icon: '🔍', size: '2 MB', install: () => toast('Everything — instalação simulada', 'info') },
    { id: 'rufus', name: 'Rufus', desc: 'Criação de pen drives bootáveis', icon: '💾', size: '2 MB', install: () => toast('Rufus — instalação simulada', 'info') },
    { id: 'notion', name: 'Notion', desc: 'Workspace todo-em-um', icon: '📝', size: '120 MB', install: () => toast('Notion — instalação simulada', 'info') },
    { id: 'obsidian', name: 'Obsidian', desc: 'Editor de notas com links', icon: '📓', size: '50 MB', install: () => toast('Obsidian — instalação simulada', 'info') },
  ]},
  { category: 'Drivers', icon: '🔧', items: [
    { id: 'nvidia', name: 'NVIDIA GeForce Driver', desc: 'Drivers oficiais NVIDIA', icon: 'NVIDIA', size: '300 MB', install: () => toast('NVIDIA Driver — instalação simulada', 'info') },
    { id: 'amd', name: 'AMD Adrenalin Driver', desc: 'Drivers oficiais da AMD', icon: 'AMD', size: '250 MB', install: () => toast('AMD Driver — instalação simulada', 'info') },
    { id: 'intel', name: 'Intel Driver & Support', desc: 'Drivers e atualizações Intel', icon: 'Intel', size: '100 MB', install: () => toast('Intel Driver — instalação simulada', 'info') },
  ]},
  { category: 'Runtime', icon: '⚙️', items: [
    { id: 'vcredist', name: 'Visual C++ Redistributable', desc: 'Runtime para muitos apps', icon: 'MS', size: '20 MB', install: () => toast('VC++ Redist — instalação simulada', 'info') },
    { id: 'directx', name: 'DirectX End-User', desc: 'Runtime DirectX para jogos', icon: 'DX', size: '15 MB', install: () => toast('DirectX — instalação simulada', 'info') },
    { id: 'dotnet', name: '.NET Desktop Runtime', desc: 'Runtime .NET para apps Windows', icon: '.NET', size: '60 MB', install: () => toast('.NET Runtime — instalação simulada', 'info') },
    { id: 'java', name: 'Java Runtime (JRE)', desc: 'Ambiente Java para apps e jogos', icon: 'Java', size: '30 MB', install: () => toast('Java — instalação simulada', 'info') },
    { id: 'python', name: 'Python 3.x', desc: 'Linguagem de programação versátil', icon: 'Py', size: '30 MB', install: () => toast('Python — instalação simulada', 'info') },
  ]},
  { category: 'Ferramentas', icon: '🛠️', items: [
    { id: 'afterburner', name: 'MSI Afterburner', desc: 'Overclock e monitoramento GPU', icon: '🔧', size: '30 MB', install: () => toast('Afterburner — instalação simulada', 'info') },
    { id: 'hwinfo', name: 'HWiNFO', desc: 'Monitoramento detalhado de hardware', icon: '📊', size: '20 MB', install: () => toast('HWiNFO — instalação simulada', 'info') },
    { id: 'cpu-z', name: 'CPU-Z', desc: 'Informações detalhadas da CPU', icon: '🧠', size: '5 MB', install: () => toast('CPU-Z — instalação simulada', 'info') },
    { id: 'gpu-z', name: 'GPU-Z', desc: 'Informações detalhadas da GPU', icon: '🎮', size: '5 MB', install: () => toast('GPU-Z — instalação simulada', 'info') },
  ]},
];

function renderApps() {
  const tabsBar = $('apps-tabs-bar');
  const grid = $('apps-grid');
  const search = $('app-search');
  if (!tabsBar || !grid) return;

  tabsBar.innerHTML = APPS_CATALOG.map(c => `
    <button class="tab-btn active" data-apptab="${c.category}">${c.icon} ${c.category}</button>
  `).join('');

  tabsBar.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tabsBar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderAppGrid(btn.dataset.apptab, search ? search.value : '');
    });
  });

  if (search) {
    let timer = null;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const activeTab = tabsBar.querySelector('.tab-btn.active');
        if (activeTab) renderAppGrid(activeTab.dataset.apptab, search.value);
      }, 200);
    });
  }

  renderAppGrid('Navegadores', '');
}

function renderAppGrid(category, query) {
  const grid = $('apps-grid');
  if (!grid) return;

  const group = APPS_CATALOG.find(c => c.category === category);
  if (!group) return;

  const items = query
    ? group.items.filter(app => app.name.toLowerCase().includes(query.toLowerCase()) || app.desc.toLowerCase().includes(query.toLowerCase()))
    : group.items;

  if (items.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">Nenhum app encontrado</div></div>';
    return;
  }

  grid.innerHTML = items.map(app => `
    <div class="app-card">
      <div class="app-card-header"><div class="app-card-icon">${app.icon}</div></div>
      <div class="app-card-name">${esc(app.name)}</div>
      <div class="app-card-desc">${esc(app.desc)}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-bottom:10px;font-family:var(--font-mono);">${esc(app.size)}</div>
      <div class="app-card-footer">
        <button class="btn btn-primary btn-sm" data-install="${app.id}">Instalar</button>
        <button class="btn btn-ghost btn-sm" data-update="${app.id}">Atualizar</button>
        <button class="btn btn-ghost btn-sm" data-uninstall="${app.id}">Desinstalar</button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('[data-install]').forEach(btn => btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Instalando...';
    const app = items.find(a => a.id === btn.dataset.install);
    try { await app?.install?.(); toast(`✔ ${app?.name} instalado`, 'success'); addHistory('install', app?.id || '', 'success'); }
    catch { toast('Erro na instalação', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Instalar'; }
  }));
  grid.querySelectorAll('[data-update]').forEach(btn => btn.addEventListener('click', () => {
    const app = items.find(a => a.id === btn.dataset.update);
    toast(`✔ ${app?.name} — está atualizado`, 'info');
  }));
  grid.querySelectorAll('[data-uninstall]').forEach(btn => btn.addEventListener('click', () => {
    const app = items.find(a => a.id === btn.dataset.uninstall);
    toast(`⚠️ Desinstalação de ${app?.name} — execute manualmente no Windows`, 'warning');
  }));
}

// ============================================================
// Configurações
// ============================================================
function renderSettings() {
  const tabsBar = $('settings-tabs-bar');
  const content = $('settings-content');
  if (!tabsBar || !content) return;

  tabsBar.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tabsBar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      content.querySelectorAll('.settings-tab').forEach(p => p.classList.remove('active'));
      const target = $(`tab-${btn.dataset.tab}`);
      if (target) target.classList.add('active');
    });
  });

  // Tema
  const themeOptions = $('theme-options');
  if (themeOptions) {
    const saved = localStorage.getItem('hb.theme') || 'dark';
    themeOptions.querySelectorAll('.theme-option').forEach(el => {
      const isSelected = el.dataset.theme === saved;
      if (isSelected) el.classList.add('selected');
      el.querySelector('input').checked = isSelected;
      el.addEventListener('click', () => {
        themeOptions.querySelectorAll('.theme-option').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        el.querySelector('input').checked = true;
        localStorage.setItem('hb.theme', el.dataset.theme);
        applyTheme(el.dataset.theme);
      });
    });
    applyTheme(saved);
  }

  // Geral
  ['autostart', 'minimize-tray', 'auto-update', 'check-version', 'auto-backup', 'backup-restore'].forEach(id => {
    const el = $(`setting-${id}`);
    if (!el) return;
    const key = `hb.${id === 'minimize-tray' ? 'tray' : id.replace('setting-','')}`;
    const defaultVal = id === 'auto-update' || id === 'check-version' || id === 'auto-backup' ? true : false;
    el.checked = localStorage.getItem(key) !== null ? localStorage.getItem(key) === 'true' : defaultVal;
    el.addEventListener('change', () => localStorage.setItem(key, el.checked));
  });

  // Performance
  ['animations', 'gpu-accel', 'logs'].forEach(id => {
    const el = $(`setting-${id}`);
    if (!el) return;
    const key = `hb.${id}`;
    const defaultVal = id === 'logs' ? false : true;
    el.checked = localStorage.getItem(key) !== null ? localStorage.getItem(key) === 'true' : defaultVal;
    el.addEventListener('change', () => localStorage.setItem(key, el.checked));
  });

  const viewLogsBtn = $('btn-view-logs');
  const clearLogsBtn = $('btn-clear-logs');
  if (viewLogsBtn) viewLogsBtn.addEventListener('click', () => toast(`Logs: ${state.history?.length || 0} entradas`, 'info'));
  if (clearLogsBtn) clearLogsBtn.addEventListener('click', () => { state.history = []; localStorage.removeItem('hb.history'); toast('✔ Logs limpos', 'success'); });

  // Avançado
  ['safe-mode', 'dev-mode'].forEach(id => {
    const el = $(`setting-${id}`);
    if (!el) return;
    const key = `hb.${id}`;
    el.checked = localStorage.getItem(key) === 'true';
    el.addEventListener('change', () => localStorage.setItem(key, el.checked));
  });

  const resetBtn = $('btn-reset-settings');
  const clearBtn = $('btn-clear-all-data');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (confirm('Resetar todas as configurações para o padrão?')) {
      localStorage.clear();
      toast('✔ Configurações resetadas', 'success');
      renderSettings();
    }
  });
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (confirm('Limpar todos os dados locais? Esta ação não pode ser desfeita.')) {
      localStorage.clear();
      state.history = [];
      toast('✔ Dados locais removidos', 'success');
    }
  });

  // Sobre
  const aboutTab = $('tab-about');
  if (aboutTab) {
    const versionEl = aboutTab.querySelector('.about-version');
    if (versionEl) versionEl.textContent = 'Versão 2.0.0 — Honest Boost';
    const logoText = aboutTab.querySelector('.about-logo .logo-text');
    if (logoText) logoText.textContent = 'Honest Boost';
    const copyright = aboutTab.querySelector('.about-copyright');
    if (copyright) copyright.textContent = '© 2025 Honest Boost. Todos os direitos reservados.';
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light') {
    root.style.setProperty('--bg-primary', '#F8FAFC');
    root.style.setProperty('--bg-secondary', '#F1F5F9');
    root.style.setProperty('--bg-sidebar', '#E2E8F0');
    root.style.setProperty('--bg-card', '#FFFFFF');
    root.style.setProperty('--text-primary', '#1E293B');
    root.style.setProperty('--text-secondary', '#475569');
    root.style.setProperty('--text-muted', '#94A3B8');
    root.style.setProperty('--border-subtle', '#E2E8F0');
    root.style.setProperty('--border-strong', '#CBD5E1');
  } else if (theme === 'dark') {
    root.style.setProperty('--bg-primary', '#070B15');
    root.style.setProperty('--bg-secondary', '#0D1222');
    root.style.setProperty('--bg-sidebar', '#09101D');
    root.style.setProperty('--bg-card', '#161D2E');
    root.style.setProperty('--text-primary', '#F0F3F8');
    root.style.setProperty('--text-secondary', '#9AA8C4');
    root.style.setProperty('--text-muted', '#637087');
    root.style.setProperty('--border-subtle', '#232E47');
    root.style.setProperty('--border-strong', '#2F3D5E');
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }
}

// ============================================================
// Autenticação
// ============================================================
function renderAuth() {
  const content = $('auth-content');
  if (!content) return;

  const loggedIn = $('auth-logged-in');
  const loggedOut = $('auth-logged-out');
  if (!loggedIn || !loggedOut) return;

  if (state.info) {
    loggedIn.classList.remove('hidden');
    loggedOut.classList.add('hidden');
    $('profile-name').textContent = state.info.name || 'Usuário';
    $('profile-plan').textContent = `Plano: ${state.info.plan || 'Pro'}`;
    const initial = (state.info.name || 'U')[0].toUpperCase();
    $('profile-avatar').textContent = initial;
    $('license-id').textContent = state.info.licenseId || '—';
    $('license-plan').textContent = state.info.plan || 'Pro';
    $('license-days').textContent = state.info.daysRemaining ?? daysRemaining(state.info.expiryDate);
    $('license-expiry').textContent = state.info.expiryDate ? new Date(state.info.expiryDate).toLocaleDateString('pt-BR') : '—';
    $('license-machines').textContent = `${state.info.machinesUsed || 1}/${state.info.machineLimit || 3}`;
    $('user-name').textContent = state.info.name || 'Usuário';
    $('user-name-large').textContent = state.info.name || 'Usuário';
    $('user-plan').textContent = `Plano: ${state.info.plan || 'Pro'}`;
    $('user-avatar').textContent = initial;
    $('user-avatar-large').textContent = initial;

    $('btn-change-license')?.addEventListener('click', () => {
      loggedIn.classList.add('hidden');
      loggedOut.classList.remove('hidden');
      state.info = null;
      localStorage.removeItem('hb.key');
    });
    $('btn-renew-license')?.addEventListener('click', () => toast('✔ Renovação iniciada — entre em contato para concluir', 'success'));
    $('btn-disconnect')?.addEventListener('click', doLogout);
    $('btn-copy-license')?.addEventListener('click', () => {
      const id = $('license-id').textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(id);
      toast('✔ ID da licença copiado', 'success');
    });
  } else {
    loggedIn.classList.add('hidden');
    loggedOut.classList.remove('hidden');

    const form = $('auth-form');
    const errorEl = $('auth-error');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const key = $('auth-key').value.trim();
        if (!key) return;
        const trialBtn = $('btn-trial');
        if (trialBtn) trialBtn.disabled = true;
        try {
          const res = await window.hbDesktop.authenticateWithKey(key);
          if (res.ok) {
            state.info = res.info || { name: 'Usuário', plan: res.tier || 'Pro', licenseId: key, daysRemaining: 365 };
            localStorage.setItem('hb.key', key);
            toast('✔ Licença ativada com sucesso', 'success');
            renderAuth();
            navigate('dashboard');
          } else {
            if (errorEl) { errorEl.textContent = res.error || 'Falha na autenticação'; errorEl.classList.remove('hidden'); }
          }
        } catch (e) {
          if (errorEl) { errorEl.textContent = e.message; errorEl.classList.remove('hidden'); }
        } finally {
          if (trialBtn) trialBtn.disabled = false;
        }
      };
    }
    $('btn-trial')?.addEventListener('click', async () => {
      const trialBtn = $('btn-trial');
      if (trialBtn) trialBtn.disabled = true;
      try {
        const res = await window.hbDesktop.authenticateWithKey('TRIAL-' + Date.now());
        if (res.ok) {
          state.info = res.info || { name: 'Usuário Trial', plan: 'Trial', licenseId: 'TRIAL-' + Date.now(), daysRemaining: 7, expiryDate: new Date(Date.now() + 7*86400000).toISOString() };
          toast('✔ Trial ativado por 7 dias', 'success');
          renderAuth();
          navigate('dashboard');
        }
      } catch (e) { toast('Erro: ' + e.message, 'error'); }
      finally { if (trialBtn) trialBtn.disabled = false; }
    });
  }
}

async function doLogout() {
  try {
    await window.hbDesktop.logout();
    state.info = null;
    localStorage.removeItem('hb.key');
    toast('✔ Desconectado', 'info');
    renderAuth();
    navigate('auth');
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
}

// ============================================================
// Histórico
// ============================================================
function addHistory(type, id, status, detail) {
  const entry = {
    type, id, status,
    date: new Date().toLocaleDateString('pt-BR'),
    time: new Date().toLocaleTimeString('pt-BR'),
    label: historyLabel(type, id),
    detail: detail || '',
  };
  state.history.unshift(entry);
  if (state.history.length > 200) state.history = state.history.slice(0, 200);
  try { localStorage.setItem('hb.history', JSON.stringify(state.history)); } catch (e) { /* silent */ }
  renderHistory();
}

const HISTORY_LABELS = {
  'apply': 'Aplicar otimização',
  'remove': 'Remover otimização',
  'clean': 'Limpeza',
  'preset': 'Aplicar preset',
  'recommended': 'Aplicar recomendadas',
  'install': 'Instalar app',
  'scan': 'Varredura de saúde',
  'backup': 'Criar backup',
  'restore': 'Restaurar',
};

function historyLabel(type, id) {
  if (id) {
    const allOpts = [
      ...((OPT_CATALOG.SYSTEM || []).map(o => ({ id: o.id, name: o.name }))),
      ...((OPT_CATALOG.GAMES || []).map(o => ({ id: o.id, name: o.name }))),
      ...((OPT_CATALOG.NETWORK || []).map(o => ({ id: o.id, name: o.name }))),
      ...((OPT_CATALOG.STORAGE || []).map(o => ({ id: o.id, name: o.name }))),
      ...((OPT_CATALOG.INTERFACE || []).map(o => ({ id: o.id, name: o.name }))),
    ];
    const found = allOpts.find(o => o.id === id);
    if (found) return `${HISTORY_LABELS[type] || type}: ${found.name}`;
  }
  return HISTORY_LABELS[type] || type;
}

function renderHistory() {
  const list = $('history-list');
  if (!list) return;

  if (!state.history || state.history.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">Sem operações ainda</div><div class="empty-state-desc">Suas ações aparecerão aqui.</div></div>';
    return;
  }

  list.innerHTML = state.history.slice(0, 50).map(entry => `
    <div class="history-item">
      <div class="history-icon ${entry.status}">
        ${entry.status === 'success' ? '✔' : entry.status === 'error' ? '✖' : '⏳'}
      </div>
      <div class="history-info">
        <div class="history-op">${esc(entry.label)}</div>
        <div class="history-meta">${esc(entry.date)} ${esc(entry.time)}${entry.detail ? ' — ' + esc(entry.detail) : ''}</div>
      </div>
      <div class="history-status ${entry.status}">${entry.status === 'success' ? 'Sucesso' : entry.status === 'error' ? 'Falha' : 'Pendente'}</div>
    </div>
  `).join('');
}

// ============================================================
// Notificações
// ============================================================
function addNotification(title, desc, type = 'info') {
  state.notifications.unshift({ title, desc, type, time: new Date().toLocaleTimeString('pt-BR') });
  if (state.notifications.length > 30) state.notifications = state.notifications.slice(0, 30);
  renderNotifications();
  updateNotifyBadge();
}

function updateNotifyBadge() {
  const badge = $('notify-badge');
  if (!badge) return;
  const count = state.notifications.filter(n => n.type !== 'info').length;
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
}

function renderNotifications() {
  const panel = $('notifications-panel');
  if (!panel) return;

  panel.innerHTML = state.notifications.slice(0, 15).map(n => `
    <div class="notification-item">
      <div class="notification-icon ${n.type}">
        ${n.type === 'success' ? '✔' : n.type === 'warning' ? '⚠' : n.type === 'error' ? '✖' : 'ℹ'}
      </div>
      <div class="notification-body">
        <div class="notification-title">${esc(n.title)}</div>
        <div class="notification-desc">${esc(n.desc)}</div>
        <div class="notification-time">${esc(n.time)}</div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// Quick actions
// ============================================================
function initQuickActions() {
  const grid = $('quick-actions-grid');
  if (!grid) return;

  grid.querySelectorAll('.quick-action').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      $('quick-actions').classList.add('hidden');

      switch (action) {
        case 'quick-clean': {
          navigate('cleaning');
          ['temp-files', 'prefetch', 'wu-cache', 'thumbnails', 'dns-cache'].forEach(id => state.selectedClean.add(id));
          renderCleaning();
          toast('✔ Itens de limpeza rápida selecionados', 'success');
          break;
        }
        case 'quick-game-boost': {
          toast('🚀 Aplicando Boost para Jogos...', 'info');
          try {
            const res = await window.hbDesktop.applyPreset('competitive');
            toast(res.ok ? '✔ Boost aplicado' : 'Erro', res.ok ? 'success' : 'error');
          } catch (e) { toast('Erro: ' + e.message, 'error'); }
          break;
        }
        case 'quick-fix-windows': {
          toast('🔧 Executando correções do Windows...', 'info');
          try {
            await window.hbDesktop.applyBatch(['repair-windows-files', 'clear-logs', 'run-dism']);
            toast('✔ Correções concluídas', 'success');
          } catch (e) { toast('Erro: ' + e.message, 'error'); }
          break;
        }
        case 'quick-free-ram': {
          toast('🧠 Liberando RAM...', 'info');
          try {
            await window.hbDesktop.freeRam();
            toast('✔ RAM liberada', 'success');
          } catch (e) { toast('Erro: ' + e.message, 'error'); }
          break;
        }
        case 'quick-flush-dns': {
          toast('🌐 Flushing DNS...', 'info');
          try {
            await window.hbDesktop.applyOptimization('flush-dns');
            toast('✔ DNS flushed', 'success');
          } catch (e) { toast('Erro: ' + e.message, 'error'); }
          break;
        }
        case 'quick-restart-explorer': {
          toast('🖥️ Reiniciando Explorador...', 'info');
          try {
            await window.hbDesktop.restartExplorer();
            toast('✔ Explorer reiniciado', 'success');
          } catch (e) { toast('Erro: ' + e.message, 'error'); }
          break;
        }
      }
    });
  });
}

// ============================================================
// Global search
// ============================================================
function initGlobalSearch() {
  const input = $('global-search');
  const results = $('search-results');
  if (!input || !results) return;

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { results.classList.add('hidden'); return; }
      const matches = searchAll(q);
      if (matches.length === 0) { results.classList.add('hidden'); return; }
      results.innerHTML = matches.slice(0, 8).map(m => `
        <div class="search-result-item" data-nav="${m.nav}">
          <span class="search-result-icon">${m.icon}</span>
          <div>
            <div class="search-result-label">${esc(m.label)}</div>
            <div class="search-result-desc">${esc(m.desc)}</div>
          </div>
        </div>
      `).join('');
      results.classList.remove('hidden');
      results.querySelectorAll('.search-result-item').forEach(el => {
        el.addEventListener('click', () => {
          const navId = el.dataset.nav;
          if (navId) { input.value = ''; results.classList.add('hidden'); navigate(navId); }
        });
      });
    }, 150);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) results.classList.add('hidden');
  });
}

function searchAll(query) {
  const results = [];
  const panels = [
    { nav: 'dashboard', icon: '📊', label: 'Painel', desc: 'Visão geral do sistema em tempo real' },
    { nav: 'optimizations', icon: '⚡', label: 'Otimizações', desc: 'Aplique otimizações por categoria' },
    { nav: 'cleaning', icon: '🧹', label: 'Limpeza', desc: 'Remova arquivos desnecessários' },
    { nav: 'restoration', icon: '🛡', label: 'Restauração', desc: 'Gerencie backups e restauração' },
    { nav: 'apps', icon: '📦', label: 'Loja de Apps', desc: 'Instale e gerencie utilitários' },
    { nav: 'settings', icon: '⚙️', label: 'Configurações', desc: 'Personalize o Honest Boost' },
    { nav: 'auth', icon: '🔐', label: 'Autenticação', desc: 'Gerencie sua licença' },
  ];
  panels.forEach(p => {
    if (p.label.toLowerCase().includes(query) || p.desc.toLowerCase().includes(query)) results.push(p);
  });

  const catalog = OPT_CATALOG;
  const allOpts = [
    ...((catalog.SYSTEM || []).map(o => ({ nav: 'optimizations', icon: '🖥️', label: o.name, desc: 'Categoria: Sistema' }))),
    ...((catalog.GAMES || []).map(o => ({ nav: 'optimizations', icon: '🎮', label: o.name, desc: 'Categoria: Jogos' }))),
    ...((catalog.NETWORK || []).map(o => ({ nav: 'optimizations', icon: '🌐', label: o.name, desc: 'Categoria: Rede' }))),
    ...((catalog.STORAGE || []).map(o => ({ nav: 'optimizations', icon: '💾', label: o.name, desc: 'Categoria: SSD/HDD' }))),
    ...((catalog.INTERFACE || []).map(o => ({ nav: 'optimizations', icon: '🎨', label: o.name, desc: 'Categoria: Interface' }))),
  ];
  allOpts.forEach(o => {
    if (o.label.toLowerCase().includes(query) || o.desc.toLowerCase().includes(query)) results.push(o);
  });

  CLEAN_GROUPS.flatMap(g => g.items).forEach(item => {
    if (item.title.toLowerCase().includes(query) || item.desc.toLowerCase().includes(query)) {
      const grp = CLEAN_GROUPS.find(g => g.items.includes(item));
      results.push({ nav: 'cleaning', icon: '🧹', label: item.title, desc: 'Limpeza: ' + (grp?.label || '') });
    }
  });

  APPS_CATALOG.flatMap(c => c.items).forEach(app => {
    if (app.name.toLowerCase().includes(query) || app.desc.toLowerCase().includes(query)) {
      results.push({ nav: 'apps', icon: '📦', label: app.name, desc: app.desc });
    }
  });

  return results;
}

// ============================================================
// Refresh de catalog
// ============================================================
async function refreshCatalog() {
  try {
    const catalog = await window.hbDesktop.getCatalog();
    if (catalog && catalog.ok) state.catalog = catalog.catalog;
  } catch {}
  try {
    const health = await window.hbDesktop.getHealthAnalysis();
    if (health && health.ok) state.health = health.health;
  } catch {}
}

// ============================================================
// Init
// ============================================================
async function init() {
  buildSidebar();
  initSidebar();
  initQuickActions();
  initGlobalSearch();

  // Top bar: refresh
  const refreshBtn = $('btn-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', async () => {
    toast('🔄 Atualizando dados...', 'info');
    await refreshCatalog();
    try {
      const res = await window.hbDesktop.getSnapshot();
      if (res.ok) state.snapshot = res.snapshot;
    } catch (e) { /* silent */ }
    toast('✔ Dados atualizados', 'success');
    if (document.querySelector('.panel.active')?.id === 'panel-dashboard') renderDashboard();
  });

  // Notifications toggle
  const notifyBtn = $('btn-notifications');
  const notificationsPanel = $('notifications-panel');
  if (notifyBtn && notificationsPanel) {
    notifyBtn.addEventListener('click', () => {
      notificationsPanel.classList.toggle('hidden');
      renderNotifications();
    });
  }

  // User menu
  const userMenuBtn = $('btn-user-menu');
  const userDropdown = $('user-dropdown');
  if (userMenuBtn && userDropdown) {
    userMenuBtn.addEventListener('click', () => userDropdown.classList.toggle('hidden'));
    document.addEventListener('click', (e) => {
      if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
        userDropdown.classList.add('hidden');
      }
    });
    $('dd-profile')?.addEventListener('click', () => { userDropdown.classList.add('hidden'); navigate('auth'); });
    $('dd-settings')?.addEventListener('click', () => { userDropdown.classList.add('hidden'); navigate('settings'); });
    $('dd-logout')?.addEventListener('click', () => { userDropdown.classList.add('hidden'); doLogout(); });
  }

  // Otimizar Agora
  const optimizeBtn = $('btn-optimize-now');
  if (optimizeBtn) optimizeBtn.addEventListener('click', async () => {
    optimizeBtn.disabled = true;
    optimizeBtn.innerHTML = '<span class="spinner"></span> Otimizando...';
    try {
      const res = await window.hbDesktop.applyRecommended();
      if (res.ok) {
        toast(`✔ ${res.result?.applied || 0} otimizações aplicadas`, 'success');
        addHistory('recommended', '', 'success');
      } else toast('Erro: ' + res.error, 'error');
    } catch (e) { toast('Erro: ' + e.message, 'error'); }
    finally { if (optimizeBtn) { optimizeBtn.disabled = false; optimizeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg> Otimizar Agora'; } }
  });

  // Preset select
  const presetSelect = $('preset-select');
  if (presetSelect) {
    presetSelect.addEventListener('change', async () => {
      const val = presetSelect.value;
      if (val !== 'custom') {
        await applyPreset(val);
        presetSelect.value = 'custom';
      }
    });
  }

  // Health scan
  const healthScanBtn = $('btn-run-health-scan');
  if (healthScanBtn) healthScanBtn.addEventListener('click', runHealthScan);

  // Apply selected optimizations
  const applySelectedBtn = $('btn-apply-selected-opt');
  if (applySelectedBtn) applySelectedBtn.addEventListener('click', async () => {
    const ids = Array.from(state.selectedOpt);
    if (ids.length === 0) { toast('Nenhuma otimização selecionada', 'warning'); return; }
    applySelectedBtn.disabled = true;
    applySelectedBtn.innerHTML = '<span class="spinner"></span> Aplicando...';
    let okCount = 0;
    for (const id of ids) {
      try {
        const res = await window.hbDesktop.applyOptimization(id);
        if (res.ok) { okCount++; addHistory('apply', id, 'success'); }
        else addHistory('apply', id, 'error');
      } catch (e) { addHistory('apply', id, 'error'); }
    }
    toast(`✔ ${okCount}/${ids.length} otimizações aplicadas`, okCount > 0 ? 'success' : 'error');
    state.selectedOpt = new Set();
    await refreshCatalog();
    renderOptimizations();
    applySelectedBtn.disabled = false;
    applySelectedBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg> Aplicar Selecionadas';
  });

  // Clean selected
  const cleanSelectedBtn = $('btn-clean-selected');
  if (cleanSelectedBtn) cleanSelectedBtn.addEventListener('click', doCleanSelected);

  // Clear history
  $('btn-clear-history')?.addEventListener('click', () => {
    if (confirm('Limpar todo o histórico de operações?')) {
      state.history = [];
      localStorage.removeItem('hb.history');
      renderHistory();
      toast('✔ Histórico limpo', 'success');
    }
  });

  // Progress close
  const progressClose = $('progress-close');
  const progressOverlay = $('progress-overlay');
  if (progressClose && progressOverlay) {
    progressClose.addEventListener('click', () => progressOverlay.classList.add('hidden'));
  }

  // App search
  const appSearch = $('app-search');
  if (appSearch) {
    let timer = null;
    appSearch.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const activeTab = document.querySelector('#apps-tabs-bar .tab-btn.active');
        if (activeTab) renderAppGrid(activeTab.dataset.apptab, appSearch.value);
      }, 200);
    });
  }

  // Load saved history
  try {
    const saved = localStorage.getItem('hb.history');
    if (saved) state.history = JSON.parse(saved);
  } catch (e) { state.history = []; }

  // Load auth
  try {
    const key = localStorage.getItem('hb.key');
    if (key) {
      const res = await window.hbDesktop.authenticateWithKey(key);
      if (res.ok) state.info = res.info || { name: 'Usuário', plan: res.tier || 'Pro', licenseId: key };
    }
  } catch (e) { /* silent */ }

  renderAuth();

  // Primeiro snapshot
  try {
    const res = await window.hbDesktop.getSnapshot();
    if (res.ok) state.snapshot = res.snapshot;
  } catch (e) { /* silent */ }

  // Health inicial
  try {
    const res = await window.hbDesktop.getHealthAnalysis();
    if (res.ok) state.health = res.health;
  } catch (e) { /* silent */ }

  renderDashboard();

  // Start polling
  startSnapshotPolling(1500);

  // Notification inicial
  addNotification('Honest Boost iniciado', 'v2.0.0 — Sistema completo de otimização de Windows', 'info');
  updateNotifyBadge();
}

document.addEventListener('DOMContentLoaded', init);
