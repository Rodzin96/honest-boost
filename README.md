# Honest Boost — Otimizador de Windows + plataforma de licenças

Monorepo com o **site + backend de licenças/pagamentos** (Express + PostgreSQL) e o
**aplicativo desktop** (Electron) — o otimizador profissional de Windows.

- Site e checkout em `public/` (landing, planos, checkout Pix/cartão, login, dashboard do cliente, `/admin`)
- API Express em `server.js` (`/api/*`, webhooks Stripe/InfinitePay, licenças vitalícias `HB-…`, keys de ativação `hb_…`)
- App desktop em `desktop/` (Electron + NSIS, auto-update via GitHub Releases)

> Não há período de teste: os planos são de **pagamento único** (Básico 1 PC, Pro 3 PCs).
> A chave entregue na compra (`HB-…`, vitalícia) **ativa direto no app**, sem criar conta.

## Início rápido (dev local)

```bash
npm install
npm start
```

Abra `http://localhost:3000`. O schema do Postgres é criado sozinho no boot
(`initSchema` + migrações `IF NOT EXISTS`); sem `DATABASE_URL`, rotas de dados
retornam `database_not_ready`, mas o site estático e o `/health` funcionam.

Scripts úteis:

| Comando | O que faz |
|---|---|
| `npm start` | Sobe o servidor (`server.js`) |
| `npm run dev` | Servidor com reload (`server-dev.js`, SQLite local — só dev) |
| `npm run check` | Checagem de sintaxe (`server.js`, `desktop/*`) |

## Variáveis de ambiente

Copie `.env.example` para `.env`. As principais:

| Var | Uso |
|---|---|
| `DATABASE_URL` | Postgres (Neon em produção). Sem ela, o app sobe mas sem dados |
| `SESSION_SECRET` | Sessões web (obrigatória em produção) |
| `PUBLIC_BASE_URL` | URLs de retorno do checkout/emails |
| `HONEST_BOOST_API_BASE_URL` | Base que o Electron usa p/ validar chaves (padrão: produção Render) |
| `STRIPE_SECRET` / `PAYMENT_WEBHOOK_SECRET` | Cartão (checkout + `POST /webhook`) |
| `INFINITEPAY_HANDLE` | Pix (checkout + `POST /webhook/infinitepay`) |
| `ADMIN_USER` / `ADMIN_PASS` | **Email válido** + senha 8+; cria/atualiza o admin no boot |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Email de licença/recuperação (sem isso, a chave aparece só na success page) |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Emails de licença e recuperação |
| `VT_API_KEY` + `INSTALLER_SHA256` | Laudo VirusTotal inline em `/download.html` (atualizar o hash a cada release) |

Preços e planos vivem em `src/products.js` (fonte única: site, checkout e backend leem dali).

## Fluxo de compra (ponta a ponta)

1. `POST /api/create-checkout-session` → Stripe (cartão) ou InfinitePay (Pix)
2. Webhook (`/webhook` com assinatura / `/webhook/infinitepay` com reconfirmação + valor) marca o pedido `paid` e cria a licença `HB-…` (idempotente)
3. `/checkout/success/:orderId` → `success.html` exibe a chave (polling de `/api/orders/:orderId`)
4. A `HB-…` **ativa direto no app** (ponte em `/api/app/auth`); alternativamente o cliente cria conta com o email da compra → dashboard → gera `hb_…`
5. Email com a chave é enviado se SMTP configurado (falha silenciosa de propósito — a success page é a fonte primária)

## Licenças, keys e limite de máquinas

- `licenses` (`HB-…`): vitalícias, criadas no webhook ou pelo admin (`POST /api/licenses`, formulário em `/admin`)
- `api_keys` (`hb_…`): geradas no dashboard **só com licença ativa** (1 ano, teto = seats do plano)
- `key_machines`: cada ativação registra o PC; `POST /api/app/auth` recusa além dos seats (`403 device_limit_reached`)
- Cliente gerencia PCs em dashboard → Dispositivos; admin vê/remover tudo em `/admin` → Dispositivos
- Admin é isento da trava (gera keys de suporte/teste) e emite `hb_` por email com validade à escolha (`POST /api/admin/keys`)

