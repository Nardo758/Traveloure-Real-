# Kyoto Persona Seed Report

Run date: 2026-08-29  
Target: managed development database  
Command: `npx tsx scripts/seed-personas.ts --apply`

## Result

| State | Count | Result |
|---|---:|---|
| Fixed persona accounts | 7 | Seeded |
| Active `plus_annual` memberships | 1 | Seeded with `source='manual'` |
| Active `pro_monthly` memberships | 1 | Seeded with `source='manual'` |
| Persona expert application rows | 0 | Correctly untouched |
| Persona provider service rows | 0 | Correctly untouched |
| Persona template rows | 0 | Correctly untouched |
| Persona trip rows | 0 | Correctly untouched |
| Persona occasion rows | 0 | Correctly untouched; the authenticated Plus flow owns creation |

The Plus persona’s account-level `home_city` is seeded as Kyoto.

## Idempotence proof

The apply command was run twice against the same development database. The
second run completed successfully and the direct count query still returned
exactly seven accounts and one row for each supported membership plan. No
marketplace or occasion rows were introduced.

## Unsupported state

Trip Pass cannot be seeded as an entitlement row because the current schema has
no `trip_entitlements` table or equivalent per-trip entitlement row. The
`trip_pass` record in `plans` is pricing catalog state, not a traveler grant.
Lane B must report this branch as unsupported unless the real checkout flow
creates a durable per-trip entitlement; it must not fabricate one.

## Hard stop

This report completes the Lane A account/entitlement seed. The manual supply
pass has not started.