# Упражнения: the full rubric

How to write an exercise set for `create_exercise_set`. The app plays it offline as a 2×2 grid of options (pairs and register have their own boards), one question at a time; a wrong answer or «Не знаю» brings the question back later. Results come back through `list_exercise_sets` (`last_run`) and `exercise_material` (`signals`).

## The set

- **Size:** 10–15 items (the server takes 6–20). Match the size the user asked for («12 вопросов»).
- **Types:** at least 3 of `choice`, `cloze`, `register`, `pairs`. A good mix for 12: 6–7 choice (several skills), 2–3 cloze, 1 register, 1 pairs.
- **Words:** 8–12 different words. Each new word (from the web) has at least one recognition item before any production item, and new words stay under a third of the set's words.
- **Order** (the app keeps it):
  1. Recognise first: `choice` meaning with `ask: "fr"` (French shown, Russian options) and `pairs`.
  2. Then judge: `register`, `situation`, `verlan`, `neutral`.
  3. Produce last: `choice` meaning with `ask: "ru"`, `form`, `cloze`.
  4. The weakest words (the top of `exercise_material`'s list, or last run's `missed`) appear late **and twice**, in two different types, with at least two other items between them.
- **Title:** short Russian, at most 60 characters: «Еда · 12 вопросов», «Вечеринка · сленг», «Ошибки: meuf, relou».

## Each item

| Type | You send | The server fills |
|---|---|---|
| `choice` + `meaning` | `word_id` or `new_ref`, `ask` (`fr` default, or `ru`), 3 `distractors` in the options' language (Russian for `fr`, French for `ru`: the server refuses a mix), each a single equivalent like the answer | `prompt` (the word), `answer` (the first of its comma-separated Russian equivalents, or the French for `ask: "ru"`) |
| `choice` + `form` / `neutral` / `verlan` / `situation` | `word_id` or `new_ref`, `prompt`, `answer`, 3 `distractors` | the word snapshot |
| `cloze` | `word_id` or `new_ref`, `sentence` with exactly one `[[gap]]`, optional `sentence_ru`, 3 `distractors` | `answer` (the gap, when left out) |
| `register` | `word_id` or `new_ref` | `answer` (the word's level: нейтр. / fam. / arg. / vulg.) |
| `pairs` | `pairs`: 4–6 `word_id`s / `new_ref`s | the tiles |

- Skills: `form` = the right French form for a Russian cue; `neutral` = the neutral equivalent of a slang word; `verlan` = the verlan form or its source; `situation` = what you would say in a described situation (a full short reply as the answer).
- `explain_ru` (optional, one line, at most 200 characters) shows after the answer: the verlan source, a nuance, a false friend.
- Don't send `id`s: the server numbers the items `q1…qN`.

## Distractors (choice and cloze: exactly 3)

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
    { "type": "register", "word_id": "w-relou", "explain_ru": "Разговорное, но не грубое: так говорят все." },
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

Why it works: recognition first (items 1–3), judgement next (4–8), production last (9–12); `la meuf` and `la teuf` come back as cloze near the end; every distractor has the answer's part of speech, gender and register; the `meaning` items send no prompt or answer; the cloze hints describe the scene without the missing word; 4 types, 11 words, 1 new.

## Good and bad items

**Distractors of another kind** — bad: `la meuf` → «девушка» among «быстро», «есть», «красивый» (adverb, verb, adjective: the noun stands out). Good: among «тачка», «засада», «хата».

**Two right answers** — bad: «Как сказать «машина» на арго?» with `la bagnole` and the distractor `la caisse` (also argot for a car). Good: distractors `la teuf`, `la meuf`, `la daronne`.

**The answer stands out by length** — bad: `C'était vraiment trop ouf, franchement !` among «C'était nul», «C'était relou», «C'était chelou». Good: four options of the same shape, «C'était … !».

**A hint that translates the gap** — bad: `J'ai trop [[kiffé]] la soirée.` / «Мне очень понравилась вечеринка». Good: «Вечер у Карима — вспоминаю до сих пор.»

**A stem that gives the answer away** — bad: prompt «Что значит la meuf (верлан от femme)?» with answer «девушка»: the note answers it. Good: let the server write the prompt; put «верлан от femme» in `explain_ru`, which shows after the answer.

**A cloze where two options fit** — bad: `Je te présente ma [[meuf]], Sarah.` with the distractor `daronne` («моя мама, Сара» fits too). Good: `teuf`, `thune`, `caisse`.

**Register misread** — a `register` item for `la thune` expects «arg.», not «fam.»: rate the word by the SKILL.md rubric in the sense you give, and check its `slang_level` in `exercise_material` (the server takes the answer from it).

**The same word twice in a row** — bad: items 4 and 5 both about `relou`. Good: at least two other items between them.
