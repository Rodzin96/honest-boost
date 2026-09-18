# Honest Boost — Local Development

This project includes a static frontend (in `public/`) and a small Express backend that provides:

- Static hosting for the site (`public/`)
- `/api/download` endpoint with download info
- `/api/create-checkout-session` creates a Stripe Checkout session (returns the hosted checkout URL)
- `/api/licenses` to generate and list licenses
- `/api/orders` to fetch order + license status (success page)
- `/webhook` verifies Stripe signatures and activates the license on `checkout.session.completed`

Quick start

1. Install dependencies

```bash
npm install
```

2. Initialize the database

```bash
npm run init-db
```

3. Start the server

```bash
npm start
```

4. Open `http://localhost:3000` in your browser. Admin licenses: `http://localhost:3000/admin.html`

Notes

- To enable real Stripe integration set `STRIPE_SECRET` and `PAYMENT_WEBHOOK_SECRET` in `.env`, then register `POST /webhook` in the Stripe Dashboard (event: `checkout.session.completed`).
- The checkout charges the catalog amount in `src/products.js` (BRL, one-time/lifetime). Optional catalog Price IDs (`STRIPE_PRICE_BASIC|STARTER|PRO`) switch it to real Stripe Prices — needed before enabling Tax/Billing/Invoicing.
- Stripe Tax is opt-in: enable it in the Dashboard, add the tax registrations, then set `ENABLE_STRIPE_TAX=1`. Pix only needs to be enabled in Stripe → Payment Methods.
- Checkout always collects billing address + tax id (CPF/CNPJ) for Brazilian receipts.
- Replace the placeholder download file in `public/downloads/` with your real installer binary.

Admin access

- The project includes a protected admin panel to view generated licenses. Access it at: `http://localhost:3000/admin`.
- Default admin credentials are defined in `.env` (see `.env.example`). For local testing you can set:

```
ADMIN_USER=admin
ADMIN_PASS=adminpass
```

After setting credentials, restart the server. The admin route uses HTTP Basic Auth.

Endpoints

- `GET /api/download` — returns download metadata (url, filename).
- `POST /api/create-checkout-session` — creates a Stripe Checkout session; returns `{ ok, checkoutUrl, orderId }`.
- `POST /api/licenses` — generates a new license (returns JSON with `license`).
- `GET /api/licenses` — (admin only) lists recent licenses.

Notes on deployment

- For production, set `STRIPE_SECRET` and `PAYMENT_WEBHOOK_SECRET`, register `POST /webhook` in the Stripe Dashboard, and keep admin credentials strong.

Docker

Build and run with Docker:

```bash
docker build -t honest-boost .
docker run -p 3000:3000 --env-file .env --name honest-boost honest-boost
```

Or with `docker-compose`:

```bash
docker-compose up --build
```

Google OAuth

- To enable login with Google, create OAuth credentials in Google Cloud Console and set the following in your `.env`:

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=https://yourdomain.com/auth/google/callback
```

After configuring, restart the server. The login/register pages will show a "Entrar com Google" button.

Password reset

- Use `/reset-request.html` to request a password reset token (in this demo the token is logged to the server console). Use `/reset.html` to apply the token and set a new password.

SMTP (sending emails)

- To send password reset emails instead of returning the token in responses, configure SMTP values in your `.env`:

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=smtp-user
SMTP_PASS=smtp-pass
SMTP_FROM="Honest Boost <noreply@yourdomain.com>"
```

- After set, restart the server; the `/api/password-reset-request` endpoint will send an email with a reset link.

Desktop (Electron)

Build the Windows installer (NSIS):

```bash
cd desktop
npm install
npm run build:win
```

Auto-updates use GitHub Releases. To publish a release:

1. Bump the `version` in `desktop/package.json` (this drives the update check).
2. Build and publish:

```bash
npm run publish
```

`electron-builder --publish always` creates a GitHub Release with the installer and a `latest.yml` file that `electron-updater` reads.  
A GitHub personal access token with `repo` scope must be available to `electron-builder` (use `GH_TOKEN` env var).

Code signing (recommended)

Without signing, Windows SmartScreen will flag the installer until enough users trust the binary. To remove the warning:

- Obtain an Authenticode certificate from a trusted CA (e.g. DigiCert, Sectigo).
- Build with the certificate:

```bash
set WIN_CSC_LINK=path/to/certificate.pfx
set WIN_CSC_KEY_PASSWORD=your-password
npm run publish
```

For CI, store the base64-encoded `.pfx` in `WIN_CSC_LINK_BASE64` and decode it before build, or use a cloud HSM / Azure Trusted Signing.

