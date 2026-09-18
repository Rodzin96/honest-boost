# Honest BOOST — Guia de Acesso Rápido

## Servidor em Execução

**URL Base**: http://localhost:3000

### Páginas Acessíveis

| Página | URL | Descrição |
|--------|-----|-----------|
| Landing Principal | http://localhost:3000 | Hero, recursos, FAQ, CTA |
| Planos | http://localhost:3000/planos.html | Preços/planos |
| Download | http://localhost:3000/download.html | Download + requisitos |
| Checkout | http://localhost:3000/checkout.html | Revisão da compra |
| Cadastro | http://localhost:3000/register.html | Criar conta |
| Login | http://localhost:3000/login.html | Entrar |
| Dashboard | http://localhost:3000/dashboard | Licença e status do usuário |
| Admin | http://localhost:3000/admin | Painel de licenças (Basic Auth) |
| Comparativo | http://localhost:3000/comparativo.html | Honest Boost vs outros serviços |
| Contato | http://localhost:3000/contact.html | Formulário de contato |
| Termos | http://localhost:3000/terms.html | Termos de uso |
| Privacidade | http://localhost:3000/privacy.html | Política de privacidade (LGPD) |
| Reembolso | http://localhost:3000/refund.html | Política de reembolso |

> URLs legadas (`*-honest.html`, `index-premium.html`, `index.hb.html`, `app.html`, `changelog.html`)
> retornam **301** para a página canônica — sem 404.

## APIs do Backend

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/health` | GET | Verificação de saúde |
| `/api/products` | GET | Preços/planos |
| `/api/register` | POST | Criar conta |
| `/api/login` / `/api/logout` | POST | Sessão |
| `/api/me` | GET | Usuário autenticado |
| `/api/password-reset-request` / `-confirm` | POST | Reset de senha |
| `/api/download` | GET | Metadados do instalador (auth) |
| `/api/keys` | GET/POST | Listar/gerar keys (auth) |
| `/api/create-checkout-session` | POST | Criar Checkout Stripe |
| `/webhook` | POST | Confirmação de pagamento |
| `/checkout/success/:orderId` | GET | Confirmação de compra |
| `/api/orders/:orderId` | GET | Status do pedido |
| `/api/orders` | GET | Pedidos (admin) |
| `/api/licenses` | GET/POST | Licenças (admin) |
| `/api/licenses/verify` | POST | Validar licença |

## Testar Local

1. Instalar dependências e iniciar:

```bash
npm install
npm run init-db
npm start
```

2. Abrir `http://localhost:3000`.
3. Admin de licenças: `http://localhost:3000/admin` (credenciais em `.env`).

## Deploy

1. Rodar na mesma máquina de produção (sessão em memória + SQLite via `DATABASE_URL`).
2. Definir no ambiente:

```env
NODE_ENV=production
SESSION_SECRET=<32+ chars>
DATABASE_URL=postgres://...
ADMIN_USER=admin
ADMIN_PASS=<senha forte>
STRIPE_SECRET=sk_live_...
PAYMENT_WEBHOOK_SECRET=whsec_...
# Opcional: Price IDs do catalogo (precos padrao jah embutidos em src/products.js)
STRIPE_PRICE_BASIC=price_1UH5VZ00k72XFvlldqIARWTR
STRIPE_PRICE_STARTER=price_1UH5VZ00k72XFvllHqh1IOlx
STRIPE_PRICE_PRO=price_1UH5Va00k72XFvlllav1oYNv
# Stripe Tax NAO suporta contas brasileiras ainda — manter desligado; ICMS/ISS
# devem ser tratados externamente (nota fiscal/contador).
# ENABLE_STRIPE_TAX=1
PUBLIC_BASE_URL=https://seu-dominio.com
```

3. Registrar `POST /webhook` no Stripe (evento `checkout.session.completed`).
4. Quando houver domínio próprio, atualizar os links em `sitemap.xml`, `robots.txt` e nas OG tags do `index.html`.

## Notas

- Todas as páginas são responsivas (mobile-first).
- Claims de marketing são factuais (sem métricas fabricadas).
- Histórico Git purgado de dados sensíveis; não adicionar novos artefatos sensíveis.