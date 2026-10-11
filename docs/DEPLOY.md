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
| `AI_DEFAULT_PLAN` | vars | `free` until payments exist; `pro` gives everyone Research. |
| `NODE_ENV` | vars | Keep `production`. |

## After the first deploy

- **Ship a change:** `npm run cf:deploy`.
- **Logs:** `npx wrangler tail`, or Workers & Pages → root → Logs in the dashboard.
- **Your own domain:** Workers & Pages → root → Settings → Domains & Routes →
  Add → Custom domain. Then add `BETTER_AUTH_URL` and `VITE_APP_URL` (both
  `https://your-domain`) under `vars` in `wrangler.jsonc` and deploy again.
- **Deploy on every push:** Workers & Pages → root → Settings → Builds →
  connect your GitHub repo. Build command `npm run build`; deploy command
  `npx wrangler d1 migrations apply root-db --remote && npx wrangler deploy`.
- **Change a table:** edit `src/lib/schema.ts` and add a new
  `migrations/0002_<name>.sql` with the same change. Never edit
  `0001_init.sql` once it is deployed. `src/lib/__tests__/schema.test.ts`
  fails until the two agree.
- **Backups:** D1 keeps 7 days of history on the free plan (30 on Paid); restore with
  `npx wrangler d1 time-travel restore root-db --timestamp=<time>`.

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
