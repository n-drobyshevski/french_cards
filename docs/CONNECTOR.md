# Claude connector («Карточки» in the Claude apps)

The app serves a remote MCP server at `/api/mcp/<MCP_SECRET>`. Added once as a custom connector on claude.ai, it works in Claude on the web, desktop and mobile, and in Claude Code signed in with the same account. Claude can then search, add, edit, move, delete and restore words, fill in custom fields («Свои поля»), undo moves, create themes, read today's study numbers and write exercise sets («Упражнения») for the app to play. Grading reviews and playing exercises stay in the app.

An optional skill (`claude/skills/kartochki/`) teaches Claude the card conventions: the slang-level rubric, verlan, translation and example style, when to ask before changing anything, and recipes. The connector works without it.

## How it works

- **Transport:** stateless Streamable HTTP via `mcp-handler@2` and `@modelcontextprotocol/server@2` (`app/api/mcp/[key]/route.ts`). Each request builds a fresh server; nothing is kept between requests, and no Redis is needed.
- **Auth:** none at the MCP level ("authless" connector). The secret path segment is the only credential.
  - The route compares SHA-256 hashes of the path key and `MCP_SECRET` in constant time.
  - A wrong key, a missing or short (< 32 characters) secret, a missing `MCP_USER_ID`, a missing `SUPABASE_SECRET_KEY` or one that is not a secret key (a publishable key is refused), or local-only mode all answer a plain `404`, whatever the HTTP method.
  - Responses carry `Cache-Control: no-store`. The app never logs the path.
  - `proxy.ts` does not run on `/api/mcp/*`, so the canonical-host redirect can't turn a POST into a 308.
- **Data:** there is no user session, so the server uses the Supabase **secret key** (it bypasses RLS) for the one `MCP_USER_ID`.
  - All access goes through `lib/mcp/repo.ts`, which adds `user_id = MCP_USER_ID` to every query and sets it on every written row.
  - The `kartochki_stamp_row` trigger still runs: it stamps `synced_at`, so devices pull Claude's changes on their next sync (on open, on focus, or within about 5 minutes while the app is visible).
  - Writes follow the app's rules (`lib/mcp/tools.ts`): new words get both review cards (written before the word) and `source = "chat"` («из чата» in the word sheet); rewrites stamp `updated_at` past the stored value; nothing is hard-deleted.
  - Rewrites of a word are compare-and-set: the row is written only if its `updated_at` is still the one read just before. If the phone synced a change, or another call changed the word, in between, Claude gets a `conflict` instead of overwriting it.
  - Migration `0005_connector_grants.sql` grants `service_role` the table rights the connector needs, so it does not depend on the project's default privileges. Migration `0006_custom_fields.sql` adds `words.custom_fields` and the `field_defs` table, with `select` for `service_role`; `0007_connector_field_writes.sql` adds `insert, update` so the connector can manage the shared fields (deletes stay soft). Without 0006, `search_words`, `update_word`, `list_fields` and `add_words` with `custom_fields` fail with a database error.
- **No subscriptions:** the server's tool list never changes, so it refuses `subscriptions/listen` streams (`maxSubscriptions: 0`) instead of holding a function open.
- **Rate limit:** write tools take a token from the in-memory `mcp` bucket (`lib/ai/rate-limit.ts`, 20 in a burst, then one per 3 s). An exhausted bucket gives an `isError` tool result; `initialize` and `tools/list` are never limited.
- **«Сегодня»:** `study_summary` computes the 04:00-to-04:00 study day in `MCP_TIMEZONE` (`lib/mcp/study-day.ts`). The device's «Новых в день» setting is not synced, so Claude assumes 15 unless told otherwise.

## Tools

