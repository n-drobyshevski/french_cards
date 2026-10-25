# Упражнения: the full rubric

How to write an exercise set for `create_exercise_set` (the app) or `play_exercises` / `exercise_artifact` (the chat): the same set, the same rules. It plays as a 2×2 grid of options (pairs have their own board; a reading item's long options go one per row), one question at a time; a wrong answer or «Не знаю» brings the question back later. The «Мини-TCF» exam (below) plays the same items once each, against the clock. Results come back through `list_exercise_sets` (`last_run`) and `exercise_material` (`signals`); a chat round only once it is saved (see «В чате» below).

## The set

- **Size:** 10–15 items (the server takes 6–20). Match the size the user asked for («12 вопросов»). A verb set is shorter: see «Спряжение глаголов» below.
- **Types:** at least 3 of `choice`, `cloze`, `pairs`, `conjugate`, `reading`. A good mix for 12: 7–8 choice (several skills), 2–3 cloze, 1 pairs; `conjugate` belongs mostly to verb sets, and `reading` to «Мини-TCF» and to sets the user asks to be about texts («с текстами», «как в TCF»), though one or two fit any set from B1 up. A set that is at least half reading items is not warned for fewer types. There is no `register` type any more: the server refuses it.
- **Words:** 8–12 different words. Each new word (from the web) has at least one recognition item before any production item, and new words stay under a third of the set's words.
- **Order** (the player keeps it, in the app and in the chat):
  1. Recognise first: `choice` meaning with `ask: "fr"` (French shown, Russian options) and `pairs`.
  2. Then judge: `situation`, `verlan`, `neutral`.
  3. Produce last: `choice` meaning with `ask: "ru"`, `form`, `cloze`, `conjugate`. A `reading` item goes after the recognition items of the words its text uses.
  4. The weakest words (the top of `exercise_material`'s list, or last run's `missed`) appear late **and twice**, in two different types, with at least two other items between them.
- **Focus («Чаще в упражнениях»):** see the next section.
- **Title:** short Russian, at most 60 characters: «Еда · 12 вопросов», «Вечеринка · сленг», «Ошибки: meuf, relou».

## «Чаще в упражнениях» (the focus)

The user picks in the app's Settings which of their words exercises should favour: «Обычно» (off), «Трудные» (cards the app rates difficult), «К повторению» (due today) or both, and how much of a set: «Немного» (≥25 %), «Половина» (≥50 %), «Почти все» (≥80 %). `exercise_material` reads it and returns:

- `focus: { target, share, from, min_items_for_12, available, note }` (`from`: `settings`, or `request` when you passed `focus`); `{ target: "normal" }` when it is off.
- The matching words first in `words`, each with `focus: true` (then the usual weakest-first order).

Rules:
- At least the share of the **questions** is about focus words: `min_items_for_12` for 12 questions, scaled for another size (≥50 % of 15 = 8). An item counts when its `word_id` is a focus word; a `pairs` board counts when at least half its words are. New words never count.
- With fewer focus words than that (`available`), use each of them at least once, the weakest twice.
- It applies to every request, a plain «сделай упражнение» included, and to a theme or topic set (the focus words of that scope). The order rules still hold: recognise before produce, the same word apart.
- Pass `focus: { target, share? }` to `exercise_material` only when the user asks otherwise in this chat («сегодня только трудные», «без упора на повторение» → `normal`); the saved setting stays as it is.
- `create_exercise_set` adds the warning `focus_share` when the saved setting asked for more than the set has; the set is saved anyway, so get it right next time.

## Only difficult / due words (`only` and `scope`)

A set made **only** of the user's difficult words, the words due today, or both, from every theme. The app's request names it: «Сделай упражнение в Карточках по трудным словам из всех тем, 12 вопросов.» («по словам к повторению», «по трудным словам и словам к повторению»), on a phone «Сделай в Карточках 12 вопросов по трудным словам из всех тем.»; a chat request like «упражнение по трудным словам» or «без тем, только то, что на повторении» means the same.

- `exercise_material` with `only: "difficult" | "due" | "both"`: `words` are just those words (live, not «на паузе», from every theme; `folders` still narrows when the user named themes), weakest first. `topic` is ignored, and there is no `focus` block (every word is a focus word already). `scope` adds `{ only, available, suggested_items, note }`.
- **Size:** `suggested_items` = available × 3, at least 6 and at most 12 (scale the 12 for another asked size). With few words make the **shorter** set: 3 difficult words → 9 questions, not 12 padded with other words.
- **Each word in 2–3 different types:** e.g. meaning FR→RU, then neutral or cloze, then meaning RU→FR. `pairs` needs at least 4 words. The same word is never in two items in a row; the weakest come back late.
- **Nothing else:** no other library words and no `new_words` (`create_exercise_set` refuses `new_words` with a `scope`).
- **None available** (`available: 0`): don't save a set; tell the user there are no such words now (e.g. «Сейчас нет слов к повторению»).
- **Saving:** `create_exercise_set` with `scope` = the same value (the app shows the set as «Трудные · все темы», «К повторению · все темы» or «Трудные и к повторению»). The warning `scope_words` lists items about words that are not difficult / due; the set is saved anyway. The saved «Чаще в упражнениях» share is not checked for a scoped set.

## «Уровень набора» (`level`)

The user can ask for a set at one level or several («Сделай в Карточках 12 вопросов уровня B1 по теме …», «… уровня B1–B2 …», on a computer «…, 12 вопросов, уровень B1–B2, …»). Pass them to `exercise_material` as `levels` (["B1", "B2"]). Without them («Авто»), `exercise_material`'s `level` takes the median level of the theme's neutral words (`from: "auto"`; B1 when none has a level). Either way, write at `level.targets` and save with `levels` (and `level_auto: true` for «Авто»). With several levels, spread the questions about evenly across them, the easier ones first (B1–B2 in 12: about 6 at B1, then 6 at B2), each written by its row below.

The level shapes **the questions, not the words**: the library words from `exercise_material` stay, even one above the level; everything around them follows the level.

| | Sentences (cloze, situation) | Distractors | Mix | New words |
|---|---|---|---|---|
| A2 | 5–8 words, présent and passé composé, concrete everyday scenes | same part of speech, clearly different meaning | mostly recognition (meaning fr→ru, pairs, verlan); at most a quarter production | A1–A2 |
| B1 | 8–12 words, the common tenses, life in France (housing, work, administration, health) | from the same theme | about half recognition, half production | up to B1 |
| B2 | 12–18 words with a subordinate clause or connector (bien que, alors que, pourtant), opinions and society | close in meaning: near-synonyms, false friends, a wrong collocation or register | mostly production (cloze, meaning ru→fr, situation) | B1–B2 |
| C1 | longer, with nuance (subjonctif, concession, nominalisation), abstract or idiomatic | differ by nuance, collocation or register only | mostly production and situation | B2–C1 |

- Keep every other word of a cloze sentence and of the French options at the level or below. `create_exercise_set` warns `level_words` when the app's dictionary puts one two levels or more above the highest level (it only rates words written in their dictionary form, and leaves out the asked words and names). Simplify those words next time; the warning never blocks.
- A2 example (le logement): «Je cherche un [[logement]] près de la gare.» — B2: «Bien que le loyer soit élevé, ce [[logement]] reste prisé des étudiants.»
- A higher level never means rarer library words or trick questions: one best answer, as always.

## «Спряжение глаголов» (verb sets)

A short test on the user's verbs. The app's request says «Сделай упражнение на спряжение глаголов в Карточках по теме «…», 8 вопросов.», on a phone «Сделай в Карточках 8 вопросов на спряжение глаголов по теме «…».»; a chat request like «потренируй спряжение» means the same.

- `exercise_material` with `verbs: true`: `words` are only the verbs `conjugate` items can use (`conjugable: true`: the word has a saved conjugation, or the app builds one from Lexique). Without `verbs`, conjugable verbs still carry `conjugable: true`.
- **Size:** 8 items by default (6–10, as asked); at most 10 `conjugate` items in a set (the server refuses more). New words: none.
- **Mix:** mostly `conjugate`, mixing the four tenses (présent, passé composé, imparfait, futur) and the persons; 30–40 % of the passé composé items on an être verb (aller, venir, partir, arriver…) or a pronominal one (se casser). Then 2–3 `cloze` items whose gap is a verb form and whose sentence carries a time marker («Hier…», «Tous les jours…», «Demain…»): passé composé vs imparfait is the classic trap for a Russian speaker.
- **Some tenses only** (`tenses` in `exercise_material` and the set, e.g. `["imparfait"]`): every `conjugate` item in one of them, spread about evenly, the persons still mixed; the server refuses an item in another tense (`items[i].tense`). Cloze items: the passé composé vs imparfait contrast only when both are picked; otherwise at most 2 cloze items whose verb gap is in a picked tense, or none. The être / pronominal share applies only when the passé composé is picked.
- The same verb at most twice, never in two items in a row.
- `person`: je, tu, il (= il / elle / on), nous, vous, ils. Never ask for elle / elles: the forms have no feminine agreement.
- Two types by design: `create_exercise_set` does not warn `few_types` for a set that is mostly `conjugate`.

Example (8 items):

```json
{
  "client_ref": "spryazhenie-2026-10-25",
  "title": "Спряжение · 8 вопросов",
  "folders": ["Повседневное"],
  "items": [
    { "type": "conjugate", "word_id": "w-kiffer", "tense": "present", "person": "nous" },
    { "type": "conjugate", "word_id": "w-casser", "tense": "passe_compose", "person": "tu" },
    { "type": "conjugate", "word_id": "w-bouffer", "tense": "imparfait", "person": "ils" },
    { "type": "conjugate", "word_id": "w-aller", "tense": "futur", "person": "je" },
    {
      "type": "cloze",
      "word_id": "w-bouffer",
      "sentence": "Hier soir, on [[a bouffé]] chez Karim.",
      "sentence_ru": "Вчерашний вечер у друга.",
      "distractors": ["bouffait", "bouffera", "bouffe"]
    },
    { "type": "conjugate", "word_id": "w-aller", "tense": "passe_compose", "person": "nous" },
    { "type": "conjugate", "word_id": "w-kiffer", "tense": "imparfait", "person": "vous" },
    {
      "type": "cloze",
      "word_id": "w-casser",
      "sentence": "Tous les jours, il [[se cassait]] à cinq heures.",
      "sentence_ru": "Привычка в прошлом.",
      "distractors": ["s'est cassé", "se cassera", "se casse"]
    }
  ]
}
```

The server turns `{ "word_id": "w-aller", "tense": "passe_compose", "person": "nous" }` into the card «aller · nous ___» with the answer «sommes allés» and three other forms of the verb (here «avons allé», «allons», «allions»).

## Each item

| Type | You send | The server fills |
|---|---|---|
| `choice` + `meaning` | `word_id` or `new_ref`, `ask` (`fr` default, or `ru`), 3 `distractors` in the options' language (Russian for `fr`, French for `ru`: the server refuses a mix), each a single equivalent like the answer | `prompt` (the word), `answer` (the first of its comma-separated Russian equivalents, or the French for `ask: "ru"`) |
| `choice` + `form` / `neutral` / `verlan` / `situation` | `word_id` or `new_ref`, `prompt`, `answer`, 3 `distractors` | the word snapshot |
| `cloze` | `word_id` or `new_ref`, `sentence` with exactly one `[[gap]]`, optional `sentence_ru`, 3 `distractors` | `answer` (the gap, when left out) |
| `pairs` | `pairs`: 4–6 `word_id`s / `new_ref`s | the tiles |
| `conjugate` | `word_id` (or `new_ref`) of a verb, `tense` (`present`, `passe_compose`, `imparfait`, `futur`), `person` (`je`, `tu`, `il`, `nous`, `vous`, `ils`); optionally 3 `distractors` (forms of the same verb without the pronoun) | `prompt` (the infinitive), `sentence` (the pronouns and the gap: «tu [[as kiffé]]»), `answer`, and 3 `distractors` from the verb's other forms when left out |
| `reading` | `passage` (French, 40–900 characters, best 300–700; line breaks kept), `passage_label` (ANNONCE, MESSAGE, COURRIEL, ARTICLE, AVIS, AFFICHE…; letters only, up to 20), `prompt` (the question, in French), `answer` and 3 `distractors` (French); optionally `word_id` (a library word the text uses; never `new_ref`) | the label in capitals; the word snapshot when there is a `word_id` |

- Skills: `form` = the right French form for a Russian cue; `neutral` = the neutral equivalent of a slang word; `verlan` = the verlan form or its source; `situation` = what you would say in a described situation (a full short reply as the answer).
- `explain_ru` (optional, one line, at most 200 characters) shows after the answer: the verlan source, a nuance, a false friend; for `reading`, where the text says it.
- `level` (optional, A1…C2, any type): the question's level. The app shows it as «≈B1» on the card; an exam needs it on every item and shows its result by level.
- Don't send `id`s: the server numbers the items `q1…qN`.

## Reading («текст»)

A question about a short French text, as in the TCF's compréhension écrite. The app and the chat show the text as a quoted block with its mono label, then the question and 4 options; a miss stamps «НЕВЕРНО» and shows the right answer and `explain_ru`, as for choice.

- **The text:** realistic French of its genre, the kind a learner meets in France: a flat ad, a message from a friend or a landlord, an email from the préfecture or the CAF, a building notice, a short news or opinion piece. On the user's themes, using a few of their words (from `exercise_material`), with names, places, prices and dates. 300–700 characters (the server takes 40–900); no translation from Russian, no stiff textbook French.
- **The level** (`level`) is the text's difficulty, and the question follows it:

  | Level | Text | Question |
  |---|---|---|
  | A2 | 300–400 characters, a message, an ad or a notice; présent, passé composé, futur proche; everyday facts | an explicit fact: when, where, how much, who |
  | B1 | 400–550, a letter, an email, a notice with conditions | a reason or a simple inference: why someone writes, what to do, what is included |
  | B2 | 500–700, an article or an opinion with connectors (pourtant, alors que, en revanche) | the author's view, a cause, a nuance; distractors close in meaning |
  | C1 | up to 900, an argued text | what is implied, the tone, a concession |

- **The question** is in French (the server refuses Russian): «Que propose l'annonce ?», «Pourquoi Léa écrit-elle à son propriétaire ?», «Que pense l'auteur de … ?». It is answered from the text alone, never from outside knowledge.
- **Exactly one clearly right answer**, said in the text (A2–B1) or plainly implied by it (B2+). Paraphrase it rather than copying the text's words.
- **3 distractors plausible from the text** but contradicted by it or not said: another price or day from the text, a partial sum, the right fact for the wrong person, what the text says will *not* happen. They may reuse the text's words (so word-matching finds nothing). Same shape and length as the answer, French, distinct.
- **One question per text.** For two questions on the same text, write two items with different passages; the same text twice gives the answer away.
- **Leak checks:** the answer is not in the question; no other item's stem gives it. (The server checks a reading item's own question only, since the answer is meant to be found in the text.)
- **`passage_label`:** the genre in one word or two: ANNONCE, MESSAGE, SMS, COURRIEL, LETTRE, AVIS, AFFICHE, ARTICLE, BLOG.
- **`word_id`:** when the text turns on one of the user's words (le loyer, la caution), so a miss counts against it; else leave it out (a miss is scored, but adds no word to the mistakes).

