# Honest BOOST — Estrutura de Arquivos Públicos

## Visão Geral
Site institucional + painel de licenças do Honest BOOST, servidos pelo Express (`server.js`).
Frontend estático em `public/` com design dark premium, mobile-first e sem claims falsos de performance.

## Estrutura de Arquivos

### Páginas
- **index.html** — Landing page principal (hero, recursos, FAQ, CTA)
- **download.html** — Download do instalador + requisitos de sistema
- **checkout.html** — Revisão do pedido (redireciona ao Checkout Stripe)
- **success.html** — Página de confirmação pós-pagamento (lê `/checkout/success/:orderId`)
- **login.html** / **register.html** — Auth (email+senha e Google OAuth)
- **reset-request.html** / **reset.html** — Recuperação de senha
- **dashboard.html** — Licença + status do usuário (servida em `/dashboard`)
- **admin.html** — Painel de licenças (servida em `/admin`, Basic Auth)
- **primeiro-uso.html** — Guia do SmartScreen/primeira execução
- **help.html** — Dúvidas e suporte
- **contact.html**, **terms.html**, **privacy.html**, **refund.html** — Legal e contato
- **planos.html**, **recursos.html**, **comparativo.html** — Marketing suplementar
- **robots.txt**, **sitemap.xml** — SEO

> Páginas legadas (`*-honest.html` duplicadas, `index-premium.html`, `index.hb.html`, `app.html`,
> `changelog.html`) foram removidas. Links antigos são redirecionados com 301 no `server.js`
> (`LEGACY_REDIRECTS`).

### Assets & Configuração
- **styles.css** — Estilos únicos do site (dark premium, CSS variables)
- **js/hb.js** — Wrapper global (`H$`) com chamadas de API e helpers
- **js/index.js**, **js/dashboard.js**, **js/login.js**, **js/register.js**, **js/checkout.js**,
  **js/contact.js**, **js/success.js**, **js/reset.js**, **js/reset-request.js** — Lógica por página
- **logo.svg**, **assets/** — Identidade visual (logotipos, ícones SVG)
- **manifest.json** — Web App Manifest (PWA)

> Assets legados do design "honest" (`styles-honest.css`, `theme-honest.js`, `hb.css`,
> `hb-polish.css`, `init.js`, `redirects.js`, `theme.js`, `config.js`, `validate.js`) foram
> removidos: nenhuma página os usava.

## Endpoints do Backend (`server.js`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Verificação de saúde |
| GET | `/api/products` | Preços/planos |
| POST | `/api/register` | Registro de usuário |
| POST | `/api/login` | Login (sessão) |
| POST | `/api/logout` | Logout |
| GET | `/api/me` | Usuário autenticado |
| POST | `/api/password-reset-request` | Solicitar reset (email/token) |
| POST | `/api/password-reset-confirm` | Aplicar novo token+senha |
| GET | `/api/download` | Metadados de download (auth) |
| POST | `/api/keys` | Gerar license key (auth) |
| GET | `/api/keys` | Listar keys (auth) |
| POST | `/api/app/auth` | Auth do app desktop |
| POST | `/api/create-checkout-session` | Criar Checkout Stripe |
| POST | `/webhook` | Confirmação de pagamento Stripe |
| GET | `/checkout/success/:orderId` | Confirmação de compra |
| GET | `/api/orders/:orderId` | Status do pedido (admin/owner/cookie) |
| GET | `/api/orders` | Lista pedidos (admin) |
| GET/POST | `/api/licenses` | Gerar/listar licenças (admin) |
| POST | `/api/licenses/verify` | Validar licença |
| GET | `/dashboard` `/admin` | Páginas autenticadas |

## Segurança & Conformidade
- **CSP/Helmet**, rate limiting por rota, sessão assinada (`SESSION_SECRET` ≥ 32 chars).
- **LGPD**: `privacy.html` com direitos do usuário; **CORS** restrito.
- Claims de marketing ficaram factuals (sem "+45% FPS" ou "10K+ usuários").
- **Purgado do histórico Git** todo dado sensível (bancos, cookies, build, `.env`).

## Próximas Etapas
1. Publicar o instalador Windows em GitHub Release (auto-update já configurado no `desktop/`).
2. Configurar Checkout Stripe em produção (variáveis + webhook).
3. Dominio próprio + atualizar `sitemap.xml`/`robots.txt`/OG tags (hoje apontam para a URL do Railway).