| Tool | Kind | What it does |
|---|---|---|
| `search_words` | read | Accent-insensitive search over French, Russian, note, tags and custom field values; filter by theme and status (new, learning, mastered, due); pages of up to 100 with `offset`/`next_offset`. |
| `list_folders` | read | Themes in order with word and due counts, plus «Входящие» (which includes words whose theme was deleted). |
| `list_fields` | read | The shared custom fields («Свои поля») in order: `{ id, name, hint, auto_fill }`, deleted ones left out, plus a note on one-off fields. |
| `create_field` | write | A new shared field `{ name, hint?, auto_fill = true }` at the end of the list (at most 10, unique names). Undo: `delete_field`. |
| `update_field` | write | Rename a field, change its hint or auto_fill, or move it (`position`, 1-based); returns `previous` for undo. Values on cards follow the new name. |
| `delete_field` | write | Soft-deletes a shared field; cards keep their values as one-off fields. Undo: `restore_field`. |
| `restore_field` | write | Brings a deleted field back by id. |
| `study_summary` | read | Cards due today, new cards left, reviews done, words by status, words due soonest. |
| `add_words` | write | 1–50 words with every field, custom fields included; skips duplicates by lemma (`on_duplicate: "add"` overrides); `folder_chosen_by_user` (per call, or per word) decides `folder_source`. Returns the ids for undo. |
| `update_word` | write | Patches one word's text, example, note, tags, part of speech, level, verlan, custom fields, `origin`, a verb's `conjugation` or `muted` («на паузе»); `both_directions` adds or removes the RU→FR card. |
| `move_words` | write | Moves words to a theme or `inbox`. `mode: "auto"` skips words placed by hand and words in locked themes. Returns an `undo` list for `restore_moves`. |
| `restore_moves` | write | Undoes `move_words` exactly: theme, and whether automatic sorting may move the word again. |
| `delete_words` | write | Soft-deletes words and their cards. |
| `restore_words` | write | Undoes `delete_words`, with the old progress. |
| `create_folder` | write | New theme, same rules as in the app (unique name, slug, colour, order). |
| `update_folder` | write | Rename a theme, change its description, lock/unlock it, pause it (`muted`) or move it (`position`, 1-based); the slug and the words stay. Returns `previous` for undo. «Входящие» can't be changed. |
| `delete_folder` | write | Soft-deletes a theme; its words move to «Входящие» (as in the app). Undo: `restore_folder` with the returned `undo`. |
| `restore_folder` | write | Brings a deleted theme back and returns its words to it (only those still in «Входящие»). |
| `exercise_material` | read | What an exercise set should practise: the live, unpaused words of the given themes (or all), weakest first, with `signals` from the last `days` (exercise misses and confusions, reviews graded 1–2, lapses, due, difficult); `topic_matches` (saved words that fit a free-text topic) and `recent_sets`. `focus`: the user's «Чаще в упражнениях» (or the input's `focus` override); when on, its words come first with `focus: true`. `only` (`difficult` / `due` / `both`): only those words, from every theme, with `scope.available`, `scope.suggested_items` and a note (no `focus`, no topic). |
| `create_exercise_set` | write | Saves one set of 6–20 items (`choice`, `cloze`, `register`, `pairs`) and up to 8 `new_words`, all or nothing. Optional `scope` (`difficult` / `due` / `both`) for a set made only of those words: `new_words` must then be empty. Refusals name every problem by path; `warnings` never block (`focus_share`: fewer questions about the saved focus words than it asks for; `scope_words`: a scoped set uses words that are not difficult / due). Idempotent on `client_ref`. Undo: `delete_exercise_set`. |
| `list_exercise_sets` | read | Sets newest first with counts by type, `scope` and `last_run` (the newest whole-set run with answers, a finished one first: when, finished, first-try score, missed words with the wrong options picked), plus `last_mistakes_round` when a later «Повторить ошибки» round exists. |
| `delete_exercise_set` | write | Soft-deletes a set; its runs stay. Undo: `restore_exercise_set`. |
| `restore_exercise_set` | write | Brings a deleted set back. |

Themes can be named by id, slug, Russian name, or `inbox`.

### Custom fields («Свои поля»)

The shared definitions are edited in the app (Settings → «Свои поля»); the connector only reads them (`repo.fieldDefs()`). Claude addresses fields by name:

