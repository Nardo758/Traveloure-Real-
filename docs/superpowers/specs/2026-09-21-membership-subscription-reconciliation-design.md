# Membership Subscription Reconciliation — Phase A Detection

## Goal

Add Stripe subscription drift detection as the fourth reconciliation rail. The job must identify recent active subscriptions with no membership and recent Stripe-sourced memberships whose stored status disagrees with Stripe. This phase detects and records drift only; it does not repair `plan_memberships`.

The existing Plus purchase surface remains unchanged. `PLUS_SALES_ENABLED` remains off, and no Stripe Price configuration is added.

## Scope

### In scope

- Add the `membership` reconciliation rail.
- Extend the injectable Stripe reader with subscription listing.
- Detect and persist two membership exception kinds.
- Persist the number of subscriptions examined on each reconciliation run.
- Add migration 318 for the nullable run tally.
- Add real-database behavioral coverage with an injected Stripe reader.
- Append a decision-ledger entry documenting the scan boundary and pending repair ruling.

### Out of scope

- Writing or repairing `plan_memberships` from reconciliation.
- Calling `upsertStripeMembership` from the job.
- Adding a repair flag or a second Stripe client.
- Changing the Plus purchase surface.
- Enabling Plus sales or configuring Stripe Prices.
- Resolving the concurrent `already_member` checkout race.
- Building a complete historical or status-change subscription inventory.

## Architecture

### Fourth reconciliation rail

`ReconciliationRail` gains `membership`. The existing reconciliation run owns orchestration, exception persistence, deduplication, and terminal run updates. Membership scanning follows the shape of the ready-made rail rather than introducing another job or persistence path.

The rail adds these exhaustive shared kinds:

- `sub_active_no_membership` — critical — “Subscription active at Stripe — no membership recorded”
- `sub_status_drift` — warning — “Stripe subscription status does not match the membership record”

Both kinds receive entries in the exhaustive reconciliation label map.

### Stripe reader

The existing injectable `StripeReader` gains:

```ts
listSubscriptions(createdGteUnix: number): Promise<Stripe.Subscription[]>
```

The default implementation uses the existing Stripe client and secret-key resolver. It lists subscriptions created at or after the reconciliation window boundary. Behavioral tests inject this method and therefore require neither network access nor a Stripe key.

No marker or audit-oriented write is added to checkout, webhook, subscription, or membership paths.

### Membership scan

For each returned subscription:

1. Increment `checkedSubscriptions`.
2. Load any `plan_memberships` row linked by `stripe_subscription_id`.
3. If no linked row exists and `mapStripeSubscriptionStatus(subscription.status)` is `active`, emit `sub_active_no_membership`.
4. If a linked Stripe-sourced row exists, map Stripe’s current status with the exported `mapStripeSubscriptionStatus`.
5. If the mapped status differs from the stored membership status, emit `sub_status_drift`.

Manual and beta grants are not candidates for status comparison. Database queries for comparison are scoped to rows with a non-null `stripe_subscription_id`; this linkage identifies Stripe-sourced memberships without treating legitimate unlinked grants as drift.

The scanner imports the writer’s status mapper. It does not reproduce or reinterpret Stripe status rules.

### Scan boundary

The membership rail uses the existing 24-hour reconciliation boundary against the Stripe subscription’s `created` timestamp.

This catches **birth drift**: a recent active subscription whose creation webhook never produced a membership. It also detects status disagreement when the affected subscription happens to have been created inside the same window.

It **cannot detect** status changes on subscriptions created before the window. For example, a subscription created three days ago and cancelled yesterday is outside this scan even if its membership row remains active. A complete status-drift inventory requires a separately ruled widening or status-based scan.

### Deduplication

Each membership exception uses a deterministic key derived from the drift kind and Stripe subscription ID. The run ID is not part of the key.

An unresolved drift fact therefore remains one append-only exception across repeated runs. Each run still increments `exceptionsDetected`, while `exceptionsNew` only counts the first persisted occurrence.

## Run persistence and migration

Migration 318 adds:

```sql
ALTER TABLE reconciliation_runs
  ADD COLUMN IF NOT EXISTS checked_subscriptions integer;
```

The column is nullable with no default, check, or backfill. `NULL` means a historical pass never tallied the membership rail; `0` means the current implementation ran the rail and examined no subscriptions.

The column is declared in the shared schema and migration registry. The existing terminal run writer persists `checkedSubscriptions` on successful and failed terminal paths in the same manner as other per-rail tallies.

This is the only schema change and therefore the only expected publish-time schema prompt.

## Error handling

- If no Stripe secret is configured, reconciliation retains its existing skipped posture and does not claim that subscriptions were checked.
- Stripe reader failures use the job’s existing failed-run handling and leave a durable run result.
- Scanner errors do not trigger membership writes or fallback status assumptions.
- Unknown Stripe statuses continue to fail safe through the existing shared mapper.
- Pagination and scan caps must preserve the job’s existing honesty rule: if the reader cannot establish a complete result within its stated bounds, logs and run notes must not describe the unchecked tail as clean.

## Testing

The real-database behavioral suite will inject a Stripe reader and seed:

1. A recent active Stripe subscription with no membership, producing one critical exception.
2. A linked Stripe membership whose stored status differs from the shared mapper’s result, producing one warning exception.
3. A linked membership whose status agrees, producing no exception.
4. Repeated scans of the same drift, proving detected-versus-new accounting and subscription-ID deduplication.
5. Manual and beta grants with no Stripe subscription ID, proving they are never flagged.
6. Run tally persistence, proving the exact examined count is written.
7. Historical run semantics, proving the new nullable column does not imply old passes checked zero subscriptions.

The suite is named and executed by CI, never added to the orphan baseline.

Validation also includes:

- migrations 001–318 from an empty local PostgreSQL database
- TypeScript at the established 129-error baseline, with no new errors
- production build
- mutation-auth ratchet
- production-constraint preflight
- decision guards

## Phase B decision boundary

Phase A does not repair missing memberships.

The pending decision is:

> May the reconciliation job hand an active, server-read Stripe subscription with no membership row to the existing `upsertStripeMembership`, using `actor="reconciliation"`?

Until that amendment is explicitly ratified, the reconciliation job must not write to `plan_memberships`, expose a repair switch, or implement separate repair logic.