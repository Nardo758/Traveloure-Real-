-- Step 7b (R323; surface spec §12, R-n, R-q, R-s, R-t, R-bd; work plan L2-2). SQL HELD for the
-- founder's ruling before merge. ADDITIVE ONLY. No function, trigger, CREATE OR REPLACE or DO block.
-- IF NOT EXISTS / ON CONFLICT DO NOTHING everywhere, so a second run is a no-op.
--
-- (1) expert_suggestions — a NEW table, born empty, with only its PK (the new-table rule). Every
--     expert change to a traveler's plan is one row; nothing reaches the plan until the traveler
--     accepts it. Declared in shared/schema.ts (deploy-push durability rule).
--   trip_id      the plan
--   item_id      the item the change is about (NULL for an `add`)
--   request_id   the expert_requests row (the handoff) it was made under
--   expert_id    the suggesting expert (the session user; server-derived)
--   kind         'edit' | 'add' | 'remove' | 'move' | 'leg'  (app-enforced, shared/handoff.ts)
--   payload      the change: an allowlisted item patch, an item body, a day/order, a leg patch
--   status       'pending' | 'accepted' | 'declined' | 'superseded'  (app-enforced)
--   created_at / resolved_at  set by the app
CREATE TABLE IF NOT EXISTS expert_suggestions (id varchar PRIMARY KEY);
ALTER TABLE expert_suggestions ADD COLUMN IF NOT EXISTS trip_id varchar;
ALTER TABLE expert_suggestions ADD COLUMN IF NOT EXISTS item_id varchar;
ALTER TABLE expert_suggestions ADD COLUMN IF NOT EXISTS request_id varchar;
ALTER TABLE expert_suggestions ADD COLUMN IF NOT EXISTS expert_id varchar;
ALTER TABLE expert_suggestions ADD COLUMN IF NOT EXISTS kind varchar(20);
ALTER TABLE expert_suggestions ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE expert_suggestions ADD COLUMN IF NOT EXISTS status varchar(20);
ALTER TABLE expert_suggestions ADD COLUMN IF NOT EXISTS created_at timestamp;
ALTER TABLE expert_suggestions ADD COLUMN IF NOT EXISTS resolved_at timestamp;

-- (2) expert_requests — the handoff's lifecycle on its ONE row. Columns added to an existing table:
--     nullable, no DEFAULT / CHECK / index / FK. NULL = not happened / not a handoff row (§13).
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS handoff_kind varchar(20);          -- polish | book | plan_all
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS scope_item_ids jsonb;               -- ticked item ids; NULL = whole plan
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS fee_cents integer;                  -- the authorized fee, server-derived
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS traveler_fee_cents integer;         -- traveler service fee in the hold
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS payment_intent_id varchar;          -- manual-capture PaymentIntent
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS authorized_at timestamp;
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS accepted_at timestamp;
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS captured_at timestamp;
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS fallback_offered_at timestamp;
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS released_at timestamp;
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS withdrawn_at timestamp;
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS withdrawal_fee_cents integer;
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS refund_id varchar;
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS delivered_at timestamp;
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS change_rounds integer;              -- NULL = none requested
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS approved_at timestamp;
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS approved_by varchar(20);            -- traveler | auto
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS on_trip_support_offered_at timestamp;
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS on_trip_support_accepted_at timestamp;
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS on_trip_support_payment_intent_id varchar;
ALTER TABLE expert_requests ADD COLUMN IF NOT EXISTS source_purchase_id varchar;         -- Ready Made revision (R-bd)

-- (3) fee_bands — three rows the handoff reads BY NAME (§8: no literal in code). Insert-if-missing;
--     an admin-tuned row is never overwritten. VALUES ARE PROPOSED, HELD FOR RULING.
--   handoff_withdrawal_accepted   R-t: share of the captured fee KEPT when the traveler withdraws
--                                 after the expert accepted (before delivery)
--   handoff_withdrawal_delivered  R-t: share KEPT when withdrawing after delivery (before approval)
--   on_trip_support               §12 step 6: the on-trip support fee, in DOLLARS
INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
VALUES
  ('handoff_withdrawal_accepted', 'percent', 0.25, NULL, NULL, 'Handoff withdrawal — after accept',
   'Share of the captured handoff fee kept when the traveler withdraws after the expert accepted (R-t). Before accept nothing is kept.', true),
  ('handoff_withdrawal_delivered', 'percent', 0.75, NULL, NULL, 'Handoff withdrawal — after delivery',
   'Share of the captured handoff fee kept when the traveler withdraws after the plan was delivered (R-t).', true),
  ('on_trip_support', 'flat', 49.00, NULL, NULL, 'On-trip support',
   'Fee in DOLLARS for the expert answering messages during the trip (spec §12 step 6), when the expert offers it at delivery and the traveler accepts.', true)
ON CONFLICT (band_key) DO NOTHING;
