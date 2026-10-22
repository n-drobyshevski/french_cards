# Карточки

Mobile-first PWA for learning French words with Russian translations: spaced-repetition cards (FSRS), quick add with dictionary and Claude suggestions, word extraction from screenshots, and themes that sort themselves.

- Conventions and module map: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Scope and phases: [docs/plan.md](docs/plan.md)
- Visual design: [mockups/SPEC.md](mockups/SPEC.md) and `mockups/*.dc.html`

## Run locally

```bash
npm install
cp .env.example .env.local   # optional; leave Supabase empty for local-only mode
npm run dev                  # http://localhost:3000
```

Without `NEXT_PUBLIC_SUPABASE_URL` the app runs fully on-device: no login and no sync. Suggestions and screenshot import need `ANTHROPIC_API_KEY`, and in local-only mode `/api/ai/*` works only outside production.

## Checks

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run e2e        # Playwright, 390×844, local-only mode; builds must exist (npm run build)
```

The e2e suite starts `next start` on port 3100 and mocks `/api/ai/*`. It uses the preinstalled Chromium (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`).

## Deploy (Vercel + Supabase)

1. Apply the migrations in `supabase/migrations/` in order (`0001_init.sql`, then `0002_user_keys_and_stale_writes.sql`).
2. Auth → Email templates «Magic Link» and «Confirm signup»: include `{{ .Token }}` so the email carries the 6-digit code. Keep the code length at 6.
3. After the first sign-in, turn off «Allow new users to sign up» (or add a before-user-created hook). RLS keeps other accounts' data apart and `ALLOWED_EMAIL` keeps them off the AI routes, but there is no reason to let them in.
4. Set in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_EMAIL`, `NEXT_PUBLIC_ALLOWED_EMAIL` (optional), `ANTHROPIC_API_KEY`, `AI_MODEL_EXTRACT` (optional), `CRON_SECRET`.

## Attribution

- `public/lexique/fr-lemmas.json` is derived from **Lexique 3.83** by Boris New & Christophe Pallier ([lexique.org](http://www.lexique.org)), licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); the derived file is shared under the same license. See `public/lexique/LICENSE.txt`; rebuild with `node scripts/build-lexique.mjs`.
- Ideas and patterns from [ts-fsrs-demo](https://github.com/ishiko732/ts-fsrs-demo) (MIT) and [jiaci](https://github.com/leoon-hu/jiaci) (MIT).
