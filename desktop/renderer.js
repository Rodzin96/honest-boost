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

const CAT_ICON_MAP = { 'Sistema': '🖥️', 'Jogo': '🎮', 'Jogos': '🎮', 'Rede': '🌐', 'SSD/HDD': '💾', 'Interface': '🎨', 'Visual': '🎨', 'Privacidade': '🛡️', 'Desempenho': '⚡', 'Energia': '🔋', 'Manutenção': '🧹', 'Manutencao': '🧹', 'Input': '⌨️', 'Latência': '⏱️', 'Reparo': '🔧', 'Hardware': '🔧', 'Ferramentas': '🧰', 'Memória': '🧠', 'Memoria': '🧠' };
function catIcon(cat) { return CAT_ICON_MAP[cat] || '⚙️'; }

function daysRemaining(expiryDate) {
  if (!expiryDate) return 0;
  return Math.max(0, Math.floor((new Date(expiryDate) - new Date()) / 86400000));
}

// ============================================================
// Sidebar
// ============================================================
const SVG = {
  dashboard: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  optimizations: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  performance: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>',
  cleaning: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  monitor: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  apps: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  services: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  internet: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.9 5.7 3.9 9S14.5 18.4 12 21c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z"/></svg>',
  security: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-3.6 8-10V5l-8-3-8 3v7c0 6.4 8 10 8 10z"/></svg>',
  restoration: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><polyline points="3 3 3 8 8 8"/></svg>',
  history: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
  settings: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>',
  auth: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
};
const NAV_GROUPS = [
  { label: 'Principal', items: [
    { id: 'dashboard', label: 'Dashboard', tip: 'Centro de controle em tempo real' },
    { id: 'optimizations', label: 'Otimizações', tip: 'Ajuste fino por categoria' },
    { id: 'performance', label: 'Performance', tip: 'Presets e boost de FPS' },
    { id: 'cleaning', label: 'Limpeza', tip: 'Cache, temporários e espaço' },
  ]},
  { label: 'Sistema', items: [
    { id: 'monitor', label: 'Monitor', tip: 'Processos e inicialização' },
    { id: 'apps', label: 'Apps', tip: 'Loja de utilitários' },
    { id: 'services', label: 'Serviços', tip: 'Serviços do Windows' },
    { id: 'internet', label: 'Internet', tip: 'Rede, DNS e latência' },
  ]},
  { label: 'Proteção', items: [
    { id: 'security', label: 'Segurança', tip: 'Defender e integridade' },
    { id: 'restoration', label: 'Restauração', tip: 'Backups e rollback' },
    { id: 'history', label: 'Histórico', tip: 'Auditoria de operações', badgeId: 'history-count' },
  ]},
  { label: 'Conta', items: [
    { id: 'settings', label: 'Configurações', tip: 'Preferências do app' },
    { id: 'auth', label: 'Autenticação', tip: 'Licença e perfil' },
  ]},
];
function buildSidebar() {
  const nav = $('sidebar-nav');
  if (!nav) return;
  nav.innerHTML = NAV_GROUPS.map(g =>
    `<div class="nav-group-label">${esc(g.label)}</div>` + g.items.map(i => `
    <button class="nav-item" data-id="${i.id}" data-tip="${esc(i.tip || i.label)}" aria-label="${esc(i.label)}">
      <span class="nav-icon">${SVG[i.id] || '⚙️'}</span>
      <span class="nav-label">${esc(i.label)}</span>
      ${i.badgeId ? `<span class="nav-badge" id="nav-${i.badgeId}" style="display:none">0</span>` : ''}
    </button>`).join('')
  ).join('');
  nav.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.id));
    btn.addEventListener('mouseenter', showTipFromEl);
    btn.addEventListener('mouseleave', hideTip);
  });
  const first = nav.querySelector('[data-id="dashboard"]');
  if (first) first.classList.add('active');
}

