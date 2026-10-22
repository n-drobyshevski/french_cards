# Карточки для Лизи

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

1. Apply the migrations in `supabase/migrations/` in order (`0001_init.sql`, `0002_user_keys_and_stale_writes.sql`, `0003_extra_examples.sql`, `0004_review_sets.sql`, `0005_connector_grants.sql`, `0006_custom_fields.sql`, `0007_connector_field_writes.sql`, then `0008_word_origin_conjugation.sql`). Apply a new migration before deploying the app version that needs it.
2. Auth → Sign In / Providers → Email: keep the provider on and turn **Confirm email** off. Sign-in is email + password, so no custom SMTP is needed; email is only used for «Забыли пароль?» (the default reset template works: its link lands on `/auth/confirm`, then `/auth/reset`).
3. Auth → URL Configuration: Site URL = the production URL, Redirect URLs = `<production URL>/**`.
4. Create the account in the app («Создать аккаунт»), then turn off «Allow new users to sign up». RLS keeps other accounts' data apart and `ALLOWED_EMAIL` keeps them off the AI routes, but there is no reason to let them in.
5. Set in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_EMAIL`, `NEXT_PUBLIC_ALLOWED_EMAIL` (optional), `ANTHROPIC_API_KEY`, `AI_MODEL_EXTRACT` (optional), `CRON_SECRET`.
6. Another person (each account has its own library): turn «Allow new users to sign up» back on, clear `NEXT_PUBLIC_ALLOWED_EMAIL` if it is set (it makes the login screen refuse other addresses) and redeploy; they create their account in the app; turn sign-up off again. Then add their address to `ALLOWED_EMAIL` (comma-separated, e.g. `a@x.io,b@x.io`; the same list may go back into `NEXT_PUBLIC_ALLOWED_EMAIL`) and redeploy, so the AI routes answer them too.
7. Optional, Claude connector (use the cards from Claude on the web, desktop and mobile): set `MCP_SECRET`, `SUPABASE_SECRET_KEY`, `MCP_USER_ID` and optionally `MCP_TIMEZONE`, redeploy, then add `https://<production URL>/api/mcp/<MCP_SECRET>` as a custom connector in claude.ai with no sign-in. Steps, the companion skill and the security trade-offs are in [`docs/CONNECTOR.md`](docs/CONNECTOR.md).

## Attribution

- `public/lexique/fr-lemmas.json` is derived from **Lexique 3.83** by Boris New & Christophe Pallier ([lexique.org](http://www.lexique.org)), licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); the derived file is shared under the same license. See `public/lexique/LICENSE.txt`; rebuild with `node scripts/build-lexique.mjs`.
- `public/lexique/fr-conj.json` (verb tables for «Контекст» → «Спряжение») is derived from the same **Lexique 3.83** data under the same CC BY-SA 4.0 license; rebuild with `node scripts/build-conjugation.mjs`.
- `public/lexique/fr-morpho.json` («Слово по частям»: how words are made) is derived from the morphology column of the same **Lexique 3.83** data, same license; rebuild with `node scripts/build-morpho.mjs`.
- «Контекст» shows example sentences from **[Tatoeba](https://tatoeba.org)** (CC BY 2.0 FR), fetched from its public API in the browser, each linked to its page on tatoeba.org.
- Ideas and patterns from [ts-fsrs-demo](https://github.com/ishiko732/ts-fsrs-demo) (MIT) and [jiaci](https://github.com/leoon-hu/jiaci) (MIT).
- Anki import reads decks on the device with [sql.js](https://github.com/sql-js/sql.js) (MIT), [fflate](https://github.com/101arrowz/fflate) (MIT) and [fzstd](https://github.com/101arrowz/fzstd) (MIT).
