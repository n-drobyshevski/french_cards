-- «Контекст»: a word's origin («верлан от lourd») and its conjugation, written from the chat through
-- the Claude connector (update_word / add_words) or by hand, synced like the other word columns.
-- conjugation is {"auxiliary": "avoir"|"être", "remark": text|null, "tenses": {"present": [6],
-- "passe_compose": [6], "imparfait": [6], "futur": [6]}}; null = built on the device from Lexique.
-- Apply before deploying the app version that syncs them (its pushes include both columns).
alter table public.words
  add column if not exists origin text,
  add column if not exists conjugation jsonb;
-- The table-level grants of 0001 (authenticated) and 0005 (service_role) cover new columns.
