# Root

A visual canvas for research. Connect topics, findings, questions and conclusions on a canvas, then write up the work in a document beside it that cites those ideas.

- **Canvas**: cards with formatted notes and images, connectors, collapse and reveal, undo.
- **Documents**: a TipTap editor next to the canvas. Type `@` to cite an idea, `/` for blocks, drag a card in to embed it, select text and choose *Make idea* to send it to the canvas, or draft a whole document from a branch. Cards show which documents cite them.
- **AI (optional)**: map a topic into a starting tree of ideas, suggest ideas connected to one idea, draft a document from a branch with citations, and rewrite selected text. Suggestions appear as dashed cards you accept or discard. Runs on Google Gemini by default (free tier), or Claude, OpenRouter or a local Ollama; people can add their own keys.
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

### AI

AI is off until a model provider is configured. To try it for free, create a Gemini key at [Google AI Studio](https://aistudio.google.com/apikey) and add it to `.env`:

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your-key
```

Restart `npm run dev:full`; the **AI** button in the header and the ✦ button on a hovered card then work. Without a server key, each person can paste their own key in *AI → AI settings*. Free tiers may use prompts to train models, so don't send sensitive research through them.

Plans and limits live in `src/lib/ai/plans.ts` (Free: 30 AI actions a month, no drafting; Pro: 1,000 and premium models). In development everyone is on Pro (`AI_DEFAULT_PLAN`). Calls on a person's own key are not counted.

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
| `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `OLLAMA_BASE_URL` | Optional. Any of these turns AI on; see `.env.example`. |
| `AI_KEY_SECRET` | Encrypts the API keys people save. Defaults to `BETTER_AUTH_SECRET`; set it once and keep it, or saved keys stop working. |
| `AI_DEFAULT_PLAN` | `free` (default in production) or `pro`. |

SQLite needs a host with a persistent disk (Render, Railway or Fly.io with a volume, or a small VPS). Back up the database file. Never commit `.env` or the database.

`GET /api/health` returns `{ "ok": true }` for uptime checks.

## Project layout

```
server.ts               Express API: auth, projects, documents, assets, AI; serves dist/ in production
src/lib/                Server stores (projects, documents), auth, mailer; client API helpers
src/lib/ai/             AI layer: model registry, plans, prompts, providers, usage store, /api/ai routes
src/ai/                 Browser side of AI: API client, AI menu and settings, suggestion requests
src/data/               Canvas model, zod schema, Zustand store (no React)
src/canvas/             React Flow canvas
src/nodes/              Idea cards, card editor
src/editor/             Document editor (TipTap): schema shared with the server, mentions, menus
src/app/                Workbench shell, projects and documents hooks
src/pages/              Landing, About, Pricing, auth pages
e2e/                    Playwright tests
```

`DESIGN.md` describes the visual system and `PRD.md` the product scope.
