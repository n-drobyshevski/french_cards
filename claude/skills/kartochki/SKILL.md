---
name: kartochki
description: Conventions for the user's «Карточки» flashcard app for colloquial French (the user speaks Russian). Use whenever the user wants to add, find, fix, sort, pause or delete French words, slang or themes, set word levels («проставь уровни»), asks to review («повтори слова», «давай повторим», «потренируй ошибки») or what to review today, about progress or the review plan, sends a French text, song or screenshot to turn into cards, asks for an exercise («упражнение», тест, квиз, по трудным словам, спряжение, «настрой упражнение») in the app or in the chat («в чате», «здесь», «погоняй меня») or a «мини-TCF», pastes a KARTOCHKI_RUN line, or mentions карточки or темы. Covers card format, slang rubric 0–3, verlan, themes, when to ask first, the chat cards (propose_words, propose_levels, setup_exercise, setup_review, play_cards), exercises and recipes for every Kartochki connector tool. Needs the Kartochki connector.
---

# Карточки: working with the user's French cards

The user learns spoken French: familier, argot, verlan and vulgar words from films, rap, chats and the street. Their app «Карточки» keeps one card per French word or phrase with a Russian translation, grouped into themes («темы»). The **Kartochki connector** reads and writes the cards. This skill only adds the conventions; every change goes through the connector's tools.

Talk to the user in Russian unless they write in another language. Call the app's features by their names («подсказки», «разложить по темам»), never "AI" or «ИИ».

## Card format

Each card the connector saves has these fields. Fill all of them for every new word.

| Field | Rule | Example |
|---|---|---|
| `fr` | Dictionary form. Nouns take their article (`la thune`, `l'oseille`); verbs go in the infinitive, pronominal with `se`/`s'` (`se casser`, `s'en foutre`); adjectives in the masculine singular (`fauché`); fixed expressions as they are said (`avoir le seum`, `c'est ouf`). Keep accents and apostrophes. | `être vénère` |
| `ru` | One to three Russian equivalents, comma-separated, lowercase, in the **same register**: argot gets Russian slang, neutral gets neutral words. No explanations here. | `бабки, деньги` |
| `note` | Optional, Russian, about 120 characters: register hint («груб.»), a neutral gloss, synonyms, verlan origin, a typical construction. Never repeats `ru`. | `верлан от énervé` |
| `example_fr` / `example_ru` | One short sentence a French speaker would really say, and its translation in the same register. Leave both out rather than invent a stiff one. | `J'ai trop le seum.` / `Я так бешусь.` |
| `pos` | `noun`, `verb`, `adj`, `adv`, `expression` (idioms, multi-word phrases, interjections such as `wesh`), `other`. | `expression` |
| `gender` | `m`, `f` or `mf` for nouns only. | `f` |
| `slang_level` | 0–3, see the rubric below. | `2` |
| `verlan` | `true` only for words formed by inverting syllables. | `true` |

Vulgar and offensive words are legitimate vocabulary here. Translate them with a Russian word of the same strength, mark them 3, and do not soften, censor or moralise.

### Origin and conjugation

A word can carry `origin` («Происхождение»: one short Russian line that helps remember it — «верлан от lourd», «от volonté „воля“ + -aire», «из арабского kif „кайф“») and, for verbs, a `conjugation` (présent, passé composé, imparfait, futur; six forms je → ils with pronouns, plus `auxiliary`). The app builds most conjugations itself; `search_words` shows `conjugation_builtin: false` for verbs it cannot conjugate — fill those when asked. Set both with `update_words` for many words (one call per batch of up to 50), `update_word` for one, or `add_words`; write only what you are sure of (check unusual forms on the web), and never overwrite an existing value unless the user asks. When asked to fill origins for many words, list them first and wait for the OK, as for other bulk changes.

### «Уровень языка» (CEFR A1…C2)

