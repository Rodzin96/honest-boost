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
