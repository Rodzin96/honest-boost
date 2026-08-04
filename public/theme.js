/* theme.js — Modo claro/escuro global (Material 3) */
(function () {
  const STORAGE_KEY = 'hb-theme';
  const root = document.documentElement;

  function getInitialTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch (e) { /* ignore */ }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  function applyTheme(theme, save) {
    root.setAttribute('data-theme', theme);
    const sunBtn = document.getElementById('theme-toggle-sun');
    const moonBtn = document.getElementById('theme-toggle-moon');
    if (sunBtn && moonBtn) {
      if (theme === 'dark') {
        sunBtn.classList.add('active');
        moonBtn.classList.remove('active');
      } else {
        moonBtn.classList.add('active');
        sunBtn.classList.remove('active');
      }
    }
    if (save) {
      try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* ignore */ }
    }
    // Notify other components
    document.dispatchEvent(new CustomEvent('hb-theme-change', { detail: { theme } }));
  }

  function toggleTheme() {
    const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark', true);
  }

  // Expose API
  window.HBTheme = {
    get: () => root.getAttribute('data-theme') || 'light',
    set: (t) => applyTheme(t === 'dark' ? 'dark' : 'light', true),
    toggle: toggleTheme
  };

  // Auto-bind toggle buttons if present
  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', toggleTheme);
    // Bind any elements with class .theme-toggle
    document.querySelectorAll('.theme-toggle:not(#theme-toggle)').forEach(function (el) {
      el.addEventListener('click', toggleTheme);
    });
  });

  // Apply initial theme as early as possible (avoid FOUC)
  applyTheme(getInitialTheme(), false);
})();

