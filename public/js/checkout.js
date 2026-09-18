/* checkout.js — order summary + checkout session creation.
 * Prices come from GET /api/products so the page can never disagree with the
 * amount the backend actually charges. Payment methods map to providers: Pix
 * → InfinitePay (infinitepay), card → Stripe (stripe). Unavailable providers
 * are disabled based on GET /api/payment-methods. */
(function () {
  'use strict';

  var HB = window.HB;
  var params = new URLSearchParams(location.search);
  var requestedProduct = params.get('plan') || params.get('product') || 'pro';
  var selectedProduct = null;

  var nameEl = document.getElementById('product-name');
  var priceEl = document.getElementById('product-price');
  var totalEl = document.getElementById('total-price');
  var msgEl = document.getElementById('msg');
  var payBtn = document.getElementById('payBtn');
  var emailEl = document.getElementById('email');

  var methodCards = Array.prototype.slice.call(document.querySelectorAll('.method-card'));

  function activeProvider() {
    for (var i = 0; i < methodCards.length; i++) {
      if (methodCards[i].classList.contains('active')) {
        return methodCards[i].getAttribute('data-provider') || 'stripe';
      }
    }
    return 'stripe';
  }

  methodCards.forEach(function (cardEl) {
    cardEl.addEventListener('click', function () {
      if (cardEl.classList.contains('disabled')) return;
      methodCards.forEach(function (c) {
        c.classList.remove('active');
        c.setAttribute('aria-pressed', 'false');
      });
      cardEl.classList.add('active');
      cardEl.setAttribute('aria-pressed', 'true');
    });
  });

  // Hide/disable methods whose provider is not configured on the backend.
  HB.api('/api/payment-methods').then(function (out) {
    var available = (out.res.ok && out.data) || {};
    methodCards.forEach(function (card) {
      var provider = card.getAttribute('data-provider');
      if (provider && !available[provider]) {
        card.classList.add('disabled');
        card.setAttribute('aria-disabled', 'true');
        card.setAttribute('tabindex', '-1');
      }
    });
    var activeCard = document.querySelector('.method-card.active');
    if (activeCard && activeCard.classList.contains('disabled')) {
      activeCard.classList.remove('active');
      activeCard.setAttribute('aria-pressed', 'false');
      var fallback = methodCards.filter(function (c) { return !c.classList.contains('disabled'); })[0];
      if (fallback) {
        fallback.classList.add('active');
        fallback.setAttribute('aria-pressed', 'true');
      } else {
        payBtn.disabled = true;
        HB.setMessage(msgEl, 'Nenhuma forma de pagamento disponível no momento.', 'error');
      }
    }
  }).catch(function () {
    /* Keep the default selection; the backend still validates the provider. */
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
        body: { product: selectedProduct.id, email: email, provider: activeProvider() }
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