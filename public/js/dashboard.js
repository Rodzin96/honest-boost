/* js/dashboard.js — Dashboard logic for logged-in users */

(function () {
  'use strict';

  // State
  let currentUser = null;
  let keys = [];

  // DOM Elements
  const sidebar = document.getElementById('sidebar');
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  const logoutBtn = document.getElementById('logout-btn');
  const generateKeyBtn = document.getElementById('generate-key-btn');
  const keysList = document.getElementById('keys-list');
  const keysCount = document.getElementById('keys-count');
  const keyModal = document.getElementById('key-modal');
  const closeModalBtns = document.querySelectorAll('#close-modal, #close-modal-btn');
  const copyKeyBtn = document.getElementById('copy-key-btn');
  const generatedKeyEl = document.getElementById('generated-key');
  const keyExpiresEl = document.getElementById('key-expires');

  // Initialize
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    setupTheme();
    setupMobileMenu();
    setupNavigation();
    setupLogout();
    setupKeyGeneration();
    setupModal();

    // Check authentication
    const isAuth = await checkAuth();
    if (!isAuth) {
      window.location.href = '/login.html?next=' + encodeURIComponent(window.location.pathname);
      return;
    }

    // Load data
    await loadAccount();
    await loadKeys();
    await loadUsage();
    await loadActivity();
  }

  // Theme
  function setupTheme() {
    const saved = localStorage.getItem('hb-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);

    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeIcon.textContent = theme === 'dark' ? 'dark_mode' : 'light_mode';
    localStorage.setItem('hb-theme', theme);
  }

  // Mobile Menu
  function setupMobileMenu() {
    mobileMenuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768 && !sidebar.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }

  // Navigation
  function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const panel = item.dataset.panel;
        navigateTo(panel);
      });
    });
  }

  function navigateTo(panelId) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

    const navItem = document.querySelector(`.nav-item[data-panel="${panelId}"]`);
    if (navItem) navItem.classList.add('active');

    const panel = document.getElementById('panel-' + panelId);
    if (panel) panel.classList.add('active');

    // Close mobile menu
    sidebar.classList.remove('open');
  }

  // Logout
  function setupLogout() {
    logoutBtn.addEventListener('click', async () => {
      try {
        await api('/api/logout', { method: 'POST' });
      } catch (e) { /* ignore */ }
      window.location.href = '/login.html';
    });
  }

  // Key Generation
  function setupKeyGeneration() {
    generateKeyBtn.addEventListener('click', generateKey);
  }

  async function generateKey() {
    if (keys.filter(k => k.status === 'active').length >= 3) {
      alert('Você já possui 3 chaves ativas. Revogue uma antes de gerar outra.');
      return;
    }

    generateKeyBtn.disabled = true;
    generateKeyBtn.innerHTML = '<span class="material-symbols-rounded">progress_activity</span> Gerando...';

    try {
      const result = await api('/api/keys', { method: 'POST' });
      if (result.ok) {
        showKeyModal(result.key, result.expiresAt);
        await loadKeys();
        await loadUsage();
        await loadActivity();
      } else {
        alert(result.message || 'Erro ao gerar key.');
      }
    } catch (e) {
      alert('Erro de conexão. Tente novamente.');
    }

    generateKeyBtn.disabled = false;
    generateKeyBtn.innerHTML = '<span class="material-symbols-rounded">add</span> Gerar Nova Key';
  }

  function showKeyModal(key, expiresAt) {
    generatedKeyEl.textContent = key;
    const expires = new Date(expiresAt);
    const now = new Date();
    const diff = expires - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    keyExpiresEl.textContent = `${hours}h ${minutes}min`;
    keyModal.classList.add('open');
  }

  function setupModal() {
    closeModalBtns.forEach(btn => {
      btn.addEventListener('click', () => keyModal.classList.remove('open'));
    });

    keyModal.addEventListener('click', (e) => {
      if (e.target === keyModal) keyModal.classList.remove('open');
    });

    copyKeyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(generatedKeyEl.textContent).then(() => {
        copyKeyBtn.innerHTML = '<span class="material-symbols-rounded">check</span> Copiado!';
        setTimeout(() => {
          copyKeyBtn.innerHTML = '<span class="material-symbols-rounded">content_copy</span> Copiar';
        }, 2000);
      });
    });
  }

  // API Helper
  async function api(url, options = {}) {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    return response.json();
  }

  // Check Auth
  async function checkAuth() {
    try {
      const result = await api('/api/me');
      return result.authenticated;
    } catch (e) {
      return false;
    }
  }

  // Load Account
  async function loadAccount() {
    try {
      const result = await api('/api/account');
      if (result.ok) {
        currentUser = result.user;
        updateUI();
      }
    } catch (e) {
      console.error('Failed to load account:', e);
    }
  }

  function updateUI() {
    if (!currentUser) return;

    const initial = currentUser.username.charAt(0).toUpperCase();
    document.getElementById('user-avatar').textContent = initial;
    document.getElementById('user-name').textContent = currentUser.username;
    document.getElementById('account-avatar').textContent = initial;
    document.getElementById('account-name').textContent = currentUser.username;
    document.getElementById('account-email').textContent = currentUser.username;
    document.getElementById('detail-username').textContent = currentUser.username;
    document.getElementById('detail-email').textContent = currentUser.username;
    document.getElementById('detail-role').textContent = currentUser.role === 'admin' ? 'Administrador' : 'Usuário';
    document.getElementById('detail-created').textContent = new Date(currentUser.createdAt).toLocaleDateString('pt-BR');

    document.getElementById('stat-member-since').textContent = new Date(currentUser.createdAt).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    document.getElementById('stat-optimizations').textContent = currentUser.optimizationsApplied || 0;
  }

  // Load Keys
  async function loadKeys() {
    try {
      const result = await api('/api/keys');
      if (result.ok) {
        keys = result.keys;
        renderKeys();
        document.getElementById('stat-active-keys').textContent = result.activeCount;
        document.getElementById('keys-count').textContent = `${result.activeCount}/3`;
      }
    } catch (e) {
      console.error('Failed to load keys:', e);
    }
  }

  function renderKeys() {
    if (keys.length === 0) {
      keysList.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">key_off</span>
          <p>Nenhuma key ativa</p>
          <p style="font-size:0.85rem;">Clique em "Gerar Nova Key" para começar</p>
        </div>
      `;
      return;
    }

    keysList.innerHTML = keys.map(key => `
      <div class="key-item ${key.status}">
        <div class="key-info">
          <div class="key-prefix">${key.prefix}...</div>
          <div class="key-meta">
            <span><span class="material-symbols-rounded" style="font-size:14px;">schedule</span> ${formatDate(key.createdAt)}</span>
            ${key.expiresAt ? `<span><span class="material-symbols-rounded" style="font-size:14px;">timer_off</span> ${formatDate(key.expiresAt)}</span>` : ''}
            ${key.lastUsedAt ? `<span><span class="material-symbols-rounded" style="font-size:14px;">mouse</span> ${formatDate(key.lastUsedAt)}</span>` : ''}
          </div>
        </div>
        <div class="key-status">
          <span class="status-badge ${key.status}">${getStatusLabel(key.status)}</span>
          ${key.status === 'active' ? `
            <button class="btn btn-ghost btn-sm" onclick="revokeKey('${key.id}')">
              <span class="material-symbols-rounded" style="font-size:16px;">delete</span>
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  window.revokeKey = async function(keyId) {
    if (!confirm('Revogar esta key? O app não poderá mais usá-la.')) return;

    try {
      const result = await api(`/api/keys/${keyId}`, { method: 'DELETE' });
      if (result.ok) {
        await loadKeys();
        await loadUsage();
        await loadActivity();
      }
    } catch (e) {
      alert('Erro ao revogar key.');
    }
  };

  function getStatusLabel(status) {
    const labels = {
      'active': 'Ativa',
      'expired': 'Expirada',
      'revoked': 'Revogada'
    };
    return labels[status] || status;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  // Load Usage
  async function loadUsage() {
    try {
      const result = await api('/api/usage');
      if (result.ok) {
        document.getElementById('usage-opts-total').textContent = result.optimizations.total;
        document.getElementById('usage-opts-unique').textContent = result.optimizations.unique;
        document.getElementById('usage-opts-last').textContent = result.optimizations.lastApplied ? formatDate(result.optimizations.lastApplied) : '—';

        document.getElementById('usage-keys-total').textContent = result.keys.total;
        document.getElementById('usage-keys-active').textContent = result.keys.active;
        document.getElementById('usage-keys-expired').textContent = result.keys.expired;
        document.getElementById('usage-keys-revoked').textContent = result.keys.revoked;
      }
    } catch (e) {
      console.error('Failed to load usage:', e);
    }
  }

  // Load Activity
  async function loadActivity() {
    try {
      const result = await api('/api/account');
      if (result.ok && result.recentActivity) {
        renderActivity(result.recentActivity);
      }
    } catch (e) {
      console.error('Failed to load activity:', e);
    }
  }

  function renderActivity(logs) {
    const list = document.getElementById('activity-list');
    if (logs.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">history</span>
          <p>Nenhuma atividade recente</p>
        </div>
      `;
      return;
    }

    list.innerHTML = logs.map(log => `
      <div class="activity-item">
        <div class="activity-icon">
          <span class="material-symbols-rounded">${getActivityIcon(log.action)}</span>
        </div>
        <div class="activity-info">
          <div class="activity-action">${getActivityLabel(log.action)}</div>
          <div class="activity-time">${formatDate(log.created_at)}</div>
        </div>
      </div>
    `).join('');
  }

  function getActivityIcon(action) {
    const icons = {
      'login': 'login',
      'key.create': 'add_key',
      'key.revoke': 'key_off',
      'key.revoke_all': 'key_off',
      'app.auth_success': 'smartphone',
      'app.auth_failed': 'error',
      'app.optimization': 'auto_fix_high',
      'app.logout': 'logout'
    };
    return icons[action] || 'info';
  }

  function getActivityLabel(action) {
    const labels = {
      'login': 'Login realizado',
      'key.create': 'Key gerada',
      'key.revoke': 'Key revogada',
      'key.revoke_all': 'Todas as keys revogadas',
      'app.auth_success': 'App autenticado',
      'app.auth_failed': 'Falha de autenticação no app',
      'app.optimization': 'Otimização aplicada',
      'app.logout': 'Logout do app'
    };
    return labels[action] || action;
  }

  // Expose navigateTo globally
  window.navigateTo = navigateTo;
})();
