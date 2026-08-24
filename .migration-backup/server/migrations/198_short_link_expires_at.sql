-- 198_short_link_expires_at.sql — D6 rails attribution (docs/DECISIONS.md ruling 61).
--
-- WHY: ruling 61 requires that "a fabricated/expired/wrong-provider ref → full rate". Fabricated
-- and wrong-provider were both answerable from the row that already exists (code lookup + owner
-- comparison). EXPIRED was not: `short_links` carried no expiry of any kind, so the refusal the
-- ruling names had nothing to key on. This is that column, and nothing else.
--
-- SEMANTICS: NULL = never expires. Every existing row is therefore byte-identical in behaviour —
-- no backfill, no default, no behaviour change for any link already shared. Only a row someone
-- deliberately dates ever refuses.
--
-- WHERE IT BINDS: the MONEY decision only (`rails-attribution.service.ts` — an expired link stops
-- selecting the rails band lane). `GET /r/:code` is deliberately UNCHANGED: an expired link still
-- redirects and still counts its click, and the S4 analytics attribution still records
-- `source='link'`, because a click that really happened is a true analytics fact whatever the fee
-- lane says about it. Two questions, two answers (§13).
--
-- NEGATIVE SPACE (ruling 43): nothing in the application WRITES this column yet — an owner-facing
-- or admin-facing expiry control is filed, not built here. Until it lands the column is set by ops
-- (or by the pin's fixture), and the refusal path is proven by
-- `server/__tests__/rails-attribution.db.test.ts`. It is declared read-side first on purpose: the
-- alternative was to let the ruling's "expired" refusal silently not exist.
--
-- Additive, nullable, no CHECK, no DEFAULT — so the Autoscale deploy-push cannot fail on rows
-- already on disk (CLAUDE.md publish-time CHECK trap). DECLARED in shared/schema.ts in the SAME
-- commit (publish-trap durability rule): an undeclared object is dropped by the push and, because
-- this migration is stamped after its first run, would never be recreated.

ALTER TABLE short_links ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

COMMENT ON COLUMN short_links.expires_at IS
  'D6 rails attribution (ruling 61). NULL = never expires. Enforced in the rails money decision '
  '(rails-attribution.service.ts) only; /r/:code redirect and S4 analytics attribution are unchanged.';
