/* products.js — single source of truth for the product catalog.
 *
 * The site, the checkout page and the backend all read prices from here. Before
 * this module the amounts were duplicated in public/index.html,
 * public/checkout.html and server.js, which is how the R$ 67 plan ended up
 * charging R$ 47. */

const PRODUCTS = {
  basic: {
    id: 'basic',
    name: 'Plano Básico',
    // Amount in cents (BRL).
    amount: 4700,
    seats: 1,
    tagline: '1 PC • Vale até formatar',
    features: [
      'Licença vinculada ao seu Windows atual',
      'Faxina profunda no sistema',
      'Mais FPS na hora',
      'Mouse e teclado com resposta mais rápida',
      'Painel simples, sem complicação',
      'Suporte direto no WhatsApp'
    ]
  },
  /* Legado: oculto do catálogo público desde a reestruturação Básico + Pro.
   * Mantido para que pedidos e licenças Starter já emitidos continuem
   * válidos (webhook, success page e ativação resolvem via getProduct). */
  starter: {
    id: 'starter',
    name: 'Starter',
    amount: 6700,
    seats: 2,
    tagline: '2 PCs • Para quem joga todo dia',
    hidden: true,
    features: [
      'Tudo do Plano Básico',
      'Polling Rate 1000Hz',
      'Refresh Rate Boost',
      'Perfis mais rápidos por jogo'
    ]
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    amount: 9700,
    seats: 3,
    featured: true,
    tagline: 'Acesso vitalício • Pagamento único',
    features: [
      'Tudo do Plano Básico',
      'Licença vitalícia, sem mensalidade',
      'Otimização que permanece ativa',
      'Faxina profunda completa',
      'Painel simples e direto',
      'Input lag reduzido na hora',
      'Suporte prioritário no WhatsApp'
    ]
  }
};

/* Optional Stripe catalog Price IDs (one per plan). The live Stripe Prices
 * below are the defaults created for this account; set the env vars
 * (STRIPE_PRICE_BASIC, STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO) to override
 * them (e.g. after recreating prices in a different environment). */
const STRIPE_PRICE_DEFAULTS = {
  basic: 'price_1UH5VZ00k72XFvlldqIARWTR',
  starter: 'price_1UH5VZ00k72XFvllHqh1IOlx',
  pro: 'price_1UH5Va00k72XFvlllav1oYNv'
};
const stripeEnv = (key) => process.env[`STRIPE_PRICE_${key.toUpperCase()}`] || null;
Object.keys(PRODUCTS).forEach((id) => {
  PRODUCTS[id].stripePriceId = stripeEnv(id) || STRIPE_PRICE_DEFAULTS[id] || null;
});

/** @param {string} id */
function isValidProduct(id) {
  return Object.prototype.hasOwnProperty.call(PRODUCTS, id);
}

/** @param {string} id @returns {object|null} */
function getProduct(id) {
  return isValidProduct(id) ? PRODUCTS[id] : null;
}

/** Format an amount in cents as Brazilian currency. */
function formatBRL(amountInCents) {
  return `R$ ${(amountInCents / 100).toFixed(2).replace('.', ',')}`;
}

/** Catalog shape exposed to the browser via GET /api/products. */
function publicCatalog() {
  return Object.values(PRODUCTS)
    .filter(function (p) { return !p.hidden; })
    .map((p) => ({
    id: p.id,
    name: p.name,
    amount: p.amount,
    price: formatBRL(p.amount),
    seats: p.seats,
    tagline: p.tagline,
    features: p.features,
    featured: Boolean(p.featured)
  }));
}

module.exports = { PRODUCTS, isValidProduct, getProduct, formatBRL, publicCatalog };
