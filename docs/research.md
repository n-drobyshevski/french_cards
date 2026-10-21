# Petit Argot v2: recommended architecture (as of 2026-10-21)

## 1. Fork or scaffold
Scaffold a new app and borrow code from existing projects. No candidate combines MIT licensing, Next.js on Vercel, mobile-first design, a vocabulary focus, FSRS and AI.

Borrow from these, with attribution, by copying the code in now:
- **ts-fsrs-demo** (MIT): card and revlog schema, undo of the last review, FSRS parameter settings. https://github.com/ishiko732/ts-fsrs-demo
- **jiaci** (MIT): the zod-validated word-entry schema pattern, the rating bar, swipe gestures and the PWA install prompt. https://github.com/leoon-hu/jiaci
- **Jolito** (Apache-2.0, keep its LICENSE and NOTICE text): the linked reciprocal-card model, which matches our FR→RU / RU→FR toggle. https://github.com/smolkaj/jolito

Use the following as ideas only:
- **Nibomo** (MIT): too heavy to fork.
- **Oblivian**: GitHub detects no license, so do not copy its code.
- All GPL and AGPL projects (read-frog, scholarsome, skola, ordkort, LinguaCafe).

The prototype `Petit_Argot.html` already defines the UX, so the new app ports that UX rather than inheriting another app's.

## 2. Stack and versions
Checked against the npm registry today where marked.

- **Framework:** Next.js 16.4.x (App Router, Turbopack, TypeScript), React 19.2, Tailwind 4.3.3, shadcn/ui. Its Drawer is built on vaul 1.1.2, which has had no release since 2024-12.
- **Node:** set Node 24 in Vercel project settings. AI SDK 7 requires Node 22 or later and its docs recommend 24 or 26 for production. Packages are ESM-only.
- **AI:**
  - `ai@^7` (7.0.148, verified), `@ai-sdk/react@^4`, `@ai-sdk/anthropic@^4`, `zod@^4`.
  - Call the Anthropic API directly with `ANTHROPIC_API_KEY`. This keeps prompt caching easy to reason about.
  - Vercel AI Gateway (no markup) is an optional later swap.
- **Scheduling:** `ts-fsrs@^5.4.2` (FSRS-6, no runtime dependencies). Do not use the 6.0 beta (FSRS-7, breaking API, needs Node 24).
- **Local storage:** `dexie@^4.4.6` (verified latest; one report said 4.4.7) plus `dexie-react-hooks`.
- **PWA:**
  - `@serwist/turbopack@9.5.13` (verified) with `esbuild` and `serwist` as dev dependencies, plus `app/manifest.ts`.
  - Do not use `@serwist/next`. Next.js 16 builds with Turbopack by default and `@serwist/next` needs a `--webpack` build.

## 3. Spaced repetition
- Use FSRS through ts-fsrs, wrapped in `lib/scheduler.ts` so a later move to v6/FSRS-7 touches one file.
- Keep **one scheduling state per direction** for each word (`fr_ru` and `ru_fr`), in the style of Jolito's reciprocal cards. The prototype keeps a single shared state keyed by `fr`.
- Keep the Again / Hard / Good buttons, mapped to `Rating.Again`, `Rating.Hard` and `Rating.Good`. Use `repeat()` to show the next interval under each button.
- Store an append-only review log so FSRS parameters can be re-optimized later.
- **Migrating the prototype:** it has 11 hard-coded words and state of the form `{box, lapses, seen}` keyed by `fr` in localStorage key `petit-argot-v1`. Import the words and reset them as new cards. The data is too small to justify a heuristic mapping from box to FSRS stability.

## 4. Storage, sync and auth
**Offline-first.** Dexie (IndexedDB) is the source of truth on the device and the UI reads it with `useLiveQuery`. The server is only for sync and backup.

Data model:
- **folders:** id, slug, name_fr, name_ru, emoji, description, created_by ('user' or 'ai'), locked, sort, updated_at, deleted_at.
- **words:** id (UUID generated on the client), fr, ru, note, example, register, pos, gender, tags[], folder_id (null means Inbox), folder_source ('ai' or 'user'), folder_confidence ('high', 'med' or 'low'), source ('manual', 'ai' or 'screenshot'), updated_at, deleted_at.
- **review_state:** primary key (word_id, direction), holding the FSRS card fields (due, stability, difficulty, state, reps, lapses, last_review).
- **review_log:** append-only.
- **reorg_runs:** the sort plan and the data needed to undo it.

Rollout:
- **Phase 1 (one user):** Dexie only, plus JSON export and import. A shared passcode is kept in a Vercel environment variable and checked by a route that sets a signed httpOnly cookie (jose). Proxy/middleware uses that cookie to guard the `/api/ai/*` routes.
- **Phase 2 (sync, small group):** Supabase Free.
  - Postgres with row-level security on `user_id = auth.uid()`.
  - Sync is last-write-wins upserts on `updated_at`, about 100 lines of code.
  - Login uses an **email OTP code, not a magic link**. On iOS, a magic link opens in Safari, which does not share cookies with the installed Home Screen app.
  - Add custom SMTP (Resend or Brevo) before inviting friends. Supabase's built-in SMTP only sends to project team members, at about 2 emails per hour.
  - A daily Vercel cron ping prevents the 7-day idle pause.
- **Alternatives:** Dexie Cloud Free (3 users, 100 MB, built-in OTP and sync, proprietary) is the fastest path. Neon with Managed Better Auth never pauses but needs a hand-written sync API.

## 5. AI: provider, models and endpoints
**Provider:** Anthropic only, for one key and one bill.
- Default model: `claude-haiku-5-5`. Verified price: $0.10 input / $0.50 output per million tokens, $0.01 for cache hits, $0.125 for 5-minute cache writes.
- Escalation model: `claude-sonnet-5-5` at $2 / $10.
- At this volume the cost is under $1 per month.

**Settings for every route**
- `providerOptions.anthropic: { thinking: { type: 'disabled' }, effort: 'low' }`. Haiku 5.5 is not one of the adaptive-only models, so turning thinking off is allowed. The provider strips that setting only on Sonnet 5.5, Opus 5.5 and Fable models.
- Never set `temperature`, `top_p` or `top_k`, and never prefill the assistant turn. Haiku 5.5 returns a 400 for any of these.
- Use `generateText` or `streamText` with `output: Output.object(...)` or `Output.array(...)`. Do not use `generateObject`.
- `export const maxDuration` = 15 to 60 s, Node runtime, region `fra1` or `cdg1`, `abortSignal: req.signal`.

**Schema rules**, from Anthropic's structured-output docs (verified):
- No `.min()`, `.max()` or `.length()` on strings, numbers or arrays. `minItems` may only be 0 or 1, and `maxItems` counts as unsupported. Put limits in `.describe()` text and slice results on the server.
- Make every field required and use `.nullable()` instead of `.optional()`.
- At most 16 nullable or union parameters, and at most 24 optional ones, across all schemas in one request.
- Confidence is an enum (`high`, `med`, `low`), not a number.
- Compare enum values case-insensitively.

