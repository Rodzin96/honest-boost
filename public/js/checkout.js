/* checkout.js — order summary + checkout session creation.
 * Prices come from GET /api/products so the page can never disagree with the
 * amount the backend actually charges. */
(function () {
  'use strict';

  var HB = window.HB;
  var params = new URLSearchParams(location.search);
  var requestedProduct = params.get('product') || 'pro';
  var selectedProduct = null;

  var nameEl = document.getElementById('product-name');
  var priceEl = document.getElementById('product-price');
  var totalEl = document.getElementById('total-price');
  var msgEl = document.getElementById('msg');
  var payBtn = document.getElementById('payBtn');
  var emailEl = document.getElementById('email');

  // Payment method cards (previously bound with inline onclick attributes).
  document.querySelectorAll('.method-card').forEach(function (cardEl) {
    cardEl.addEventListener('click', function () {
      document.querySelectorAll('.method-card').forEach(function (c) { c.classList.remove('active'); });
      cardEl.classList.add('active');
    });
  });

  function renderProduct(product) {
    selectedProduct = product;
    nameEl.textContent = 'Honest Boost ' + product.name;
    priceEl.textContent = product.price;
    totalEl.textContent = product.price;
  }

  HB.api('/api/products').then(function (out) {
    if (!out.res.ok || !Array.isArray(out.data)) throw new Error('catalog_unavailable');
    var found = out.data.filter(function (p) { return p.id === requestedProduct; })[0] || out.data[0];
    renderProduct(found);
  }).catch(function () {
    nameEl.textContent = 'Indisponível';
    priceEl.textContent = '-';
    totalEl.textContent = '-';
    HB.setMessage(msgEl, 'Não foi possível carregar o plano. Recarregue a página.', 'error');
    payBtn.disabled = true;
  });

  payBtn.addEventListener('click', async function () {
    var email = (emailEl.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      HB.setMessage(msgEl, 'Por favor, insira um e-mail válido.', 'error');
      emailEl.focus();
      return;
    }
    if (!selectedProduct) {
      HB.setMessage(msgEl, 'Plano não carregado. Recarregue a página.', 'error');
      return;
    }

    HB.setLoading(payBtn, true, 'Processando...');
    HB.setMessage(msgEl, '');

    try {
      var out = await HB.api('/api/create-checkout-session', {
        method: 'POST',
        body: { product: selectedProduct.id, email: email }
      });
      if (out.res.ok && out.data && out.data.checkoutUrl) {
        // Keep the order id so success.html can poll for the license.
        try { sessionStorage.setItem('hb-last-order', out.data.orderId); } catch (e) { /* ignore */ }
        window.location.href = out.data.checkoutUrl;
        return;
      }
      HB.setMessage(msgEl, HB.errorMessage(out.data, 'Erro ao iniciar o checkout. Tente novamente.'), 'error');
    } catch (err) {
      HB.setMessage(msgEl, 'Erro de conexão. Tente novamente.', 'error');
    }
    HB.setLoading(payBtn, false);
  });
})();