Every word shows a level: `search_words` gives `level` (null = none) and `level_source`. Most are estimates the app computes from its dictionary (`flelex`) or from word frequency (`freq`); leave those alone. `chat` is a level you set, `ai` one from the app, `user` one the user picked: **never change a `user` level unless the user asks**. You may give `cefr` in `add_words` when you are fairly sure; otherwise leave it out and the app estimates one. Rate a word as a textbook or a DELF / TCF list would: A1 basic everyday words (maison, manger), A2 common ones (le loyer, se dépêcher), B1 (la démarche, constater), B2 (s'en sortir, néanmoins), C1–C2 rare, literary or very specific. Argot, vulgar words and verlan get no level unless the user asks. The level only orders new words in review; it never locks anything. To fill missing levels, show them on the «Уровни слов» card (`propose_levels`, see the recipe), not as a text list.

### Custom fields («Свои поля»)

The user can add their own fields to every card (e.g. «Синонимы»). `list_fields` shows them in order, each with a hint on what to write. Set them by name in `custom_fields` (`add_words` per word, `update_word` in `patch`), following the hint; `null` clears one, and `update_word` leaves the fields you don't name alone. A name that is not in `list_fields` creates a field on that one word only: use one only when the user asks for it, and if a result lists `new_one_off_fields` you didn't intend, fix the name. `search_words` shows a word's fields as `custom_fields`. The shared fields themselves are managed with `create_field`, `update_field` (rename, hint, auto_fill, position) and `delete_field` (cards keep their values; undo with `restore_field`): ask before creating or deleting one.

## Slang level rubric

Judge the register of the word **in the sense you give**, not its topic. When torn between two levels, pick the less marked one.

| Level | App label | What it is | Examples |
|---|---|---|---|
| 0 | нейтр. | Standard French, fine in writing and with strangers. | l'argent, la voiture, manger, fatigué, partir, se débrouiller |
| 1 | fam. | Familier: normal casual speech everyone uses with friends, out of place in a formal letter. | le fric, la bagnole, bouffer, crevé, le boulot, un mec, bosser, kiffer, c'est nul |
| 2 | arg. | Argot: marked street or youth slang, often from the banlieues, verlan, Arabic or Romani loans; socially coded. | la thune, le flouze, un keuf, chelou, relou, vénère, la daronne, le seum, wesh, la gova |
| 3 | vulg. | Vulgaire: coarse, sexual, scatological or insulting; shocking in most company. | putain, fait chier, un connard, niquer, ta gueule, foutre le camp |

The same form can sit at two levels in two senses: `se casser` «уйти» is 2, `se casser la tête` «ломать голову» is 1. Make two cards if the user wants both senses.

### Verlan

`verlan` is independent of the level. Set it only when syllables are inverted, and give the source word in `note` («верлан от louche»).

keuf ← flic, meuf ← femme, relou ← lourd, chelou ← louche, vénère ← énervé, ouf ← fou, tromé ← métro, teuf ← fête, reuf ← frère, zarbi ← bizarre, chanmé ← méchant, céfran ← français, laisse béton ← laisse tomber.

Most verlan is level 2; a few words are now level 1 (meuf, ouf, relou). Plain abbreviations (`vnr`, `jsp`) and loans (`wesh`, `kiffer`) are not verlan.

## Themes

- Themes are about **meaning**: money, food, police, parties, emotions, people… Never put a word in a theme because of its register; there is no «Сленг» or «Верлан» theme.
- Call `list_folders` to see the themes and their descriptions before choosing one.
- `folder_chosen_by_user: true` only when the user named the theme («добавь в Эмоции»). When you picked it, send `false`: the app then knows it may re-sort the word later. In a mixed call, set it per word next to the per-word `folder`. When no theme fits well, leave the word in «Входящие» rather than force it.
- Create a theme (`create_folder`) only when the user asks, or after proposing it and getting a yes. Give it a Russian name of one or two capitalised words and a one-sentence description.
- **«На паузе»:** `update_folder` with `muted: true` keeps a theme and its progress but takes all its words out of review and practice; `muted: false` brings it back. `list_folders` shows paused themes (`muted: true`) and each theme's `new` count (words never reviewed). A single word is paused with `update_word` `muted`.
- **Propose pausing** when `list_folders` shows many themes with new words and some look like later steps of a sequence (Уровень 1/2/3, Урок 5…, chapters of a book or course, numbered or dated themes) or the user said they can wait: say which themes would stay in review and which would pause, and wait for the OK. When the user finishes a step, propose bringing the next theme back. Never pause or unpause without a yes.
- Rename, re-describe, lock or reorder a theme with `update_folder`; delete one with `delete_folder` (its words go to «Входящие»). Both only after naming the change (and, for a delete, how many words the theme holds) and getting a yes. Undo: `update_folder` with `previous`, `restore_folder` with the delete's `undo`.

## Ask first

The connector's write tools normally ask the user for approval in the chat. Still follow these rules, because the user may have switched approvals to «Always allow»:

- **Adding more than 5 words:** show them on the «Новые слова» card (`propose_words`); the user's «Добавить N» there is the OK. Where there is no card, show the list in text (fr — ru, level, theme) and wait for «да», «ок» or edits.
- **Moving or deleting any words:** always list what will change and wait for an OK.
- **Editing a word:** fine without asking when the user asked for that edit; otherwise propose it.
- **Setting levels for several words:** show them on the «Уровни слов» card (`propose_levels`); its «Сохранить N» is the OK. Where there is no card, list the words with the levels you propose and wait for the OK before `set_word_levels`.
- **Up to 5 words the user asked to add:** add them directly.
- **An exercise set the user asked for:** save it directly; it adds no words and never changes the review schedule.
- **Grades come only from the user's taps on the cards page.** The card saves each answer itself (`grade_cards` and `undo_grades` are the card's tools, not yours). Never grade, save or undo a review from what the user writes in the chat («это я знаю», «отметь как выученное»): offer a round instead (`setup_review` or `play_cards`).
- **A round played in the chat:** never save it unasked. The player's «Сохранить в Карточки» is the user's yes; a pasted «Скопировать результат» line is not: ask «Сохранить результат в Карточки?» and wait.

After every change you make, report what was done in one or two lines and how to undo it (a review card's write is reported by the card itself, see below): `delete_words` with the returned ids after adding, `restore_words` after deleting, `restore_moves` with the returned `undo.moves` after moving (never a move back with `move_words`: it would change how automatic sorting treats the words), `set_word_levels` with the returned `undo` after setting levels, `update_words` with the returned `undo.items` after a batch edit, `update_study_plan` with the returned `undo` after changing the plan, `delete_exercise_set` after saving an exercise set and `restore_exercise_set` after deleting one; after `save_exercise_result`, its `undo` (`delete_exercise_set`, only when that call added the set; a result added to a saved set can't be removed on its own, so say so). Mention that the app shows the change after its next sync (open the app or switch back to it).

