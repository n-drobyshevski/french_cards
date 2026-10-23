---
name: kartochki
description: Conventions for the user's «Карточки» flashcard app for colloquial French (the user is a Russian speaker). Use whenever the user wants to add, find, fix, sort, pause or delete French words, slang or themes, asks what to review today («что повторить сегодня»), sends a French text, chat, song or screenshot to turn into cards, asks for an exercise («упражнение», тест, квиз, QCM), or mentions карточки, темы or «Входящие». Covers card format, the slang level rubric 0–3 with verlan, theme choice, when to ask first, exercise rules, and recipes for the Kartochki connector tools (search_words, add_words, update_word, move_words, restore_moves, delete_words, restore_words, create/update/delete/restore_folder, list_folders, list_fields, create/update/delete/restore_field, study_summary, exercise_material, create_exercise_set, list_exercise_sets, delete/restore_exercise_set). Needs the Kartochki connector (else: say to add it).
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

A word can carry `origin` («Происхождение»: one short Russian line that helps remember it — «верлан от lourd», «от volonté „воля“ + -aire», «из арабского kif „кайф“») and, for verbs, a `conjugation` (présent, passé composé, imparfait, futur; six forms je → ils with pronouns, plus `auxiliary`). The app builds most conjugations itself; `search_words` shows `conjugation_builtin: false` for verbs it cannot conjugate — fill those when asked. Set both with `update_word` (or `add_words`); write only what you are sure of (check unusual forms on the web), and never overwrite an existing value unless the user asks. When asked to fill origins for many words, list them first and wait for the OK, as for other bulk changes.

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

- **Adding more than 5 words:** show the list first (fr — ru, level, theme) and wait for «да», «ок» or edits.
- **Moving or deleting any words:** always list what will change and wait for an OK.
- **Editing a word:** fine without asking when the user asked for that edit; otherwise propose it.
- **Up to 5 words the user asked to add:** add them directly.
- **An exercise set the user asked for:** save it directly; it adds no words and never changes the review schedule.

After every change, report what was done in one or two lines and how to undo it: `delete_words` with the returned ids after adding, `restore_words` after deleting, `restore_moves` with the returned `undo.moves` after moving (never a move back with `move_words`: it would change how automatic sorting treats the words), `delete_exercise_set` after saving an exercise set and `restore_exercise_set` after deleting one. Mention that the app shows the change after its next sync (open the app or switch back to it).

Make write calls one at a time, never in parallel, even for different fields of the same word.

## Recipes

### Add words the user names or pastes

1. `search_words` for each word (or rely on `add_words`, which skips French forms that already exist, and report the duplicates it returns).
2. Fill every field by the rules above; pick a theme or use the one the user named.
3. More than 5 words → show the list and wait. Then call `add_words` once with all of them; a per-word `folder` lets one call cover several themes.
4. Reply with what was added, the duplicates that were skipped, and the undo hint.

### Add words from a screenshot, chat, lyrics or text

1. Read the image or text and pick what a learner wants: slang, familier and vulgar words, verlan, idioms, and less common standard words. Skip names and everyday basics the user surely knows.
2. Turn each into dictionary form: «jsuis vnr» → `être vénère`, «les keufs» → `le keuf`. Reuse a good sentence from the source as the example, tidied up.
3. Translate in the sense used in the source. If the source gives a translation, keep it unless it is wrong, and say so.
4. Show the list (usually more than 5 words), wait for the OK, then `add_words`.

### «Что повторить сегодня?»

1. `study_summary` (pass `new_per_day` if the user mentioned a different daily limit; the default is 15).
2. Answer in two or three lines: how many cards are due, how many new cards are left for today, how many reviews are done, and a few of the words due soonest. Mention `muted_themes` if there are any. If new cards pile up across many themes that look sequential, offer to pause the later ones (see Themes). Reviewing itself happens in the app, so suggest opening it. The numbers come from the synced copy, so reviews the phone has not synced yet are missing.

### Sort «Входящие»

1. `list_folders` for the themes and descriptions, then `search_words` with `folder: "inbox"` and `limit: 100`; while `next_offset` is not null, call again with `offset: next_offset` to see the rest.
2. Propose a theme for each word by meaning, plus at most one or two new themes when at least 3 words would go there. Leave unclear words in the inbox.
3. Show the plan grouped by theme and wait for the OK.
4. Create any approved new themes, then `move_words` per theme with `mode: "auto"`. Auto mode never moves words the user placed by hand or words in locked themes; report the ones it skipped.

### Fix or delete a word

1. `search_words` to find it and its id.
2. Edit with `update_word` (only the changed fields). The theme is changed with `move_words` (mode `user`), not with `update_word`.
3. Deleting: name the words, wait for the OK, `delete_words`, then mention that `restore_words` can bring them back with their progress.

## Упражнения (exercise sets)

