/* js/dashboard.js — Dashboard logic for logged-in users */

(function () {
  'use strict';

  let currentUser = null;
  let keys = [];

  const sidebar = document.getElementById('sidebar');
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

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    setupTheme();
    setupNavigation();
    setupLogout();
    setupKeyGeneration();
    setupModal();

    const authInfo = await checkAuth();
    if (!authInfo.authenticated) {
      window.location.href = '/login.html?next=' + encodeURIComponent(window.location.pathname);
      return;
    }

    currentUser = authInfo.user || null;
    updateUI();
    await loadKeys();
    renderUsageFallback();
    renderActivityFallback();
  }

  function setupTheme() {
    const saved = localStorage.getItem('hb-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);

    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        applyTheme(current === 'dark' ? 'light' : 'dark');
      });
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeIcon) themeIcon.textContent = theme === 'dark' ? 'dark_mode' : 'light_mode';
    localStorage.setItem('hb-theme', theme);
  }

  function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        navigateTo(item.dataset.panel);
      });
    });
  }

  function navigateTo(panelId) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

    const navItem = document.querySelector('.nav-item[data-panel="' + panelId + '"]');
    if (navItem) navItem.classList.add('active');

    const panel = document.getElementById('panel-' + panelId);
    if (panel) panel.classList.add('active');
  }

  function setupLogout() {
    if (!logoutBtn) return;
    logoutBtn.addEventListener('click', async () => {
      try {
        await api('/api/logout', { method: 'POST' });
      } catch (e) {
        /* ignore */
      }
      window.location.href = '/login.html';
    });
  }

  function setupKeyGeneration() {
    if (!generateKeyBtn) return;
    generateKeyBtn.addEventListener('click', generateKey);
  }

  async function generateKey() {
    const activeKeys = keys.filter(k => k.status === 'active').length;
    if (activeKeys >= 3) {
      window.alert('Você já possui 3 chaves ativas. Revogue uma antes de gerar outra.');
      return;
    }

    generateKeyBtn.disabled = true;
    generateKeyBtn.innerHTML = '<span class="material-symbols-rounded">progress_activity</span> Gerando...';

    try {
      const result = await api('/api/keys', { method: 'POST' });
      if (result.ok) {
        showKeyModal(result.key, result.expiresAt);
        await loadKeys();
      } else {
        window.alert(result.error || 'Erro ao gerar key.');
      }
    } catch (e) {
      window.alert('Erro de conexão. Tente novamente.');
    }

    generateKeyBtn.disabled = false;
    generateKeyBtn.innerHTML = '<span class="material-symbols-rounded">add</span> Gerar nova key';
  }

  function showKeyModal(key, expiresAt) {
    if (!generatedKeyEl || !keyModal) return;
    generatedKeyEl.textContent = key;
    const expires = new Date(expiresAt);
    const now = new Date();
    const diff = expires - now;
    const hours = Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
    const minutes = Math.max(0, Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)));
    if (keyExpiresEl) keyExpiresEl.textContent = hours + 'h ' + minutes + 'min';
    keyModal.classList.add('open');
  }

  function setupModal() {
    closeModalBtns.forEach(btn => {
      btn.addEventListener('click', () => keyModal.classList.remove('open'));
    });

    if (keyModal) {
      keyModal.addEventListener('click', (e) => {
        if (e.target === keyModal) keyModal.classList.remove('open');
      });
    }

    if (copyKeyBtn) {
      copyKeyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(generatedKeyEl.textContent).then(() => {
          copyKeyBtn.innerHTML = '<span class="material-symbols-rounded">check</span> Copiado';
          setTimeout(() => {
            copyKeyBtn.innerHTML = '<span class="material-symbols-rounded">content_copy</span> Copiar';
          }, 1800);
        });
      });
    }
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    return response.json();
  }

  async function checkAuth() {
    try {
      return await api('/api/me');
    } catch (e) {
      return { authenticated: false };
    }
  }

  function updateUI() {
    if (!currentUser) return;

    // "nickname" is the display name chosen at registration; "username" is
    // the account's email (used for login, not meant to be shown as the
    // person's name in the UI).
    const displayName = currentUser.nickname || currentUser.username || 'Usuário';
    const email = currentUser.username || '—';
    const initial = displayName.charAt(0).toUpperCase();
    const createdAt = currentUser.createdAt ? new Date(currentUser.createdAt) : null;
    const createdText = createdAt && !isNaN(createdAt.getTime())
      ? createdAt.toLocaleDateString('pt-BR')
      : '—';
    const memberSince = createdAt && !isNaN(createdAt.getTime())
      ? createdAt.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
      : '—';

    setText('user-avatar', initial);
    setText('user-name', displayName);
    setText('account-avatar', initial);
    setText('account-name', displayName);
    setText('account-email', email);
    setText('detail-username', displayName);
    setText('detail-email', email);
    setText('detail-role', currentUser.role === 'admin' ? 'Administrador' : 'Usuário');
    setText('detail-created', createdText);
    setText('stat-member-since', memberSince);
    setText('stat-optimizations', '—');
  }

  async function loadKeys() {
    try {
      const result = await api('/api/keys');
      if (result.ok) {
        keys = (result.keys || []).map(normalizeKey);
        renderKeys();
        const activeCount = keys.filter(k => k.status === 'active').length;
        setText('stat-active-keys', String(activeCount));
        setText('keys-count', activeCount + '/3');
        renderUsageFromKeys();
      }
    } catch (e) {
      renderKeysError();
    }
  }

  function normalizeKey(key) {
    return {
      id: key.id,
      prefix: key.key_prefix || key.prefix || 'hb_****',
      createdAt: key.created_at || key.createdAt || null,
      expiresAt: key.expires_at || key.expiresAt || null,
      lastUsedAt: key.last_used_at || key.lastUsedAt || null,
      status: key.status || 'active'
    };
  }

  function renderKeys() {
    if (!keysList) return;

    if (keys.length === 0) {
      keysList.innerHTML = [
        '<div class="empty-state">',
        '<span class="material-symbols-rounded">key_off</span>',
        '<p>Nenhuma key ativa</p>',
        '<p style="font-size:0.85rem;">Gere uma nova key para começar.</p>',
        '</div>'
      ].join('');
      return;
    }

    keysList.innerHTML = keys.map(function (key) {
      return [
        '<div class="key-item ' + escapeHtml(key.status) + '">',
        '<div class="key-info">',
        '<div class="key-prefix">' + escapeHtml(key.prefix) + '...</div>',
        '<div class="key-meta">',
        '<span><span class="material-symbols-rounded" style="font-size:14px;">schedule</span> ' + escapeHtml(formatDate(key.createdAt)) + '</span>',
        key.expiresAt ? '<span><span class="material-symbols-rounded" style="font-size:14px;">timer_off</span> ' + escapeHtml(formatDate(key.expiresAt)) + '</span>' : '',
        key.lastUsedAt ? '<span><span class="material-symbols-rounded" style="font-size:14px;">touch_app</span> ' + escapeHtml(formatDate(key.lastUsedAt)) + '</span>' : '',
        '</div>',
        '</div>',
        '<div class="key-status">',
        '<span class="status-badge ' + escapeHtml(key.status) + '">' + escapeHtml(getStatusLabel(key.status)) + '</span>',
        key.status === 'active'
          ? '<button class="btn btn-outlined" style="padding:0.55rem 0.85rem;" onclick="revokeKey(\'' + escapeHtml(key.id) + '\')"><span class="material-symbols-rounded" style="font-size:16px;">delete</span></button>'
          : '',
        '</div>',
        '</div>'
      ].join('');
    }).join('');
  }

  function renderKeysError() {
    if (!keysList) return;
    keysList.innerHTML = [
      '<div class="empty-state">',
      '<span class="material-symbols-rounded">error</span>',
      '<p>Não foi possível carregar suas keys</p>',
      '<p style="font-size:0.85rem;">Tente recarregar a página.</p>',
      '</div>'
    ].join('');
  }

  window.revokeKey = async function (keyId) {
    if (!window.confirm('Revogar esta key? O app não poderá mais usá-la.')) return;

    try {
      const result = await api('/api/keys/' + encodeURIComponent(keyId), { method: 'DELETE' });
      if (result.ok) await loadKeys();
      else window.alert('Não foi possível revogar a key.');
    } catch (e) {
      window.alert('Erro ao revogar key.');
    }
  };

  function renderUsageFromKeys() {
    const total = keys.length;
    const active = keys.filter(k => k.status === 'active').length;
    const expired = keys.filter(k => keyExpired(k)).length;
    const revoked = keys.filter(k => k.status === 'revoked').length;
    const lastUsed = keys
      .map(k => k.lastUsedAt)
      .filter(Boolean)
      .sort()
      .pop();

    setText('usage-opts-total', '—');
    setText('usage-opts-unique', '—');
    setText('usage-opts-last', 'Sem endpoint disponível');
    setText('usage-keys-total', String(total));
    setText('usage-keys-active', String(active));
    setText('usage-keys-expired', String(expired));
    setText('usage-keys-revoked', String(revoked));

    renderActivityFromKeys(lastUsed);
  }

  function renderUsageFallback() {
    setText('usage-opts-total', '—');
    setText('usage-opts-unique', '—');
    setText('usage-opts-last', 'Sem dados');
    setText('usage-keys-total', '0');
    setText('usage-keys-active', '0');
    setText('usage-keys-expired', '0');
    setText('usage-keys-revoked', '0');
  }

  function renderActivityFallback() {
    const list = document.getElementById('activity-list');
    if (!list) return;
    list.innerHTML = [
      '<div class="empty-state">',
      '<span class="material-symbols-rounded">info</span>',
      '<p>Atividade detalhada ainda não está disponível nesta versão.</p>',
      '<p style="font-size:0.85rem;">As informações exibidas abaixo serão baseadas nas suas keys quando possível.</p>',
      '</div>'
    ].join('');
  }

  function renderActivityFromKeys(lastUsed) {
    const list = document.getElementById('activity-list');
    if (!list) return;

    const items = [];
    const activeCount = keys.filter(k => k.status === 'active').length;
    items.push({ icon: 'key', title: 'Resumo de keys ativas', time: activeCount + ' em uso no momento' });

    if (lastUsed) {
      items.push({ icon: 'touch_app', title: 'Último uso registrado', time: formatDate(lastUsed) });
    }

    const newest = keys
      .map(k => k.createdAt)
      .filter(Boolean)
      .sort()
      .pop();

    if (newest) {
      items.push({ icon: 'schedule', title: 'Key mais recente gerada', time: formatDate(newest) });
    }

    if (!items.length) {
      renderActivityFallback();
      return;
    }

    list.innerHTML = items.map(function (item) {
      return [
        '<div class="activity-item">',
        '<div class="activity-icon"><span class="material-symbols-rounded">' + escapeHtml(item.icon) + '</span></div>',
        '<div class="activity-info">',
        '<div class="activity-action">' + escapeHtml(item.title) + '</div>',
        '<div class="activity-time">' + escapeHtml(item.time) + '</div>',
        '</div>',
        '</div>'
      ].join('');
    }).join('');
  }

  function getStatusLabel(status) {
    const labels = {
      active: 'Ativa',
      expired: 'Expirada',
      revoked: 'Revogada'
    };
    return labels[status] || status;
  }

  function keyExpired(key) {
    return Boolean(key.expiresAt) && new Date(key.expiresAt).getTime() < Date.now();
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.navigateTo = navigateTo;
})();
