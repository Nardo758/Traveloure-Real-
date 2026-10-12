-- 374 — reset an echoed leg mode (P0-c item 2; ledger `2026-10-12-p0c-hotfix`). HELD for Leon's approval
-- comment on the PR. The number is provisional until merge-main.
--
-- DATA ONLY. No ALTER, no CHECK, no index, no DEFAULT — nothing for the publish-time push to see.
--
-- From the production smoke on 330f594a: a leg whose `user_selected_mode` merely ECHOES its
-- `recommended_mode` was never a traveler's choice — nobody checked it (`checked_by IS NULL`) — but the
-- engine reads a non-NULL selected mode as a pinned choice, so those legs never re-route by the market's
-- default mode. Clearing the echo returns them to the default; the next recompute re-routes them.
--
-- The predicate is exactly the one the production read used (decision-maker, Oct 12, 2026): 11 rows
-- matched (10 with `source` NULL, 1 `google_routes`). Expected effect: 11 rows updated on first run.
--
-- IDEMPOTENT: an updated row has `user_selected_mode` NULL, and `NULL = recommended_mode` is never true,
-- so a second run updates 0 rows. A leg a person checked, a leg whose selection differs from the
-- recommendation, and a superseded leg are never touched.
UPDATE transport_legs
   SET user_selected_mode = NULL
 WHERE checked_by IS NULL
   AND user_selected_mode = recommended_mode
   AND superseded_at IS NULL;