**Endpoints**

1. **`POST /api/ai/suggest`** (predictive entry)
   - **Local tier, instant:** on every keystroke, search a Lexique 4.1 lemma index on the client. The index is accent-folded, ranked by subtitle frequency and about 300–400 KB gzipped, built at build time and searched by binary-searched prefix range. Strip a leading "se " / "s'" before lookup.
   - **AI tier:** `streamText` with the Suggest schema `{fr, ru, note, pos, gender, register, folder, alternatives, newFolder}`, returning up to 3 suggestions.
   - Request timing: send after a 300–350 ms debounce once the input has 3 or more characters, and abort the previous request on each new keystroke. If earlier results already match the longer prefix, filter them locally instead of calling again.
   - **Caching:** mark a frozen system prompt of at least 512 tokens, with few-shot argot and verlan examples, as `cacheControl: ephemeral`. Verified: 512 tokens is the minimum for Haiku 5.5, and shorter prompts are silently not cached. Also keep a Vercel Runtime Cache keyed by `promptVersion|dir|fold(q)`.
   - The same call returns the folder choice for the word (endpoint 3a), so per-word sorting costs nothing extra.
2. **`POST /api/ai/extract`** (screenshot to word pairs)
   - **Client:** convert HEIC and re-encode every image. Fit it to a long edge of at most 2576 px and roughly 4784 visual tokens. Split very tall screenshots (height/width > 2.2) into at most 4 tiles with overlap. Encode WebP at quality 0.9, falling back to JPEG if the browser returns another type. Keep each upload under about 1.5 MB, because Vercel caps function request bodies at 4.5 MB on every plan.
   - **Upload:** send as multipart FormData. The file input uses `accept="image/png,image/jpeg,image/webp"`. Never list `image/heic`, since Safari may convert files to the first listed type.
   - **Route:** `streamText` with `Output.array({ element: VocabItem })`. Images are sent as `{ type: 'file', mediaType: 'image', data: bytes }`, the v7 replacement for `type: 'image'`. Put the images before the prompt text. Stream rows to the client as they arrive via `elementStream`.
   - VocabItem fields: fr, frAsSeen, ru, ruSuggested, note, pos, gender, register, provenance, confidence, issue, suggestedFolder, newFolder.
   - Do not store images.
   - Always end on a review screen. Nothing is saved automatically.
3. **`POST /api/ai/classify`** (sort into folders)
   - **(a) Per word:** handled by the suggest call above, using `z.enum([...slugs, 'NEW', 'INBOX'])` built per request. Low confidence goes to the Inbox.
   - **(b) Re-sort all, on request only:**
     - Pass A asks for a folder taxonomy (8–25 folders; locked and user-created folders are kept).
     - Pass B assigns words in chunks of about 150, run in parallel with `elementStream`.
     - The result is a plan the user reviews: "N moves, new folders, merges, M manually placed words untouched". The user applies it, and it can be undone.
   - **Rules:** the AI never moves a word whose `folder_source` is `user`. A new folder is created only if at least 3 words support it. Register (argot, verlan, familier, vulgaire) is a tag, never a folder. Folders filter study sessions but do not change scheduling. Words the user placed manually are fed back as few-shot examples.
   - Embeddings (for duplicates, similar words and few-shot retrieval) come in a later phase, not in v1.

## 6. PWA
- `app/manifest.ts` with 192, 512 and maskable icons, `display: standalone`.
- `appleWebApp` metadata and a 180 px apple-touch-icon.
- Serwist through Turbopack: precache the app shell and an `/~offline` page, and serve `sw.js` with `Cache-Control: no-cache`.
- Call `navigator.storage.persist()`.
- When not running standalone on iOS, show "Share → Add to Home Screen" instructions.
- `share_target` for screenshots works on Android and Chromium only; iOS has no support.
- Position the add sheet with `visualViewport`, because iOS Safari ignores `interactive-widget=resizes-content` through 26.5.

## 7. Screens to mock up
Mobile widths of 360–430 px, one-handed use, with every repeated action in the bottom third. Bottom tab bar: **Review | raised (+) Add | Library**.

1. **Review**
   - States: card front, card back, swipe-drag (right = Good, left = Again, Hard is a button only), and the undo snackbar.
   - Top strip: "N left", a direction chip and a theme filter chip.
   - Before the flip, the bottom slot holds one "Show" button. After the flip it holds Again / Hard / Good, each with its interval. Hard is narrow and neutral-coloured so it reads as a pass.
2. **Quick-add sheet**
   - States: empty; local results with AI suggestions streaming in; a suggestion picked and the fields filled for editing; duplicate warning; offline manual form.
   - Folder chip plus 2 alternatives, and a "+ New: …" chip.
   - Buttons: "Ajouter" and "Ajouter + suivant".
   - Header entry points: Screenshot and Paste list.
3. **Screenshot import review**
   - States: processing (thumbnail, skeleton rows, Stop); streamed rows with checkboxes; low-confidence rows marked amber; AI-suggested translations in italics with a "suggested" badge; "déjà ajouté" duplicates unchecked; empty result.
   - Sticky bottom button: "Ajouter N mots".
4. **Library**
   - Search across FR and RU, ignoring accents.
   - Chips: All, Due, Difficult, Unsorted.
   - Two-column grid of theme cards with count, due count and a mastery bar. The Inbox card is pinned first when it has items.
   - "Trier automatiquement" button.
5. **AI re-sort plan sheet**: grouped moves, per-group accept or decline, Appliquer, Undo.
6. **Theme detail / word list**: swipe a row for Move or Delete. Tapping a row opens the word detail sheet (edit fields, review history, "Regénérer avec IA", reset progress).
7. **Session complete**: counts, "Review missed", "Add words". The next round does not start automatically.
8. **Settings**: theme, default direction, daily new-card limit, 2- or 3-button grading, AI on or off with a privacy note, export and import, account.
9. **Passcode / login screen.**
10. Dark variants of Review and Library: surface around #121212–#1a1a1a, grade colours always paired with text labels, AA contrast.

## 8. Build order
0. **Mockups** (the screens above). In parallel, run a **spike** that confirms Haiku 5.5 latency from fra1 with thinking disabled, `result.warnings`, `cacheReadTokens` > 0, and the v7 helper names.
1. **Core:** scaffold, Dexie schema, prototype import, review screen with ts-fsrs and both directions, Library and folders (manual), word CRUD, PWA, passcode, deploy to Vercel.
2. **AI entry:** the Lexique index, `/api/ai/suggest`, the quick-add sheet with per-word folder choice and the Inbox.
3. **Screenshot import:** client image preparation, `/api/ai/extract`, the review screen.
4. **AI re-sort:** taxonomy and assignment passes, the plan screen, undo.
5. **Sync and auth:** Supabase with OTP, the sync loop, the cron ping, then inviting friends.
6. **Later:** embeddings (duplicates, similar words), web push reminders, the FSRS optimizer.

