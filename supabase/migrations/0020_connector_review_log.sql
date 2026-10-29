-- «Карточки в чате»: a card graded on the connector's cards page (ui://kartochki/cards.html) is
-- saved by grade_cards (lib/mcp/tools.ts) the way the app saves one: the card's review_state row
-- (compare-and-set on its updated_at) and one review_log row in grade()'s shape. undo_grades
-- soft-deletes that log again. So service_role may now insert and update review_log too (0005
-- granted it only select; the upsert's ON CONFLICT needs update as well). Its log ids are
-- "cr-" + sha256(card id, the card's updated_at before the grade), never a device's, so a retried
-- grade lands on the same row; nothing is deleted.
-- Apply before deploying the app version with grade_cards (without it grading in the chat fails
-- with a permission error; nothing else changes).
grant insert, update on public.review_log to service_role;