Make write calls one at a time, never in parallel, even for different fields of the same word.

## Review cards in the chat («Новые слова», «Уровни слов», «Настроить упражнение»)

`setup_exercise` shows «Настроить упражнение»: themes with their counts, «Спряжение глаголов» and its «Времена», the number of questions and the level; its «Начать ›» sends the request to you as the user's message («Сделай упражнение на спряжение глаголов здесь в чате по теме «…», 8 вопросов, только imparfait.»), which you then play with `exercise_material` and `play_exercises`. Use it when the user wants to choose («настрой упражнение», «хочу выбрать времена»), or for a verb drill in the chat that names neither themes nor tenses; preselect whatever the request did say. A request that says what to play is played directly. Don't ask the same questions in text; if the user sees no card, ask in one line which themes and tenses.

`setup_review` shows «Повторить слова» and `play_cards` a round of cards on their own card (the third MCP App); see the recipe «Повтори слова» below.

`propose_words` and `propose_levels` show a card in the chat (an MCP App, like the exercise player) with what you propose; they write nothing. The user fixes the proposal on the card, and the card's own button writes it: «Добавить N» calls `add_words`, «Сохранить N» calls `set_word_levels` (the host may ask the user to allow the call). After the write the card shows a receipt with «Отменить», which calls the tool's own undo (`delete_words` with the returned ids, `set_word_levels` with the returned `undo`).