## 9. Open questions for the user
Each has a recommended default.

1. **Review model.** Due-date FSRS sessions that end ("done for today") or the prototype's endless weighted practice?
   *Default:* FSRS, plus a "Practice anyway" button for extra rounds that do not affect scheduling.
2. **Users.** Just you, or friends from day one? This decides passcode only versus Supabase OTP now.
   *Default:* passcode in Phase 1, Supabase in Phase 5.
3. **Sync backend.** Supabase (open, Postgres) or Dexie Cloud (fastest, proprietary)?
   *Default:* Supabase.
4. **Screenshot model.** Haiku 5.5 (about $0.001 per image) or Sonnet 5.5 (about $0.01–0.02 per image)?
   *Default:* Haiku 5.5. Switch to Sonnet if it fails an accuracy check on 20 real screenshots.
5. **Interface language.** The research mockups use French UI copy ("Ajouter", "Trier automatiquement"). Should the UI be French, Russian, or switchable? Notes are written in Russian.
   *Default:* French UI, Russian notes, as in the prototype.
6. **Grading.** Three buttons, or the two-button Again/Good that many Anki users prefer?
   *Default:* three buttons, with two as a setting.
7. **Folder seeding.** Should the AI propose the first folder set, or do you create them?
   *Default:* the AI proposes about 8 starter themes from your first words, and you approve them.
8. **Keeping screenshots.** *Default:* no. Images are discarded after extraction.

## 10. Claims in the reports that are outdated, wrong or unverified
- **Wrong (verified):** report 2's code puts `{role:'system'}` inside `messages`. AI SDK 7 rejects system messages in `messages` unless `allowSystemInMessages: true` is set. Either set that flag and keep `cacheControl` on the system message (the form the provider docs show), or use `instructions` (whether `cacheControl` works there is undocumented).
- **Wrong (verified):** the concern that "thinking: disabled gets stripped" does not apply to Haiku 5.5. It applies to Sonnet 5.5, Opus 5.5 and Fable models, where `reasoning: 'none'` is mapped to `effort: 'low'`. On Haiku, use `thinking: { type: 'disabled' }` directly.
- **Outdated:** report 3 cites `ai` 7.0.77; the current version is 7.0.148. Report 4 says Dexie 4.4.7; the registry shows 4.4.6. Report 1's `@serwist/next` is the webpack path; use `@serwist/turbopack`.
- **Conflicts with Anthropic limits:** report 5's schema sketch uses `.max(2)` and a numeric `confidence`. Both break under Anthropic structured outputs. Report 5's "16 nullable" and report 3's "24 optional" are separate limits and both apply.
- **Overstated:** "generateObject/streamObject deprecated". The v7 migration guide does not list that. Prefer `Output` regardless.
- **Unverified:**
  - The exact v7 streaming helpers (`toTextStream`, `createTextStreamResponse`, `useObject().stop`), and how `elementStream` is sent over HTTP.
  - Whether Haiku 5.5 reads images in the 2576 px high-resolution tier.
  - Whether the AI Gateway free tier includes Anthropic models, and its slug format for Haiku 5.5.
  - Whether wiktextract's French Wiktionary output includes `translations[].lang_code == 'ru'`.
  - Lexique's license: the page text says CC BY-SA but the link points to CC BY-NC. Either is fine for personal use.
  - Haiku 5.5 latency: published figures range from about 0.8 s to 12 s and more to first token. Measure it.
  - The iOS 26 "Open as Web App" default.
  - Quizlet's current swipe behaviour.
  - All GitHub star and commit counts are snapshots.
  - No Mobbin screen references are available: the MCP returned errors and then required a paid plan.
- **Verified today:** Haiku 5.5, Sonnet 5.5, Opus 5.5 and Haiku 4.5 prices; the 512-token cache minimum; the structured-output limits; `ai@7.0.148`, `@serwist/turbopack@9.5.13`, `dexie@4.4.6`.

Sources: https://registry.npmjs.org/ai/latest · https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0 · https://ai-sdk.dev/providers/ai-sdk-providers/anthropic · https://platform.claude.com/docs/en/about-claude/pricing · https://platform.claude.com/docs/en/build-with-claude/prompt-caching · https://platform.claude.com/docs/en/build-with-claude/structured-outputs · https://registry.npmjs.org/@serwist/turbopack/latest · https://registry.npmjs.org/dexie/latest · https://vercel.com/docs/functions/limitations · https://github.com/open-spaced-repetition/ts-fsrs

Prototype read (read-only): /root/.claude/uploads/ae44d364-7fd9-50b8-b908-ac71a97a6dd6/33b33b8f-Petit_Argot.html

===  OSS starters for a mobile-first FR<->RU vocab flashcard app (Next.js/Vercel, FSRS, AI): fork vs scaffold, plus ts-fsrs status
REC: Scaffold a new app and borrow pieces; don't fork. No existing project combines all of: MIT, Next.js on Vercel, mobile-first, vocabulary-focused, FSRS and AI.

**Why not fork the closest candidates:**
- **ts-fsrs-demo** is desktop-oriented, has no AI, and is tied to GitHub OAuth, Kysely and Docker Postgres.
- **jiaci** is 33 commits old, written in Chinese, and organized around fixed wordbooks.
- **Nibomo** is a multi-platform Vite/AWS monorepo with roughly 8k commits.
- **Oblivian** has no confirmed license and no activity for about a year.

Forking any of them means ripping out more than we keep. Our app is for one user or a small group, and the existing single-file Petit Argot prototype already defines the UX.

**Plan:**
1. `create-next-app` with Next 16.4 (App Router), TypeScript, Tailwind 4, and shadcn/ui, plus vaul for bottom sheets. Mobile-first PWA via @serwist/next.
2. Scheduling: ts-fsrs pinned to ^5.4.2, using `fsrs()`, `createEmptyCard()`, `repeat()` and `next()`, wrapped in `lib/scheduler.ts` so a later v6/FSRS-7 upgrade touches one file. Keep the existing Again/Hard/Good buttons and use `repeat()` to show the next interval on each one.
3. Storage: Dexie/IndexedDB for local-first, offline review. Optionally sync to a hosted Postgres or Supabase later for the small group.
4. AI via Vercel AI SDK `ai@7`:
   - a route handler for predictive entry using `streamObject` with a zod `{fr, ru, note, register, examples, themeSuggestions}` schema
   - multimodal `generateObject` for screenshot to word pairs, with heic-to for iPhone images
   - theme auto-sorting through an LLM classification call over the existing folder list, optionally with embeddings
