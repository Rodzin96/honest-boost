/* success.js — post-checkout page.
 *
 * The license key is no longer taken from the URL (it used to be, which meant
 * anyone could fabricate a "valid looking" success page). It is fetched from
 * GET /api/orders/:orderId and only exists once the payment webhook activated
 * the license. */
(function () {
  'use strict';
  var HB = window.HB;

  var orderEl = document.getElementById('order');
  var licenseEl = document.getElementById('license');
  var statusEl = document.getElementById('order-status');
  var titleEl = document.getElementById('success-title');
  var subtitleEl = document.getElementById('success-subtitle');
  var downloadBtn = document.getElementById('downloadInstallerBtn');

  var params = new URLSearchParams(location.search);
  var orderId = params.get('order');
  if (!orderId) {
    try { orderId = sessionStorage.getItem('hb-last-order'); } catch (e) { /* ignore */ }
  }

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'status-badge ' + (kind || 'status-pending');
  }

  if (!orderId) {
    orderEl.textContent = '-';
    licenseEl.textContent = '-';
    setStatus('pedido não identificado');
    if (titleEl) titleEl.textContent = 'Pedido não encontrado';
    if (subtitleEl) subtitleEl.textContent = 'Abra esta página a partir do link enviado após o pagamento.';
    return;
  }

  orderEl.textContent = orderId;

  var attempts = 0;
  var MAX_ATTEMPTS = 20; // ~60s of polling at 3s intervals

  async function poll() {
    attempts++;
    try {
      var out = await HB.api('/api/orders/' + encodeURIComponent(orderId));
      if (out.res.status === 404) {
        licenseEl.textContent = '-';
        setStatus('pedido não encontrado');
        if (titleEl) titleEl.textContent = 'Pedido não encontrado';
        return;
      }
      if (!out.res.ok || !out.data) throw new Error('poll_failed');

      var data = out.data;
      if (data.license) {
        licenseEl.textContent = data.license;
        setStatus('licença ativa', 'status-active');
        if (titleEl) titleEl.textContent = 'Compra Concluída!';
        if (subtitleEl) subtitleEl.textContent = 'Sua licença foi ativada. Cole a chave abaixo na tela Autenticação do app — sem criar conta.';
        if (downloadBtn) downloadBtn.disabled = false;
        return;
      }

      if (data.status === 'pending') {
        licenseEl.textContent = 'aguardando confirmação';
        setStatus('pagamento pendente');
        if (titleEl) titleEl.textContent = 'Pagamento em processamento';
        if (subtitleEl) {
          subtitleEl.textContent = 'Assim que o pagamento for confirmado, sua chave aparecerá aqui automaticamente.';
        }
        if (attempts < MAX_ATTEMPTS) return void setTimeout(poll, 3000);
        if (subtitleEl) {
          subtitleEl.textContent = 'Ainda não recebemos a confirmação. Você receberá a chave por email assim que o pagamento for aprovado.';
        }
        return;
      }

      // refunded / cancelled / failed
      licenseEl.textContent = '-';
      setStatus(data.status || 'indisponível', 'status-error');
      if (titleEl) titleEl.textContent = 'Pagamento não concluído';
      if (subtitleEl) subtitleEl.textContent = 'Não foi possível liberar a licença para este pedido.';
    } catch (err) {
      if (attempts < MAX_ATTEMPTS) return void setTimeout(poll, 3000);
      setStatus('erro ao consultar', 'status-error');
    }
  }

  if (downloadBtn) downloadBtn.disabled = true;
  licenseEl.textContent = 'consultando...';
  poll();
})();