Example (B1, `Жильё`; the word id shortened as above):

```json
{
  "type": "reading",
  "level": "B1",
  "word_id": "w-loyer",
  "passage_label": "ANNONCE",
  "passage": "À louer — Lyon 7e, T2 de 42 m², 3e étage sans ascenseur, à cinq minutes du métro Jean-Macé.\nLoyer : 780 € par mois + 60 € de charges (eau froide et entretien de l'immeuble).\nCaution : un mois de loyer hors charges.\nFrais d'agence : 390 € à la signature du bail.\nPréavis : un mois (zone tendue).\nLibre le 1er décembre. Visites le samedi matin, sur rendez-vous uniquement.",
  "prompt": "Combien faut-il payer à l'entrée dans le logement ?",
  "answer": "2 010 €",
  "distractors": ["1 620 €", "1 170 €", "840 €"],
  "explain_ru": "Первый месяц с charges 840 € + залог 780 € + агентству 390 €."
}
```

Why it works: a real ad's shorthand (T2, charges, zone tendue) at B1; the answer is worked out from three lines of the text, not copied from one; each distractor is a sum a hurried reader makes (840 + 780, 780 + 390, the first month alone); four options of the same shape.

Bad and good:
- **Answerable without the text** — bad: «Qu'est-ce qu'une caution ?». Good: a question only this text answers.
- **Two defensible answers** — bad: «Karim ne vient pas samedi» next to «Karim est occupé samedi». Good: one of them, and distractors the text rules out.
- **The answer copied, the distractors invented** — bad: the answer repeats the text's line word for word, the distractors appear nowhere in it. Good: the answer paraphrased, the distractors built from the text's own facts.
- **A Russian question or options** — refused by the server; the whole item is French, `explain_ru` aside.