5. Code to borrow, with attribution:
   - from ts-fsrs-demo (MIT): the card/revlog schema, the undo-last-review flow and the FSRS parameter settings
   - from jiaci (MIT): the zod-validated word-entry schema pattern, the rating bar and swipe gestures, and the PWA install prompt
   - from Jolito (Apache-2.0, keep its NOTICE): the linked reciprocal FR to RU / RU to FR card model and the review gestures
   - from Nibomo and Oblivian: ideas only, for AI card improvement and embedding-based deck recommendation
6. Keep all GPL and AGPL projects as visual and UX references only.
RISKS: ['ts-fsrs v6 (FSRS-7) is in beta with a breaking API (DefaultScheduler, async init, revlog) and needs Node >=24. Starting on 5.4.2 means a migration later. Isolate it behind one module and store the raw revlog so parameters can be re-optimized after the switch.', 'Migrating localStorage progress from the Leitner-style prototype has no exact FSRS equivalent. Either reset cards as new with createEmptyCard, or seed due/stability heuristically from the old box and weight. Decide this before the mockups are final.', 'Small or new candidates (jiaci, Oblivian) may disappear or change license. Copy the borrowed snippets with their license headers and attribution now rather than depending on the repos.', "Oblivian's MIT claim is unverified (GitHub detects no license file), so treat it as all-rights-reserved and don't copy code from it.", 'Apache-2.0 code from Jolito requires keeping its license and NOTICE text for any copied files.', 'Vercel function limits apply to screenshot extraction: large images and slow multimodal calls can hit body-size and timeout limits. Downscale and compress images on the client (and convert HEIC) before upload.', "Vaul has had no release since 2024-12. It still works with React 19, but consider shadcn's drawer or a maintained alternative if issues come up.", 'The GitHub search API was only partly reachable from this session: repo metadata came from search results, and READMEs were read through WebFetch and raw.githubusercontent. Some stars and commit counts are snapshots from 2026-10-21 and may be slightly off.']

===  AI predictive word entry for a FR<->RU vocab app on Vercel: AI SDK 7, Anthropic/Claude Haiku 5.5, latency, cost, caching, plus a non-LLM prefix dictionary layer
REC: Build predictive entry in two tiers.

Tier 1, local and instant: at build time, turn Lexique 4.1 into a gzipped (about 300-400 KB) accent-folded, frequency-ranked lemma index with POS and gender. Optionally add FR->RU glosses for the top lemmas, precomputed from the kaikki.org fr.wiktionary extraction (CC BY-SA, credit it). Search it on the client with binary-search prefix ranges on every keystroke.

Tier 2, AI enrichment: one Next.js Node route, /api/suggest, on AI SDK 7 (ai@^7, @ai-sdk/anthropic@^4, zod, Node 22). It calls `streamText` with `Output.object(zod schema)` on `claude-haiku-5-5`, with reasoning off (`reasoning: 'none'`, falling back to `effort: 'low'`) and no temperature. The system prompt is frozen, at least 512 tokens with few-shot slang examples, and marked `cacheControl: ephemeral`. The route forwards `abortSignal: req.signal`, keeps a 30-day Runtime Cache (or Upstash) keyed by folded query plus prompt version, and has a simple passcode or rate limit. The client uses `experimental_useObject` with a 350 ms debounce, a minimum of 3 characters, stop() on each keystroke, and local narrowing of earlier results.

Expect about 0.6-1 s to the first AI suggestion and about $0.0001 per call, so 1,000 words cost under $1. Reuse the same route shape, with `generateText` and `Output.object` or an array schema, for screenshot extraction (image part) and AI folder sorting (folders plus words in, {wordId, folder, isNewFolder} out). Use Sonnet 5.5 only if Haiku's slang notes prove weak in a quick eval of about 30 real argot or verlan words.
RISKS: ['AI SDK 7 API names drifted across v5/v6/v7 (generateObject vs Output.object, result.output vs experimental_output, useObject stop/submit). Tutorials and third-party skill pages disagree. Check against installed typings and ai-sdk.dev v7 docs before writing the route.', "Disabling thinking on Haiku 5.5: Anthropic accepts thinking 'disabled' at effort <= high, but the AI SDK provider says it strips 'disabled' with a warning on 'adaptive-only' models. If it is stripped, adaptive thinking at the default 'medium' effort could add seconds of TTFT. Verify result.warnings and real latency in a spike.", "Haiku 5.5 returns a 400 for non-default temperature, top_p or top_k, and for assistant prefill. Do not carry over 'temperature: 0' habits.", 'Anthropic structured outputs may not honor numeric schema constraints (e.g. z.array().max(3), string lengths). Express limits in .describe() text and slice server-side rather than relying on the schema.', 'The Lexique license is ambiguous (page text says CC BY-SA 4.0, link points to CC BY-NC 4.0). That is fine for personal or non-commercial use but needs re-checking if the app is ever monetized. Wiktionary-derived data is CC BY-SA/GFDL and needs attribution, and the derived gloss file is share-alike.', "Whether wiktextract's fr.wiktionary JSON exposes Russian translations as `translations[].lang_code == 'ru'` is unverified. Inspect a sample before building the gloss pipeline. The full raw dump is 6.4 GB, so filter it with a streaming script offline, not in the Vercel build.", "Third-party Haiku 5.5 latency numbers conflict (0.8 s vs 12+ s TTFT) because they are measured at different reasoning settings. Measure from the chosen Vercel region before promising 'instant' AI suggestions.", 'The haiku-5.5 prompt-cache minimum (512 tokens) comes from a cached reference and should be confirmed. A system prompt below the minimum silently does not cache. Verify cacheReadTokens > 0.', 'A public Vercel URL exposes the API-key-backed route. Without a passcode or auth and rate limiting, anyone can spend the Anthropic budget.', 'The Vercel AI Gateway free $5 credit may not cover Anthropic models, and its model slug format for Haiku 5.5 is unverified.']

===  Extracting FR/RU vocabulary pairs from screenshots: a vision LLM (Claude via Vercel AI SDK) vs Tesseract.js, upload limits, client-side downscaling, structured-output schema and a review step before saving
REC: Use a vision LLM directly: Claude via AI SDK 7 with @ai-sdk/anthropic, one call per screenshot, streaming structured output into a review sheet. Do not use Tesseract.js in v1.

PIPELINE
1. Capture
- Button "Scan screenshot" opens <input type=file accept="image/png,image/jpeg,image/webp" multiple>.
- Also accept pasting from the clipboard (desktop) and drag-and-drop.
- Optional: register a PWA share_target so screenshots can be shared from the phone's share sheet. Treat it as Android/Chromium-only; I did not check Safari support.

