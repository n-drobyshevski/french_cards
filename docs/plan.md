# Petit Argot v2: mobile-first FR↔RU vocab cards with AI entry

## Context
The user has a one-file prototype (`Petit_Argot.html`): 11 hard-coded FR slang words, a weighted Leitner-style review with Не знаю / Сложно / Знаю, a FR→RU / RU→FR toggle, a word-list sheet and localStorage progress. They want a real web app, deployed on Vercel and mobile-first, that adds:
- AI predictive word entry
- screenshot → extracted word pairs
- theme folders that the AI sorts words into

The repo `n-drobyshevski/french_cards` is empty (branch `ccr-8a1fb2eb-6rovnb`, no commits).

**Decisions from the user:** Supabase sync, single user, Claude through the Vercel AI SDK, Russian UI. They asked for **UI/UX mockups first**, before any app code.

**Research result** (7-agent workflow, 2026-10-21): no open-source project is MIT-licensed + Next.js/Vercel + mobile + vocab + FSRS + AI all at once, so we **scaffold fresh and borrow pieces** with attribution:
- [ts-fsrs-demo](https://github.com/ishiko732/ts-fsrs-demo) (MIT): card/revlog schema, undo of the last review
- [jiaci](https://github.com/leoon-hu/jiaci) (MIT): zod word-entry schema pattern, rating bar, swipe gestures, PWA install hint
- [Jolito](https://github.com/smolkaj/jolito) (Apache-2.0): ideas only for linked reciprocal cards (one FSRS state per direction)
- GPL/AGPL apps: UX reference only, no code copied

## Stack (versions checked 2026-10-21)
- **App:** Next.js 16.4 (App Router, Turbopack, TS), React 19.2, Tailwind 4.3, shadcn/ui + vaul drawer. Node 24 on Vercel, region `fra1`.
- **Spaced repetition:** `ts-fsrs@^5.4.2` (FSRS-6), wrapped in `lib/scheduler.ts`. No 6.0 beta.
- **Data:**
  - `dexie@^4.4.6` + `dexie-react-hooks` as the on-device source of truth (offline-first)
  - Supabase Free (Postgres + RLS `user_id = auth.uid()`) for sync/backup
  - Last-write-wins sync on `updated_at`, with soft deletes
- **Auth:** Supabase **email OTP code**, not a magic link, because magic links open in Safari outside the iOS home-screen app. The built-in SMTP is enough for a single user. A daily Vercel cron ping stops Supabase's 7-day idle pause.
- **AI:** `ai@^7`, `@ai-sdk/anthropic@^4`, `zod@^4`, with `ANTHROPIC_API_KEY` set in Vercel env.
  - Default model `claude-haiku-5-5` with `thinking: {type:'disabled'}`. Escalate to `claude-sonnet-5-5` only if a quality check fails.
  - Use `streamText`/`generateText` + `Output.object/array`.
  - Schema rules: no `.min/.max`; every field required with `.nullable()`; confidence as an enum.
  - `/api/ai/*` routes require a Supabase session plus a simple rate limit.
- **PWA:** `app/manifest.ts`, `@serwist/turbopack` (not `@serwist/next`), apple-touch-icon, iOS "Add to Home Screen" hint, `navigator.storage.persist()`.

## Data model (Dexie and Supabase mirror each other)
- **`folders`**: id, slug, name_ru, name_fr, emoji, description, created_by (user|ai), locked, sort, updated_at, deleted_at
- **`words`**:
  - id (client UUID), fr, ru, note, example, register (neutral/familier/argot/verlan/vulgaire), pos, gender, tags[]
  - folder_id (null = «Входящие»), folder_source (ai|user), folder_confidence (high/med/low), source (manual/ai/screenshot)
  - updated_at, deleted_at
- **`review_state`**: PK (word_id, direction ∈ fr_ru|ru_fr), FSRS card fields
- **`review_log`**: append-only, for undo and later FSRS optimization
- **`reorg_runs`**: plan + undo payload for the AI re-sort
- **`review_sets`**: «Мои наборы» for Повторение (name, themes, statuses, slang levels, age, mode), synced so every device sees them

## Phase 0: UI/UX mockups (first deliverable; we stop here for the user's feedback)
- **Process:** run a workflow with one designer agent per screen group, then a consistency/critique pass.
- **Output:** a single clickable HTML mockup page (mobile frames at 390 px, light and dark), published as a private Artifact and committed to `mockups/` in the repo.
- **Visual language:** carried over from the prototype: Newsreader for words, Manrope for UI, `--accent:#2a46c9`, again/hard/good colors, Russian copy.
- **Navigation:** bottom tab bar «Повторение | (+) | Библиотека».

Screens:
1. **Повторение** (review):
   - Card front, then card back with translation, note and register badge.
   - Bottom slot: «Показать» before the flip; after it, Не знаю / Сложно / Знаю, each with its next interval.
   - Swipe-drag state: right = Знаю, left = Не знаю. Undo snackbar.
   - Top chips: direction and theme filter.
2. **Быстрое добавление** (bottom sheet):
   - States: empty; typing «se cass…» with local suggestions instantly and AI suggestions streaming in; a picked suggestion fills editable FR/RU/note/folder chips (the AI pick plus 2 alternatives and «+ Новая: …»).
   - Also: duplicate warning and an offline manual form.
   - Header buttons: «Скриншот», «Вставить список».
3. **Импорт со скриншота:**
   - Processing state: thumbnail, skeleton rows, «Стоп».
   - Review list with checkboxes. Low-confidence rows get an amber edge; AI-suggested translations are italic with a «предложено» badge; duplicates show «уже есть» and start unchecked.
   - Sticky «Добавить 12 слов» button.
4. **Библиотека:** search across FR/RU ignoring accents; chips Все / К повторению / Трудные / Без папки; a 2-column theme grid (emoji, count, due, mastery bar) with «Входящие» pinned first; a «Разложить с ИИ» button.
5. **План сортировки ИИ** (sheet): grouped moves, accept/decline per group, «Применить», undo.
6. **Папка → список слов → карточка слова:** swipe a row to move or delete. The word detail sheet has edit, history, «Перегенерировать с ИИ» and reset progress.
7. **Сессия завершена**, **Настройки**, **Вход (OTP)**.

## Phase 1: Core app
- Scaffold, Dexie schema, `lib/scheduler.ts`, and both review directions on FSRS.
  - Sessions end with «На сегодня всё», plus «Ещё практика» for extra rounds that don't change scheduling.
  - Keyboard shortcuts: Space flips, 1/2/3 grade, Z undoes.
- Import the prototype's 11 words as new cards.
- Library, folders, word CRUD (manual), JSON export/import.
- Supabase project, SQL migration with RLS, OTP login, sync loop (pull on open/focus, debounced push), cron ping.
- PWA. Deploy to Vercel (Vercel MCP: create project, env vars).

## Phase 2: AI predictive input
- **Tier 1, instant and local:** a build-time Lexique 4.1 lemma index (accent-folded, frequency-ranked, ~300–400 KB gzip) with client-side prefix search. «se »/«s'» are stripped before lookup.
- **Tier 2, `POST /api/ai/suggest`:** `streamText` + Output schema `{fr, ru, note, pos, gender, register, folder, alternatives, newFolder, confidence}`, up to 3 suggestions.
  - The folder enum is built per request from existing slugs + `NEW` + `INBOX`, so per-word sorting comes free with the same call.
  - Frozen system prompt of ≥512 tokens with argot/verlan few-shots and `cacheControl: ephemeral`.
  - Client: 300 ms debounce, ≥3 characters, abort on each keystroke, filter earlier results locally when they already match.
- Russian input is detected and the direction flipped (fill RU, suggest FR).

## Phase 3: Screenshot extraction
- **Client:** `createImageBitmap`, optional crop, fit the long edge to ≤2576 px, tile very tall screenshots (≤4 tiles), encode WebP 0.9 with a JPEG fallback, keep each upload ≤1.5 MB, send as multipart. `accept` lists png/jpeg/webp and never heic.
- **`POST /api/ai/extract`:** `streamText` + `Output.array(VocabItem)` (fields as researched: fr, frAsSeen, ru, ruSuggested, note, pos, gender, register, provenance, confidence, issue, suggestedFolder, newFolder). Rows stream as NDJSON. Images are not stored.
- Always ends on the review screen; nothing is saved automatically.
- Start on Haiku 5.5 and switch to Sonnet 5.5 if it fails on ~20 real screenshots.

## Phase 4: AI re-sort («Разложить с ИИ»)
- **Pass A (taxonomy):** propose 8–25 folders, keeping locked and user folders.
- **Pass B (assignment):** chunks of ~150 words in parallel.
- The diff is built in code and shown as a reviewable plan; applying it writes `reorg_runs` for undo.
- **Rules:**
  - The AI never moves `folder_source='user'` words.
  - A new folder needs ≥3 words.
  - Register is a tag, never a folder.
  - Low confidence goes to «Входящие».
  - Manually placed words are used as few-shot examples.
- Embeddings (duplicates, similar words) come later.

## Files to create (representative)
- `app/(app)/review/page.tsx`, `app/(app)/library/page.tsx`, `app/(app)/library/[slug]/page.tsx`, `app/login/page.tsx`
- `components/review/Card.tsx`, `components/review/GradeBar.tsx`, `components/add/QuickAddSheet.tsx`, `components/import/ScreenshotReview.tsx`, `components/library/SortPlanSheet.tsx`
- `lib/db.ts` (Dexie), `lib/scheduler.ts`, `lib/sync.ts`, `lib/supabase.ts`, `lib/image-prep.ts`, `lib/lexique-search.ts`
- `lib/ai/schemas.ts`, `lib/ai/prompts.ts`, `app/api/ai/{suggest,extract,classify}/route.ts`, `app/api/cron/ping/route.ts`
- `supabase/migrations/0001_init.sql`, `scripts/build-lexique.ts`, `app/manifest.ts`, `app/sw.ts`, `mockups/index.html`, `NOTICE.md` (attributions)

## Execution approach
Ultracode, with one workflow per phase:
- design agents for the mockups
- implementation agents per area (scheduler/data, review UI, library, AI routes), each followed by an adversarial review/verify pass

The user reviews the mockups before Phase 1. Commit and push to `ccr-8a1fb2eb-6rovnb` after each phase; no PR unless asked.

## Verification
- **Mockups:** a Playwright screenshot of each frame at 390×844, light and dark, attached for review.
- **Unit tests (Vitest):** the scheduler wrapper (grading maps to FSRS, per-direction state), sync merge (LWW, tombstones), image-prep sizing and tiling, Lexique prefix search, zod schemas checked against Anthropic constraints.
- **AI spike before Phase 2:** call Haiku 5.5 from `fra1`; check latency, `result.warnings`, and `cacheReadTokens > 0` on the second call.
- **E2E (Playwright, mobile viewport):** add a word through the suggestion flow → it appears in its folder → review it in both directions → undo. Screenshot import with a fixture image → review list → add. AI re-sort plan → apply → undo.
- **Deploy:** Vercel preview via MCP, then test on a real phone: install the PWA, OTP login inside the home-screen app, offline review, sync between phone and laptop.
- `npm run lint && npm run typecheck && npm test && npm run build` pass before each push.

## Defaults the user may want to override
- FSRS daily sessions (with «Ещё практика») rather than the prototype's endless weighted mode.
- Three grade buttons.
- Haiku for screenshots.
- AI proposes ~8 starter themes from the first words, for the user to approve.
- Screenshots are not kept.
