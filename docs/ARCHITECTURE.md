# Карточки для Лизи: architecture and conventions

Read with `docs/plan.md` (scope and phases), `mockups/SPEC.md` (the v3 visual design: tokens, components, copy rules and every screen) and the mockup sources in `mockups/*.dc.html`. The mockups are the visual source of truth: match their layout, spacing, copy and states.

## Stack
- **App:** Next.js 16.4 App Router + Turbopack, React 19.3, TypeScript, Tailwind 4.
  - This Next is newer than most training data. Read `node_modules/next/dist/docs/` before using an API you're unsure of.
  - `cacheComponents: true` is on.
  - Request interception lives in `proxy.ts` (the old `middleware.ts` was renamed).
- **Data:** Dexie 4 (`lib/db.ts`) is the on-device source of truth. The UI reads it with `useLiveQuery` from `dexie-react-hooks`, so screens that use it are client components (`"use client"`).
- **Scheduling:** `ts-fsrs@5`, used only through `lib/scheduler.ts`.
- **Sync and auth:** Supabase (`@supabase/ssr` + `@supabase/supabase-js`).
  - Login is email + password (works inside the iOS home-screen app and needs no custom SMTP); only `ALLOWED_EMAIL` may sign in. Password reset links land on `/auth/confirm` → `/auth/reset`.
  - Sync is last-write-wins on `updated_at` with soft deletes (`deleted_at`). `review_log` rows are only ever soft-deleted (undo).
- **AI:**
  - Packages: `ai@7`, `@ai-sdk/anthropic@4`, `zod@4`.
  - Model `claude-haiku-5-5` with `providerOptions.anthropic.thinking = {type:'disabled'}`. Never set temperature/top_p/top_k and never prefill.
  - Use `streamText`/`generateText` with `output: Output.object|array(...)`.
  - Schemas: no `.min/.max/.length`, every field required (use `.nullable()`), confidence is an enum. Limits go in `.describe()` text, and results are sliced on the server.
  - The v7 API changed (`instructions`, `type:'file'` image parts, `Output`). Read the typings in `node_modules/ai` and `node_modules/@ai-sdk/anthropic` before writing calls.
- **PWA:** `app/manifest.ts` + Serwist via `@serwist/turbopack`.

## Product rules
- UI copy is Russian; words are French.
- Never show «ИИ»/«AI», sparkles or "magic" in the UI. The one exception is the Settings privacy line.
- Every word has `slang_level` 0..3 (нейтр./fam./arg./vulg.) and a `verlan` flag. Show it with the `SlangMeter` component.
- Folders («темы») hold words. `folder_id = null` means «Входящие» (Inbox).
  - Automatic sorting never moves a word whose `folder_source = 'user'`, and never renames or deletes a `locked` or user-created folder.
  - A new automatic folder needs ≥3 words.
  - Slang level is never a folder.
- Each word has a review state per direction: `fr_ru`, plus `ru_fr` when `both_directions`.
- Review sessions end («Готово на сегодня»). «Ещё практика» runs extra rounds that do NOT change scheduling.
- Grades: Не знаю = Again, Сложно = Hard, Знаю = Good.
- Nothing produced automatically (suggestions, screenshot rows, sort plans) is saved without the user confirming it. Every bulk change can be undone.

## Local-only mode
If `NEXT_PUBLIC_SUPABASE_URL` is unset, the app runs fully local: there is no login gate and sync is off. In that mode `/api/ai/*` is allowed only when `NODE_ENV !== 'production'`.

## Env vars
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `ALLOWED_EMAIL`
- `ANTHROPIC_API_KEY`
- `CRON_SECRET`
- See `.env.example`.

## Module map (ownership during the parallel build)
| Area | Files |
|---|---|
| Domain/data | `lib/types.ts`, `lib/db.ts` (shared, edit carefully), `lib/scheduler.ts`, `lib/session.ts`, `lib/words.ts`, `lib/folders.ts`, `lib/seed.ts`, `lib/backup.ts`, `lib/text.ts` (accent folding, normalization, duplicate detection) |
| Sync/auth | `lib/supabase/{client,server}.ts`, `lib/sync.ts`, `proxy.ts`, `supabase/migrations/*`, `app/login/*`, `app/api/cron/ping/route.ts`, `vercel.json`, `.env.example`, `components/auth/*` |
| UI kit + shell | `components/ui/*` (Button, Chip, SlangMeter, Sheet, Toggle, Segmented, Snackbar, Icon set, AppMark, TabBar, Header), `app/(app)/layout.tsx`, `components/providers/*` (theme, db init, sync loop mount) |
| AI core | `lib/ai/{schemas,prompts,model,auth,rate-limit}.ts`, `app/api/ai/{suggest,extract,classify}/route.ts`, `scripts/build-lexique.*`, `public/lexique/*`, `lib/lexique.ts` |
| PWA | `app/manifest.ts`, `app/sw.ts`, `next.config.ts`, `public/icons/*`, `components/pwa/*` |
| Review screens | `app/(app)/page.tsx` (review), `app/(app)/done/*` or in-page done state, `components/review/*`, `app/(app)/settings/page.tsx`, `components/settings/*` |
| Library screens | `app/(app)/library/page.tsx`, `app/(app)/library/[id]/page.tsx`, `components/library/*` (tiles, folder list, word detail sheet, sort plan sheet), `lib/reorg.ts` |
| Add flow | `components/add/*` (QuickAddSheet, suggestion lists, filled form, duplicate/offline states), `lib/use-suggest.ts` |
| Import flow | `app/(app)/import/page.tsx`, `components/import/*`, `lib/image-prep.ts`, `lib/use-extract.ts` |

## Testing
- Vitest unit tests sit next to the code as `*.test.ts`.
- IndexedDB tests use `fake-indexeddb/auto`.
- Playwright e2e lives in `e2e/` at a mobile viewport (390×844), using the preinstalled Chromium (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; never run `playwright install`).
- Before pushing: `npm run lint && npm run typecheck && npm test && npm run build`.