2. Client preparation (no library needed)
- Decode with createImageBitmap(file). Modern browsers apply EXIF orientation by default.
- Let the user crop. Cropping helps accuracy and cost the most.
- Fit to the high-res tier: long edge <= 2576 px and ceil(w/28)*ceil(h/28) <= 4784.
- If height/width > 2.2 (long scrolling screenshot), do not shrink it. Split it into tiles about 2x the width tall, with 10% overlap, at most 4 tiles.
- Encode with canvas.toBlob('image/webp', 0.9). If blob.type is not webp (older Safari may silently return PNG; unverified), retry with 'image/jpeg', 0.9.
- Never compress twice. Target <= 1.5 MB per tile and refuse anything over 4 MB total before upload.
- Send as FormData (binary), not base64 JSON.

3. Route: app/api/extract/route.ts on the Node runtime, maxDuration 60
- Check size and file type from the first bytes.
- Run streamText({ model: anthropic('claude-opus-5-5') — or 'claude-sonnet-5-5' / 'claude-haiku-5-5' after a 20-screenshot accuracy check; that is the user's call —, providerOptions: { anthropic: { effort: 'low' } }, instructions: SYSTEM, output: Output.array({ element: VocabItem }), messages: [{ role:'user', content: [ {type:'text',text:'Image 1:'}, {type:'file', mediaType:'image', data: bytes}, …, {type:'text', text: `Existing folders: ${JSON.stringify(folderNames)}. Extract every French word/expression and its Russian translation…`} ] }] }).
- Put the images first and the instructions last.
- Write elementStream to the client as NDJSON. Check finishReason for 'length' or a refusal.
- Do not store the image.
- Protect the route with a shared secret or session plus a simple per-IP rate limit, because each call costs money.
- Before relying on the exact streaming and response helpers, check them against the AI SDK 7 docs.

4. Prompt rules
- Pair a French item with Russian text only when the image shows them together: same line, separator, or adjacent chat bubble.
- If no translation is visible, set ru=null and put a suggestion in ruSuggested.
- Normalize fr to its dictionary form (infinitive, masc. sg., keep 'se' for pronominal verbs). Keep the exact text from the image in frAsSeen.
- Never invent words that are not in the image. Ignore UI chrome: timestamps, names, buttons.
- For overlapping tiles, list each item once.
- Pick suggestedFolder only from the existing folder names, or propose newFolder.

SCHEMA (Zod; every field required, nullable where noted; no min/max constraints, per Anthropic's structured-output limits)
VocabItem = z.object({
  fr: z.string(),                        // canonical: "se casser"
  frAsSeen: z.string().nullable(),       // "je me casse" if different
  ru: z.string().nullable(),             // translation visible in the image
  ruSuggested: z.string().nullable(),    // AI translation when ru is null or looks wrong
  note: z.string().nullable(),           // "argot: partir, s'en aller"
  pos: z.enum(['noun','verb','adj','adv','expression','other']),
  gender: z.enum(['m','f','mf','none']),
  register: z.enum(['neutral','familier','argot','verlan','vulgaire']),
  provenance: z.enum(['pair_in_image','fr_only_in_image','ru_only_in_image']),
  confidence: z.enum(['high','medium','low']),   // low if blurry, cut off or ambiguous pairing
  issue: z.string().nullable(),          // "text cut off at right edge"
  suggestedFolder: z.string().nullable(),
  newFolder: z.string().nullable()
})
- Use Output.array of VocabItem. If whole-image metadata is wanted, use Output.object({ items, sourceKind: enum[notes, chat, textbook, subtitles, other], nothingFound: boolean }) with partialOutputStream.
- Compare enum values case-insensitively on the client.

REVIEW / CONFIRM UX (mobile bottom sheet)
- While the request runs: the cropped thumbnail at the top and skeleton rows, with real rows replacing the skeletons as they stream in. A "Stop" button cancels the request.
- Each row is a card showing FR -> RU, a note line, register and gender chips, and the folder chip.
- Rows are pre-checked if confidence=high and the word is not a duplicate.
- Low-confidence rows get an amber edge plus the issue text.
- Rows whose Russian is AI-suggested show it in italics with a "suggested" badge, so a guessed translation is never confused with one actually in the image.
- Duplicates are detected on the client: NFC, lowercase, strip le/la/l'/les/un/une, compare against the deck. They show an "Already in <folder>" badge, are unchecked, and offer "Merge note".
- Tap a field to edit it inline. Swipe left to discard. The folder chip opens a picker of existing folders plus "+ newFolder".
- Sticky bottom bar: "Select all / none" and the primary button "Add 12 words".
- After saving, an "Undo" toast stays for about 5 s.
- Empty result: "No word pairs found" with tips (crop tighter, use light mode) and "Try again".
- Errors: 413 means the client should retry with stronger compression automatically. A refusal or truncation shows the rows already received, plus "Some items may be missing".
- Saved words go into the deck through the same code path as manual entry, so Leitner state starts fresh.

Tesseract.js (v7, Apache-2.0) only becomes worth adding if offline or no-API-cost scanning is ever needed. The vision-LLM path is simpler, handles chat and notes layouts, mixed Latin/Cyrillic and dark mode, fills in missing translations and slang notes, and costs about $0.01–0.04 per screenshot on Sonnet/Opus 5.5.
RISKS: ["Hallucinated or wrongly paired items: the vision model can pair a French word with the Russian from the next line, or invent plausible slang glosses. Mitigation: the provenance field, italic 'suggested' translations, the confidence enum, and a review step that is never skipped.", 'Very tall screenshots downscaled server-side become unreadable. Client tiling is required, and duplicates in the overlap must be removed by the prompt plus client-side dedupe.', "Vercel's 4.5 MB body limit is hard on all plans. Multi-image batches over the limit need direct-to-Blob client upload (@vercel/blob/client) and an image URL source, which adds storage and privacy considerations.", "AI SDK 7 is a fresh major version: image parts moved to type:'file', system was renamed to instructions, and Node 22+ is required. Many tutorials and examples online still show v6 syntax. Pin versions and check against ai-sdk.dev.", 'Anthropic structured outputs reject minLength/maxLength/min/max and minItems>1 (400 error) and cap optional fields at 24. Zod schemas with .min()/.optional() everywhere will break. Use required + nullable fields.', "Opus 5.5 cannot turn thinking off and Sonnet 5.5's lowest setting is 'between_tools'. At default effort, latency and output-token cost are higher than needed. Set effort 'low' explicitly and measure.", 'Refusal or max_tokens stops produce JSON that does not match the schema. Handle finishReason and keep the rows already streamed.', 'iOS HEIC/accept-attribute quirks (Safari 17+ converts to the first listed MIME type) can turn uploads into HEIC, which Claude rejects. Never list image/heic, and always re-encode on the client.', "Safari's canvas.toBlob may not encode WebP (unverified). Always check blob.type and fall back to JPEG at quality 0.9; avoid repeated lossy passes, which degrade small accented and Cyrillic text.", 'Cost and abuse: an unauthenticated /api/extract endpoint lets anyone spend the API key. Add auth or a shared secret plus rate limiting even for a single-user app.', "Unverified details: the exact elementStream-to-HTTP streaming helper names in AI SDK 7, Haiku 5.5's resolution tier, Web Share Target support on iOS, and the exact size of rus.traineddata. Check these during implementation."]

===  Storage, sync, auth and PWA installability for a small personal FR<->RU vocab app on Vercel (Oct 2026)
REC: Go offline-first. Store everything locally in Dexie 4 (IndexedDB), read it with useLiveQuery, and treat the server only as sync and backup.

Primary pick: Dexie + Supabase Free.
- Postgres with RLS on user_id. Words, folders, review_state, plus an optional review_log.
- Client-generated UUIDs, with updated_at and deleted_at on every row. Sync with last-write-wins upserts. Pull on app open and on focus, and push after changes (debounced).
- Login with a Supabase email OTP code (put {{ .Token }} in the Magic Link template), not a link, so the session lands inside the iOS Home Screen app.
- The built-in SMTP is enough while you are the only user. Add Resend or Brevo SMTP before inviting friends.
- Add a daily Vercel Cron ping so the free project never hits the 7-day pause.
- The AI features (predictive entry, screenshot extraction, auto-sorting) run as Next.js route handlers on Vercel. They return suggestions, and the client writes them to Dexie and syncs. Or the server writes to Supabase using the user's JWT.
- Moving to Pro ($25/month) later removes the pause entirely.

Fastest alternative: Dexie + Dexie Cloud Free.
- 3 production users, 100 MB, built-in email OTP and sync, so almost no sync code.
- Best if you want to ship in a weekend and accept a proprietary service.

Pick Neon + Managed Better Auth instead only if you prefer a server-centric setup:
- It never pauses and gives 1 GB.
- But you write the sync API yourself and there is no browser-side RLS.

Skip Turso for v1. Its browser sync maturity is unconfirmed and it has no built-in auth.

PWA:
- Next.js 16 with app/manifest.ts: 192, 512 and maskable icons, display standalone, plus appleWebApp metadata and a 180 px apple-touch-icon.
- Serwist through @serwist/turbopack. Precache the app shell and an /~offline page. Serve the service worker with no-cache.
- Call navigator.storage.persist() and show an iOS 'Share > Add to Home Screen' hint when not in standalone mode.
- Import the prototype's localStorage data into Dexie on first run.
RISKS: ['Supabase Free pauses after 7 days without activity and needs a manual unpause. Mitigate with a daily cron ping or upgrade to Pro ($25/month).', "Supabase's default SMTP only sends to project team members, about 2 emails per hour. Friends cannot log in until custom SMTP is configured.", 'On iOS, magic links open in Safari, not the installed PWA, because storage is separate. Use typed OTP codes or a passcode. Logging in on Safari does not carry over to the Home Screen app.', 'IndexedDB on iOS can still be evicted under storage pressure, and persist() is granted by heuristic. Keep the server copy as the source of backup and offer a JSON export.', 'Last-write-wins sync can lose a concurrent edit to the same word on two devices. Acceptable for one user. Keeping an append-only review log avoids losing review history.', "Dexie Cloud and InstantDB are proprietary hosted services (vendor lock-in). Dexie Cloud's free tier is limited to 3 production users and 100 MB.", "Neon's free compute has a cold start after 5 minutes idle (a few hundred ms), and Neon Auth was labelled Beta in older docs, so check its maturity.", 'Serwist with Turbopack is a newer path. Test the service worker on a production build (it is usually disabled in dev), and watch for stale-cache bugs after deploys.', 'Vercel Hobby is limited to non-commercial use and Hobby cron jobs run at most once a day. Fine for a personal app.', 'Some pricing figures (Neon paid rates, Dexie Cloud rate limits, Supabase custom-SMTP default of 30 per hour) come from secondary or inconsistent sources. Re-check before relying on them.']

===  AI auto-sorting of vocabulary into themed folders (FR<->RU slang flashcards, ~1000 words, Vercel + AI Gateway)
REC: RECOMMENDED DESIGN: an LLM-first hybrid. Assign a folder for each word inside the call that already adds the word, run an occasional "Re-sort all" that the user reviews before anything moves, and add embeddings later.

1) DATA MODEL (Postgres on Neon/Supabase, or IndexedDB in phase 0)
- folders: id, slug, name_fr, name_ru, emoji, description ("what belongs here", which the user can edit and the AI classifies against), created_by ('user'|'ai'), locked bool.
- words: id, fr, ru, note, folder_id (nullable means Inbox), folder_source ('ai'|'user'), folder_confidence real, folder_model text, folder_at timestamptz, tags text[], embedding vector(512) NULL (phase 2).
- folder_suggestions: proposed name/emoji, word_ids[], first_seen. Proposals collect here until enough words support them.
- reorg_runs: id, plan jsonb, applied_at, undo jsonb (previous folder_id for each moved word). This gives one-tap undo.

2) RULES THAT PROTECT USER OVERRIDES
- Any manual move or confirmation sets folder_source='user'. The AI never moves those words and never renames or deletes user-created or locked folders. It may only suggest changes, which the user can decline.
- Manually placed words become few-shot examples. Put up to 2 per folder in the prompt; in phase 2, retrieve the top 8 nearest by embedding instead.
- confidence < 0.6 goes to INBOX ("Unsorted, AI unsure" badge), never to a guessed folder.
- 'NEW' is allowed only when no existing folder fits. On the add-word sheet, show it as a chip ("+ New: 💸 Argent?") that the user taps to create. In batch mode, a proposed folder is created only if ≥3 words support it, which stops one-word folders piling up. Match proposals by normalized name; in phase 2 also by embedding similarity of the names.
- Keep register (argot/verlan/familier/vulgaire/vieilli) and part of speech as tags, never as folders.

3) PER-WORD ON INSERT, which is free because it rides on the enrichment call
The predictive-input/enrich endpoint already sends the term to the LLM. Add the folder list to that request and two fields to the output schema. The add-word sheet then shows the AI's pick as a preselected chip plus 2 alternative chips. Tapping a different chip counts as a user override.

