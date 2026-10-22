---
name: kartochki
description: Conventions for the user's «Карточки» flashcard app for colloquial French (the user is a Russian speaker). Use whenever the user wants to add, find, fix, sort or delete French words or slang, asks what to review today («что повторить сегодня»), sends a French text, chat, song or screenshot to turn into cards, or mentions карточки, темы or «Входящие». Covers card format (dictionary form, Russian translation in the same register, example), the slang level rubric 0–3 with verlan, theme choice, when to ask before changing anything, and step-by-step recipes for the Kartochki connector tools (search_words, add_words, update_word, move_words, restore_moves, delete_words, restore_words, create_folder, list_folders, list_fields, create_field, update_field, delete_field, restore_field, study_summary). Needs the Kartochki connector; without it, explain that it must be added first.
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

## Ask first

The connector's write tools normally ask the user for approval in the chat. Still follow these rules, because the user may have switched approvals to «Always allow»:

- **Adding more than 5 words:** show the list first (fr — ru, level, theme) and wait for «да», «ок» or edits.
- **Moving or deleting any words:** always list what will change and wait for an OK.
- **Editing a word:** fine without asking when the user asked for that edit; otherwise propose it.
- **Up to 5 words the user asked to add:** add them directly.

After every change, report what was done in one or two lines and how to undo it: `delete_words` with the returned ids after adding, `restore_words` after deleting, `restore_moves` with the returned `undo.moves` after moving (never a move back with `move_words`: it would change how automatic sorting treats the words). Mention that the app shows the change after its next sync (open the app or switch back to it).

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
2. Answer in two or three lines: how many cards are due, how many new cards are left for today, how many reviews are done, and a few of the words due soonest. Reviewing itself happens in the app, so suggest opening it. The numbers come from the synced copy, so reviews the phone has not synced yet are missing.

### Sort «Входящие»

1. `list_folders` for the themes and descriptions, then `search_words` with `folder: "inbox"` and `limit: 100`; while `next_offset` is not null, call again with `offset: next_offset` to see the rest.
2. Propose a theme for each word by meaning, plus at most one or two new themes when at least 3 words would go there. Leave unclear words in the inbox.
3. Show the plan grouped by theme and wait for the OK.
4. Create any approved new themes, then `move_words` per theme with `mode: "auto"`. Auto mode never moves words the user placed by hand or words in locked themes; report the ones it skipped.

### Fix or delete a word

1. `search_words` to find it and its id.
2. Edit with `update_word` (only the changed fields). The theme is changed with `move_words` (mode `user`), not with `update_word`.
3. Deleting: name the words, wait for the OK, `delete_words`, then mention that `restore_words` can bring them back with their progress.

## Limits to keep in mind

- The connector sees the synced copy of the cards. Words just added on the phone without a connection are not visible yet, so a «duplicate» check can miss them.
- Grading reviews is only possible in the app.
- If a tool answers `conflict`, the app saved a newer version meanwhile: search again and retry with the fresh data.
