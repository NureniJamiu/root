# Deploy Root to Cloudflare

Root runs on Cloudflare Workers: Cloudflare serves the built app, a Worker
runs the API (`src/worker.ts`), D1 holds the database, R2 holds images, and
a rate-limiting binding caps AI requests. Everything is configured in
`wrangler.jsonc`. The first deploy takes about 30 minutes.

## What you need

- A Cloudflare account (free): <https://dash.cloudflare.com/sign-up>.
- R2 turned on in the dashboard (**R2 Object Storage**). Cloudflare may ask
  for a card to turn it on; the first 10 GB a month are free.
- A Gemini API key for the AI features: <https://aistudio.google.com/apikey>.
- Optional: a Resend account and key for password-reset email.

## Steps

Run these in the project folder.

1. **Install.** `npm install` (this adds Wrangler, Cloudflare's CLI).
2. **Sign in to Cloudflare.** `npx wrangler login` opens your browser; allow access.
3. **Create the database.** `npx wrangler d1 create root-db`. It prints a
   `database_id`. Paste it into `wrangler.jsonc` in place of
   `REPLACE_WITH_YOUR_DATABASE_ID`.
4. **Create the image bucket.** `npx wrangler r2 bucket create root-files`.
5. **Add the secrets.** Run each line and paste the value when asked
   (say yes if Wrangler offers to create the Worker):
   ```bash
   openssl rand -base64 32          # run twice: one value for each secret below
   npx wrangler secret put BETTER_AUTH_SECRET
   npx wrangler secret put AI_KEY_SECRET
   npx wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY
   npx wrangler secret put RESEND_API_KEY       # optional
   ```
   Never change `AI_KEY_SECRET` after launch: it encrypts the API keys people
   save, and a new value makes every saved key unreadable.
6. **Deploy.** `npm run cf:deploy`. This builds the app, creates the tables
   in D1 (`migrations/`) and uploads the Worker. It ends by printing your URL,
   `https://root.<your-subdomain>.workers.dev`.
7. **Check it.** Open that URL and:
   - open `/api/health` (shows `{"ok":true}`);
   - sign up, then sign out and back in;
   - add ideas and an image to a card, reload, and see them still there;
   - write a document with an image;
   - try an AI feature, such as Expand on a card.

Commit `wrangler.jsonc` with your `database_id` (it is not a secret).

## Settings

Plain settings are under `vars` in `wrangler.jsonc`; secrets are set with
`npx wrangler secret put <NAME>` and never written in a file.

| Setting | Where | |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | secret | Required. Signs sessions. |
| `AI_KEY_SECRET` | secret | Encrypts saved API keys. Set once, keep forever. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | secret | Turns AI on (Gemini free tier). Google may use free-tier prompts to improve its products. |
| `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `OPENALEX_API_KEY` | secret | Optional. |
| `RESEND_API_KEY` | secret | Optional. Without it, reset emails are only written to the Worker's log. |
| `BETTER_AUTH_URL`, `VITE_APP_URL` | vars | Only with your own domain: set both to it. Without them the app uses the URL it is reached on. |
| `EMAIL_FROM` | vars | `onboarding@resend.dev` only delivers to your own address; verify a domain in Resend and use an address on it. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO` | secret | Payments for Pro; see [Payments](#payments-stripe). Billing stays hidden without them. |
| `AI_DEFAULT_PLAN` | vars | Plan for people who have never paid. Keep `free`; `pro` gives everyone Pro. |
| `NODE_ENV` | vars | Keep `production`. |

## After the first deploy

- **Ship a change:** `npm run cf:deploy`.
- **Logs:** `npx wrangler tail`, or Workers & Pages → root → Logs in the dashboard.
- **Your own domain:** Workers & Pages → root → Settings → Domains & Routes →
  Add → Custom domain. Then add `BETTER_AUTH_URL` and `VITE_APP_URL` (both
  `https://your-domain`) under `vars` in `wrangler.jsonc` and deploy again.
- **Deploy on every push:** see below.
- **Change a table:** edit `src/lib/schema.ts` and add a new
  `migrations/0002_<name>.sql` with the same change. Never edit
  `0001_init.sql` once it is deployed. `src/lib/__tests__/schema.test.ts`
  fails until the two agree.
- **Backups:** D1 keeps 7 days of history on the free plan (30 on Paid); restore with
  `npx wrangler d1 time-travel restore root-db --timestamp=<time>`.

## Deploy on every push to main

`.github/workflows/ci.yml` has a `deploy` job. After lint, type checks,
unit tests and browser tests all pass on a push to `main`, it applies new
migrations to D1 and deploys the Worker. Pull requests and failed checks
never deploy. It needs two secrets, set once:

1. **API token.** Cloudflare dashboard → your profile icon → My Profile →
   API Tokens → Create Token → "Edit Cloudflare Workers" template → Use
   template. Under Permissions click "+ Add more" and add **Account · D1 ·
   Edit**. Under Account Resources pick your account. Continue to summary →
   Create Token, and copy the token (it is shown once).
2. **Account ID.** Workers & Pages overview → the Account ID on the right,
   or run `npx wrangler whoami`.
3. **Add both to GitHub.** github.com/NureniJamiu/root → Settings → Secrets
   and variables → Actions → New repository secret. Add
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. **Push to main.** Watch it in the repo's Actions tab: `check` and `e2e`
   run first, then `deploy`.

Secrets set with `wrangler secret put` stay on the Worker; deploys keep them.

## Payments (Stripe)

People upgrade to Pro from AI settings or the pricing page. Stripe Checkout
takes the card, a webhook moves them to Pro, and Stripe's billing portal is
where they change their card, see invoices or cancel. Cancelling keeps Pro to
the end of the paid period, then they go back to Free. Code:
`src/lib/billing/`.

Start in **test mode** (the Test mode switch in the Stripe dashboard, keys
starting `sk_test_`). No real card is charged; pay with `4242 4242 4242 4242`,
any future date, any CVC. AI settings shows "Test mode" while it is on.

1. **Make the Pro product.** Stripe dashboard → Product catalog → Add
   product. Name it "Root Pro", pick **Recurring**, set the monthly price,
   save. Open the price and copy its ID (`price_…`).
2. **Copy the secret key.** Developers → API keys → Secret key (`sk_test_…`).
3. **Add the webhook.** Developers → Webhooks → Add endpoint.
   - Endpoint URL: `https://<your app>/api/billing/webhook`
   - Events: `checkout.session.completed`,
     `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`
   - Save, then reveal the **Signing secret** (`whsec_…`).
4. **Turn on the billing portal.** Settings → Billing → Customer portal →
   Activate. Allow cancelling and updating payment methods.
5. **Store the three values** and deploy:
   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY       # sk_test_…
   npx wrangler secret put STRIPE_PRICE_PRO        # price_…
   npx wrangler secret put STRIPE_WEBHOOK_SECRET   # whsec_…
   npm run cf:deploy
   ```
6. **Try it.** Sign in, open AI settings → Upgrade to Pro, pay with the test
   card. You come back on Pro. Manage billing → Cancel shows "Pro ends on…".

**Going live** later: switch the dashboard to live mode, make the product
and webhook again there (test and live are separate), and put the live
`sk_live_…`, `price_…` and `whsec_…` in with the same three commands.

**Locally**, add the same three to `.env` (or `.dev.vars` for `cf:dev`). For
the webhook, run `stripe listen --forward-to localhost:3001/api/billing/webhook`
with the Stripe CLI and use the `whsec_…` it prints. Without it, upgrades
still apply when you come back from Checkout; only portal changes wait for
the webhook.

## Try the Worker on your machine first (optional)

```bash
cp .dev.vars.example .dev.vars   # local secrets; never commit it
npm run cf:dev                   # http://localhost:8787, with a local D1 and R2
```

`npm run dev:full` still runs the Node server with a local SQLite file, as before.

## Limits

The free plan gives 100,000 requests and 100,000 D1 row writes a day, and
10 ms of CPU per request. Saving a canvas with large images, and AI search
in a big project, can go over 10 ms, which shows up as failed saves. Workers
Paid ($5 a month) raises the CPU limit to 30 seconds; switch before real
users arrive. Turn on usage notifications in the dashboard.
