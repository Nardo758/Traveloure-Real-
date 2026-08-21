# TravelPulse city reconciliation runbook

## Governance decision

For every duplicate normalized `(lower(city_name), lower(country))` group, the
canonical row is selected deterministically in this order:

1. Highest `pulse_score` (the row with the strongest current city intelligence).
2. Most recent `last_updated`.
3. Most recent `created_at`.
4. Lowest `id` as the stable final tie-breaker.

This rule identifies the canonical Tokyo/Japan and Sydney/Australia rows from
the live production data without guessing or copying development IDs. The
audit output records the selected canonical ID and every merged duplicate ID
for approval before any write.

## Supported production-data operation

1. Confirm the target is production and take the normal database backup/snapshot.
2. Run the audit (no writes):

   ```sh
   npx tsx scripts/reconcile-travelpulse-cities.ts
   ```

3. Review the printed canonical and duplicate IDs for Tokyo/Japan,
   Sydney/Australia, and any other group. The output is the approval record.
4. Run the one-time write only after approval:

   ```sh
   TRAVELPULSE_CITY_RECONCILIATION_APPROVED=true \
     npx tsx scripts/reconcile-travelpulse-cities.ts --apply
   ```

   The command must use the production `DATABASE_URL` supplied by the
   production-data workflow. It is dry-run by default and refuses `--apply`
   without the explicit approval flag.
5. Verify the script reports no duplicate groups. Verify city-media counts
   remain unchanged and the canonical rows are present.
6. Publish/start the application so migration 249 creates
   `travel_pulse_cities_city_country_unique`. If it fails, stop and investigate;
   never copy development over production.

The write is a single serializable transaction. Before deleting duplicate city
rows it re-points every `city_media_cache.city_id` reference to the canonical
row. This is required because that foreign key cascades on delete. No city
media records are intentionally deleted.

## Disposable-database integration check

Before the production operation, run the merge check against a disposable local
or CI database:

```sh
npm run test:travelpulse-reconciliation
```

The check refuses non-loopback `DATABASE_URL` hosts. It creates duplicate
case-variant Tokyo/Japan rows with media references on both rows, runs the same
approved serializable merge transaction used by `--apply`, verifies that the
highest-pulse canonical row remains and every media reference points to it,
then creates the normalized `(lower(city_name), lower(country))` unique index.
Fixtures and any temporary index are removed afterward, and a pre-existing
index is restored.

## Post-reconciliation verification

- `server/seed-travelpulse.ts` performs a normalized lookup and uses
  `ON CONFLICT DO NOTHING`, so rerunning the seed is safe with the restored
  expression index, including concurrent seed attempts.
- City enrollment uses the same normalized lookup/write authority and must be
  smoke-tested after migration 249.
- Run `node scripts/preflight-prod-unique-indexes.cjs "$PROD_DATABASE_URL"` and
  confirm the city/country manifest entry is clean before any later publish.