function navigate(id) {
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.id === id));
  $$('.panel').forEach(el => el.classList.remove('active'));
  const panel = $(`panel-${id}`);
  if (panel) { panel.classList.add('active'); panel.scrollTop = 0; }
  const mc = $('main-content'); if (mc) mc.scrollTop = 0;
  switch (id) {
    case 'dashboard': renderDashboard(); break;
    case 'optimizations': renderOptimizations(); break;
    case 'performance': renderPerformance(); break;
    case 'cleaning': renderCleaning(); break;
    case 'monitor': renderMonitorPanel(); break;
    case 'apps': renderApps(); break;
    case 'services': renderServicesPanel(); break;
    case 'internet': renderInternetPanel(); break;
    case 'security': renderSecurityPanel(); break;
    case 'restoration': renderRestoration(); break;
    case 'history': renderHistory(); break;
    case 'settings': renderSettings(); break;
    case 'auth': renderAuth(); break;
  }
  const qa = $('quick-actions'); if (qa) qa.classList.add('hidden');
  hideTip();
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
  // Extrair valores do snapshot para render inicial (primeira vez)
  const cpuPct = s ? s.cpu.usage : 0;
  const gpuUsage = (s && s.gpu && s.gpu.usage) || 0;
  const gpuName = (s && s.gpu && s.gpu.name) ? esc(s.gpu.name) : 'N/A';
  const gpuTemp = s ? s.gpuTemp : null;
  const tempColor = gpuTemp !== null ? (gpuTemp > 80 ? 'var(--red)' : gpuTemp > 65 ? 'var(--amber)' : 'var(--green)') : 'var(--text-muted)';
  const tempStatus = gpuTemp !== null ? (gpuTemp > 80 ? 'Crítica' : gpuTemp > 65 ? 'Normal' : 'Baixa') : 'N/A';
  const tempVal = gpuTemp !== null ? `${gpuTemp}°C` : 'N/A';
  const cDrive = s ? (s.disk.space.find(d => d.device === 'C:') || null) : null;
  const diskFreeGB = cDrive ? (cDrive.free / 1e9).toFixed(1) : 'N/A';
  const diskTotalGB = cDrive ? (cDrive.size / 1e9).toFixed(1) : 'N/A';
  const diskPctUsed = cDrive ? Math.min(100, ((cDrive.size - cDrive.free) / cDrive.size) * 100) : 0;
  const netRx = s ? s.network.rxMBps.toFixed(1) : '0.0';
  const netTx = s ? s.network.txMBps.toFixed(1) : '0.0';

  if (!s) {
    // Sem dados — atualiza os elementos com valores nulos
    const els = ['stat-cpu-val','stat-gpu-val','stat-ram-val','stat-ssd-val','stat-net-val'];
    els.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '0.0'; });
    const subEls = ['stat-cpu-sub','stat-gpu-sub','stat-ram-sub','stat-ssd-sub','stat-net-sub'];
    subEls.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = 'Aguuardando dados...'; });
    const bars = ['stat-cpu-bar','stat-gpu-bar','stat-ram-bar','stat-ssd-bar','stat-net-bar','stat-temp-bar'];
    bars.forEach(id => { const el = document.getElementById(id); if (el) el.style.width = '0%'; });
    const tempEl = document.getElementById('stat-temp-val');
    if (tempEl) { tempEl.textContent = 'N/A'; tempEl.style.color = 'var(--text-muted)'; }
    chartsGrid.innerHTML = '';
    infoGrid.innerHTML = '';
    return;
  }

  // Se os elementos dos stat cards existem no HTML (já renderados pelo index.html),
  // usa atualização via IDs — mais rápido e preserva animações
  const hasStatCards = document.getElementById('stat-cpu-val') !== null;
  if (!hasStatCards) {
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
    chartsGrid.innerHTML = `
      <div class="chart-card" data-chart="cpu"><div class="chart-card-header"><span class="chart-card-title">CPU</span><span class="chart-card-value" style="color:var(--accent-primary);">${cpuPct.toFixed(1)}%</span></div><div class="chart-canvas-wrap"><canvas class="chart-canvas" id="chart-cpu"></canvas></div></div>
      <div class="chart-card" data-chart="ram"><div class="chart-card-header"><span class="chart-card-title">RAM</span><span class="chart-card-value" style="color:var(--cyan);">${ramPct.toFixed(1)}%</span></div><div class="chart-canvas-wrap"><canvas class="chart-canvas" id="chart-ram"></canvas></div></div>
      <div class="chart-card" data-chart="disk"><div class="chart-card-header"><span class="chart-card-title">Disco I/O</span><span class="chart-card-value" style="color:var(--green);">${(s.disk.io.readMBps + s.disk.io.writeMBps).toFixed(2)} MB/s</span></div><div class="chart-canvas-wrap"><canvas class="chart-canvas" id="chart-disk"></canvas></div></div>
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
    // Atualização incremental — só altera valores via IDs dedicados
    updateStatCardValues(s);
    updateCharts();
    // Info grid é pequeno, reconstruir aqui é aceitável
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

  // Health score (atualiza sempre — no dashboard e no top bar)
  const health = state.health;
  if (health) {
    const hsTop = $('health-value-top');
    const hsPanel = $('health-value');
    const hn = $('health-number');
    const circle = $('health-circle');
    const color = health.score >= 80 ? 'var(--green)' : health.score >= 50 ? 'var(--amber)' : 'var(--red)';
    if (hsTop) { hsTop.textContent = health.score; hsTop.style.color = color; }
    if (hsPanel) { hsPanel.textContent = health.score; hsPanel.style.color = color; }
    if (hn) { hn.textContent = health.score; }
    if (circle) {
      circle.style.setProperty('--card-accent', color);
    }
    const title = $('health-title');
    const desc = $('health-desc');
    const healthScoreEl = $('health-score-top');
    if (title) title.textContent = health.score >= 80 ? 'Excelente!' : health.score >= 50 ? 'Precisa de atenção' : 'Requer otimização urgente';
    if (desc) desc.textContent = health.recommendations.length > 0
      ? `${health.recommendations.length} recomendações baseadas no seu hardware.`
      : 'Sistema saudável. Nenhuma ação crítica necessária.';
    if (healthScoreEl) healthScoreEl.style.borderColor = health.score >= 80 ? 'rgba(34,197,94,0.3)' : health.score >= 50 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)';
    try { paintHealth(health.score); } catch (e) {}
  }
  const oc = $('opt-count'); if (oc) oc.textContent = totalOptCount();
  try { renderRecentMini(); } catch (e) {}
}

// ============================================================
// Canvas Charts
// ============================================================
const _chartCache = {};
function drawChart(canvasId, data, color) {
  const canvas = $(canvasId);
  if (!canvas || !data || data.length === 0) return;
  const rect = canvas.getBoundingClientRect();
  // Painel oculto ou sem layout: pula (evita canvas 0px e layout thrash)
  if (rect.width < 2 || rect.height < 2) return;
  const dpr = window.devicePixelRatio || 1;
  const W = Math.round(rect.width * dpr), H = Math.round(rect.height * dpr);
  let entry = _chartCache[canvasId];
  let ctx;
  if (!entry) {
    ctx = canvas.getContext('2d');
    entry = _chartCache[canvasId] = { ctx, w: 0, h: 0 };
  } else {
    ctx = entry.ctx;
  }
  // Só redimensiona quando o tamanho mudou (resize é caro: limpa o canvas)
  if (entry.w !== W || entry.h !== H) {
    canvas.width = W; canvas.height = H;
    entry.w = W; entry.h = H;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
let _tick = 0;
let _chartsQueued = false;
function startSnapshotPolling(periodMs = 1500) {
  stopSnapshotPolling();
  // Pausa o trabalho visual com janela oculta/minimizada (economiza CPU/GPU)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.snapshot) {
      try { updateStatCardValues(state.snapshot); } catch (e) {}
      requestCharts();
    }
  });
  snapshotTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      const res = await window.hbDesktop.getSnapshot();
      if (res.ok && res.snapshot) {
        _tick++;
        lastSnapshot = res.snapshot;
        state.snapshot = res.snapshot;
        state._histCpu.push(res.snapshot.cpu.usage);
        state._histRam.push(res.snapshot.ram.pct);
        state._histDiskRead.push(res.snapshot.disk.io.readMBps);
        state._histDiskWrite.push(res.snapshot.disk.io.writeMBps);
        if (state._histCpu.length > 40) { state._histCpu.shift(); state._histRam.shift(); state._histDiskRead.shift(); state._histDiskWrite.shift(); }
        // Atualiza apenas os valores nos stat cards (sem reconstruir HTML)
        updateStatCardValues(res.snapshot);
        // Charts via rAF (1 frame por tick, sem sobreposição)
        if (document.querySelector('.panel.active')?.id === 'panel-dashboard') {
          requestCharts();
        }
      }
    } catch (e) { /* silent */ }
  }, periodMs);
}
function requestCharts() {
  if (_chartsQueued) return;
  _chartsQueued = true;
  requestAnimationFrame(() => {
    _chartsQueued = false;
    try { updateCharts(); } catch (e) {}
  });
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

  // Helpers com cache + guard de escrita (só toca o DOM quando muda)
  const setText = (id, val) => { const el = _el(id); if (el && el.textContent !== val) el.textContent = val; };
  const setW = (id, v) => { const el = _el(id); if (el) { const w = Math.max(0, Math.min(100, v)).toFixed(1) + '%'; if (el.style.width !== w) el.style.width = w; } };
  // Textos secundários quase estáticos (modelo, VRAM, totais): atualiza a cada ~4 ticks
  const slow = (_tick % 4 === 0);

  setText('stat-cpu-val', cpuPct.toFixed(1));
  if (slow) setText('stat-cpu-sub', `Load: ${snap.cpu.load !== null ? snap.cpu.load : '—'} | ${snap.cpu.cores} núcleos | ${snap.cpu.model || ''}`);
  setW('stat-cpu-bar', cpuPct);

  const gpuKnown = !snap.gpu || snap.gpu.usageOk !== false;
  setText('stat-gpu-val', gpuKnown ? gpuUsage.toFixed(1) : '—');
  if (slow) setText('stat-gpu-sub', gpuKnown
    ? `${snap.gpu && snap.gpu.name ? snap.gpu.name : 'N/A'} | VRAM: ${(snap.gpu && snap.gpu.vram ? (snap.gpu.vram / 1e9).toFixed(1) : 'N/A')} GB`
    : `${snap.gpu && snap.gpu.name ? snap.gpu.name : 'GPU'} • sensor de uso indisponível`);
  setW('stat-gpu-bar', gpuKnown ? gpuUsage : 0);

  setText('stat-ram-val', ramPct.toFixed(1));
  if (slow) setText('stat-ram-sub', `${(snap.ram.used / 1e9).toFixed(1)} / ${(snap.ram.total / 1e9).toFixed(1)} GB`);
  setW('stat-ram-bar', ramPct);

  setText('stat-ssd-val', diskFreeGB);
  if (slow) setText('stat-ssd-sub', `${((cDrive ? cDrive.size - cDrive.free : 0) / 1e9).toFixed(1)} / ${diskTotalGB} GB usados`);
  setW('stat-ssd-bar', diskPctUsed);

  setText('stat-net-val', `↓${netRx}`);
  setText('stat-net-sub', `↑${netTx} MB/s`);
  setW('stat-net-bar', Math.min(100, parseFloat(netRx) * 2));

  if (gpuTemp !== null) {
    const tempColor = gpuTemp > 80 ? 'var(--red)' : gpuTemp > 65 ? 'var(--amber)' : 'var(--green)';
    const tempStatus = gpuTemp > 80 ? 'Crítica' : gpuTemp > 65 ? 'Normal' : 'Baixa';
    const tempVal = `${gpuTemp}°C`;
    const tempEl = _el('stat-temp-val');
    if (tempEl) { if (tempEl.textContent !== tempVal) tempEl.textContent = tempVal; if (tempEl.style.color !== tempColor) tempEl.style.color = tempColor; }
    setText('stat-temp-sub', `Status: ${tempStatus}`);
    setW('stat-temp-bar', Math.min(100, gpuTemp * 1.2));
    const tempBar = _el('stat-temp-bar');
    if (tempBar && tempBar.style.background !== tempColor) tempBar.style.background = tempColor;
  } else {
    const warmed = (typeof _tick === 'number' && _tick > 6);
    setText('stat-temp-val', warmed ? '—' : 'N/A');
    setText('stat-temp-sub', warmed ? 'Sensor indisponível neste hardware' : 'Aguardando dados...');
    setW('stat-temp-bar', 0);
  }

  // Atualiza indicadores do top bar (premium: CPU/RAM/GPU/NET/SSD/TEMP)
  const cpuInd = _el('indicator-cpu');
  const ramInd = _el('indicator-ram');
  const gpuInd = _el('indicator-gpu');
  const ssdInd = _el('indicator-ssd');
  const netInd = _el('indicator-net');
  const tempInd = _el('indicator-temp');
  if (cpuInd && cpuInd.textContent !== (cpuPct.toFixed(0) + '%')) cpuInd.textContent = cpuPct.toFixed(0) + '%';
  if (ramInd && ramInd.textContent !== (ramPct.toFixed(0) + '%')) ramInd.textContent = ramPct.toFixed(0) + '%';
  if (gpuInd) gpuInd.textContent = gpuUsage.toFixed(0) + '%';
  if (ssdInd) ssdInd.textContent = diskFreeGB + 'GB';
  if (netInd) { const v = '↓' + netRx; if (netInd.textContent !== v) netInd.textContent = v; }
  if (tempInd) { const v = gpuTemp !== null ? gpuTemp + '°' : '—'; if (tempInd.textContent !== v) tempInd.textContent = v; }
  if (gpuInd) { const v = gpuKnown ? gpuUsage.toFixed(0) + '%' : '—'; if (gpuInd.textContent !== v) gpuInd.textContent = v; }
  if (ssdInd) { const v = diskFreeGB + 'GB'; if (ssdInd.textContent !== v) ssdInd.textContent = v; }
  try { syncPremiumWidgets(snap, { cpuPct, ramPct, gpuUsage, diskFreeGB, netRx, netTx, gpuTemp, fpsBoost: 0 }); } catch (e) {}

  // Atualiza info grid (sistema) — só no dashboard e com guard de escrita
  if (document.querySelector('.panel.active')?.id === 'panel-dashboard') {
    const fpsBoost = Math.max(0, Math.round((100 - cpuPct) * 0.15));
    setText('sys-info-state', snap.windows ? snap.windows.state : 'N/A');
    setText('sys-info-uptime', snap.os.uptime ? snap.os.uptime.label : 'N/A');
    setText('sys-info-processes', String(snap.processes ? snap.processes.count : '—'));
    setText('sys-info-startup', String(snap.startup ? snap.startup.length : 0));
    setText('sys-info-freespace', diskFreeGB + ' GB');
    setText('sys-info-fps', '+' + fpsBoost + '%');
    if (slow) {
      setText('sys-info-hostname', snap.os.hostname || 'N/A');
      setText('sys-info-arch', snap.os.arch || 'N/A');
      setText('sys-info-os', `${snap.os.type || ''} ${snap.os.release || ''}`);
    }
  }
}

// Redesenha charts com dados existentes (canvas já criado, via cache)
function updateCharts() {
  if (document.hidden) return;
  if (_el('chart-cpu')) drawChart('chart-cpu', state._histCpu, '#3B82F6');
  if (_el('chart-ram')) drawChart('chart-ram', state._histRam, '#06B6D4');
  if (_el('chart-disk')) {
    const n = state._histDiskRead.length;
    const diskCombined = new Array(n);
    for (let i = 0; i < n; i++) diskCombined[i] = state._histDiskRead[i] + (state._histDiskWrite[i] || 0);
    drawChart('chart-disk', diskCombined, '#10B981');
  }
  // Atualiza os valores dos chart cards
  const snap = state.snapshot;
  if (snap) {
    const cpuVal = _el('chart-cpu-val');
    const ramVal = _el('chart-ram-val');
    const diskVal = _el('chart-disk-val');
    if (cpuVal) { const v = snap.cpu.usage.toFixed(1) + '%'; if (cpuVal.textContent !== v) cpuVal.textContent = v; }
    if (ramVal) { const v = snap.ram.pct.toFixed(1) + '%'; if (ramVal.textContent !== v) ramVal.textContent = v; }
    if (diskVal) {
      const v = (snap.disk.io.readMBps + snap.disk.io.writeMBps).toFixed(2) + ' MB/s';
      if (diskVal.textContent !== v) diskVal.textContent = v;
    }
  }
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
  { id: 'Sistema', label: 'Sistema', icon: '🖥️' },
  { id: 'Jogo', label: 'Jogos', icon: '🎮' },
  { id: 'Energia', label: 'Energia', icon: '🔋' },
  { id: 'Rede', label: 'Rede', icon: '🌐' },
  { id: 'Privacidade', label: 'Privacidade', icon: '🛡️' },
  { id: 'Manutenção', label: 'Manutenção', icon: '🧹' },
  { id: 'Hardware', label: 'Hardware', icon: '🔧' },
  { id: 'Ferramentas', label: 'Ferramentas', icon: '🧰' },
  { id: 'Memória', label: 'Memória', icon: '🧠' },
  { id: 'Input', label: 'Input', icon: '⌨️' },
];

// Normaliza o catálogo real (recommended[] + optional[]) para a UI.
// O backend retorna { recommended, optional, summary }; a UI agrupa por categoria.
function allOptItems() {
  const c = OPT_CATALOG;
  const out = [];
  Object.values(c || {}).forEach(list => { if (Array.isArray(list)) out.push(...list); });
  return out;
}
function syncOptCatalog() {
  const cat = state.catalog;
  if (!cat) return;
  const all = [...(cat.recommended || []), ...(cat.optional || [])];
  // Marca tier para a UI (Recomendada vs Opcional)
  const recIds = new Set((cat.recommended || []).map(o => o.id));
  const groups = {};
  all.forEach(o => {
    const g = o.category || 'Sistema';
    if (!groups[g]) groups[g] = [];
    groups[g].push({ ...o, tier: recIds.has(o.id) ? 'RECOMMENDED' : 'OPTIONAL', group: g, cat: g });
  });
  OPT_CATALOG = groups;
}

function renderOptimizations() {
  const tabsBar = $('opt-tabs-bar');
  const content = $('opt-content');
  const applyBtn = $('btn-apply-selected-opt');
  if (!tabsBar || !content) return;

  const recTotal = state.catalog?.summary?.recommendedTotal ?? state.catalog?.recommended?.length ?? 0;
  const groups = Object.keys(OPT_CATALOG).sort();
  tabsBar.innerHTML = `
    <button class="tab-btn active" data-opttab="all">Todas (${totalOptCount()})</button>
    <button class="tab-btn" data-opttab="__rec">⭐ Recomendadas (${recTotal})</button>
    ${groups.map(g => {
      const meta = OPT_GROUPS.find(x => x.id === g);
      const icon = meta ? meta.icon : catIcon(g);
      const n = (OPT_CATALOG[g] || []).length;
      return `<button class="tab-btn" data-opttab="${esc(g)}">${icon} ${esc(g)} (${n})</button>`;
    }).join('')}
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
  return allOptItems().length;
}