Schema sketch (AI SDK 7, zod; built per request):
```ts
const slugs = folders.map(f => f.slug) as [string, ...string[]];
const Assign = z.object({
  folder: z.enum([...slugs, 'NEW', 'INBOX']),
  alternatives: z.array(z.enum(slugs)).max(2),
  newFolder: z.object({ slug: z.string(), name_fr: z.string(), name_ru: z.string(), emoji: z.string() }).nullable(),
  confidence: z.number(),            // 0..1, enforce in code (min/max not portable across strict schemas)
  tags: z.array(z.enum(['argot','verlan','familier','vulgaire','vieilli','expression','verbe','nom','adj'])),
  reason: z.string()                 // <= 12 words, shown on long-press
});
const { output } = await generateText({
  model: 'google/gemini-2.5-flash-lite', // or 'openai/gpt-5-nano' with reasoningEffort:'minimal'
  instructions: SYSTEM,
  prompt: render({ word, folders, examples }),
  output: Output.object({ schema: EnrichAndAssign /* enrich fields + Assign */ }),
});
```
Prompt sketch: "You sort French slang/colloquial vocabulary (with Russian translations) into the user's THEME folders. Theme means what the word is about (money, food, police, partying, emotions, people, insults...), never register. Register and part of speech go in tags. Folders (slug: description): {list}. Examples the user placed manually: {fr → slug}. Prefer an existing folder. Use NEW only if none fits and the theme is likely to recur. Use INBOX if unsure. Use slugs exactly."
Use slugs that mean something (e.g. "argent"), not UUIDs, and map them back on the server. Pass folder slugs and few-shot examples in a fixed prefix so provider prompt caching applies.

