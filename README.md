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


