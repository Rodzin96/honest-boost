/* index.js — renders the pricing cards from GET /api/products.
 *
 * Prices used to be hardcoded in the HTML, which is how "Starter R$ 67" ended up
 * pointing at the R$ 47 product. The catalog is now server-owned. */
(function () {
  'use strict';

  var grid = document.getElementById('pricing-grid');
  if (!grid) return;

  function card(product) {
    var el = document.createElement('div');
    el.className = 'price-card stagger' + (product.featured ? ' featured' : '');

    var features = product.features.map(function (f) {
      return '<li><span class="material-symbols-rounded">check_circle</span> ' + window.HB.escapeHtml(f) + '</li>';
    }).join('');

    el.innerHTML =
      (product.featured ? '<div class="popular-tag">RECOMENDADO</div>' : '') +
      '<h3>' + window.HB.escapeHtml(product.name) + '</h3>' +
      '<div class="price">' + window.HB.escapeHtml(product.price) + '<span>/único</span></div>' +
      '<p class="text-muted" style="font-size:0.9rem;">' + window.HB.escapeHtml(product.tagline) + '</p>' +
      '<ul class="features-list">' + features + '</ul>' +
      '<button class="btn ' + (product.featured ? 'btn-filled' : 'btn-tonal') + ' btn-block purchase" ' +
      'data-product="' + window.HB.escapeHtml(product.id) + '">Comprar ' + window.HB.escapeHtml(product.name) + '</button>';

    el.querySelector('.purchase').addEventListener('click', function () {
      window.location = '/checkout.html?product=' + encodeURIComponent(product.id);
    });
    return el;
  }

  // Barra de versão sempre atual (lê a Release vigente, com fallback estático).
  (function () {
    var el = document.getElementById('version-bar-text');
    var bar = document.getElementById('version-bar');
    if (!el) return;
    window.HB.api('/api/app-version').then(function (out) {
      var v = out && out.data && out.data.version;
      if (!v) return;
      el.textContent = 'V' + v + ' Disponível — ver o que mudou';
      if (bar) bar.setAttribute('aria-label', 'Versão ' + v + ' disponível — ver novidades');
    }).catch(function () {});
  })();

  window.HB.api('/api/products').then(function (out) {
    if (!out.res.ok || !Array.isArray(out.data)) throw new Error('catalog_unavailable');
    grid.innerHTML = '';
    out.data.forEach(function (p) { grid.appendChild(card(p)); });
  }).catch(function () {
    grid.innerHTML = '<div class="card" style="text-align:center;">' +
      '<span class="material-symbols-rounded" style="font-size:2rem;color:var(--error);">error</span>' +
      '<p>Não foi possível carregar os planos. <a href="/checkout.html">Ir para o checkout</a>.</p></div>';
  });
})();

/* Galeria de capturas reais do app (hero). Troca a imagem principal com fade. */
(function () {
  'use strict';
  function init() {
    var main = document.getElementById('hero-shot');
    var caption = document.getElementById('hero-shot-caption');
    var thumbs = document.querySelectorAll('.shot-thumb');
    if (!main || !thumbs.length) return;
    // Precarrega as capturas para a troca ser instantânea.
    thumbs.forEach(function (t) { var im = new Image(); im.src = t.dataset.src; });
    thumbs.forEach(function (t) {
      t.addEventListener('click', function () {
        if (t.classList.contains('active')) return;
        thumbs.forEach(function (x) { x.classList.remove('active'); x.setAttribute('aria-selected', 'false'); });
        t.classList.add('active');
        t.setAttribute('aria-selected', 'true');
        main.classList.add('fading');
        var swap = function () {
          main.src = t.dataset.src;
          main.alt = t.dataset.alt || main.alt;
          if (caption) caption.textContent = t.dataset.caption || '';
          main.classList.remove('fading');
        };
        if (main.complete) setTimeout(swap, 160);
        else { main.onload = swap; setTimeout(swap, 600); }
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
