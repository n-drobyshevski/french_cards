# Claude connector («Карточки» in the Claude apps)

The app serves a remote MCP server at `/api/mcp/<MCP_SECRET>`. Added once as a custom connector on claude.ai, it works in Claude on the web, desktop and mobile, and in Claude Code signed in with the same account. Claude can then search, add, edit, move, delete and restore words, fill in custom fields («Свои поля»), undo moves, create themes and read today's study numbers. Grading reviews stays in the app.

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
  - Migration `0005_connector_grants.sql` grants `service_role` the table rights the connector needs, so it does not depend on the project's default privileges. Migration `0006_custom_fields.sql` adds `words.custom_fields` and the `field_defs` table, with `select` only for `service_role`: the connector reads the shared field definitions but never edits them. Without 0006, `search_words`, `update_word`, `list_fields` and `add_words` with `custom_fields` fail with a database error.
- **No subscriptions:** the server's tool list never changes, so it refuses `subscriptions/listen` streams (`maxSubscriptions: 0`) instead of holding a function open.
- **Rate limit:** write tools take a token from the in-memory `mcp` bucket (`lib/ai/rate-limit.ts`, 20 in a burst, then one per 3 s). An exhausted bucket gives an `isError` tool result; `initialize` and `tools/list` are never limited.
- **«Сегодня»:** `study_summary` computes the 04:00-to-04:00 study day in `MCP_TIMEZONE` (`lib/mcp/study-day.ts`). The device's «Новых в день» setting is not synced, so Claude assumes 15 unless told otherwise.

## Tools

| Tool | Kind | What it does |
|---|---|---|
| `search_words` | read | Accent-insensitive search over French, Russian, note, tags and custom field values; filter by theme and status (new, learning, mastered, due); pages of up to 100 with `offset`/`next_offset`. |
| `list_folders` | read | Themes in order with word and due counts, plus «Входящие» (which includes words whose theme was deleted). |
| `list_fields` | read | The shared custom fields («Свои поля») in order: `{ name, hint, auto_fill }`, deleted ones left out, plus a note on one-off fields. |
| `study_summary` | read | Cards due today, new cards left, reviews done, words by status, words due soonest. |
| `add_words` | write | 1–50 words with every field, custom fields included; skips duplicates by lemma (`on_duplicate: "add"` overrides); `folder_chosen_by_user` (per call, or per word) decides `folder_source`. Returns the ids for undo. |
| `update_word` | write | Patches one word's text, example, note, tags, part of speech, level, verlan or custom fields; `both_directions` adds or removes the RU→FR card. |
| `move_words` | write | Moves words to a theme or `inbox`. `mode: "auto"` skips words placed by hand and words in locked themes. Returns an `undo` list for `restore_moves`. |
| `restore_moves` | write | Undoes `move_words` exactly: theme, and whether automatic sorting may move the word again. |
| `delete_words` | write | Soft-deletes words and their cards. |
| `restore_words` | write | Undoes `delete_words`, with the old progress. |
| `create_folder` | write | New theme, same rules as in the app (unique name, slug, colour, order). |

Themes can be named by id, slug, Russian name, or `inbox`.

### Custom fields («Свои поля»)

The shared definitions are edited in the app (Settings → «Свои поля»); the connector only reads them (`repo.fieldDefs()`). Claude addresses fields by name:

- **Input** (`add_words` per word, `update_word` in `patch`): `custom_fields: { "<name>": "<value>" | null }`. A name that matches a live shared field (any case) sets that field (`field_id` = the definition's id, label = its current name); any other name creates a one-off field on that word (`field_id: null`). `null` or an empty value clears a field. `update_word` changes only the named fields and keeps the rest; clears are applied first. Names are at most 40 characters and values at most 300 (longer input is refused, like other fields); whitespace is collapsed. A word holds at most 12 fields; a call that would go past that is refused before anything is written.
- **Output:** words in `search_words`, `update_word` and `add_words` results carry `custom_fields: { "<name>": "<value>" }` only when they have any. Shared fields come first under the definition's current name; one-off fields and values of deleted definitions follow under their stored label. When a call created one-off fields, the result lists them in `new_one_off_fields` (per added word in `add_words`) with a `fields_note`, so Claude can tell a misspelt shared name.

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
   Apply `supabase/migrations/0005_connector_grants.sql` and `0006_custom_fields.sql` if you haven't (README, step 1).
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