function renderOptCategory(tabId) {
  const content = $('opt-content');
  if (!content) return;

  // Catálogo ainda carregando
  if (!state.catalog) {
    content.innerHTML = '<div class="empty-state"><div class="spinner" style="width:26px;height:26px;margin:0 auto 12px"></div><div class="empty-state-title">Carregando otimizações…</div><div class="empty-state-desc">Analisando seu sistema (leva alguns segundos na primeira vez).</div></div>';
    return;
  }

  let items = [];
  if (tabId === 'all') {
    items = allOptItems();
  } else if (tabId === '__rec') {
    items = (state.catalog?.recommended || []).map(o => ({ ...o, group: o.category || 'Sistema', cat: o.category || 'Sistema' }));
  } else {
    items = (OPT_CATALOG[tabId] || []).map(o => ({ ...o, group: o.category || tabId, cat: o.category || tabId }));
  }

  if (items.length === 0) {
    content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">Nenhuma otimização nesta categoria</div><div class="empty-state-desc">Tente outra aba ou use a busca acima.</div></div>';
    return;
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
      const st = optStatusOf(item.id);
      const stLabel = st ? (st.label || st.level) : 'Pendente';
      const isGuide = item.kind === 'guide';
      const selected = state.selectedOpt.has(item.id);
      html += `
        <div class="opt-card ${selected ? 'selected' : ''}" data-optid="${item.id}">
          <div class="opt-card-header">
            <span class="opt-card-icon">${catIcon(item.cat)}</span>
            <div class="opt-card-name">${esc(item.name)}</div>
          </div>
          <div class="opt-card-desc">${esc(item.summary || st?.detail || '')}</div>
          <div class="opt-card-tags">
            <span class="opt-card-status ${applied ? 'applied' : 'pending'}">${applied ? '✔ Aplicado' : '○ ' + esc(stLabel)}</span>
            ${item.tier === 'RECOMMENDED' ? '<span class="badge-sm" style="background:var(--accent-dim);color:#7AA8FF;border:1px solid rgba(59,130,246,.35)">⭐ Recomendada</span>' : '<span class="badge-sm">Opcional</span>'}
            <span class="badge-sm">${esc(item.risk || 'LOW')} risco</span>
            ${item.admin ? '<span class="badge-sm">admin</span>' : ''}
            ${isGuide ? '<span class="badge-sm">guia</span>' : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" data-apply="${item.id}" ${applied ? 'disabled' : ''}>${isGuide ? 'Ver Guia' : 'Aplicar'}</button>
            <button class="btn btn-ghost btn-sm" data-remove="${item.id}" ${(!applied || isGuide) ? 'disabled' : ''}>Remover</button>
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

function optStatusOf(id) {
  const all = [...(state.catalog?.recommended || []), ...(state.catalog?.optional || [])];
  return all.find(o => o.id === id)?.status;
}
function isOptApplied(id) {
  return optStatusOf(id)?.level === 'APPLIED';
}

function currentOptTab() {
  return document.querySelector('#opt-tabs-bar .tab-btn.active')?.dataset.opttab || 'all';
}
async function doApply(id) {
  if (!licenseGate('aplicar otimizações')) return;
  try {
    const item = allOptItems().find(o => o.id === id);
    if (item?.kind === 'guide') {
      const steps = (item.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n');
      toast('📖 Guia: ' + item.name, 'info');
      addHistory('apply', id, 'success', 'guia visualizado');
      if (steps) setTimeout(() => toast(steps.slice(0, 220), 'info'), 600);
      return;
    }
    const res = await window.hbDesktop.applyOptimization(id);
    const msg = res.result?.message || res.message || 'Aplicado';
    if (!res.ok) throw new Error(res.error || 'Falha');
    toast('✔ ' + msg, 'success');
    addHistory('apply', id, 'success');
    await refreshCatalog();
    if (document.querySelector('.panel.active')?.id === 'panel-optimizations') renderOptimizationsKeepTab();
  } catch (e) { toast('Erro: ' + e.message, 'error'); addHistory('apply', id, 'error'); }
}
function renderOptimizationsKeepTab() {
  const tab = currentOptTab();
  renderOptimizations();
  const btn = document.querySelector(`#opt-tabs-bar .tab-btn[data-opttab="${CSS.escape(tab)}"]`);
  if (btn) { btn.click(); }
}

async function doRemove(id) {
  if (!licenseGate('reverter otimizações')) return;
  try {
    const res = await window.hbDesktop.removeOptimization(id);
    const msg = res.result?.message || res.message || 'Removido';
    if (!res.ok) throw new Error(res.error || 'Falha');
    toast('✔ ' + msg, 'success');
    addHistory('remove', id, 'success');
    await refreshCatalog();
    if (document.querySelector('.panel.active')?.id === 'panel-optimizations') renderOptimizationsKeepTab();
  } catch (e) { toast('Erro: ' + e.message, 'error'); addHistory('remove', id, 'error'); }
}

function showProgress(title, text, detail) {
  const overlay = $('progress-overlay');
  if (!overlay) return;
  $('progress-title').textContent = title;
  $('progress-text').textContent = text;
  $('progress-detail').textContent = detail || '';
  $('progress-bar').style.width = '35%';
  overlay.classList.remove('hidden');
}
function hideProgress(doneText) {
  const overlay = $('progress-overlay');
  if (!overlay) return;
  if (doneText) {
    $('progress-bar').style.width = '100%';
    $('progress-text').textContent = doneText;
    setTimeout(() => overlay.classList.add('hidden'), 900);
  } else overlay.classList.add('hidden');
}
// "Otimizar Agora" / "Recomendadas": batch real com progresso + resumo honesto
// (aplicadas, puladas por hardware, bloqueadas por falta de admin).
async function runOptimizeNow() {
  if (!licenseGate('otimizar o Windows')) return;
  showProgress('Otimizando o Windows', 'Aplicando otimizações recomendadas…', 'Isso pode levar 1–2 minutos. Não feche o app.');
  try {
    const res = await window.hbDesktop.applyRecommended();
    if (!res.ok) throw new Error(res.error || 'Falha');
    const r = res.result || {};
    const applied = r.applied || 0, failed = r.failed || 0;
    const adminBlocked = r.adminBlocked || 0, skipped = r.skipped || 0;
    hideProgress(`Concluído — ${applied} aplicadas`);
    if (applied > 0 && failed === 0) {
      toast(`✔ ${applied} otimizações aplicadas com sucesso`, 'success');
      addHistory('recommended', '', 'success', `${applied} aplicadas`);
    } else if (applied > 0) {
      const extra = adminBlocked ? ` (${adminBlocked} exigem administrador)` : skipped ? ` (${skipped} não se aplicam a este hardware)` : '';
      toast(`✔ ${applied} aplicadas, ${failed} pendentes${extra}`, 'warning');
      addHistory('recommended', '', 'success', `${applied} aplicadas, ${failed} pendentes`);
      if (adminBlocked) {
        addNotification('Elevação necessária', `${adminBlocked} otimizações exigem administrador — use o botão Admin na aba Otimizações.`, 'warning');
        if (confirm(`${adminBlocked} otimizações exigem administrador.\n\nReiniciar o Honest Boost como administrador agora?`)) {
          await restartAsAdminFlow();
        }
      }
    } else if (adminBlocked > 0) {
      toast(`⚠️ ${adminBlocked} otimizações exigem administrador`, 'warning');
      addHistory('recommended', '', 'error', 'bloqueado: sem admin');
      if (confirm('Nenhuma otimização pôde ser aplicada sem elevação.\n\nReiniciar o Honest Boost como administrador agora?')) {
        await restartAsAdminFlow();
      }
    } else {
      const firstErr = (r.results || []).find(x => !x.ok)?.message || 'Falha desconhecida';
      toast('Erro: ' + firstErr, 'error');
      addHistory('recommended', '', 'error', firstErr.slice(0, 80));
    }
    await refreshCatalog();
    if (document.querySelector('.panel.active')?.id === 'panel-optimizations') renderOptimizationsKeepTab();
    else if (document.querySelector('.panel.active')?.id === 'panel-dashboard') renderDashboard();
  } catch (e) {
    hideProgress();
    toast('Erro: ' + e.message, 'error');
  }
}
async function applyRecommended() { await runOptimizeNow(); }

async function restartAsAdminFlow() {
  toast('🛡 Aguardando confirmação no UAC…', 'info');
  try {
    const res = await window.hbDesktop.restartAsAdmin();
    if (res.ok) {
      toast('🛡 Reabrindo elevado — esta janela vai fechar', 'success');
    } else if (res.error === 'already-admin') {
      toast('✔ O app já está rodando como administrador', 'success');
    } else {
      toast('Elevação cancelada — o app continua aberto sem admin', 'warning');
    }
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
  if (!licenseGate('aplicar o preset')) return;
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
      { id: 'error-logs', title: 'Logs de Erro ⚠️', desc: 'Apaga logs do sistema, inclusive Segurança (irreversível)', size: '10–100 MB', dangerous: true },
      { id: 'dns-cache', title: 'Cache DNS', desc: 'Limpar cache de DNS do Windows', size: 'Pequeno' },
      { id: 'clipboard', title: 'Clipboard', desc: 'Histórico da área de transferência', size: 'Variável' },
      { id: 'recycle-bin', title: 'Lixeira ⚠️', desc: 'Esvaziar a lixeira do Windows (irreversível)', size: 'Variável', dangerous: true },
    ]
  },
  {
    id: 'browsers', label: 'Navegadores', icon: '🌐',
    items: [
      { id: 'chrome-cache', title: 'Chrome — Cache', desc: 'Cache de páginas e assets', size: 'Variável' },
      { id: 'chrome-cookies', title: 'Chrome — Cookies ⚠️', desc: 'Desloga você de TODOS os sites (irreversível)', size: 'Variável', dangerous: true },
      { id: 'chrome-history', title: 'Chrome — Histórico ⚠️', desc: 'Apaga o histórico de navegação (irreversível)', size: 'Variável', dangerous: true },
      { id: 'edge-cache', title: 'Edge — Cache', desc: 'Cache do Microsoft Edge', size: 'Variável' },
      { id: 'edge-cookies', title: 'Edge — Cookies ⚠️', desc: 'Desloga você de TODOS os sites (irreversível)', size: 'Variável', dangerous: true },
      { id: 'firefox-cache', title: 'Firefox — Cache', desc: 'Cache do Mozilla Firefox', size: 'Variável' },
      { id: 'firefox-cookies', title: 'Firefox — Cookies ⚠️', desc: 'Desloga você de TODOS os sites (irreversível)', size: 'Variável', dangerous: true },
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
      { id: 'office-cache', title: 'Office — Cache ⚠️', desc: 'Pode conter rascunhos não sincronizados (irreversível)', size: '100–500 MB', dangerous: true },
    ]
  },
  {
    id: 'advanced', label: 'Avançado', icon: '⚙️',
    items: [
      { id: 'winsxs', title: 'WinSxS ⚠️', desc: 'IRREVERSÍVEL: impede desinstalar updates do Windows', size: '2–10 GB', admin: true, dangerous: true },
      { id: 'component-store', title: 'Component Store', desc: 'Sistema de componentes do Windows', size: '1–5 GB', admin: true },
      { id: 'user-temp', title: 'Temp do Usuário', desc: 'Todas as pastas temp do usuário', size: 'Variável' },
      { id: 'system-temp', title: 'Temp do Sistema', desc: 'Temp do Windows e arquivos de programa', size: '1–5 GB', admin: true },
      { id: 'msi-cache', title: 'MSI Cache', desc: 'Pacotes MSI temporários (pasta Temp)', size: '50–500 MB', admin: true },
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
  'chrome-cache': 5e8, 'chrome-cookies': 1e8, 'chrome-history': 1e8,
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

function cleanItemMeta(id) {
  for (const g of CLEAN_GROUPS) {
    const found = g.items.find(i => i.id === id);
    if (found) return found;
  }
  return null;
}
function confirmDangerous(ids) {
  const dangerous = ids.map(cleanItemMeta).filter(m => m && m.dangerous);
  if (!dangerous.length) return true;
  const names = dangerous.map(m => '• ' + m.title.replace(/ ⚠️/g, '')).join('\n');
  return confirm(
    `ATENÇÃO — ${dangerous.length} item(ns) irreversível(eis):\n\n${names}\n\nEsta ação NÃO pode ser desfeita. Continuar?`
  );
}

async function doCleanItem(id) {
  if (!licenseGate('executar a limpeza')) return;
  if (!confirmDangerous([id])) return;
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
  if (!licenseGate('executar a limpeza')) return;
  if (!confirmDangerous(ids)) return;
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
    if (!licenseGate('restaurar o sistema')) return;
    toast('Restaurando ponto de restauração...', 'info');
    try {
      const res = await window.hbDesktop.restoreRegistry();
      if (res.ok) toast('✔ Sistema restaurado com sucesso', 'success');
      else toast('Erro: ' + res.error, 'error');
    } catch (e) { toast('Erro: ' + e.message, 'error'); }
  });

  if (createBtn) createBtn.addEventListener('click', async () => {
    if (!licenseGate('criar pontos de restauração')) return;
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
    if (!licenseGate('criar backups')) return;
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
    if (!licenseGate('restaurar backups')) return;
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
// Loja de Apps — instalação REAL via winget (IDs verificados com
// `winget show --exact`). type: 'winget' instala pelo gerenciador do Windows;
// type: 'official' abre a página oficial (sem pacote winget confiável).
const APPS_CATALOG = [
  { category: 'Navegadores', icon: '🌐', items: [
    { id: 'chrome', name: 'Google Chrome', desc: 'Navegador mais usado do mundo', icon: '🌐', size: 'via winget', type: 'winget' },
    { id: 'firefox', name: 'Mozilla Firefox', desc: 'Navegador open-source da Mozilla', icon: '🦊', size: 'via winget', type: 'winget' },
    { id: 'edge', name: 'Microsoft Edge', desc: 'Navegador baseado em Chromium', icon: '🌐', size: 'via winget', type: 'winget' },
    { id: 'opera', name: 'Opera Browser', desc: 'Navegador com VPN integrada', icon: '🔴', size: 'via winget', type: 'winget' },
    { id: 'brave', name: 'Brave Browser', desc: 'Navegador focado em privacidade', icon: '🦁', size: 'via winget', type: 'winget' },
  ]},
  { category: 'Jogos', icon: '🎮', items: [
    { id: 'steam', name: 'Steam', desc: 'Plataforma de jogos mais popular', icon: '🎮', size: 'via winget', type: 'winget' },
    { id: 'epic', name: 'Epic Games Launcher', desc: 'Jogos gratuitos semanais', icon: '🏰', size: 'via winget', type: 'winget' },
    { id: 'battle', name: 'Battle.net', desc: 'Launcher da Blizzard Entertainment', icon: '⚔️', size: 'via winget', type: 'winget' },
    { id: 'discord', name: 'Discord', desc: 'Comunicação para gamers', icon: '🎤', size: 'via winget', type: 'winget' },
    { id: 'obs', name: 'OBS Studio', desc: 'Gravação e streaming de jogos', icon: '📹', size: 'via winget', type: 'winget' },
  ]},
  { category: 'Utilitários', icon: '🧰', items: [
    { id: '7zip', name: '7-Zip', desc: 'Compactador open-source', icon: '📦', size: 'via winget', type: 'winget' },
    { id: 'everything', name: 'Everything', desc: 'Busca de arquivos instantânea', icon: '🔍', size: 'via winget', type: 'winget' },
    { id: 'rufus', name: 'Rufus', desc: 'Criação de pen drives bootáveis', icon: '💾', size: 'via winget', type: 'winget' },
    { id: 'notion', name: 'Notion', desc: 'Workspace todo-em-um', icon: '📝', size: 'via winget', type: 'winget' },
    { id: 'obsidian', name: 'Obsidian', desc: 'Editor de notas com links', icon: '📓', size: 'via winget', type: 'winget' },
  ]},
  { category: 'Drivers', icon: '🔧', items: [
    { id: 'nvidia', name: 'NVIDIA GeForce Driver', desc: 'Driver oficial — abre a página da NVIDIA', icon: 'NVIDIA', size: 'site oficial', type: 'official' },
    { id: 'amd', name: 'AMD Adrenalin Driver', desc: 'Driver oficial — abre a página da AMD', icon: 'AMD', size: 'site oficial', type: 'official' },
    { id: 'intel', name: 'Intel Driver & Support', desc: 'Drivers e atualizações Intel', icon: 'Intel', size: 'via winget', type: 'winget' },
  ]},
  { category: 'Runtime', icon: '⚙️', items: [
    { id: 'vcredist', name: 'Visual C++ Redistributable', desc: 'Runtimes x64 + x86 para jogos', icon: 'MS', size: 'via winget', type: 'winget' },
    { id: 'directx', name: 'DirectX End-User', desc: 'Runtime DirectX para jogos', icon: 'DX', size: 'via winget', type: 'winget' },
    { id: 'dotnet', name: '.NET Desktop Runtime 9', desc: 'Runtime .NET para apps Windows', icon: '.NET', size: 'via winget', type: 'winget' },
    { id: 'java', name: 'Java Runtime (JRE)', desc: 'Ambiente Java para apps e jogos', icon: 'Java', size: 'via winget', type: 'winget' },
    { id: 'python', name: 'Python 3.13', desc: 'Linguagem de programação versátil', icon: 'Py', size: 'via winget', type: 'winget' },
  ]},
  { category: 'Ferramentas', icon: '🛠️', items: [
    { id: 'afterburner', name: 'MSI Afterburner', desc: 'Overclock e monitoramento GPU', icon: '🔧', size: 'via winget', type: 'winget' },
    { id: 'hwinfo', name: 'HWiNFO', desc: 'Monitoramento detalhado de hardware', icon: '📊', size: 'via winget', type: 'winget' },
    { id: 'cpu-z', name: 'CPU-Z', desc: 'Informações detalhadas da CPU', icon: '🧠', size: 'via winget', type: 'winget' },
    { id: 'gpu-z', name: 'GPU-Z', desc: 'Informações detalhadas da GPU', icon: '🎮', size: 'via winget', type: 'winget' },
  ]},
];

// Estado de instalados (via `winget list` no main process). null = ainda não carregado.
state.appsStatus = null;
state.appsStatusLoading = false;

async function refreshAppsStatus(silent) {
  if (state.appsStatusLoading) return;
  state.appsStatusLoading = true;
  try {
    const res = await window.hbDesktop.getAppsStatus();
    if (res && res.ok) {
      state.appsStatus = res.installed || {};
      state.appsStatusTs = Date.now();
    } else if (res && res.error === 'winget-not-found') {
      state.appsStatus = {};
      if (!silent) toast('⚠️ winget não encontrado — instale o App Installer pela Microsoft Store', 'warning');
    }
  } catch (e) { /* mantém estado anterior */ }
  finally {
    state.appsStatusLoading = false;
    const activeTab = document.querySelector('#apps-tabs-bar .tab-btn.active');
    if (document.querySelector('.panel.active')?.id === 'panel-apps' && activeTab) {
      renderAppGrid(activeTab.dataset.apptab, ($('app-search') || {}).value || '');
    }
  }
}
function wingetErrorMessage(err) {
  if (!err) return 'Falha desconhecida';
  if (err === 'winget-not-found') return 'winget não encontrado — instale o App Installer pela Microsoft Store';
  if (/0x8a15002b|0x8A15002B/i.test(err)) return 'Sem conexão com a fonte winget — verifique a internet';
  if (/require admin|0x800704C7|cancelled|cancelado/i.test(err)) return 'Operação cancelada ou requer elevação (admin)';
  return err.length > 220 ? err.slice(0, 220) + '…' : err;
}

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
  // Detecta instalados em background (1 chamada `winget list`) e re-renderiza;
  // recarrega se o cache tem +2 min (instalou algo fora do app)
  if ((!state.appsStatus || Date.now() - (state.appsStatusTs || 0) > 120000) && !state.appsStatusLoading) refreshAppsStatus(true);
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

  grid.innerHTML = items.map(app => {
    const installed = state.appsStatus ? !!state.appsStatus[app.id] : null;
    const statusTag = app.type === 'official'
      ? '<span class="badge-sm">site oficial</span>'
      : installed === null
        ? '<span class="badge-sm">verificando…</span>'
        : installed
          ? '<span class="badge-sm" style="background:var(--green-bg);color:var(--green);border:1px solid rgba(34,197,94,.35)">✔ Instalado</span>'
          : '<span class="badge-sm">não instalado</span>';
    const footer = app.type === 'official'
      ? `<button class="btn btn-primary btn-sm" data-openpage="${app.id}">Baixar no site oficial</button>`
      : installed
        ? `<button class="btn btn-secondary btn-sm" data-update="${app.id}">Atualizar</button>
           <button class="btn btn-ghost btn-sm" data-uninstall="${app.id}">Desinstalar</button>`
        : `<button class="btn btn-primary btn-sm" data-install="${app.id}">Instalar via winget</button>
           <button class="btn btn-ghost btn-sm" data-uninstall="${app.id}">Desinstalar</button>`;
    return `
    <div class="app-card">
      <div class="app-card-header"><div class="app-card-icon">${app.icon}</div>${statusTag}</div>
      <div class="app-card-name">${esc(app.name)}</div>
      <div class="app-card-desc">${esc(app.desc)}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-bottom:10px;font-family:var(--font-mono);">${esc(app.size)}</div>
      <div class="app-card-footer">${footer}</div>
    </div>`;
  }).join('');

  const rerender = () => {
    const activeTab = document.querySelector('#apps-tabs-bar .tab-btn.active');
    if (activeTab) renderAppGrid(activeTab.dataset.apptab, ($('app-search') || {}).value || '');
  };
  grid.querySelectorAll('[data-install]').forEach(btn => btn.addEventListener('click', async () => {
    if (!licenseGate('instalar aplicativos')) return;
    const app = items.find(a => a.id === btn.dataset.install);
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Instalando… (pode levar minutos)';
    toast(`⬇ Instalando ${app?.name} via winget…`, 'info');
    try {
      const res = await window.hbDesktop.installApp(app.id);
      if (!res.ok) throw new Error(res.error || 'Falha');
      toast(`✔ ${app?.name} — ${res.message || 'instalado'}`, 'success');
      addHistory('install', app?.id || '', 'success');
    } catch (e) { toast('Erro: ' + wingetErrorMessage(e.message), 'error'); addHistory('install', app?.id || '', 'error'); }
    finally { await refreshAppsStatus(true); rerender(); }
  }));
  grid.querySelectorAll('[data-update]').forEach(btn => btn.addEventListener('click', async () => {
    if (!licenseGate('atualizar aplicativos')) return;
    const app = items.find(a => a.id === btn.dataset.update);
    btn.disabled = true;
    const old = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span> Verificando…';
    try {
      const res = await window.hbDesktop.upgradeApp(app.id);
      if (!res.ok) throw new Error(res.error || 'Falha');
      toast(res.latest ? `✔ ${app?.name} — já está atualizado` : `✔ ${app?.name} atualizado`, res.latest ? 'info' : 'success');
    } catch (e) { toast('Erro: ' + wingetErrorMessage(e.message), 'error'); }
    finally { btn.disabled = false; btn.textContent = old; }
  }));
  grid.querySelectorAll('[data-uninstall]').forEach(btn => btn.addEventListener('click', async () => {
    if (!licenseGate('desinstalar aplicativos')) return;
    const app = items.find(a => a.id === btn.dataset.uninstall);
    if (!confirm(`Desinstalar ${app?.name}?`)) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Removendo…';
    try {
      const res = await window.hbDesktop.uninstallApp(app.id);
      if (!res.ok) throw new Error(res.error || 'Falha');
      toast(`✔ ${app?.name} desinstalado`, 'success');
      addHistory('remove', app?.id || '', 'success');
    } catch (e) { toast('Erro: ' + wingetErrorMessage(e.message), 'error'); }
    finally { await refreshAppsStatus(true); rerender(); }
  }));
  grid.querySelectorAll('[data-openpage]').forEach(btn => btn.addEventListener('click', async () => {
    try { await window.hbDesktop.openAppPage(btn.dataset.openpage); toast('🌐 Página oficial aberta no navegador', 'info'); }
    catch (e) { toast('Erro: ' + e.message, 'error'); }
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
  if (viewLogsBtn) viewLogsBtn.addEventListener('click', showLogsModal);
  if (clearLogsBtn) clearLogsBtn.addEventListener('click', () => {
    state.history = []; state.errlog = [];
    localStorage.removeItem('hb.history'); localStorage.removeItem('hb.errlog');
    toast('✔ Logs limpos', 'success');
  });

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
    $('license-days').textContent = state.info.lifetime ? '∞' : (state.info.daysRemaining ?? daysRemaining(state.info.expiryDate));
    $('license-expiry').textContent = state.info.lifetime ? 'Vitalícia' : (state.info.expiryDate ? new Date(state.info.expiryDate).toLocaleDateString('pt-BR') : '—');
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
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        try {
          const res = await window.hbDesktop.authenticateWithKey(key);
          if (res.ok) {
            state.info = res.info || { name: 'Usuário', plan: res.tier || 'Pro', licenseId: key, daysRemaining: 365 };
            localStorage.setItem('hb.key', key);
            try { localStorage.setItem('hb.info', JSON.stringify(state.info)); } catch (e) {}
            toast('✔ Licença validada no servidor', 'success');
            renderAuth();
            navigate('dashboard');
          } else {
            if (errorEl) { errorEl.textContent = res.error || 'Falha na autenticação'; errorEl.classList.remove('hidden'); }
          }
        } catch (e) {
          if (errorEl) { errorEl.textContent = e.message; errorEl.classList.remove('hidden'); }
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      };
    }
    // Sem trial no produto: o botão leva aos planos reais do site.
    $('btn-buy')?.addEventListener('click', async () => {
      try { await window.hbDesktop.openPlans(); }
      catch (e) { toast('Erro: ' + e.message, 'error'); }
    });
  }
  try { refreshLockUI(); } catch (e) {}
}

async function doLogout() {
  try {
    await window.hbDesktop.logout();
    state.info = null;
    localStorage.removeItem('hb.key');
    localStorage.removeItem('hb.info');
    toast('✔ Desconectado', 'info');
    renderAuth();
    navigate('auth');
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
}

// ============================================================
// Log local de erros (100% local — nada sai da máquina).
// Alimenta o visualizador em Configurações → Logs (para suporte via Discord).
// ============================================================
state.errlog = [];
try { state.errlog = JSON.parse(localStorage.getItem('hb.errlog') || '[]'); } catch (e) { state.errlog = []; }
function pushErrLog(msg, src) {
  try {
    state.errlog.unshift({ t: new Date().toISOString(), msg: String(msg || 'erro').slice(0, 300), src: String(src || '').slice(-120) });
    if (state.errlog.length > 50) state.errlog.length = 50;
    localStorage.setItem('hb.errlog', JSON.stringify(state.errlog));
  } catch (e) {}
}
window.addEventListener('error', (e) => pushErrLog(e.message || 'window.onerror', e.filename));
window.addEventListener('unhandledrejection', (e) => pushErrLog((e.reason && (e.reason.message || e.reason)) || 'unhandledrejection', 'promise'));
function showLogsModal() {
  const root = $('modal-root');
  if (!root) return;
  const ops = (state.history || []).slice(0, 30).map(h =>
    `<div class="log-row"><span class="log-time">${esc(h.date || '')} ${esc(h.time || '')}</span><span class="log-msg">${esc(h.label || h.type || '')}</span><span class="history-status ${h.status}">${esc(h.status || '')}</span></div>`
  ).join('');
  const errs = (state.errlog || []).map(e =>
    `<div class="log-row"><span class="log-time">${esc((e.t || '').slice(0, 19).replace('T', ' '))}</span><span class="log-msg">${esc(e.msg || '')}</span><span class="log-src">${esc(e.src || '')}</span></div>`
  ).join('');
  root.innerHTML = `
    <div class="progress-overlay" id="logs-modal">
      <div class="progress-modal" style="width:560px;max-width:94vw;max-height:80vh;display:flex;flex-direction:column;">
        <div class="progress-header"><div class="progress-title-wrap"><h3>Logs locais</h3></div><button class="progress-close" id="logs-close" aria-label="Fechar">✕</button></div>
        <div class="progress-body" style="overflow-y:auto;">
          <p class="progress-detail" style="margin-bottom:8px;">Operações (${(state.history || []).length}) e erros (${(state.errlog || []).length}) — ficam só neste PC. Copie e envie ao suporte se precisar.</p>
          <h4 class="mini-title" style="margin:10px 0 6px;">Erros recentes</h4>
          ${errs || '<div class="empty-state" style="padding:12px;"><div class="empty-state-desc">Nenhum erro registrado. 🎉</div></div>'}
          <h4 class="mini-title" style="margin:14px 0 6px;">Últimas operações</h4>
          ${ops || '<div class="empty-state" style="padding:12px;"><div class="empty-state-desc">Sem operações ainda.</div></div>'}
        </div>
        <div class="setting-action-row" style="margin-top:12px;">
          <button class="btn btn-secondary btn-sm" id="logs-copy">Copiar tudo</button>
        </div>
      </div>
    </div>`;
  $('logs-close')?.addEventListener('click', () => { root.innerHTML = ''; });
  $('logs-modal')?.addEventListener('click', (e) => { if (e.target.id === 'logs-modal') root.innerHTML = ''; });
  $('logs-copy')?.addEventListener('click', async () => {
    const text = 'OPERACOES:\n' + (state.history || []).slice(0, 30).map(h => `${h.date} ${h.time} [${h.status}] ${h.label}`).join('\n')
      + '\n\nERROS:\n' + (state.errlog || []).map(e => `${e.t} ${e.msg} (${e.src})`).join('\n');
    try { await navigator.clipboard.writeText(text); toast('✔ Logs copiados — cole no suporte', 'success'); }
    catch (e) { toast('Erro ao copiar', 'error'); }
  });
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
    const found = allOptItems().find(o => o.id === id);
    if (found) return `${HISTORY_LABELS[type] || type}: ${found.name}`;
    if (id === 'benchmark') return 'Benchmark do sistema';
  }
  return (HISTORY_LABELS[type] || type) + (id && !allOptItems().find(o => o.id === id) && id !== 'benchmark' ? ': ' + id : '');
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
      // Drawer legado delega ao handler único (com trava de licença).
      // 'quick-fix-windows' só existe aqui: trata com gate antes.
      const action = btn.dataset.action;
      $('quick-actions').classList.add('hidden');
      if (action === 'quick-fix-windows') {
        if (!licenseGate('executar correções do Windows')) return;
        toast('🔧 Executando correções do Windows (SFC/DISM + limpeza)...', 'info');
        try {
          const res = await window.hbDesktop.applyBatch(['sfc-dism', 'temp-cleanup']);
          const r = res.result || {};
          if (res.ok && r.applied > 0 && !r.failed) toast('✔ Correções concluídas', 'success');
          else if ((r.applied || 0) > 0) toast(`✔ ${r.applied} aplicadas, ${r.failed || 0} pendentes (podem exigir admin)`, 'warning');
          else toast('⚠️ ' + ((r.results || []).find(x => !x.ok)?.message || 'Nada aplicado — tente como administrador'), 'warning');
        } catch (e) { toast('Erro: ' + e.message, 'error'); }
        return;
      }
      await handleQuickAction(action, btn);
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

  allOptItems().forEach(o => {
    const label = o.name || o.id;
    const desc = 'Otimização • ' + (o.category || 'Sistema') + (o.tier === 'RECOMMENDED' ? ' • ⭐ Recomendada' : '');
    if (label.toLowerCase().includes(query) || desc.toLowerCase().includes(query) || (o.summary || '').toLowerCase().includes(query)) {
      results.push({ nav: 'optimizations', icon: catIcon(o.category || 'Sistema'), label, desc });
    }
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
    if (catalog && catalog.ok) {
      state.catalog = catalog.catalog;
      syncOptCatalog();
      const oc = $('opt-count');
      if (oc) oc.textContent = totalOptCount();
    }
  } catch {}
  try {
    const health = await window.hbDesktop.getHealthAnalysis();
    if (health && health.ok) {
      state.health = health.health;
      try { paintHealth(health.health.score); } catch (e) {}
    }
  } catch {}
}

// ============================================================
// PREMIUM LAYER v4.0 — tooltips, ripple, widgets, novas telas
// ============================================================
function showTipFromEl(e) {
  const el = e.currentTarget;
  const txt = el.getAttribute('data-tip');
  if (!txt) return;
  const tip = $('tooltip');
  if (!tip) return;
  tip.textContent = txt;
  tip.classList.remove('hidden');
  const r = el.getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2;
  let y = r.bottom + 8;
  x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
  if (y + th > window.innerHeight - 8) y = r.top - th - 8;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function hideTip() { const tip = $('tooltip'); if (tip) tip.classList.add('hidden'); }
function bindTips(root) {
  (root || document).querySelectorAll('[data-tip]').forEach(el => {
    if (el._tipBound) return; el._tipBound = true;
    el.addEventListener('mouseenter', showTipFromEl);
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('focus', showTipFromEl);
    el.addEventListener('blur', hideTip);
  });
}
function initRipple() {
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.btn, .qa-card, .nav-item, .quick-action, .opt-card');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const rip = document.createElement('span');
    rip.className = 'ripple';
    const size = Math.max(rect.width, rect.height);
    rip.style.width = rip.style.height = size + 'px';
    rip.style.left = (e.clientX - rect.left - size / 2) + 'px';
    rip.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.style.position = btn.style.position || 'relative';
    btn.appendChild(rip);
    setTimeout(() => rip.remove(), 600);
  });
}
function setRing(id, score) {
  const el = $(id);
  if (!el) return;
  const C = 2 * Math.PI * parseFloat(el.getAttribute('r') || '12');
  const off = C - (C * Math.max(0, Math.min(100, score)) / 100);
  el.style.strokeDasharray = C.toFixed(1);
  el.style.strokeDashoffset = off.toFixed(1);
  el.style.stroke = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--red)';
}
function paintHealth(score) {
  setRing('health-ring-top', score);
  const main = $('health-ring-main');
  if (main) {
    const C = 276.5;
    main.style.strokeDasharray = C;
    main.style.strokeDashoffset = (C - (C * score / 100)).toFixed(1);
  }
  const pill = $('health-pill');
  if (pill) {
    const label = score >= 80 ? 'Excelente' : score >= 50 ? 'Atenção' : 'Crítico';
    pill.textContent = score + ' • ' + label;
    pill.className = 'pill ' + (score >= 80 ? 'green' : score >= 50 ? 'amber' : 'red');
  }
  const hv = $('health-value-top');
  if (hv) hv.style.color = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--red)';
  const checks = $('health-checks');
  if (checks && state.health) {
    checks.innerHTML = state.health.checks.slice(0, 4).map(c =>
      `<span class="health-check ${c.severity}">${c.severity === 'high' ? '●' : c.severity === 'medium' ? '◐' : '○'} ${esc(c.label)}</span>`
    ).join('');
  }
  const recList = $('rec-list'), recCount = $('rec-count');
  if (recList && state.health) {
    const recs = state.health.recommendations || [];
    if (recCount) recCount.textContent = recs.length;
    recList.innerHTML = recs.length === 0
      ? '<div class="empty-state"><div class="empty-state-icon">✨</div><div class="empty-state-title">Sistema saudável</div><div class="empty-state-desc">Nenhuma ação crítica necessária.</div></div>'
      : recs.slice(0, 6).map(r => `<div class="rec-item"><span class="rec-prio ${esc(r.priority)}">${esc(r.priority)}</span><div><div class="rec-title">${esc(r.label)}</div><div class="rec-desc">${esc(r.desc || '')}</div></div></div>`).join('');
  }
}
// Cache de elementos atualizados a cada tick (evita getElementById repetido)
const _elCache = {};
function _el(id) {
  let el = _elCache[id];
  if (el === undefined) { el = document.getElementById(id) || null; _elCache[id] = el; }
  // Se o painel foi reconstruído, o nó antigo pode ter saído do DOM: revalida
  if (el && !el.isConnected) { el = document.getElementById(id) || null; _elCache[id] = el; }
  return el;
}
function _setText(id, v) { const el = _el(id); if (el && el.textContent !== v) el.textContent = v; }
function _setW(id, v) { const el = _el(id); if (el) { const w = Math.max(0, Math.min(100, v)).toFixed(1) + '%'; if (el.style.width !== w) el.style.width = w; } }
let _lastHealthSig = '', _lastRecentSig = '', _lastStartupSig = '';
function syncPremiumWidgets(snap, pre) {
  const fpsBoost = Math.max(0, Math.round((100 - snap.cpu.usage) * 0.15));
  const dashActive = document.querySelector('.panel.active')?.id === 'panel-dashboard';
  // Widgets do dashboard: só quando visível
  if (dashActive) {
    _setText('perf-cpu', snap.cpu.usage.toFixed(1) + '%'); _setW('perf-cpu-bar', snap.cpu.usage);
    _setText('perf-ram', snap.ram.pct.toFixed(1) + '%'); _setW('perf-ram-bar', snap.ram.pct);
    const _gpuKnown = !snap.gpu || snap.gpu.usageOk !== false;
    _setText('perf-gpu', _gpuKnown ? (((snap.gpu && snap.gpu.usage) || 0).toFixed(1) + '%') : '—'); _setW('perf-gpu-bar', _gpuKnown ? ((snap.gpu && snap.gpu.usage) || 0) : 0);
    _setText('perf-fps', '+' + fpsBoost + '%'); _setW('perf-fps-bar', Math.min(100, fpsBoost * 3));
  }
  _setText('sidebar-fps', '+' + fpsBoost + '%');
  const st = _el('system-status-text');
  if (st) { const v = snap.cpu.usage > 90 ? 'Sob carga' : snap.ram.pct > 90 ? 'RAM cheia' : 'Online'; if (st.textContent !== v) st.textContent = v; }
  // Painéis secundários: só quando ativos (evita tocar em DOM oculto)
  const active = document.querySelector('.panel.active')?.id;
  if (active === 'panel-monitor') {
    _setText('mon-proc-count', String(snap.processes ? snap.processes.count : '—'));
    _setText('mon-proc-sub', (snap.processes ? snap.processes.count : 0) + ' processos • ' + (snap.cpu.cores || '?') + ' núcleos • load ' + (snap.cpu.load ?? '—'));
    _setW('mon-proc-bar', Math.min(100, (snap.processes ? snap.processes.count : 0) / 3));
    _setText('mon-start-count', String(snap.startup ? snap.startup.length : 0));
    const sig = (snap.startup || []).length + '|' + ((snap.startup || [])[0] || '');
    if (sig !== _lastStartupSig) {
      _lastStartupSig = sig;
      const msu = _el('mon-startup');
      if (msu) msu.innerHTML = (snap.startup && snap.startup.length) ? snap.startup.slice(0, 8).map(s => `<div class="startup-item">${esc(String(s).slice(0, 60))}</div>`).join('') : '<div class="startup-item">Nenhum app de inicialização detectado</div>';
    }
    _setText('mon-host', snap.os.hostname || '—'); _setText('mon-uptime', snap.os.uptime ? snap.os.uptime.label : '—');
    _setText('mon-os', (snap.os.type || '') + ' ' + (snap.os.release || '')); _setText('mon-arch', snap.os.arch || '—');
    const wp = _el('mon-win-pill'); if (wp) { const v = snap.windows ? snap.windows.state : '—'; if (wp.textContent !== v) wp.textContent = v; }
  }
  if (active === 'panel-internet') {
    const rx = snap.network.rxMBps, tx = snap.network.txMBps;
    _setText('net-down', '↓' + rx.toFixed(2)); _setText('net-up', '↑' + tx.toFixed(2));
    _setText('net-disk', (snap.disk.io.readMBps + snap.disk.io.writeMBps).toFixed(2) + ' MB/s');
  }
  if (active === 'panel-security' || dashActive) {
    const secState = snap.windows ? snap.windows.state : '—';
    _setText('sec-defender-sub', 'Defender / proteção: ' + secState);
    const sp = _el('sec-defender-pill');
    if (sp) { const on = /ati|run/i.test(secState); const v = on ? 'Protegido' : 'Verificar'; if (sp.textContent !== v) { sp.textContent = v; sp.className = 'pill ' + (on ? 'green' : 'amber'); } }
    const qa = _el('qa-defender-sub');
    if (qa) { const v = secState.length > 10 ? secState.slice(0, 10) : secState; if (qa.textContent !== v) qa.textContent = v; }
  }
  // Saúde e recentes: só re-renderizam quando o conteúdo muda (eram innerHTML a cada 1.5s!)
  if (state.health) {
    const sig = state.health.score + '|' + (state.health.checks || []).map(c => c.id + c.points).join(',') + '|' + (state.health.recommendations || []).length;
    if (sig !== _lastHealthSig) { _lastHealthSig = sig; try { paintHealth(state.health.score); } catch (e) {} }
  }
  renderRecentMini();
}
function renderRecentMini() {
  const sig = (state.history || []).slice(0, 5).map(h => h.label + h.status + h.time).join('|');
  if (sig === _lastRecentSig) return;
  _lastRecentSig = sig;
  const el = _el('recent-list');
  if (!el) return;
  if (!state.history || state.history.length === 0) return;
  el.innerHTML = state.history.slice(0, 5).map(h => `
    <div class="rec-item"><span class="history-icon ${h.status}" style="width:30px;height:30px;font-size:12px">${h.status === 'success' ? '✔' : h.status === 'error' ? '✖' : '⏳'}</span>
    <div><div class="rec-title">${esc(h.label)}</div><div class="rec-desc">${esc(h.date)} ${esc(h.time)}</div></div></div>`).join('');
  const hc = _el('history-count'); if (hc) hc.textContent = state.history.length;
  const nb = _el('nav-history-count'); if (nb) { nb.textContent = state.history.length; nb.style.display = state.history.length ? '' : 'none'; }
}
const PRESET_META = [
  { id: 'max-performance', icon: '🚀', name: 'Performance Máxima', desc: 'Todas as otimizações seguras. Ideal para PCs dedicados a jogos.' },
  { id: 'competitive', icon: '🏆', name: 'Jogos Competitivos', desc: 'Latência mínima, prioridade máxima, DVR off.' },
  { id: 'balanced', icon: '⚖️', name: 'Equilibrado', desc: 'Ganho real sem afetar funções do Windows.' },
  { id: 'streaming', icon: '📺', name: 'Streaming', desc: 'Mais CPU/RAM livres para o encoder (OBS).' },
  { id: 'laptop', icon: '💻', name: 'Notebook', desc: 'Equilíbrio entre FPS e bateria/temperatura.' },
];
function renderPerformance() {
  const grid = $('preset-grid');
  if (grid) {
    grid.innerHTML = PRESET_META.map(p => `
      <button class="preset-card card ${state.selectedPreset === p.id ? 'active' : ''}" data-preset="${p.id}">
        <div class="preset-ico">${p.icon}</div><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p>
        <span class="btn btn-secondary btn-sm">Aplicar preset</span>
      </button>`).join('');
    grid.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', async () => {
      state.selectedPreset = b.dataset.preset;
      grid.querySelectorAll('.preset-card').forEach(c => c.classList.toggle('active', c === b));
      await applyPreset(b.dataset.preset);
    }));
  }
  if (state.snapshot) syncPremiumWidgets(state.snapshot, {});
  bindTips($('panel-performance'));
}
function renderMonitorPanel() { if (state.snapshot) syncPremiumWidgets(state.snapshot, {}); bindTips($('panel-monitor'));
  $('btn-monitor-refresh')?.addEventListener('click', async () => {
    toast('🔄 Atualizando monitor...', 'info');
    try { const r = await window.hbDesktop.getSnapshot(); if (r.ok) { state.snapshot = r.snapshot; syncPremiumWidgets(r.snapshot, {}); updateStatCardValues(r.snapshot); } } catch (e) {}
  }, { once: true });
}
function renderServicesPanel() {
  const grid = $('services-grid');
  if (!grid) return;
  const s = state.snapshot;
  const defOn = s && s.windows && /ati|run/i.test(s.windows.state);
  const items = [
    { name: 'Windows Defender', desc: 'Proteção antivírus nativa', on: !!defOn },
    { name: 'Windows Update', desc: 'Atualizações do sistema', on: true, warn: true },
    { name: 'SysMain (Superfetch)', desc: 'Pré-carregamento — seguro desativar em SSD', on: s ? s.ram.pct < 85 : true, warn: true },
    { name: 'Search Indexer', desc: 'Indexação — alto I/O em HDD', on: true, warn: true },
    { name: 'Plano de energia', desc: s ? ('Load CPU ' + (s.cpu.load ?? '—')) : '—', on: true },
    { name: 'Rede / DNS', desc: s ? ('↓' + s.network.rxMBps.toFixed(2) + ' • ↑' + s.network.txMBps.toFixed(2) + ' MB/s') : '—', on: true },
  ];
  grid.innerHTML = items.map(i => `<div class="service-card card"><span class="service-dot ${i.on ? (i.warn ? 'warn' : 'on') : 'off'}"></span><div><h3>${esc(i.name)}</h3><p>${esc(i.desc)}</p></div></div>`).join('');
}
function renderInternetPanel() {
  const s = state.snapshot;
  const list = $('net-opt-list');
  if (list) {
    const netItems = allOptItems().filter(o =>
      /dns|rede|network|tcp|lat[êe]ncia|nagle|winsock|ndu/i.test(o.id + ' ' + (o.name || '') + ' ' + (o.category || ''))
    ).slice(0, 6);
    const show = netItems.length ? netItems : allOptItems().filter(o => o.tier === 'RECOMMENDED').slice(0, 6);
    list.innerHTML = show.map(o => {
      const applied = isOptApplied(o.id);
      return `<div class="opt-card"><div class="opt-card-header"><span class="opt-card-icon">🌐</span><div class="opt-card-name">${esc(o.name)}</div></div><div class="opt-card-desc">${esc(o.summary || '')}</div><div style="display:flex;gap:6px"><button class="btn btn-primary btn-sm" data-apply="${o.id}" ${applied ? 'disabled' : ''}>${applied ? 'Aplicado ✓' : 'Aplicar'}</button></div></div>`;
    }).join('') || '<div class="empty-state"><div class="empty-state-title">Catálogo ainda carregando…</div><div class="empty-state-desc">Aguarde a análise inicial do sistema.</div></div>';
    list.querySelectorAll('[data-apply]').forEach(b => b.addEventListener('click', () => doApply(b.dataset.apply)));
  }
  if (s) syncPremiumWidgets(s, {});
  $('btn-dns-flush')?.addEventListener('click', async () => { if (!licenseGate('limpar o DNS')) return; try { await window.hbDesktop.applyOptimization('flushdns'); toast('✔ DNS limpo', 'success'); } catch (e) { toast('Erro: ' + e.message, 'error'); } }, { once: true });
  $('btn-net-boost')?.addEventListener('click', async () => { if (!licenseGate('otimizar a rede')) return; toast('🚀 Otimizando rede...', 'info'); try { const r = await window.hbDesktop.applyBatch(['flushdns', 'system-responsiveness']); if (r.ok) toast('✔ Rede otimizada', 'success'); } catch (e) { toast('Erro: ' + e.message, 'error'); } }, { once: true });
}
function renderSecurityPanel() { if (state.snapshot) syncPremiumWidgets(state.snapshot, {});
  $('btn-sec-repair')?.addEventListener('click', async () => { if (!licenseGate('reparar o sistema')) return; toast('🔧 Reparando arquivos do Windows...', 'info'); try { await window.hbDesktop.applyBatch(['sfc-dism', 'temp-cleanup']); toast('✔ Reparo concluído', 'success'); } catch (e) { toast('Erro: ' + e.message, 'error'); } }, { once: true });
}
async function runBenchmark() {
  const scoreEl = $('bench-score'), btn = $('btn-benchmark'), qa = $('qa-bench-sub');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Medindo...'; }
  const samples = [];
  for (let i = 0; i < 5; i++) {
    try { const r = await window.hbDesktop.getSnapshot(); if (r.ok) samples.push(r.snapshot); } catch (e) {}
    await new Promise(r => setTimeout(r, 350));
    const pct = ((i + 1) / 5) * 100;
    ['bench-cpu', 'bench-ram', 'bench-disk'].forEach(id => { const el = $(id); if (el) el.style.width = pct + '%'; });
    if (scoreEl) scoreEl.textContent = '…';
  }
  const avg = (f) => samples.length ? samples.reduce((a, s) => a + f(s), 0) / samples.length : 0;
  const cpu = avg(s => s.cpu.usage), ram = avg(s => s.ram.pct), io = avg(s => s.disk.io.readMBps + s.disk.io.writeMBps);
  const score = Math.max(300, Math.round(9500 - cpu * 45 - ram * 30 - Math.min(2000, io * 8)));
  if (scoreEl) scoreEl.textContent = score.toLocaleString('pt-BR');
  if (qa) qa.textContent = 'Score ' + (score / 1000).toFixed(1) + 'k';
  const c = $('bench-cpu'), rm = $('bench-ram'), d = $('bench-disk');
  if (c) c.style.width = Math.min(100, 100 - cpu) + '%';
  if (rm) rm.style.width = Math.min(100, 100 - ram) + '%';
  if (d) d.style.width = Math.min(100, Math.max(8, 100 - io * 2)) + '%';
  addHistory('scan', 'benchmark', 'success', 'Score ' + score);
  toast('✔ Benchmark concluído — Score ' + score.toLocaleString('pt-BR'), 'success');
  if (btn) { btn.disabled = false; btn.textContent = 'Executar novamente'; }
}
function initPremium() {
  initRipple(); bindTips(document);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('global-search')?.focus(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); $('btn-toggle-sidebar')?.click(); }
    if (e.key === 'F5' && !e.shiftKey) { e.preventDefault(); $('btn-refresh')?.click(); }
    if (e.key === 'Escape') { hideTip(); $('search-results')?.classList.add('hidden'); $('notifications-panel')?.classList.add('hidden'); }
  });
  $('qa-grid')?.addEventListener('click', async (e) => {
    const card = e.target.closest('.qa-card'); if (!card) return;
    await handleQuickAction(card.dataset.action, card);
  });
  document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.goto)));
  $('btn-all-quick')?.addEventListener('click', () => { const qa = $('quick-actions'); const shell = $('app-shell'); if (qa) qa.classList.toggle('hidden'); if (shell && qa && !qa.classList.contains('hidden')) { shell.classList.add('sidebar-expanded'); shell.classList.remove('sidebar-collapsed'); } });
  $('btn-sidebar-boost')?.addEventListener('click', () => handleQuickAction('quick-boost'));
  $('btn-perf-boost')?.addEventListener('click', () => handleQuickAction('quick-boost'));
  $('btn-benchmark')?.addEventListener('click', runBenchmark);
  $('btn-optimize-now')?.addEventListener('click', () => paintHealth(state.health ? state.health.score : 0));
  const optSearch = $('opt-search');
  if (optSearch) optSearch.addEventListener('input', () => {
    const q = optSearch.value.toLowerCase();
    document.querySelectorAll('#opt-content .opt-card').forEach(c => {
      c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
  const hSearch = $('history-search');
  if (hSearch) hSearch.addEventListener('input', () => {
    const q = hSearch.value.toLowerCase();
    document.querySelectorAll('#history-list .history-item').forEach(c => {
      c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
  setTimeout(() => { if (state.health) paintHealth(state.health.score); renderRecentMini(); }, 600);
  initAutoUpdate();
  initLicenseGate();
  initOnboarding();
}
const ONBOARD_STEPS = [
  { ico: '⚡', title: 'Bem-vindo ao Honest Boost', desc: 'Otimização profissional para Windows: saúde do sistema, 33 ajustes validados e rollback seguro em cada mudança.' },
  { ico: '🔑', title: 'Ative sua licença', desc: 'Cole sua chave HB- na tela Autenticação. Sem conta, sem complicação — a ativação é vitalícia.', action: 'auth', actionLabel: 'Abrir autenticação' },
  { ico: '🛡', title: 'Primeiro: crie segurança', desc: 'Antes de otimizar, crie um ponto de restauração. Cada otimização também gera snapshot próprio do registro.', action: 'restoration', actionLabel: 'Abrir restauração' },
  { ico: '🚀', title: 'Execute e otimize', desc: 'Rode a varredura de saúde no Dashboard e clique em Otimizar Agora. Itens com selo admin pedem elevação.', action: 'dashboard', actionLabel: 'Ir para o dashboard' },
];
function initOnboarding() {
  let step = 0;
  const overlay = $('onboard-overlay');
  if (!overlay) return;
  // Só no primeiro uso real: sem licença salva e sem tour concluído
  try {
    if (localStorage.getItem('hb.onboarded') === '1' || localStorage.getItem('hb.key')) return;
  } catch (e) { return; }
  const ico = $('onboard-ico'), title = $('onboard-title'), desc = $('onboard-desc'),
    dots = $('onboard-dots'), nextBtn = $('onboard-next'), nextLabel = $('onboard-next-label'),
    skipBtn = $('onboard-skip');
  const finish = () => {
    try { localStorage.setItem('hb.onboarded', '1'); } catch (e) {}
    overlay.classList.add('hidden');
  };
  const paint = () => {
    const s = ONBOARD_STEPS[step];
    ico.textContent = s.ico; title.textContent = s.title; desc.textContent = s.desc;
    nextLabel.textContent = step === ONBOARD_STEPS.length - 1 ? 'Começar' : (s.action ? s.actionLabel + ' →' : 'Próximo');
    dots.innerHTML = ONBOARD_STEPS.map((_, i) => `<span class="${i === step ? 'on' : ''}"></span>`).join('');
  };
  nextBtn.addEventListener('click', () => {
    const s = ONBOARD_STEPS[step];
    if (step === 0 && s.action === undefined) { step++; paint(); return; }
    if (s.action) navigate(s.action);
    if (step >= ONBOARD_STEPS.length - 1) { finish(); return; }
    step++; paint();
  });
  skipBtn.addEventListener('click', finish);
  paint();
  setTimeout(() => overlay.classList.remove('hidden'), 1500);
}
// ============================================================
// Modo bloqueado: sem licença válida, ações de ESCRITA exigem ativação.
// Leitura (dashboard, gráficos, monitor, varredura, histórico) é livre.
// ============================================================
function isLicensed() {
  const info = state.info;
  if (!info) return false;
  if (info.lifetime) return true;
  if (info.expiryDate) {
    try { if (new Date(info.expiryDate).getTime() < Date.now()) return false; } catch (e) {}
  }
  return true;
}
function licenseGate(actionLabel) {
  if (isLicensed()) return true;
  const overlay = $('license-gate-overlay');
  const desc = $('license-gate-desc');
  if (desc) desc.textContent = actionLabel
    ? `Para ${actionLabel}, ative sua licença. A visualização é livre.`
    : 'Ative sua licença para aplicar otimizações e alterações no sistema. A visualização é livre.';
  if (overlay) overlay.classList.remove('hidden');
  return false;
}
function refreshLockUI() {
  const locked = !isLicensed();
  const banner = $('license-banner');
  if (banner) banner.classList.toggle('hidden', !locked);
  document.body.classList.toggle('locked', locked);
}
function initLicenseGate() {
  $('btn-gate-close')?.addEventListener('click', () => $('license-gate-overlay')?.classList.add('hidden'));
  $('btn-gate-activate')?.addEventListener('click', () => {
    $('license-gate-overlay')?.classList.add('hidden');
    navigate('auth');
  });
  $('btn-gate-plans')?.addEventListener('click', async () => {
    try { await window.hbDesktop.openPlans(); } catch (e) { toast('Erro: ' + e.message, 'error'); }
  });
  $('btn-banner-activate')?.addEventListener('click', () => navigate('auth'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $('license-gate-overlay')?.classList.add('hidden');
  });
  refreshLockUI();
}
function initAutoUpdate() {
  try {
    window.hbDesktop.onUpdateStatus((st) => {
      if (!st) return;
      if (st.stage === 'available') {
        toast(`⬇ Atualização ${st.version || ''} encontrada — baixando…`, 'info');
        addNotification('Atualização disponível', `Versão ${st.version || 'nova'} baixando em segundo plano.`, 'info');
      } else if (st.stage === 'downloaded') {
        toast(`✔ Atualização ${st.version || ''} pronta`, 'success');
        addNotification('Atualização pronta', 'Reinicie o app para aplicar.', 'success');
        if (confirm(`Atualização ${st.version || ''} baixada.\n\nReiniciar agora para aplicar?`)) {
          window.hbDesktop.installUpdate();
        }
      } else if (st.stage === 'error') {
        if (st.message && !/dev|packaged|published|404/i.test(st.message)) toast('Atualização: ' + st.message, 'warning');
      }
    });
  } catch (e) {}
  // Checagem no boot (respeita a configuração; silenciosa se em dia)
  setTimeout(async () => {
    try {
      if (localStorage.getItem('hb.check-version') === 'false') return;
      const res = await window.hbDesktop.checkForUpdates();
      if (res && res.ok && res.available) toast(`⬇ ${res.message}`, 'info');
    } catch (e) {}
  }, 8000);
}
async function handleQuickAction(action, el) {
  if (el) { el.style.transform = 'scale(.94)'; setTimeout(() => el.style.transform = '', 160); }
  switch (action) {
    case 'quick-boost': await runOptimizeNow(); break;
    case 'quick-clean': navigate('cleaning'); ['temp-files', 'prefetch', 'wu-cache', 'thumbnails', 'dns-cache'].forEach(id => state.selectedClean.add(id)); renderCleaning(); toast('✔ Limpeza rápida pré-selecionada', 'success'); break;
    case 'quick-game-boost': if (!licenseGate('ativar o Game Mode')) break; toast('🎮 Ativando Game Mode...', 'info'); try { const r = await window.hbDesktop.applyPreset('competitive'); toast(r.ok ? '✔ Game Mode ativo' : 'Erro', r.ok ? 'success' : 'error'); } catch (e) { toast('Erro: ' + e.message, 'error'); } break;
    case 'quick-flush-dns': if (!licenseGate('limpar o DNS')) break; try { const r = await window.hbDesktop.applyOptimization('flushdns'); if (!r.ok) throw new Error(r.error || 'Falha'); toast('✔ DNS renovado', 'success'); } catch (e) { toast('Erro: ' + e.message, 'error'); } break;
    case 'quick-free-ram': if (!licenseGate('liberar RAM')) break; try { const r = await window.hbDesktop.freeRam(); if (!r.ok) throw new Error(r.error || 'Falha'); toast('✔ ' + (r.message || 'RAM liberada'), 'success'); } catch (e) { toast('Erro: ' + e.message, 'error'); } break;
    case 'quick-restart-explorer': if (!licenseGate('reiniciar o Explorer')) break; try { await window.hbDesktop.restartExplorer(); toast('✔ Explorer reiniciado', 'success'); } catch (e) { toast('Erro: ' + e.message, 'error'); } break;
    case 'quick-benchmark': navigate('dashboard'); setTimeout(runBenchmark, 300); break;
    case 'goto-apps': navigate('apps'); break;
    case 'goto-security': navigate('security'); break;
    case 'goto-restore': navigate('restoration'); break;
  }
}

// ============================================================
// Init
// ============================================================
async function init() {
  buildSidebar();
  initSidebar();
  initQuickActions();
  initGlobalSearch();
  initPremium();

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

  // Otimizar Agora (batch real com progresso + resumo)
  const optimizeBtn = $('btn-optimize-now');
  if (optimizeBtn) optimizeBtn.addEventListener('click', async () => {
    optimizeBtn.disabled = true;
    try { await runOptimizeNow(); }
    finally { if (optimizeBtn) optimizeBtn.disabled = false; }
  });

  // Reiniciar como administrador (otimizações que exigem elevação)
  $('btn-restart-admin')?.addEventListener('click', async () => {
    try {
      const chk = await window.hbDesktop.isAdmin();
      if (chk.admin) { toast('✔ O app já está rodando como administrador', 'success'); return; }
    } catch (e) {}
    if (!confirm('Reiniciar o Honest Boost como administrador?\n(O Windows pedirá confirmação no UAC.)')) return;
    await restartAsAdminFlow();
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
    if (!licenseGate('aplicar otimizações')) return;
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

  // Load auth — revalida a chave no servidor a cada abertura; sem internet,
  // restaura os dados da última verificação (modo offline, sem deslogar).
  try {
    const key = localStorage.getItem('hb.key');
    if (key) {
      const res = await window.hbDesktop.authenticateWithKey(key);
      if (res.ok) {
        state.info = res.info || { name: 'Usuário', plan: res.tier || 'Pro', licenseId: key };
        try { localStorage.setItem('hb.info', JSON.stringify(state.info)); } catch (e) {}
      } else if (res.offline) {
        try {
          const saved = localStorage.getItem('hb.info');
          if (saved) {
            state.info = JSON.parse(saved);
            setTimeout(() => toast('⚠️ Sem conexão — exibindo dados da última verificação', 'warning'), 1200);
          }
        } catch (e) {}
      } else {
        // Chave inválida/expirada no servidor: limpa o login local
        state.info = null;
        localStorage.removeItem('hb.key');
        localStorage.removeItem('hb.info');
        setTimeout(() => toast('⚠️ Sessão inválida: ' + (res.error || 'verifique sua licença'), 'warning'), 1200);
      }
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

  // Catálogo inicial (otimizações) — sem isso a aba fica vazia
  try {
    const res = await window.hbDesktop.getCatalog();
    if (res.ok) {
      state.catalog = res.catalog;
      syncOptCatalog();
      const oc = $('opt-count');
      if (oc) oc.textContent = totalOptCount();
    }
  } catch (e) { /* silent */ }

  renderDashboard();

  // Atualiza o catálogo em segundo plano (o full scan pode demorar alguns segundos)
  refreshCatalog().then(() => {
    try {
      if (document.querySelector('.panel.active')?.id === 'panel-optimizations') renderOptimizationsKeepTab();
      const oc = $('opt-count');
      if (oc) oc.textContent = totalOptCount();
    } catch (e) {}
  });

  // Start polling
  startSnapshotPolling(1500);

  // Notification inicial
  addNotification('Honest Boost iniciado', 'v2.0.0 — Sistema completo de otimização de Windows', 'info');
  updateNotifyBadge();
}

document.addEventListener('DOMContentLoaded', init);
