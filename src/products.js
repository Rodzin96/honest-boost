/* products.js — single source of truth for the product catalog.
 *
 * The site, the checkout page and the backend all read prices from here. Before
 * this module the amounts were duplicated in public/index.html,
 * public/checkout.html and server.js, which is how the R$ 67 plan ended up
 * charging R$ 47. */

const PRODUCTS = {
  /* TEMP — checkout de teste de suporte (R$ 0,50 Pix). Remover junto com a
   * verificação ponta a ponta. Não indexar. */
   teste: {
    id: 'teste',
    name: 'Teste de Pagamento',
    /* R$ 1,00 = 100 centavos — o MÍNIMO aceito pela InfinitePay para Pix
     * (qualquer valor abaixo de R$ 1,00 é recusado pela API deles). */
    amount: 100,
    seats: 1,
    tagline: 'Teste • R$ 1,00',
    features: [
      'Valor mínimo aceito pelo InfinitePay (Pix)',
      'Apenas para verificação do fluxo de pagamento',
      'Ativa a chave de licença após o pagamento'
    ],
    hidden: true
  },
  basic: {
    id: 'basic',
    name: 'Plano Básico',
    // Amount in cents (BRL).
    amount: 4700,
    seats: 1,
    tagline: '1 PC • Melhor custo-benefício',
    features: [
      'Otimização completa (CPU/RAM)',
      'Game Mode (boost automático)',
      'Mouse Acceleration Off',
      'Suporte por email'
    ]
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    amount: 6700,
    seats: 2,
    tagline: '2 PCs • Para quem joga todo dia',
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
    tagline: 'Até 3 PCs • Performance competitiva',
    features: [
      'Tudo do Starter',
      'G-Sync / FreeSync Tuning',
      'Color Profile Calibration',
      'Suporte Discord VIP'
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