## «Мини-TCF» (exam mode)

`play_exercises` with `mode: "exam"` plays the set as a short timed test (the chat only; `create_exercise_set` and `exercise_artifact` keep the normal practice round). The player shows a start card («МИНИ-TCF · 12 ВОПРОСОВ · 18 МИН», the levels strip from the items' levels, «Состав» by type: «6 текстов · 4 значения · 2 пропуска», three rules, «Начать 18:00»), then one question at a time with the countdown (red under 2:00): pick A–D, then «Ответить»; no stamp, no feedback, no requeue, no «Не знаю», no going back. When the time is up the test ends and the questions left count as wrong. The result card: «8 из 12 · 14:05», a chip per level (✓ 80 % or more right, ~ in between, ✗ under half), «Это ориентир, не балл TCF.», the mistakes (level, the question, the pick struck, the right answer), «Разобрать ошибки», «Сохранить в Карточки», «Ещё раз».

- **Size:** about 12 items (the server takes 8–20); `time_limit_s` (60–3600) only when the user asked for a time, else 90 s a question.
- **Levels:** `level` on every item (refused without). A2 → B2 by default, easier first; at least 3 items per level, so a chip means something (12: about 4 A2, 5 B1, 3 B2).
- **Mix:** about half `reading` (different genres), the rest `choice` (meaning, situation) and `cloze` about the user's words, `conjugate` if it fits; no `pairs` and no `new_words` (refused). The distractor, leak and level rules above apply unchanged.
- **During the test** never reveal or hint at an answer, even when asked. **After it**, «Разобрать ошибки» sends the mistakes (question, pick, right answer): explain each from its text in a line or two, in Russian, and offer a round on the weak level. The result is an estimate, not a TCF score.
- **Saving** works as for any chat round («Сохранить в Карточки»); the saved set plays in the app as a practice round (named «тексты» when more than half are reading items).

Outline of a 12-question exam on «Жильё» and «Администрация»:

| # | Level | Type | About |
|---|---|---|---|
| 1 | A2 | choice meaning fr | le loyer |
| 2 | A2 | reading MESSAGE | a friend can't help with the move on Saturday |
| 3 | A2 | cloze | la coloc |
| 4 | A2 | reading AFFICHE | the building's water cut: which day, what time |
| 5 | B1 | reading ANNONCE | the example above: what to pay on entry |
| 6 | B1 | choice situation | le préavis: what you say to the landlord |
| 7 | B1 | reading COURRIEL | why Mme Roux writes to the préfecture |
| 8 | B1 | cloze | la démarche |
| 9 | B1 | reading AVIS | the CAF's notice: which document is missing |
| 10 | B2 | choice meaning ru | l'état des lieux |
| 11 | B2 | reading ARTICLE | rents in the banlieue: what the author observes |
| 12 | B2 | cloze | l'enjeu |

## Distractors (choice, cloze and reading: exactly 3; conjugate: the server's)

1. **Same part of speech, gender and number** as the answer: a feminine noun with its article among feminine nouns with theirs; a past participle among past participles.
2. **Same register:** slang answers among slang distractors, neutral among neutral (except in `neutral` items, where the distractors are neutral too and wrong in meaning).
3. **About the same length:** the answer must not be the longest option in most items (the server warns at 60 %).
4. **Exactly one best answer.** Every distractor is clearly wrong in this sentence or for this word: no synonyms, no second sense that also fits («la caisse» next to «la bagnole» when the question is «машина на арго»).
5. **Plausible:** real words the user may know, ideally from the same set or theme, or a past confusion (`confusions`, `last_run.missed[].chosen`) in the options' language (a confusion may be a Russian tile from a pairs board). No invented words, no joke options. For `meaning`, no other equivalent of the word itself (the server refuses «тёлка» for «la meuf» = «девушка, тёлка»).
6. Distinct from each other and from the answer, ignoring case and accents (the server refuses repeats).

## Leak checks (run them before saving)

- The answer does not appear in its own `prompt`, `sentence` (outside the gap) or `sentence_ru`.
- No other item's stem shows the answer (a cloze sentence elsewhere that contains «kiffer» gives away a `kiffer` item). The server warns about both.
- `sentence_ru` sets the scene; it **never translates the gap**. «Мне очень понравилась вечеринка» for «J'ai trop [[kiffé]] la soirée» gives the answer away; «Вечер у Карима — вспоминаю до сих пор» does not.
- The prompt does not hint by form: no «(глагол)» when only one option is a verb, no article only on the answer.
- Two items about the same word are never back to back.
- A `pairs` board has distinct translations (two words meaning «деньги» can't share a board).

## New words from the web

Only when the user allowed them («можно новые слова») or asked for a topic their library lacks. At most 8 per set.

- Check each word and its meaning in **at least 2 sources** (dictionaries such as Wiktionnaire, Le Robert, Larousse, a slang dictionary, usage in real texts). Leave out anything you can't confirm.
- Fill it like a card: dictionary form, 1–3 Russian equivalents in the same register, `slang_level` by the rubric in SKILL.md, `verlan`, `pos`, `gender` for nouns, a short real example, `origin` if you are sure; `source_url` = one of the pages you checked.
- `ref`: `n1`, `n2`…; items point at it with `new_ref`.
- First `exercise_material` with the `topic`: a word in `topic_matches` is saved already, so use its `word_id` (the server refuses a new word that is saved).
- Never `add_words` them: the done screen offers «Добавить в библиотеку» with checkboxes.

## Worked example

`exercise_material({ topic: "вечеринка", folders: ["Эмоции"] })` returned, among others, `la meuf` (weakest), `la bagnole`, `le keuf`, `la thune`, `la galère`, `relou`, `ouf`, `vénère`, `chelou`, `kiffer` (word ids shortened to `w-…` here; use the real ones), and no saved word for «тусовка». The user allowed new words. The set, saved with no warnings:

```json
{
  "client_ref": "vecherinka-2026-10-23",
  "title": "Вечеринка · 12 вопросов",
  "topic": "вечеринка",
  "folders": ["Эмоции"],
  "new_words": [
    {
      "ref": "n1",
      "fr": "la teuf",
      "ru": "тусовка",
      "note": "верлан от fête",
      "example_fr": "On fait une teuf samedi.",
      "example_ru": "В субботу у нас тусовка.",
      "pos": "noun",
      "gender": "f",
      "slang_level": 2,
      "verlan": true,
      "origin": "верлан от fête",
      "source_url": "https://fr.wiktionary.org/wiki/teuf"
    }
  ],
  "items": [
    { "type": "choice", "skill": "meaning", "ask": "fr", "word_id": "w-meuf", "distractors": ["тачка", "засада", "хата"] },
    { "type": "choice", "skill": "meaning", "ask": "fr", "new_ref": "n1", "distractors": ["засада", "тачка", "хата"] },
    { "type": "pairs", "pairs": ["w-bagnole", "w-keuf", "w-thune", "w-galere"] },
    {
      "type": "choice",
      "skill": "neutral",
      "word_id": "w-relou",
      "prompt": "Как сказать «relou» нейтрально?",
      "answer": "pénible",
      "distractors": ["facile", "agréable", "rapide"],
      "explain_ru": "relou — верлан от lourd: «тяжёлый, занудный»."
    },
    {
      "type": "choice",
      "skill": "situation",
      "word_id": "w-ouf",
      "prompt": "Друг выходит с концерта в полном восторге. Что он скажет?",
      "answer": "C'était ouf !",
      "distractors": ["C'était relou !", "C'était chelou !", "C'était nul !"],
      "explain_ru": "ouf — верлан от fou: «безумно круто»."
    },
    {
      "type": "choice",
      "skill": "verlan",
      "word_id": "w-vener",
      "prompt": "Верлан от «énervé»",
      "answer": "vénère",
      "distractors": ["chelou", "relou", "zarbi"]
    },
    {
      "type": "choice",
      "skill": "neutral",
      "word_id": "w-bagnole",
      "prompt": "Как сказать «la bagnole» нейтрально?",
      "answer": "la voiture",
      "distractors": ["la moto", "la gare", "la route"]
    },
    {
      "type": "choice",
      "skill": "form",
      "word_id": "w-thune",
      "prompt": "«Бабки» на арго — это…",
      "answer": "la thune",
      "distractors": ["la teuf", "la meuf", "la daronne"]
    },
    { "type": "choice", "skill": "meaning", "ask": "ru", "word_id": "w-chelou", "distractors": ["relou", "vénère", "ouf"] },
    {
      "type": "cloze",
      "word_id": "w-kiffer",
      "sentence": "J'ai trop [[kiffé]] la soirée chez Karim.",
      "sentence_ru": "Вечер у Карима — вспоминаю до сих пор.",
      "distractors": ["bouffé", "galéré", "flippé"]
    },
    {
      "type": "cloze",
      "new_ref": "n1",
      "sentence": "Samedi, on fait une [[teuf]] chez moi, tu viens ?",
      "sentence_ru": "Зовёшь друзей к себе в субботу.",
      "distractors": ["meuf", "thune", "caisse"]
    },
    {
      "type": "cloze",
      "word_id": "w-meuf",
      "sentence": "Je te présente ma [[meuf]], Sarah.",
      "sentence_ru": "Знакомишь друга с Сарой: вы встречаетесь.",
      "distractors": ["teuf", "thune", "caisse"]
    }
  ]
}
```

Why it works: recognition first (items 1–3), judgement next (4–8), production last (9–12); `la meuf` and `la teuf` come back as cloze near the end; every distractor has the answer's part of speech, gender and register; the `meaning` items send no prompt or answer; the cloze hints describe the scene without the missing word; 3 types (choice with five skills), 11 words, 1 new.

## Good and bad items

**Distractors of another kind** — bad: `la meuf` → «девушка» among «быстро», «есть», «красивый» (adverb, verb, adjective: the noun stands out). Good: among «тачка», «засада», «хата».

**Two right answers** — bad: «Как сказать «машина» на арго?» with `la bagnole` and the distractor `la caisse` (also argot for a car). Good: distractors `la teuf`, `la meuf`, `la daronne`.

**The answer stands out by length** — bad: `C'était vraiment trop ouf, franchement !` among «C'était nul», «C'était relou», «C'était chelou». Good: four options of the same shape, «C'était … !».

**A hint that translates the gap** — bad: `J'ai trop [[kiffé]] la soirée.` / «Мне очень понравилась вечеринка». Good: «Вечер у Карима — вспоминаю до сих пор.»

**A stem that gives the answer away** — bad: prompt «Что значит la meuf (верлан от femme)?» with answer «девушка»: the note answers it. Good: let the server write the prompt; put «верлан от femme» in `explain_ru`, which shows after the answer.

**A cloze where two options fit** — bad: `Je te présente ma [[meuf]], Sarah.` with the distractor `daronne` («моя мама, Сара» fits too). Good: `teuf`, `thune`, `caisse`.

**The same word twice in a row** — bad: items 4 and 5 both about `relou`. Good: at least two other items between them.

## В чате

The same set, played right in the chat («давай здесь», «в чате», «прямо тут»): `play_exercises` takes exactly the fields of `create_exercise_set`, checks them the same way and writes nothing; the player shows in the chat with the app's rules and look (the question card, 4 options, «Не знаю», a miss back up to 3 times, intro cards for new words, «ИТОГ НАБОРА» at the end). Everything above applies: size, mix, order, distractors, leak checks.

- **Never** write the questions, options or answers in the chat: the player shows them. A line or two that it is ready is enough.
- Reading items play in the chat as in the app; `mode: "exam"` turns the round into the «Мини-TCF» above.
- No player (Claude Code, or the user doesn't see one): `exercise_artifact` with the same input, and publish its HTML verbatim as an HTML artifact.
- Replay a saved set with `play_exercises` `{ set_id }` alone; a `client_ref` that is saved already is refused.
- Saving is the user's choice: the player's «Сохранить в Карточки» saves the set (if new) and the round by itself; a pasted «Скопировать результат» line (`KARTOCHKI_RUN …`) is saved with `save_exercise_result` (`run_line` + the set input you played, or `set_id`) only after you asked and the user said yes. The server recomputes the score and ignores answers to questions that are not in the set.
- An exercise artifact the user already has is rebuilt only when they ask to change it (more questions, another topic): `exercise_material` for the app's words, then `exercise_artifact` keeping its title and topic.
