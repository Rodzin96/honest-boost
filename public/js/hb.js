/* hb.js — behaviour shared by every page.
 *
 * Loaded with `defer` on all pages. Each block is guarded so the same file works
 * on pages that don't have the corresponding markup.
 *
 * Exposes window.HB with small helpers reused by the page-specific scripts. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- utilities
  /** Escape text before it goes anywhere near innerHTML. */
  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** fetch + JSON with credentials, returning { res, data }. */
  async function api(url, options) {
    var opts = Object.assign({ credentials: 'same-origin' }, options || {});
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
      opts.body = JSON.stringify(opts.body);
    }
    var res = await fetch(url, opts);
    var data = null;
    try { data = await res.json(); } catch (e) { /* empty or non-JSON body */ }
    return { res: res, data: data };
  }

  /** Human-readable message for a backend error code. */
  var ERROR_MESSAGES = {
    invalid_credentials: 'Usuário ou senha incorretos.',
    missing_fields: 'Preencha todos os campos.',
    user_already_exists: 'Este email já está cadastrado.',
    validation_error: 'Verifique os dados informados.',
    username_must_be_email: 'Informe um email válido.',
    password_too_short: 'A senha deve ter no mínimo 8 caracteres.',
    too_many_attempts: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    invalid_token: 'Token inválido.',
    token_expired: 'Token expirado. Solicite um novo.',
    invalid_password: 'A senha deve ter entre 8 e 200 caracteres.',
    invalid_email: 'Informe um email válido.',
    invalid_license: 'Licença inválida ou inativa.',
    license_required: 'É necessária uma licença ativa para continuar.',
    device_limit_reached: 'Você atingiu o limite de dispositivos do seu plano.',
    download_not_available: 'O instalador ainda não está disponível.',
    email_required: 'Informe seu email.',
    nickname_required: 'Escolha um nome de usuário (apelido).',
    nickname_invalid_length: 'O nome de usuário deve ter entre 2 e 30 caracteres.',
    passwords_do_not_match: 'As senhas informadas não coincidem.',
    checkout_not_configured: 'Checkout indisponível no momento. Tente novamente mais tarde.',
    invalid_product: 'Plano inválido.',
    order_not_found: 'Pedido não encontrado.',
    forbidden: 'Você não tem permissão para acessar isto.',
    not_authenticated: 'Faça login para continuar.',
    internal_error: 'Erro interno. Tente novamente.',
    database_not_ready: 'O serviço está inicializando ou sem conexão com o banco de dados. Tente novamente em instantes.'
  };
  function errorMessage(data, fallback) {
    if (!data) return fallback || 'Erro inesperado. Tente novamente.';
    if (data.fields && data.fields.length && ERROR_MESSAGES[data.fields[0]]) {
      return ERROR_MESSAGES[data.fields[0]];
    }
    return ERROR_MESSAGES[data.error] || fallback || 'Erro inesperado. Tente novamente.';
  }

  /** Show a message in a status container. Text only — never HTML. */
  function setMessage(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.className = kind || '';
  }

  /** Swap a button into/out of a loading state, preserving its markup. */
  function setLoading(btn, loading, label) {
    if (!btn) return;
    if (loading) {
      if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:20px;">progress_activity</span> ' + escapeHtml(label || 'Aguarde...');
    } else {
      btn.disabled = false;
      if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
    }
  }

  // -------------------------------------------------------------------- theme
  function applyTheme(theme, save) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('#theme-toggle, .theme-toggle').forEach(function (btn) {
      btn.setAttribute('data-state', theme);
      var sun = btn.querySelector('.sun');
      var moon = btn.querySelector('.moon');
      if (sun) sun.style.display = theme === 'light' ? 'inline-block' : 'none';
      if (moon) moon.style.display = theme === 'dark' ? 'inline-block' : 'none';
    });
    if (save) { try { localStorage.setItem('hb-theme', theme); } catch (e) { /* ignore */ } }
    document.dispatchEvent(new CustomEvent('hb-theme-change', { detail: { theme: theme } }));
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function initTheme() {
    applyTheme(currentTheme(), false);
    document.querySelectorAll('#theme-toggle, .theme-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
      });
    });
  }

  // ----------------------------------------------------------------- chrome
  function initHeader() {
    var header = document.getElementById('app-header');
    if (header) {
      var onScroll = function () {
        if (window.scrollY > 10) header.classList.add('scrolled');
        else header.classList.remove('scrolled');
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    var navToggle = document.getElementById('nav-toggle');
    var navLinks = document.getElementById('nav-links');
    if (navToggle && navLinks) {
      navToggle.addEventListener('click', function () {
        var expanded = navToggle.getAttribute('aria-expanded') === 'true';
        navToggle.setAttribute('aria-expanded', String(!expanded));
        navLinks.classList.toggle('show');
      });
      navLinks.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          navLinks.classList.remove('show');
          navToggle.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  // ------------------------------------------------------------------- auth
  /**
   * Reflect the session in the header: replace the "Entrar" link with the user
   * identity plus a logout button. Previously the header always showed "Entrar"
   * and there was no way to log out from the UI at all.
   */
  async function initAuthState() {
    var slots = document.querySelectorAll('.header-actions');
    if (!slots.length) return;

    var result = await api('/api/me').catch(function () { return { data: null }; });
    var info = result.data;
    if (!info || !info.authenticated) return;

    slots.forEach(function (slot) {
      var loginLink = slot.querySelector('a[href$="login.html"]');
      var wrap = document.createElement('div');
      wrap.className = 'auth-chip';
      wrap.style.display = 'flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '0.5rem';

      if (info.user.role === 'admin') {
        var adminLink = document.createElement('a');
        adminLink.href = '/admin';
        adminLink.className = 'btn btn-text';
        adminLink.innerHTML = '<span class="material-symbols-rounded">admin_panel_settings</span> Admin';
        wrap.appendChild(adminLink);
      }

      var who = document.createElement('span');
      who.className = 'text-muted';
      who.style.fontSize = '0.85rem';
      who.textContent = info.user.nickname || info.user.username;
      wrap.appendChild(who);

      var logout = document.createElement('button');
      logout.type = 'button';
      logout.className = 'btn btn-outlined';
      logout.style.padding = '0.5rem 1.1rem';
      logout.innerHTML = '<span class="material-symbols-rounded">logout</span> Sair';
      logout.addEventListener('click', async function () {
        setLoading(logout, true, 'Saindo...');
        await api('/api/logout', { method: 'POST' }).catch(function () {});
        window.location = '/';
      });
      wrap.appendChild(logout);

      if (loginLink) slot.replaceChild(wrap, loginLink);
      else slot.appendChild(wrap);
    });
  }

  // --------------------------------------------------------------- download
  /** Wire any [data-hb-download] element to the protected download endpoint. */
  function initDownloadButtons() {
    document.querySelectorAll('[data-hb-download]').forEach(function (btn) {
      btn.addEventListener('click', async function (e) {
        e.preventDefault();
        setLoading(btn, true, 'Preparando...');
        try {
          var out = await api('/api/download');
          if (out.res.status === 401) {
            window.location = (out.data && out.data.loginUrl) || '/login.html';
            return;
          }
          if (!out.res.ok || !out.data || !out.data.url) throw new Error('download_failed');
          var a = document.createElement('a');
          a.href = out.data.url;
          a.download = out.data.filename || '';
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch (err) {
          window.alert('Não foi possível iniciar o download. Tente novamente.');
        } finally {
          setLoading(btn, false);
        }
      });
    });
  }

  // --------------------------------------------------------------- purchase
  /** Purchase buttons route to the checkout page carrying the product id. */
  function initPurchaseButtons() {
    document.querySelectorAll('.purchase[data-product]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        window.location = '/checkout.html?product=' + encodeURIComponent(btn.dataset.product);
      });
    });
  }

  // ------------------------------------------------------------------ export
  window.HB = {
    api: api,
    escapeHtml: escapeHtml,
    errorMessage: errorMessage,
    setMessage: setMessage,
    setLoading: setLoading,
    applyTheme: applyTheme,
    currentTheme: currentTheme
  };

  function init() {
    initTheme();
    initHeader();
    initDownloadButtons();
    initPurchaseButtons();
    initAuthState();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