## Acesso admin

Defina `ADMIN_USER` (email válido!) e `ADMIN_PASS` no ambiente e reinicie — o
boot provisiona o papel `admin`. Entre em `/login.html` e abra `/admin`
(emissão de licenças/keys, listas, dispositivos).

## App desktop (`desktop/`)

```bash
cd desktop
npm install
npm start        # dev (janela Electron)
npm run build:win  # instalador NSIS em dist/
```

- Catálogo de 33 otimizações validadas (`src/catalog.js`); telemetria em tempo real com coleta lenta em background (não trava a UI)
- Loja de apps instala de verdade via `winget` (allowlist no main process)
- **Modo bloqueado**: sem licença válida, escrita exige ativação (leitura é livre)
- Otimizações com `admin` pedem elevação (botão Admin relança elevado)
- Login valida `POST /api/app/auth` (API base via `HONEST_BOOST_API_BASE_URL`); offline, usa a última verificação salva

## Releases e auto-update

1. Suba `version` em `desktop/package.json`
2. `git tag vX.Y.Z && git push origin vX.Y.Z`
3. O workflow `.github/workflows/release.yml` compila o NSIS e publica na Release com `latest.yml` — o `electron-updater` encontra sozinho

Nunca crie a Release pela interface web sem assets: uma tag "latest" sem instalador quebra o auto-update. Sem assinatura de código, o SmartScreen avisa até o binário ganhar reputação.

## Deploy (Render)

Blueprint em `render.yaml` (`NODE_ENV=production`, `npm ci`, `npm start`, health check `/health`).
**Nunca fixe `PORT`** nas env vars — o Render injeta a porta e o health check mira nela
(foi a causa de um deploy `Timed out` aqui). `/health` responde 200 em ms mesmo
com o banco acordando (orçamento de 3s para o `SELECT 1`).

## Endpoints principais

| Método/Rota | Acesso | Descrição |
|---|---|---|
| `GET /health` | público | Liveness + flag `db` |
| `POST /api/register` / `/api/login` / `/api/logout` | público | Conta email+senha (sessão) |
| `GET /api/me` | sessão | Usuário autenticado |
| `POST /api/create-checkout-session` | público | Checkout Stripe/Pix |
| `POST /webhook` | Stripe (assinatura) | Ativa pedido + licença |
| `POST /webhook/infinitepay` | InfinitePay (reconfirmação) | Idem p/ Pix |
| `GET /checkout/success/:orderId` | recibo (cookie) | Redireciona p/ success |
| `GET /api/orders/:orderId` | dono/admin/recibo | Pedido + licença (polling) |
| `POST /api/app/auth` | rate limit 20/min | **Ativação do app** (`hb_` e `HB-`), com seats |
| `POST /api/licenses/verify` | público | Valida licença `HB-` |
| `GET/POST /api/keys` · `DELETE /api/keys/:id` | sessão (+licença p/ criar) | Keys `hb_` do usuário |
| `GET/DELETE /api/machines` | sessão (dono/admin) | Dispositivos por chave |
| `GET /api/licenses` · `POST /api/licenses` | admin | Lista/emite `HB-` |
| `GET /api/admin/users` · `GET/DELETE /api/admin/keys/:id` · `POST /api/admin/keys` · `GET /api/admin/machines` | admin | Operação/suporte |
| `GET /api/download` | sessão | Metadados do instalador |
| `GET /dashboard` · `GET /admin` | sessão / admin | Páginas autenticadas |

## Estrutura

```
server.js            # API + site (produção)
server-dev.js        # espelho p/ dev local (SQLite)
src/                 # db, keys, products, infinitepay, audit, middleware
public/              # site estático + js/ (hb, checkout, dashboard, admin...)
desktop/             # app Electron (main, renderer, src/, package.json próprio)
desktop/dist/        # saída do NSIS (ignorado no git)
```