4) BATCH "RE-SORT ALL", run only on request, producing a plan the user reviews
- Pass A (taxonomy): send all words compactly, plus existing folders with locked/user flags. The model returns Output.object({folders:[{slug,name_fr,name_ru,emoji,description,mergeFrom:slug[]}]}) and must keep locked and user folders. Cap the total at 8-25 folders.
- Pass B (assign): send words that are not folder_source='user', in chunks of about 150, run in parallel, using streamText + Output.array({element:{id, folder:z.enum([...slugs,'INBOX']), confidence}}). Use elementStream to drive a progress bar.
- Build the diff in code and show a "Review plan" screen: "37 moves · 2 new folders · 1 merge · 214 manually placed words untouched". The user can uncheck any row, then Apply, which writes a reorg_runs row for undo. The AI never applies a plan silently.
- Run it automatically never, or offer it when the Inbox exceeds about 30 words or a folder exceeds about 80 words (suggest a split).

5) EMBEDDINGS (phase 2, optional)
Model: openai/text-embedding-3-small at dimensions 512, or alibaba/qwen3-embedding (multilingual, $0.01/M). Embed the enriched string "fr | ru | note" rather than the bare word; a bare slang token embeds poorly. Uses: (a) a duplicate or near-synonym warning on add ("you already have 'se tirer' in Partir"), (b) retrieving the nearest user-placed examples as few-shot context, (c) a "similar words" strip on the card back, (d) a drift check that flags a card whose 5 nearest neighbors are mostly in another folder ("Move?"). Store vectors in a pgvector column, or as float arrays and scan them in JS. No ANN index and no HDBSCAN or k-means: at 1000 words the LLM taxonomy pass does better than clustering.

6) COST ESTIMATES FOR ~1000 WORDS (Gateway list prices, Oct 2026)
- Per-word sort riding on the enrich call (about +400 input / +40 output tokens per word, so +0.4M input / +0.04M output in total): gpt-5-nano ≈ $0.04, gemini-2.5-flash-lite ≈ $0.06, claude-haiku-5.5 ≈ $0.06, gemini-3-flash ≈ $0.32.
- Per-word sort as its own call (about 800 input / 60 output tokens): flash-lite ≈ $0.10, gemini-3-flash ≈ $0.58 per 1000 words.
- One full re-sort (Pass A about 35k in / 2k out, Pass B about 7 × 5k in / 12k out total; about 70k in / 14k out overall): flash-lite ≈ $0.01, gemini-3-flash ≈ $0.08, a Sonnet-class model at about $3/$15 ≈ $0.42. Weekly re-sorts on gemini-3-flash for a year come to about $4.
- Embeddings for all 1000 words: about $0.0006. Storage at 512 dims is about 2 MB.
- Everything stays well under the $5 per 30 days AI Gateway free credit. Set a Gateway budget anyway.

Model choice: gemini-2.5-flash-lite or gpt-5-nano (minimal reasoning) for the per-word path. Use a stronger flash-tier model (gemini-3-flash or gpt-5-mini) for Pass A taxonomy, where folder naming quality in FR/RU matters. Sort into a single folder per word with tags alongside. Build phase 1 without embeddings.
RISKS: ["Model names and prices (e.g. claude-haiku-5.5, gemini-3-flash) come from Vercel's model catalog page as of Oct 2026 and were not checked against each provider. Check them before hard-coding. The free tier covers only some models, so the chosen model may not be free.", "Without strict rules, folder explosion and churn are likely: an LLM asked repeatedly will invent near-duplicate folders ('Argent', 'Fric & thunes') and shift borderline words. The ≥3-word rule for new folders, locked/user flags, and a reviewed plan instead of silent moves are what make this safe.", 'Mixing register (verlan/argot) with theme is the main source of classification instability for a slang deck. Keep register as tags.', 'Strict-schema portability: a runtime-built z.enum with many folder slugs plus nullable fields must stay flat. Anthropic caps strict schemas at 16 union/nullable params; OpenAI needs all fields required. Number min/max constraints are not portable, so clamp confidence in code.', 'gpt-5-nano is a reasoning model, and reasoning tokens are billed as output. Without minimal effort, cost and latency per word can rise several times.', 'Single-word or bare-slang embeddings are noisy, and general embedding models know slang poorly. Always embed the enriched text (fr | ru | note), and do not rely on embedding-only classification.', "Self-confidence scores from LLMs are poorly calibrated. Treat 0.6 as a UX threshold to tune against the user's corrections, not as a probability.", 'AI SDK 7 requires Node 22+ and ESM. If the project starts on v6 examples, `experimental_output` is removed and `system` is renamed to `instructions` (still accepted as a fallback).', 'Vercel Hobby functions top out at 300 s; a full re-sort should finish well within that if chunks run in parallel and progress is streamed. Supabase free projects reportedly pause after about a week idle; Neon suspends compute when the free monthly quota runs out.']

===  Mobile-first UX patterns for Petit Argot (FR<->RU slang flashcards): review card and grading, swipe, AI quick-add with autocomplete, screenshot import with review list, theme folders, navigation, thumb zone, dark mode
REC: CORE SCREENS (6), mobile-first at 360-430 px width, one-handed

Navigation: a bottom tab bar with 3 slots: Review | (+) Add (raised center FAB) | Library. Settings sits behind a gear in the Library header. Header chips are used only for in-screen filters: FR->RU / RU->FR toggle and theme filter. The bar respects env(safe-area-inset-bottom) and hides during an active review session to give focus mode.

