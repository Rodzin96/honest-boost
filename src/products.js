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

/* Optional Stripe catalog Price IDs (one per plan). Set env vars like
 * STRIPE_PRICE_BASIC=price_xxx to charge via catalog prices instead of the
 * inline unit_amount above. Catalog prices are required by Stripe Billing,
 * Invoicing and Tax; once created, keeping the env var set switches the
 * checkout to the real catalog price. */
const stripeEnv = (key) => process.env[`STRIPE_PRICE_${key.toUpperCase()}`] || null;
Object.keys(PRODUCTS).forEach((id) => {
  PRODUCTS[id].stripePriceId = stripeEnv(id);
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
  return Object.values(PRODUCTS).map((p) => ({
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