- **One card, no text list.** Never list the words or levels in the chat as well; say in one line that they are waiting on the card above.
- **The card tells you what it wrote:** a line in your context («В окне «Новые слова» пользователь добавил 9 слов: …», «… сохранил 14 уровней …», or that the user undid it). Don't call `add_words` or `set_word_levels` again for those words. If the user asks you to undo after that, use the card's «Отменить»; if that is gone, `search_words` for the words named in that line, then `delete_words` (added words) or `set_word_levels` with `cefr: null` (levels that were empty before), and give the undo of that call.
- **No card** (the user says they don't see one, or the host shows no apps, e.g. Claude Code): fall back to the text list, wait for the OK, then call `add_words` / `set_word_levels` yourself, as in «Ask first».
- **«Новые слова»** (`propose_words`, the same input as `add_words` plus an optional `source_label`: «из скриншота», «из песни», «из статьи»): rows with checkboxes, the French with the gender, the Russian, the level (≈B1), the slang meter, and a theme chip with a picker of the user's themes and «Входящие»; words already saved come unchecked and struck («уже есть в «Жильё»»). A theme the user picks on the card counts as chosen by the user (`folder_chosen_by_user: true`). After adding, «Открыть «Жильё» в Карточках ↗» opens the theme in the app. Fields the card doesn't show (`tags`, `custom_fields`, `conjugation`, `both_directions`) go to `add_words` with the word as you gave them; custom fields that don't fit are refused by `propose_words` itself.
- **«Уровни слов»** (`propose_levels`, `items: [{ id, cefr }]` with ids from `search_words`): each row has your level preselected on an A1…C2 strip, «≈C1 по словарю» when the app's dictionary says otherwise, and the user's own levels greyed out («ВЫ УКАЗАЛИ», never saved over). «Следующие 15 ›» sends you «Предложи уровни для следующих 15 слов без уровня»: that is the next batch of the recipe below.

## Recipes

### Add words the user names or pastes

1. `search_words` for each word (or rely on `add_words`, which skips French forms that already exist, and report the duplicates it returns).
2. Fill every field by the rules above; pick a theme or use the one the user named.
3. More than 5 words → `propose_words` with all of them (see «Review cards» above; a per-word `folder` lets one card cover several themes) and stop: the card adds them. Up to 5 words, or no card → `add_words` once with all of them (more than 5: after the text list and the OK).
4. After your own `add_words`, reply with what was added, the duplicates that were skipped, and the undo hint.

### Add words from a screenshot, chat, lyrics or text

1. Read the image or text and pick what a learner wants: slang, familier and vulgar words, verlan, idioms, and less common standard words. Skip names and everyday basics the user surely knows.
2. Turn each into dictionary form: «jsuis vnr» → `être vénère`, «les keufs» → `le keuf`. Reuse a good sentence from the source as the example, tidied up.
3. Translate in the sense used in the source. If the source gives a translation, keep it unless it is wrong, and say so.
4. `propose_words` with every field filled and a `source_label` («из скриншота», «из песни», «из переписки», «из статьи»); pick a theme per word (`folder_chosen_by_user: false`) unless the user named one. Say in one line that the words are on the card; it finds the duplicates and adds what the user keeps. No card → show the list in text, wait for the OK, then `add_words`.

### «Повтори слова» / «давай повторим» / «что повторить сегодня?»

1. `setup_review` shows «Повторить слова»: today's numbers, the themes with cards due or new (or something to practise), and four ways: «Карточки» (a round by the schedule; the card saves the grades), «Карточки, потом упражнение», «Упражнение» (on the words due, nothing graded) and «Тренировка» (cards that change nothing: missed today, this week, difficult, due, all), plus the number of cards. Preselect what the request did say (`choice`, `size`, `folders`, `scope`). Say in one line that the card is above and wait; don't ask the same questions in text, and don't start a round yourself.
2. Its «Начать ›» sends the choice as the user's message. Do what it says:
   - «Повтори карточки здесь в чате, 20 карточек[, по теме «Еда»][, только FR → RU][, потом упражнение по ошибкам].» → `play_cards` with `limit`, `folders`, `direction` (and `next: "exercise"` for «потом упражнение»).
   - «Потренируй карточки здесь в чате без расписания: ошибки сегодня, 20 карточек.» → `play_cards` `mode: "practice"` with the `scope` named (`today`, `recent`, `difficult`, `due`, `all`).
   - «Сделай упражнение здесь в чате по словам к повторению …» → «Упражнение по трудным словам / к повторению» below (`exercise_material` `only: "due"`, then `play_exercises` with `scope: "due"`).
   A request that already says how («повтори карточки здесь», «потренируй ошибки», «потренируй трудные слова в чате») skips the card: call `play_cards` directly («потренируй …» → `mode: "practice"` with the scope it names, not an exercise). «Погоняй меня», «тест», «квиз» stay exercises.
3. The round shows on its own card: the app's review card, flip, «Не знаю / Сложно / Знаю» with the next intervals, «Отменить последний ответ». The card saves every grade on the user's tap and puts a line in your context after each save or undo; never grade, save or undo cards yourself, and don't write the words, translations or answers in the chat. Say in one line that the cards are ready above.
4. At the end: «Ещё N к повторению · Продолжить ›» sends «Повтори карточки здесь в чате, ещё N карточек…» → `play_cards` again. «Упражнение по ошибкам ›» sends «Сделай упражнение здесь в чате по ошибкам из карточек: … (word_ids: …)» → `exercise_material` with those `word_ids` (it gives `scope.suggested_items` and a note), then `play_exercises` (see «Упражнения в чате»). The exercise comes only from that button or the user's own message: never call `play_cards` and `play_exercises` in one reply.
5. **No card** (the user sees none, or the host shows no apps, e.g. Claude Code): offer the four ways in one line, or reviewing in the app (the `app_url` the result names). Never run the review as text and never grade from the chat.

For the numbers alone («сколько у меня сегодня к повторению?», «какой план на сегодня?»): `study_summary`, which plans the day exactly as the app does with the user's «План повторения». Answer in two or three lines: how many cards are due, how many new words today (`plan.new_words_today` of `plan.ceiling`, and why fewer: `plan.reason` load / accuracy / backlog), how many reviews are done, and a few of the words due soonest. Mention `muted_themes` if there are any. If new cards pile up across many themes that look sequential, offer to pause the later ones (see Themes). Then offer a round in the chat (`setup_review`) or in the app. The numbers come from the synced copy, so reviews the phone has not synced yet are missing.

### «Как у меня с прогрессом за месяц?»

1. `study_summary` with `history_days: 30` (7 for «за неделю», 90 or 365 for longer). `history.days` holds the app's saved end-of-day numbers as rows named by `history.columns`; `history.today` is now.
2. Answer in Russian in three or four lines about trends: «знаю» (`known`) and «помню ≈» (`memorized`, rounded) then vs now, how many words moved from «новых» to «учу», «Верно» per month against the 90 % target (`retention`), the days studied (`active_days` of the range). Name the streak (`streak.current`, `streak.best`) at most once, plainly; never press to keep it, never scold for missed days. Days without a row were simply not saved; don't call them gaps in study.

### «План повторения»: «давай 15 новых слов в день», «новые по темам», «без обратной стороны»

1. `study_summary` for the current plan (`plan.settings`) and today's numbers.
2. `update_study_plan` with only the fields the user asked about: `new_words` (0–30 a day; a ceiling the app lowers on heavy or weak days), `review_cap` (50–999 reviews a day, `null` = no limit), `new_order` (`level`: by «Уровень языка» and frequency, themes in turn; `themes`; `added`), `mix` (`mixed` / `after`), `ru_fr` (`after`: RU→FR once FR→RU holds 3 days; `together`: the next day; `recognition`: never). Change it only when asked; for advice («сколько новых слов брать?»), suggest numbers from `plan.forecast_7d` and `plan.accuracy_7d` and wait for the OK.
3. Say what changed and the undo (`update_study_plan` with the returned `undo`), then what today looks like (`study_summary` again). The app picks it up on its next sync.

### План vs прогресс: «план слишком маленький», «слишком тяжело», «сколько новых брать?»

`study_summary` always returns `plan_fit`: the saved plan against her last ≤ 14 study days (`active_days`), the same numbers as Settings → «План повторения». Days without study are not data: never count them, never say «из 14 дней».

1. **"The plan is much smaller than what I usually do"** (`fit` "room"): quote `new_words.full_days` of `new_words.plan_days` («все 10 — в 11 из 12 учебных дней») and `reviews.typical` against `reviews.cap` («повторений по старым карточкам обычно 58 — до 200 далеко»), then offer `suggestion.new_words` with its forecast: «можно брать 15 в день: ≈ 82–89 повторений в день через месяц (`forecast_30d.then`), вернуть можно в любой момент».
2. **"Too heavy"** (`fit` "heavy"): quote `reviews.backlog_days` («4 дня повторений было больше лимита — новые подождали, карточки никуда не делись») and `retention.rate` vs `retention.target`, then offer `suggestion.new_words` (fewer new words, «повторений станет меньше», with `forecast_30d`) or, when given, `suggestion.or_review_cap` as the other option. Name the cause as the plan or the cards («план придержал новые»), never the user.
3. **`suggestion` is null** but she asks anyway: say why in a line (`fit` "warming_up": пока мало данных; "fits": the plan fits; `dismissed_until`: she put it off in the app). If she still wants a change, work out options from `plan.forecast_7d`: each extra new word a day adds roughly 3 reviews a day a month later (≈ 4.5 with `ru_fr` "after"); say the forecast is approximate. The `new_per_day` what-if covers today only.
4. A "low" `confidence` suggestion: mention it only as «пока мало данных», if at all.
5. Propose a change at most once per conversation, only when the talk is about the plan, pace, load or progress; never open with it. Change the plan only after the OK (`update_study_plan`), then give the undo.

Wording: the plan is a ceiling, always «до 10», never «цель», «норма» or «задание». Write «a из N» only when a = N; below it say «обычно 6 · до 10 по плану». Taking fewer new words than allowed is information, never a reason to lower the plan. No «+N» or «перевыполнено» for a surplus. Never use провал, пропуск, пропущено, долг, отстаёте, не выполнено, норма, сгорит, потеряете, цель не достигнута.

### Sort «Входящие»

1. `list_folders` for the themes and descriptions, then `search_words` with `folder: "inbox"` and `limit: 100`; while `next_offset` is not null, call again with `offset: next_offset` to see the rest.
2. Propose a theme for each word by meaning, plus at most one or two new themes when at least 3 words would go there. Leave unclear words in the inbox.
3. Show the plan grouped by theme and wait for the OK.
4. Create any approved new themes, then `move_words` per theme with `mode: "auto"`. Auto mode never moves words the user placed by hand or words in locked themes; report the ones it skipped.

### «Проставь уровни» / «Определи уровень слов» / fill missing levels

1. `search_words` with `level: "none"` (and the theme, if the user named one), `limit: 100`; page with `next_offset`. A few words of known level from the same search without `level` are your anchors.
2. Take the next 15 words (skip argot, vulgar words and verlan: they get no level unless the user asks) and rate each by the rule in «Уровень языка».
3. `propose_levels` with those 15 `{ id, cefr }` and stop: the card saves them (see «Review cards»). Say in one line that the levels are on the card, and how many words are still without one (`remaining`, from the result).
4. «Предложи уровни для следующих 15 слов без уровня» (the card's «Следующие 15 ›»): `search_words` `level: "none"` again (saved words have left that list), leave out the words of the last card the user didn't save, and repeat from step 2.
5. No card: list the batch grouped by level, wait for the OK, then `set_word_levels` in batches of 10–15. Report `skipped_user` and `conflicts`, and the undo.

### Fix or delete a word

1. `search_words` to find it and its id.
2. Edit with `update_word` (only the changed fields). The theme is changed with `move_words` (mode `user`), not with `update_word`.

### Edit many words at once («заполни происхождение / примеры / поле X для темы …», «исправь переводы в теме …»)

1. `search_words` with the theme and `fields` naming only what you need (e.g. `["ru", "origin"]` to see which words lack an origin, `["ru", "example_fr"]` for examples): compact rows, `limit: 100`, page with `next_offset`.
2. More than 5 words: list what will change and wait for the OK.
3. `update_words` with up to 50 `{ id, patch }` per call (each patch only the changed fields), one call per batch, never `update_word` word by word. Every patch is checked first: if one is refused, nothing was written; fix the one the refusal names (`items[i]`) and send the batch again.
4. Report `updated`, any `missing` or `conflict` words, and the undo: `update_words` with the result's `undo.items`.
3. Deleting: name the words, wait for the OK, `delete_words`, then mention that `restore_words` can bring them back with their progress.

## Упражнения (exercise sets)

Duolingo-style question sets that **you** write through the connector; they never touch the review schedule. A set is played in one of two places, and the request says which:

- **In the app** («Упражнения» tab, offline): the user asks in the chat («сделай упражнение по теме Еда»), or pastes a request the app built: on a computer «Сделай упражнение в Карточках по теме «Люди», 12 вопросов.», on a phone one sentence, «Сделай в Карточках 12 вопросов по темам «Еда», «Полиция» — можно новые слова.» («— без новых слов»: no `new_words`). «Сделай в Карточках N вопросов …», «в приложении», or no place named → `create_exercise_set`.
- **Right in the chat** («давай упражнение здесь», «в чате», «прямо тут», «погоняй меня по теме …»): `play_exercises` shows an interactive player in the chat, with the app's rules and look; see «Упражнения в чате» below.

Either way, never write the questions, options or answers into the chat yourself, and never call the app's own features for this. **No `play_exercises` among your tools** means the connector in this chat is an old copy: never run the quiz as chat messages instead. Say in one line to reconnect «Карточки» in the connector settings and open a new chat, and meanwhile offer the set for the app (`create_exercise_set`), or an artifact if `exercise_artifact` is there.

- **Tools:** `exercise_material` (read: the words to use, weakest first, with `signals`; `topic_matches` for a free-text topic; `recent_sets`), then **one** call with the whole set: `create_exercise_set` (the app) or `play_exercises` (the chat; same fields and rules, writes nothing). `exercise_artifact` is the chat player as an HTML page, for hosts that show no player. `save_exercise_result` saves a chat round to «Упражнения», only when the user agrees. `list_exercise_sets` shows the sets and each one's `last_run` (score, missed words, the wrong options picked). `delete_exercise_set` / `restore_exercise_set` undo.
- **Item types:** `choice` (4 options; skill `meaning`, `form`, `neutral`, `verlan` or `situation`), `cloze` (a French sentence with one `[[gap]]`, 4 options), `pairs` (match 4–6 words with their translations), `conjugate` (the right form of a verb for a `tense` and `person`, 4 options), `reading` («текст», as in the TCF's compréhension écrite: a short French `passage` with its `passage_label`, a French question in `prompt`, the `answer` and 3 French distractors; `word_id` optional, never `new_ref`). Any item may carry its `level` (A1…C2); an exam needs it on every item. There is no `register` item any more (picking нейтр. / fam. / arg. / vulg.): the server refuses one, and old sets' register questions are skipped wherever they are played. For `choice`/`meaning` send only `word_id`, `ask` and the 3 distractors (single equivalents, in the options' language): the server writes the prompt and the answer (the word's first Russian equivalent). For `pairs` send only the ids. For `conjugate` send only the verb's `word_id`, `tense` and `person`: the server writes the infinitive, the gap («tu ___»), the answer and 3 other forms of the verb.
- **The rubric, in short** (full version with examples: [references/exercises.md](references/exercises.md)): 10–15 items of at least 3 types; `choice` and `cloze` get exactly 3 distractors of the same part of speech, gender, register and length as the answer, with exactly one best answer; a cloze's `sentence_ru` sets the scene and never translates the gap; recognise before produce (FR→RU and pairs first, RU→FR and cloze later); the weakest words late and twice (not in a row); no answer visible in another item's stem. A `reading` item is a realistic French text on the user's themes (an ad, a message, a notice, a short article; 300–700 characters, using some of their words), a question in French, 3 distractors that are plausible from the text but wrong by it, exactly one clearly right answer, and the `level` of the text's difficulty; it can go in any set, and in the app or the chat it plays like a choice item under the text.
- **New words from the web** (only when the user allowed new words, «можно новые слова», or asked for a topic their library lacks): at most 8, each checked in at least 2 sources, `slang_level` by the rubric above, filled like a card, with a `source_url`. They go in `new_words` with a `ref` (`n1`, `n2`…) and the items point at them with `new_ref`. Never `add_words` them unasked: the user ticks the ones to keep on the app's done screen; after a chat round, add one only when the user asks («добавь teuf в карточки»). A word in `topic_matches` is saved already: use its `word_id`.
- **«Спряжение глаголов»** («упражнение на спряжение глаголов»): `exercise_material` `verbs: true` (only verbs the app can conjugate), then a short set of 8 items (6–10, at most 10 `conjugate`): mostly `conjugate` mixing the 4 tenses and the persons (30–40 % of the passé composé on être or pronominal verbs), plus 2–3 `cloze` with a verb gap and a time marker (hier / tous les jours / demain) for passé composé vs imparfait. **Tenses named in the request** («только imparfait», «passé composé и imparfait», the app's «…, только imparfait.»): pass them as `tenses` to `exercise_material` and to the set; every `conjugate` item uses one of them, and the cloze items follow the material's note (the passé composé vs imparfait contrast only when both are picked); the same verb at most twice, never in a row; never elle / elles. Details and an example: [references/exercises.md](references/exercises.md).
- **«Мини-TCF»** («мини-TCF», «как на экзамене», «пробный TCF»): the exam mode of the chat player, `play_exercises` with `mode: "exam"`: about 12 questions A2→B2, half of them `reading`; see the recipe below.
- **Only difficult / due words** («по трудным словам», «по словам к повторению», «из всех тем»): `exercise_material` `only`, then `create_exercise_set` (or `play_exercises`) with the same `scope`; see the recipe below.
- **«Чаще в упражнениях»** (the user's setting, read by `exercise_material`): when its `focus` is on, at least the share its `note` names of the questions are about the words marked `focus: true` (difficult and/or due today), even for a plain «сделай упражнение». Pass `focus` to `exercise_material` only when the user asks otherwise in the chat («только трудные», «без упора на повторение»). `create_exercise_set` warns `focus_share` when a set falls short.
- **«Уровень набора»** («уровня B1» or «уровня B1–B2» in the request, one or several; the app's «Авто» says nothing): pass them to `exercise_material` as `levels`; without them, `level` comes from the words. Write the questions at `level.targets` by each one's `guide` (sentence length and tenses, how close the distractors are, recognition vs production, the level of new words; details in the reference), several levels spread about evenly, easier first, never by dropping or swapping the user's words, and save with `levels` (plus `level_auto: true` when they came from the words). A `level_words` warning names harder words in your sentences or options: simplify them next time.
- **Saving:** make up a `client_ref` (e.g. `eda-2026-10-23`) and keep it when you retry after a refusal; a refusal lists every problem by path (`items[7].distractors …`), so fix them all in one go. `warnings` never block, but fix them next time. Reply with the title, the number of questions and the undo (`delete_exercise_set`); the set shows in «Упражнения» after the app's next sync. (`play_exercises` checks a set the same way but saves nothing.)

### «Сделай упражнение по теме „Еда“» / «по темам „Люди“, „Эмоции“» / «по всем темам»

1. `exercise_material` with `folders` (the themes named; none for «по всем темам»); the default `limit: 30` is plenty.
2. Pick 8–12 words: the weakest first in the list (with a `focus` on, the `focus: true` words take the share it names), plus a few the user knows, for confidence. Plan the order: meaning FR→RU and pairs → situation, verlan, neutral → meaning RU→FR, form, cloze; the 2–3 weakest words come back a second time near the end.
3. Write the items by the rubric and run the leak checks from the reference.
4. `create_exercise_set` with `title` («Еда · 12 вопросов» style, at most 60 characters), `folders` as named, the items. Reply in two lines with the undo.

### «Сделай упражнение на тему „вечеринка“» (a free-text topic)

1. `exercise_material` with `topic` (and the themes, if the user named some). Use `topic_matches` (saved words) by `word_id`.
2. When too few saved words fit and new words are allowed: web search for the topic's spoken vocabulary, keep words you confirm in 2 sources, rate their register, and put them in `new_words` (at most 8; keep them under a third of the set's words, mixing in library words).
3. Write the set; every new word gets at least one recognition item (meaning FR→RU or pairs) before any production item. Save with `topic` set.

### Упражнение по трудным словам / к повторению

The app's request reads «Сделай упражнение в Карточках по трудным словам из всех тем, 12 вопросов.» (or «по словам к повторению», «по трудным словам и словам к повторению»), on a phone «Сделай в Карточках 12 вопросов по трудным словам из всех тем.» (or «по словам к повторению из всех тем»); the user may also just say «упражнение по трудным словам».

1. `exercise_material` with `only`: `difficult`, `due` or `both` (and no `topic`; `folders` only if the user named themes). It returns only those words, from every theme, weakest first, and `scope: { only, available, suggested_items, note }`.
2. `available` 0: there is nothing to drill. Don't save a set; tell the user (e.g. «Сейчас нет трудных слов — упражнение не из чего делать»).
3. Otherwise use only these words: no other library words and no `new_words`. Make `suggested_items` questions (fewer words → a shorter set, at least 6): each word in 2–3 different types (meaning FR→RU, neutral or situation, cloze, meaning RU→FR; pairs only with 4+ words), the same word never twice in a row, the weakest late.
4. `create_exercise_set` with `scope` set to the same value and a title like «Трудные слова · 9 вопросов». A `scope_words` warning means an item used a word outside the scope.

### «Работа над ошибками» / «следующий набор с упором на ошибки»

1. `list_exercise_sets` (the latest set's `last_run.missed`, with `chosen` = the wrong options picked) and `exercise_material` (`signals.ex_misses`, `confusions`, `review_misses`).
2. Build the set around the missed words: each one twice, in two different types (e.g. choice and cloze), and use the confused options as distractors where they are in the options' language («keuf» for «meuf» in a cloze). Fill up with a few words the user got right.
3. Save; mention which words the set drills.

### Упражнения в чате («давай здесь», «в чате», «прямо тут», «в диалоге», «на отдельной вкладке», «тест», «квиз», «погоняй меня»)

Only with `play_exercises` in your tools; without it, see the line above the tool list (reconnect, no text quiz).

- **Every exercise, test or quiz played in the conversation goes to `play_exercises`.** «На отдельной вкладке» and «в диалоге» mean the chat player too: it is the player's own card, not an artifact.
- **Big requests are split into rounds, never moved to an artifact.** «Все глаголы из тем 01, 02 и 35», «по всем словам темы»: more than 20 questions or 8 new words is a series. Say in one line how many rounds it takes («это 9 раундов по 20»), play round 1 now with `series` ({id, round: 1, of, covered, total, unit: «глаголов»}), and stop. The player's «Следующий раунд ›» sends «Следующий раунд: 2 из 9 …»: then build round 2 from words not played yet in this series (keep a short list in mind of which words each round used) and call `play_exercises` with `series.round` 2. Never show several rounds in one reply.
- **An existing exercise artifact never replaces the player**, even one from an earlier chat. It may be mentioned in one line after the player, never instead of it. Don't build a hand-made HTML trainer for exercises unless the user explicitly asks for a page.

1. `exercise_material` as for any set (themes, `topic`, `only`, `verbs`, `levels`: the recipes above apply unchanged).
2. Write the set by the same rubric and send it once to `play_exercises`, with the fields `create_exercise_set` takes (`client_ref`, `title`, `topic`, `folders`, `items`, `new_words`, `levels`, `level_auto`, `scope`). A refusal lists every problem by path: fix them all and call again with the same `client_ref`. Nothing is written.
3. The player shows in the chat, as in the app: the question card, 4 options, «Не знаю», a miss comes back (up to 3 tries), intro cards for new words, pairs, conjugation and reading texts, then «ИТОГ НАБОРА» with the score («3 из 5 с первого раза») and the mistakes. Say in a line or two that the exercise is ready to play. **Never** repeat the questions, options or answers in the chat, and don't quiz the user in text next to it.
4. When a round ends, the player puts a one-line summary in your context (score, missed words, whether it was saved). «Обсудить ошибки» sends the user's message with the missed words and the wrong picks: explain each in a line or two (meaning, register, a short example) and offer a round on them (`play_exercises` again) or a set for the app.
5. «Ещё раз» for a set saved in «Упражнения»: `play_exercises` with its `set_id` alone (from `list_exercise_sets` or an earlier result). A `client_ref` whose set is saved already is refused with the `set_id` to use. A set that isn't saved: the player's own «Ещё раз», or `play_exercises` with the same input again.

**Saving the round** happens only with the user's yes:
- The player's «Сохранить в Карточки» calls `save_exercise_result` itself (the host may ask the user to allow it). That tap is the yes; don't call the tool again yourself.
- Don't offer to save more than once, and never save unasked.
- A pasted `KARTOCHKI_RUN {…}` line (an artifact's «Скопировать результат»): ask «Сохранить результат в Карточки?» first. After the yes, call `save_exercise_result` with the whole line as `run_line` and the same set input you played (for a set played by `set_id`, just that `set_id`). It saves the set if it is new («из чата») and the round; the score is recomputed on the server, and a repeat answers `already_saved`. Reply with the score («7 из 10 с первого раза», from `run.first_try` and `run.total`), the missed words and the `undo`.

### «Мини-TCF» («устрой мне мини-TCF», «как на экзамене», «пробный TCF по жилью»)

A short timed test in the chat, in the TCF's manner: one overall timer, every question once in order, no feedback, no «Не знаю», no going back, then a result by level. Only with `play_exercises` (the app and the artifact play a set as a normal practice round, without the timer).

1. `exercise_material` with the themes or `topic` the user named, and `levels` as the user asked, else `["A2", "B1", "B2"]`.
2. Write about 12 items (the exam takes 8–20), easier first, A2 → B1 → B2 (for 12: about 4 A2, 5 B1, 3 B2), **each with its `level`**:
   - about half `reading`: different kinds of text (ANNONCE, MESSAGE, COURRIEL, ARTICLE, AVIS), on the user's themes, each using some of their words, at its level, by the rules in [references/exercises.md](references/exercises.md) («Reading»);
   - the rest `choice` (meaning, situation) and `cloze` about the user's words, written at the item's level; `conjugate` is fine too.
   - No `pairs` and no `new_words` (the server refuses both in an exam).
3. `play_exercises` with the set and `mode: "exam"`; `time_limit_s` only when the user asked for a time (the default is 90 s a question: 18 min for 12). A refusal lists every problem by path (a missing `level`, a pairs item, the size): fix them all and call again with the same `client_ref`.
4. Say in one line that the test is ready above and the time starts at «Начать». **Never** reveal or hint at an answer before the result, not even when the user asks during the test («скажу, когда закончите»), and never quiz in text next to it.
5. At the end the player puts the result in your context (score, time, by level, each mistake with the pick). «Разобрать ошибки» sends you the mistakes: for each one, in Russian and briefly, why the right answer is right (quote the line of the text that says it) and why the pick is wrong, plus the word or construction behind it; then offer a practice round on the weakest level or words (`play_exercises`) or a set for the app. The level chips are a guide: it is an estimate, never a TCF score, so don't convert it to TCF points or levels.
6. Saving: the card's «Сохранить в Карточки» saves the set and the result, as for any chat round (the saved set later plays in the app as a practice round). «Ещё раз» on the card restarts the same test; for a saved one later, `play_exercises` with its `set_id` and `mode: "exam"`.

### Нет плеера: `exercise_artifact`

When the host shows no apps (Claude Code), the user says they don't see a player, or they want a page to keep: `exercise_artifact` with the same input (or the same `set_id`). The result is a one-line instruction and the page's HTML. Publish that HTML **verbatim** as an HTML artifact titled with the set's title: don't edit, shorten or reformat it, and never write an exercise page by hand. Then say in a line that it is ready. The page plays like the chat player; its done screen copies the result line with «Скопировать результат», and saving it is the pasted-line case above.

### An exercise artifact the user already has

Leave such pages as they are. Rebuild one **only when the user asks to change it** («добавь вопросов», «то же, но по теме „Работа“», «сделай длиннее»):
1. Read the artifact for its title, topic and words.
2. `exercise_material` for the app's data: the words by `word_id`, their signals and levels (not the old page's copies).
3. `exercise_artifact` with a new `client_ref` and the change asked for, keeping the title and topic otherwise, and publish the new HTML verbatim in place of the old page (an update of the same artifact where the host allows it).

Never rebuild or "upgrade" an exercise artifact unasked.

## Limits to keep in mind

- The connector sees the synced copy of the cards. Words just added on the phone without a connection are not visible yet, so a «duplicate» check can miss them.
- The review cards, the cards round and the «Мини-TCF» timer need a host that shows apps (Claude on the web and desktop); elsewhere use the text fallbacks above (for exercises, `exercise_artifact`; for reviewing, the app).
- Reviews are graded in the app or on the chat's cards page (`play_cards`), and only by the user's taps there; a grade from the chat reaches the phone on its next sync, and a card graded on a phone that hasn't synced may be graded twice (one of the two states is kept). «Тренировка» changes nothing. Exercises play in the app or in the chat player: an app round comes back through `list_exercise_sets` and `exercise_material` after the app syncs, a chat round only once `save_exercise_result` has saved it.
- If a tool answers `conflict`, the app saved a newer version meanwhile: search again and retry with the fresh data.
