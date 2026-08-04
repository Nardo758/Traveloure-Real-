-- 172_purge_fixture_paid_out_earnings.sql — decision-maker-ratified fixture cleanup (Aug 2, 2026).
--
-- WHAT: the invariants run surfaced 20 `paid_out` earnings rows (~$4,240; 12 expert_earnings +
-- 8 provider_earnings) with NO payout_id — money-history that claims a payout the ledger can't
-- back. Triage classified every row: all 5 owners are @example.com seed personas
-- (seed-expert-services.ts — kenji.tanaka, maria.santos, isabella.rossi, carlos.mendez,
-- sophie.laurent; RFC 2606 reserved domain, no Stripe transfers exist to verify). Fabricated
-- money history on a live ledger is the §13 class, and it keeps the
-- `paid-out-earnings-have-payout-id` invariant permanently red.
--
-- DURABILITY: no seed or script writes earnings-ledger rows (verified — beta-reviews-bookings.ts
-- writes a booking FIELD, and run-beta-seed is a manual `npm run seed:beta`, not a startup seed),
-- so this purge cannot be resurrected at boot.
--
-- MECHANISM (migration-168 pattern): ARCHIVE into `legacy_archives` (jsonb copy, source-tagged,
-- skip-if-already-archived) THEN delete. Predicate is EXACTLY the violation set — status
-- 'paid_out' ∧ payout_id IS NULL ∧ owner email @example.com — never a broader fixture purge
-- (that is a separate decision). Idempotent: re-runs archive nothing new and delete 0 rows.
-- No schema change, no CHECK → nothing for the preflight manifest, no publish-push trap.

-- Expert-side
INSERT INTO legacy_archives (source_table, reason, row_data)
SELECT 'expert_earnings',
       'fixture purge: paid_out with NULL payout_id, @example.com seed persona (invariant paid-out-earnings-have-payout-id; ratified Aug 2 2026)',
       to_jsonb(e.*)
FROM expert_earnings e
JOIN users u ON u.id = e.expert_id
WHERE e.status = 'paid_out'
  AND e.payout_id IS NULL
  AND u.email LIKE '%@example.com'
  AND NOT EXISTS (
    SELECT 1 FROM legacy_archives la
    WHERE la.source_table = 'expert_earnings' AND la.row_data->>'id' = e.id
  );

DELETE FROM expert_earnings e
USING users u
WHERE u.id = e.expert_id
  AND e.status = 'paid_out'
  AND e.payout_id IS NULL
  AND u.email LIKE '%@example.com';

-- Provider-side
INSERT INTO legacy_archives (source_table, reason, row_data)
SELECT 'provider_earnings',
       'fixture purge: paid_out with NULL payout_id, @example.com seed persona (invariant paid-out-earnings-have-payout-id; ratified Aug 2 2026)',
       to_jsonb(p.*)
FROM provider_earnings p
JOIN users u ON u.id = p.provider_id
WHERE p.status = 'paid_out'
  AND p.payout_id IS NULL
  AND u.email LIKE '%@example.com'
  AND NOT EXISTS (
    SELECT 1 FROM legacy_archives la
    WHERE la.source_table = 'provider_earnings' AND la.row_data->>'id' = p.id
  );

DELETE FROM provider_earnings p
USING users u
WHERE u.id = p.provider_id
  AND p.status = 'paid_out'
  AND p.payout_id IS NULL
  AND u.email LIKE '%@example.com';