1) REVIEW / TODAY (home)
- Top strip (low priority): progress ring or 'N left', a direction chip (FR->RU <-> RU->FR), and a theme filter chip ('All themes', 'Argot de rue'...). The default is All, mixed, following Anki's deck guidance.
- Card centered in the middle zone. Tap anywhere on the card to flip, using a fast 3D flip of about 200ms that respects prefers-reduced-motion.
- Answer side shows the translation, a usage note or example, and a register badge (argot, verlan, familier, vulgaire).
- Bottom bar, appearing after the flip: [Again] [Hard] [Good] buttons, each at least 48px tall and full-width split. Each shows the next interval underneath ('<1m', '1d', '4d'). Again and Good are wider; Hard is narrower and neutral-colored so it reads as a pass.
- Before the flip, the same slot holds one big 'Show' button so the thumb doesn't move.
- Swipes are active only on the answer side, with touch-action: pan-y and the card inset from the edges. Swipe right is Good (green 'Bien' label fades in with drag), swipe left is Again (red or amber). Commit at about 1/3 width or on a fast flick, otherwise snap back. Optionally swipe up is Hard.
- Feedback: a small check or cross flash (AnkiMobile style) and navigator.vibrate(10) on Android only.
- An 'Undo' snackbar shows for 4s, and there is a persistent undo icon in the top bar.
- Desktop keys: Space flips, 1/2/3 grade, Z undoes.
- Session complete screen: counts, 'Review missed (n)', 'Add words'. No auto-start of the next round.

2) QUICK-ADD SHEET (center +)
- A vaul bottom sheet opens with the input autofocused and expands to full height when the keyboard opens. Position it with visualViewport, because iOS Safari ignores interactive-widget.
- One smart field ('Tape un mot ou une expression...'). After about 250ms debounce, an AI suggestion list appears directly above the keyboard, like Quizlet's term then definition suggestions. Each row shows the FR lemma with the matched part bolded ('se cass|er'), the RU translation, a register badge and a proposed theme chip.
- Inline ghost-text completion is accepted with Tab or the right arrow on desktop.
- Tapping a row fills FR, RU, note, example and theme as editable fields below; nothing is saved silently. If the language is detected as Russian, it fills RU and suggests FR.
- A duplicate warning 'Déjà dans ta liste' links to the existing card.
- Primary button at the bottom: 'Ajouter' plus a secondary 'Ajouter + suivant' that keeps the sheet open and clears the field.
- Secondary entry points in the sheet header: 'Screenshot' (camera icon) and 'Paste list'.
- Offline or AI-error fallback: a plain manual FR/RU form.

3) SCREENSHOT IMPORT -> EXTRACTION REVIEW
- Entry points: the Screenshot button opens <input type=file accept='image/*' multiple>; a paste handler accepts images; desktop supports drag-drop; on Android the PWA share_target receives a screenshot from the share sheet. iOS has no share target; offer an iOS Shortcut later.
- Processing state: thumbnail at the top, skeleton rows, 'Extraction...' with a cancel option.
- Review list (full-screen route): a collapsible screenshot thumbnail; rows with checkboxes, all pre-checked, showing FR -> RU, a register badge and a suggested theme chip.
- Rows the user already has are unchecked and greyed with 'déjà ajouté'. Low-confidence rows get an amber dot.
- Tapping a row edits it inline. Swiping a row left deletes it.
- Header has 'Select all' and a theme picker for everything.
- A sticky bottom primary button reads 'Ajouter 12 mots'. Afterwards a toast offers 'Réviser maintenant'.

4) LIBRARY (themes/folders)
- A sticky search field at the top searches FR and RU, ignoring accents.
- A chip row: All | Due | Difficult | Unsorted.
- A 2-column grid of theme cards, each with an emoji or color, name, word count, due count and a thin mastery bar.
- An 'Inbox / Non trié' card is pinned first when it holds items.
- An AI 'Trier automatiquement' button opens a proposal sheet: grouped moves ('8 → Argent', '5 → Fête', '2 → new theme: Police'). The user can accept each group or tap a word to change it, then confirm with 'Appliquer'. Never sort silently. Undo is available.
- Themes are tags with one primary theme per word, so re-sorting never touches scheduling.
- Long-press a theme to rename, recolor, merge or delete. Add a '+ Nouveau thème' tile.

5) THEME DETAIL / WORD LIST -> WORD DETAIL SHEET
- The theme header shows the name, count and a 'Réviser ce thème' button at the bottom, which starts a filtered session.
- Rows show FR (bold), RU (muted), a register badge and a status dot (new, learning, known, difficult).
- Swipe actions: left for Delete, right for Move. A trailing overflow menu offers the same options.
- Tapping a row opens a detail bottom sheet with editable fields, the example, review history (last grade, next due, lapses), the theme or tags, 'Regénérer avec IA' for the note or example, and 'Reset progress'.

6) SETTINGS (from the Library gear)
- Theme: System / Light / Dark.
- Default direction and daily new-card limit.
- A toggle for 2-button versus 3-button grading.
- A toggle for AI suggestions on or off, plus a privacy note saying screenshots are sent to the AI provider.
- Export/import JSON (a migration path from the prototype's localStorage) and account/sync.

DARK MODE AND VISUAL
- Follow prefers-color-scheme with a manual override stored per device.
- Use a dark surface of about #121212 to #1a1a1a rather than pure black. Elevate the card with a lighter surface, not with shadow.
- Desaturate the grade colors in dark mode and always pair color with a text label or icon, since Again/Good can't rely on red/green alone.
- Meet AA contrast on the button labels, which was AnkiDroid's main complaint.
- Touch targets are at least 48x48 px with 8px gaps.
- The card font is about 28-34px for the prompt.
- Grade buttons, flip, Add, Save and bulk Add all live in the bottom third, per the Hoober thumb data.

MOCKUP ORDER: Review (front, back and swipe-drag states), Quick-add (empty, suggestions and filled states), Import review list, Library grid with the AI-sort proposal, Word detail sheet, Session complete, then the dark variants of Review and Library.
RISKS: ['Mobbin returned a 502 and then said it requires a paid plan, so the visual references for Anki, Quizlet, Duolingo and Mochi are not screen-verified. The descriptions rely on docs and forums, and current Quizlet swipe behavior is unconfirmed by any official source.', 'iOS Safari: edge swipes trigger browser back navigation and can collide with card swipes. Keep the card inset from the edges, use touch-action: pan-y and overscroll-behavior, and always provide buttons.', 'iOS Safari keyboard: interactive-widget is unsupported through 26.5, so bottom sheets with autocomplete can end up under the keyboard. This needs visualViewport positioning and testing on a real device.', 'The Vibration API is unavailable on iOS Safari, so haptic feedback works on Android only. Visual feedback must stand on its own.', "Web Share Target works only for Android/Chromium installed PWAs. iPhone users can't share a screenshot from the Photos share sheet into the web app; they have to open the app and pick the file.", 'AI suggestion latency: if predictive suggestions take more than about 500ms they feel broken. Debounce, show the last results while loading, cache per prefix, and keep a manual-entry fallback.', 'AI quality on slang and verlan: suggested translations and the register could be wrong or offensive. Always show editable fields before saving and include a confidence indicator.', 'Auto-sorting into themes could confuse the user if it is applied silently. Always present it as a reviewable proposal with undo.', 'Users misuse Hard: if Hard looks like a failing grade (red or orange), users press it after forgetting and intervals inflate. Style it neutral and show its interval.', "Many small theme-scoped study sessions can weaken recall (Anki's guidance). Keep the default review mixed across themes and make theme filters opt-in."]