The app's «Упражнения» tab plays Duolingo-style question sets that **you** write and save through the connector; the app plays them offline and they never touch the review schedule. The user asks in the chat («сделай упражнение по теме Еда»), or pastes a request the app built («Сделай упражнение в Карточках по теме «Люди», 12 вопросов.»). Never write the questions into the chat instead, and never call the app's own features for this.

- **Tools:** `exercise_material` (read: the words to use, weakest first, with `signals`; `topic_matches` for a free-text topic; `recent_sets`), then **one** `create_exercise_set` call with the whole set. `list_exercise_sets` shows the sets and each one's `last_run` (score, missed words, the wrong options picked). `delete_exercise_set` / `restore_exercise_set` undo.
- **Item types:** `choice` (4 options; skill `meaning`, `form`, `neutral`, `verlan` or `situation`), `cloze` (a French sentence with one `[[gap]]`, 4 options), `register` (the user picks нейтр. / fam. / arg. / vulg. for the word), `pairs` (match 4–6 words with their translations). For `choice`/`meaning` send only `word_id`, `ask` and the 3 distractors (single equivalents, in the options' language): the server writes the prompt and the answer (the word's first Russian equivalent). For `register` send only the word. For `pairs` send only the ids.
- **The rubric, in short** (full version with examples: [references/exercises.md](references/exercises.md)): 10–15 items of at least 3 types; `choice` and `cloze` get exactly 3 distractors of the same part of speech, gender, register and length as the answer, with exactly one best answer; a cloze's `sentence_ru` sets the scene and never translates the gap; recognise before produce (FR→RU and pairs first, RU→FR and cloze later); the weakest words late and twice (not in a row); no answer visible in another item's stem.
- **New words from the web** (only when the user allowed new words, «можно новые слова», or asked for a topic their library lacks): at most 8, each checked in at least 2 sources, `slang_level` by the rubric above, filled like a card, with a `source_url`. They go in `new_words` with a `ref` (`n1`, `n2`…) and the items point at them with `new_ref`. Never `add_words` them: the user ticks the ones to keep on the app's done screen. A word in `topic_matches` is saved already: use its `word_id`.
- **«Чаще в упражнениях»** (the user's setting, read by `exercise_material`): when its `focus` is on, at least the share its `note` names of the questions are about the words marked `focus: true` (difficult and/or due today), even for a plain «сделай упражнение». Pass `focus` to `exercise_material` only when the user asks otherwise in the chat («только трудные», «без упора на повторение»). `create_exercise_set` warns `focus_share` when a set falls short.
- **Saving:** make up a `client_ref` (e.g. `eda-2026-10-23`) and keep it when you retry after a refusal; a refusal lists every problem by path (`items[7].distractors …`), so fix them all in one go. `warnings` never block, but fix them next time. Reply with the title, the number of questions and the undo (`delete_exercise_set`); the set shows in «Упражнения» after the app's next sync.

### «Сделай упражнение по теме „Еда“» / «по темам „Люди“, „Эмоции“» / «по всем темам»

1. `exercise_material` with `folders` (the themes named; none for «по всем темам»); the default `limit: 30` is plenty.
2. Pick 8–12 words: the weakest first in the list (with a `focus` on, the `focus: true` words take the share it names), plus a few the user knows, for confidence. Plan the order: meaning FR→RU and pairs → register, situation, verlan → meaning RU→FR, cloze; the 2–3 weakest words come back a second time near the end.
3. Write the items by the rubric and run the leak checks from the reference.
4. `create_exercise_set` with `title` («Еда · 12 вопросов» style, at most 60 characters), `folders` as named, the items. Reply in two lines with the undo.

### «Сделай упражнение на тему „вечеринка“» (a free-text topic)

1. `exercise_material` with `topic` (and the themes, if the user named some). Use `topic_matches` (saved words) by `word_id`.
2. When too few saved words fit and new words are allowed: web search for the topic's spoken vocabulary, keep words you confirm in 2 sources, rate their register, and put them in `new_words` (at most 8; keep them under a third of the set's words, mixing in library words).
3. Write the set; every new word gets at least one recognition item (meaning FR→RU or pairs) before any production item. Save with `topic` set.

### «Работа над ошибками» / «следующий набор с упором на ошибки»

1. `list_exercise_sets` (the latest set's `last_run.missed`, with `chosen` = the wrong options picked) and `exercise_material` (`signals.ex_misses`, `confusions`, `review_misses`).
2. Build the set around the missed words: each one twice, in two different types (e.g. choice and cloze), and use the confused options as distractors where they are in the options' language («keuf» for «meuf» in a cloze; register misses carry no options). Fill up with a few words the user got right.
3. Save; mention which words the set drills.

## Limits to keep in mind

- The connector sees the synced copy of the cards. Words just added on the phone without a connection are not visible yet, so a «duplicate» check can miss them.
- Grading reviews is only possible in the app, and so is playing exercises: their results come back through `list_exercise_sets` and `exercise_material` after the app syncs.
- If a tool answers `conflict`, the app saved a newer version meanwhile: search again and retry with the fresh data.
