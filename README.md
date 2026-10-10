# Root

A visual canvas for research. Connect topics, findings, questions and conclusions on a canvas, then write up the work in a document beside it that cites those ideas.

- **Canvas**: cards with formatted notes and images, connectors, collapse and reveal, undo.
- **Documents**: a TipTap editor next to the canvas. Type `@` to cite an idea, `/` for blocks, drag a card in to embed it, select text and choose *Make idea* to send it to the canvas, or draft a whole document from a branch. Cards show which documents cite them.
- **Accounts**: email and password (Better Auth), with password reset by email. Everything is saved to the server per user.

Stack: React 18, Vite, Tailwind, React Flow, Zustand, TipTap 3; Express 5, Better Auth, SQLite (better-sqlite3).

## Run it locally

Requires Node 20.19 or newer.

```bash
npm install
cp .env.example .env        # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run auth:migrate        # create the database tables
npm run dev:full            # API on :3001 and the app on http://localhost:5173
```

Without Resend keys, password reset links are printed in the API server's log.

## Checks

```bash
npm run lint
npm run typecheck
npm run test:run            # unit tests (Vitest)
npx playwright install chromium   # once
npm run e2e                 # end-to-end tests on their own ports and database
```

CI runs all of these on every pull request (`.github/workflows/ci.yml`).

## Deploy

One Node process serves the API and the built app.

```bash
npm ci
npm run build
npm run auth:migrate
npm start                   # NODE_ENV=production, serves dist/ and /api on $PORT
```

Set these in the host's environment (see `.env.example`):

| Variable | |
| --- | --- |
| `BETTER_AUTH_SECRET` | Required. The server refuses to start in production without it. |
| `BETTER_AUTH_URL`, `VITE_APP_URL` | The public URL, e.g. `https://root.example.com`. |
| `DATABASE_PATH` | A file on a persistent disk, e.g. `/var/data/root.db`. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Sends password reset email. `EMAIL_FROM` must be on a domain verified in Resend. |
| `PORT` | Defaults to 3001. |

SQLite needs a host with a persistent disk (Render, Railway or Fly.io with a volume, or a small VPS). Back up the database file. Never commit `.env` or the database.

`GET /api/health` returns `{ "ok": true }` for uptime checks.

## Project layout

```
server.ts               Express API: auth, projects, documents, assets; serves dist/ in production
src/lib/                Server stores (projects, documents), auth, mailer; client API helpers
src/data/               Canvas model, zod schema, Zustand store (no React)
src/canvas/             React Flow canvas
src/nodes/              Idea cards, card editor
src/editor/             Document editor (TipTap): schema shared with the server, mentions, menus
src/app/                Workbench shell, projects and documents hooks
src/pages/              Landing, About, Pricing, auth pages
e2e/                    Playwright tests
```

`DESIGN.md` describes the visual system and `PRD.md` the product scope.