- **Input** (`add_words` per word, `update_word` in `patch`): `custom_fields: { "<name>": "<value>" | null }`. A name that matches a live shared field (any case) sets that field (`field_id` = the definition's id, label = its current name); any other name creates a one-off field on that word (`field_id: null`). `null` or an empty value clears a field. `update_word` changes only the named fields and keeps the rest; clears are applied first. Names are at most 40 characters and values at most 300 (longer input is refused, like other fields); whitespace is collapsed. A word holds at most 12 fields; a call that would go past that is refused before anything is written.
- **Output:** words in `search_words`, `update_word` and `add_words` results carry `custom_fields: { "<name>": "<value>" }` only when they have any. Shared fields come first under the definition's current name; one-off fields and values of deleted definitions follow under their stored label. When a call created one-off fields, the result lists them in `new_one_off_fields` (per added word in `add_words`) with a `fields_note`, so Claude can tell a misspelt shared name.

### Origin and conjugation («Контекст»)
- **Input** (`add_words` per word, `update_word` in `patch`): `origin` — one Russian line, at most 200 characters («верлан от lourd», «от volonté „воля“ + -aire»); `null` clears it. `conjugation` — verbs only (`pos` verb, or expression in `update_word`): `{ auxiliary: "avoir"|"être", remark?, present, passe_compose, imparfait, futur }`, each tense exactly six forms je → ils with pronouns; `null` clears it, and the app goes back to the one it builds from Lexique. A conjugation on another part of speech is refused by `update_word` and dropped by `add_words`.
- **Output:** words carry `origin` when they have one; verbs carry the saved `conjugation` (same flat shape) or `conjugation_builtin` (true when the app conjugates the verb itself from Lexique, false when it cannot, so Claude knows which ones to fill).
- **Storage:** `words.origin` (text) and `words.conjugation` (jsonb, `{auxiliary, remark, tenses: {present…}}`), migration `0008_word_origin_conjugation.sql`, synced like the other word columns. The app shows them in «Контекст» (they win over the lookup's origin line and the built-in conjugation) and the origin under the translation in the word card.

### «На паузе»
- `update_word` `patch.muted`: `true` keeps the word in the library but takes it out of every review and practice round (the review card's mute button does the same); `false` brings it back with its progress.
- **Output:** such words carry `muted: true`; their `due_today` is false and `study_summary` leaves them out of the due and new counts.
- **Storage:** `words.muted` (boolean, default false), migration `0009_word_muted.sql`, synced like the other word columns.
- **A whole theme:** `update_folder` `muted: true` pauses every word of the theme (`false` brings them back with their progress). `list_folders` marks it `muted: true` and gives every theme a `new` count (words never reviewed); `search_words` marks its words `theme_muted: true`; `study_summary` lists `muted_themes` and leaves their words out of the due and new counts. Storage: `folders.muted`, migration `0010_folder_muted.sql`.
- **Proposals:** the server instructions ask Claude to suggest pausing themes that look like later steps of a sequence (levels, lessons, chapters) or that the user said can wait, when many themes still hold new words — naming them and waiting for the OK, never pausing on its own.

### Упражнения
Claude writes Duolingo-style question sets through the connector; the app plays them offline from its synced copy and never asks the API for them. Exercises never write `review_state` or `review_log`.
- **Storage:** `exercise_sets` and `exercise_runs`, migration `0011_exercises.sql`, synced like the other tables. The connector writes a set's content once and later only its `deleted_at` (delete / restore); the app only sets `deleted_at` too. Runs are written only by the device that plays them (one row per playthrough, upserted after each answer), so the connector reads them and never writes them. `service_role` has `select, insert, update` on `exercise_sets` and `select` on `exercise_runs`.
- **Input** (`create_exercise_set`): `{ client_ref ≤40, title ≤60, topic?, folders?, items 6–20, new_words? ≤8 }`. `items`, `new_words` and `folders` may also come as JSON strings. The item contract is documented on `ExerciseItem` in `lib/types.ts`; the rules live in `lib/core/exercises.ts` (shared with the app).
- **What the server does:** the id is `x-` + the first 24 hex digits of `sha256(client_ref)`, so a retry hits the same row: a replay of a live set answers `already_saved: true` and writes nothing; a `client_ref` whose set was deleted is refused with a pointer to `restore_exercise_set`. The items are renumbered `q1…qN` (ids Claude sends are ignored). `completeSet` copies each word into the set (it plays without the library), writes the `choice`/meaning prompt and answer, the `register` answer and the `pairs` tiles; `validateSet` then refuses the whole set, listing every error by path (`items[7].word_id: no such word …`): unknown, deleted or paused words, an unresolved `new_ref`, a new word that is already saved («use word_id …»), anything but 3 distinct distractors different from the answer, a cloze span that is not the answer, bad pairs. Themes are resolved like everywhere else (id, slug, name, `inbox`). The row is one upsert, so a failure saves nothing; the result is a summary (`{ id, title, count, by_type, new_words }`, `warnings`, `undo`), never the set.
- **Warnings** (`warningsFor`, saved anyway): fewer than 3 types, the answer is the longest option in over 60 % of items, an answer shows in a stem, the same word in two consecutive items, over 30 % new words.
- **«Чаще в упражнениях»:** the user's choice in Settings → «Упражнения» of which words sets should favour (`normal` off, `difficult` = a card `cardStatus` difficult, `due` = a card due today, `both`) and how much of a set (`some` ≥25 %, `half` ≥50 %, `most` ≥80 %; `lib/core/exercise-focus.ts`). Stored in the synced `user_prefs` table (row `exercise_focus`, `value` jsonb), migration `0012_user_prefs.sql`; `service_role` has `select` only (`repo.userPrefs()`), the app writes it. `exercise_material` reads it (an input `focus: {target, share?}` overrides it for one request, the saved share kept when none is given), ranks the in-scope focus words first (then the weakness order), marks them `focus: true` and returns `focus: { target, share, from: "settings"|"request", min_items_for_12, available, note }`, or `{ target: "normal" }` when off. `create_exercise_set` adds the warning `focus_share` when the saved focus (never an override) asks for more focus-word questions than the set has: an item counts when its `word_id` is a focus word, a `pairs` item when at least half its words are; the expectation is `focusMinItems(focus, items)` capped at the number of focus words in the set's themes (every unpaused theme when it names none).
- **Only difficult / due words** (`scope`, migration `0013_exercise_scope.sql`: `exercise_sets.scope` text, null or `difficult` / `due` / `both`): a set made only of the user's difficult words, the words due today, or both, from every theme — the app's «Откуда слова», quick tiles, library ledger and review done screen copy «Сделай упражнение в Карточках по трудным словам из всех тем, 12 вопросов.» (`buildRequestText` with `scope`). `exercise_material` `only` returns just those words (live and not paused, even in a theme named in `folders`, which still narrows them; `topic` and `focus` are left out) with `scope: { folders, days, only, available, suggested_items, note }`: `suggested_items` = min(12, max(6, available × 3)), 0 when there are none, and the note says to use only these words, each in 2–3 types, no new words, or, with none, to tell the user there is nothing to drill. `create_exercise_set` stores `scope`, refuses non-empty `new_words` with it (path `new_words`), skips `focus_share` and warns `scope_words` for items whose words are off scope (the same difficult / due flags). `list_exercise_sets` shows `scope` (null for an ordinary set or a row from before 0013); the app counts the available words with `useScopeCounts` (`lib/exercises.ts`, like the library ledger).
- **Closing the loop:** `exercise_material` and `list_exercise_sets` read the runs (`repo.exerciseRunsSince`, by `started_at`), so Claude can build «работа над ошибками» from the misses and the wrong options picked.

## Setup

1. Generate a secret:
   ```sh
   openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
   ```
2. In Vercel → Project → Settings → Environment Variables (Production), set:
   - `MCP_SECRET`: the secret from step 1.
   - `SUPABASE_SECRET_KEY`: Supabase → Project Settings → API Keys → a **secret** key (`sb_secret_…`, or the legacy `service_role` key). Server-only; never prefix it with `NEXT_PUBLIC_`. The publishable key is refused (the endpoint stays 404).
   - `MCP_USER_ID`: Supabase → Authentication → Users → your user's UID.
   - `MCP_TIMEZONE` (optional): your IANA time zone, for example `Europe/Moscow`. The default is `Europe/Paris`.

   Then redeploy.
   Apply `supabase/migrations/0005_connector_grants.sql`, `0006_custom_fields.sql`, `0007_connector_field_writes.sql`, `0008_word_origin_conjugation.sql`, `0009_word_muted.sql`, `0010_folder_muted.sql`, `0011_exercises.sql`, `0012_user_prefs.sql` and `0013_exercise_scope.sql` if you haven't (README, step 1). Without 0011, `exercise_material` and the exercise-set tools fail with a database error, and so do `exercise_material` and `create_exercise_set` without 0012, and `create_exercise_set` without 0013 (the app's sync fails too, so apply them before deploying).
3. Check the endpoint. A wrong key must give `404`, with no redirect:
   ```sh
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://frenchcards.vercel.app/api/mcp/wrong
   ```
4. In claude.ai: **Customize → Connectors → Add custom connector**.
   - URL: `https://frenchcards.vercel.app/api/mcp/<MCP_SECRET>`. Use the production domain: preview and team-alias URLs sit behind Vercel's deployment protection. Don't add a trailing slash, because Next answers it with a 308.
   - Authentication: **No sign-in**.
   - The connector then appears on desktop and mobile too. Turn it on per chat under **+ → Connectors** if needed.
5. Ask Claude to list your themes (`list_folders`). It must show your themes and word counts; an empty library means `MCP_USER_ID` is not your user id. Database errors reach Claude as «The database refused or did not answer: …» and are logged in Vercel's function logs as `[mcp] <tool>: …`.
6. Keep the write tools at **Needs approval** (Customize → Connectors → Карточки → Tool permissions). Read tools can be set to **Always allow**. Setting write tools to «Always allow» waives the app's rule that nothing is saved without the user's OK; the skill still tells Claude to ask before adding more than 5 words, and before moving or deleting.

### The skill (optional)

Skills need **Settings → Capabilities → Code execution and file creation** turned on, and a paid plan.

1. Zip the folder itself, so the archive contains `kartochki/SKILL.md`:
   ```sh
   cd claude/skills && zip -r kartochki.zip kartochki
   ```
2. claude.ai → **Customize → Skills → + → Upload a skill**, choose the zip, then turn the skill on.

### Local test

```sh
MCP_SECRET=local-test-secret-local-test-secret-1 MCP_USER_ID=<uid> SUPABASE_SECRET_KEY=<sb_secret_…> npm run dev
npx @modelcontextprotocol/inspector   # connect to http://localhost:3000/api/mcp/local-test-secret-local-test-secret-1
```

The dev server prints request paths, secret included. Use a throwaway secret locally.

## Rotating or revoking

1. Generate a new secret and set it as `MCP_SECRET` in Vercel, then redeploy. The old URL starts answering 404 immediately.
2. In claude.ai, remove the connector and add it again with the new URL. A connector's URL can't be edited in place.

To switch the connector off entirely, delete `MCP_SECRET`, or `SUPABASE_SECRET_KEY`, and redeploy.

## Limitations and trade-offs

- **Anyone with the URL has full read and write access to the words.** There is no second factor. Treat the URL like a password.
- The URL can end up in browser history, in screenshots of the connector settings, and in Vercel's request logs (they record paths). Rotate the secret if it may have leaked.
- The secret key bypasses RLS. The `user_id` filters in `lib/mcp/repo.ts` are what keep the connector to one account; keep every query in that file.
- Claude sees the synced copy only. Words added on a phone that hasn't synced yet are invisible, so a duplicate check can miss them.
- Last-write-wins is per row. If the phone edits a word offline while Claude edits it too, one of the two edits is lost when they meet; Claude is told when its own write lost.
- Two `add_words` calls running in parallel can both pass the duplicate check. The server instructions tell Claude to make write calls one at a time.
- The rate limit lives in one serverless instance's memory: it stops a runaway loop, not a determined caller.
