/* theme-init.js — applied synchronously in <head> to avoid a theme flash (FOUC).
 * Must stay an external file: the CSP forbids inline scripts. */
(function () {
  try {
    var t = localStorage.getItem('hb-theme');
    if (t !== 'light' && t !== 'dark') {
      t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
