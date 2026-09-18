/* src/infinitepay.js — InfinitePay Checkout Integrado client.
 *
 * Docs: https://www.infinitepay.io/checkout-documentacao
 * Hosted checkout: we create a payment link server-side and redirect the
 * customer to the returned URL. Payment status is confirmed server-side via
 * payment_check (their webhook carries no cryptographic signature, so it is
 * never trusted directly). Amounts are always in BRL cents. Uses global fetch
 * (Node >= 18). */

const API_BASE = 'https://api.checkout.infinitepay.io';

async function post(path, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`InfinitePay ${path} failed with HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Create a hosted payment link. Items are { quantity, price (cents), description }. */
function createCheckoutLink({ handle, items, orderNsu, redirectUrl, webhookUrl, customer }) {
  const payload = { handle, items };
  if (orderNsu) payload.order_nsu = orderNsu;
  if (redirectUrl) payload.redirect_url = redirectUrl;
  if (webhookUrl) payload.webhook_url = webhookUrl;
  if (customer) payload.customer = customer;
  return post('/links', payload).then((data) => ({
    url: data.url || data.checkout_url || null,
    raw: data
  }));
}

/** Confirm whether a payment actually happened before granting a license. */
function checkPayment({ handle, orderNsu, transactionNsu, slug }) {
  return post('/payment_check', {
    handle,
    order_nsu: orderNsu,
    transaction_nsu: transactionNsu,
    slug
  });
}

module.exports = { createCheckoutLink, checkPayment };