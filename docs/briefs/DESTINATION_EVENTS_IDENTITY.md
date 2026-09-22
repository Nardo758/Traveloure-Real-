# Lane brief — `destination_events` has four writers and three different ideas of "the same event" (board #298)

**Status: NOT BUILDABLE AS FILED.** #298 asks for "a uniqueness constraint". Before an index can be
written, someone has to say **what makes two destination events the same event** — and the code
currently answers that three ways. It is also blocked on a production read, for the reason
CLAUDE.md names by hand: a violated UNIQUE fails the publish and offers the destructive
"copy development database to production" option.

## The four writers

| Writer | Dedupe identity it uses | `source_type` | Atomic? |
|---|---|---|---|
| `travelpulse.service.ts:1583` | `(country, city, title)` | `ai` (`source_id` NULL) | **No** — check-then-insert |
| `partner-events-cache.service.ts:237` | `(source_type, source_id)` | `fever` | **No** — check-then-insert |
| `seed-destination-calendar.ts:345` | *"does this country have ANY events"* | `system` | **No** — coarse guard |
| `storage.ts:5455` `createDestinationEvent` | **none at all** | caller's | n/a |

Every guard that exists is a **check-then-insert** — the shape §15 names as the bug rather than the
guard. Two concurrent ingests for the same city both read zero rows and both insert.

**And the two real identities are not in conflict — they are different natural keys for different
provenance.** A partner event carries a stable partner id, so `(source_type, source_id)` is its
identity. An AI-derived event has no such id, so the title is the only handle there is. Picking one
key for the whole table would be wrong for the other half.

## Why a single unique index does not work

- **`(source_type, source_id)`** is right for `fever` and enforces **nothing** for `ai`/`system`
  rows, because `source_id` is NULL there and Postgres treats NULLs as distinct.
- **`(country, city, title)`** is right for `ai` and would wrongly collide two genuinely different
  partner events that share a title in one city — a recurring show is the obvious case, and it is
  exactly what `specific_date` exists to distinguish.

## The decision this lane needs

**What is a destination event's identity?** My recommendation, which mirrors what the writers
already believe rather than inventing a third answer:

```sql
-- partner-sourced rows: the partner's own id is the identity
CREATE UNIQUE INDEX destination_events_source_uniq
  ON destination_events (source_type, source_id)
  WHERE source_id IS NOT NULL;

-- rows with no partner id: title within a place, on a date
CREATE UNIQUE INDEX destination_events_title_uniq
  ON destination_events (country, city, title, specific_date)
  WHERE source_id IS NULL;
```

Two partial indexes, one per provenance, each matching its own writer's belief. `specific_date` is
in the second key deliberately: without it, an annual festival cannot have two rows, which is a
claim nobody has made. **`city` is nullable**, so the second index needs a decision of its own —
two rows with the same title and NULL city will not conflict, which may or may not be wanted.

## Blocked on a production read, and the reason is not procedural

`preflight-prod-constraints.cjs` exists precisely because a CHECK or UNIQUE that production data
violates fails the deploy **mid-push** and offers the destructive option. So before either index is
written, this must be run against **production**:

```sql
-- partner-identity duplicates
SELECT source_type, source_id, count(*) FROM destination_events
 WHERE source_id IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1 ORDER BY 3 DESC;

-- title-identity duplicates
SELECT country, city, title, specific_date, count(*) FROM destination_events
 WHERE source_id IS NULL GROUP BY 1,2,3,4 HAVING count(*) > 1 ORDER BY 5 DESC;
```

Given that three of the four writers dedupe loosely or not at all, **duplicates are likely, not
hypothetical** — and the count decides whether this is an index plus a dedupe migration or an index
alone.

## Build order, once the identity is ruled and the census is back

1. Dedupe production per the census, keeping the earliest row (the migration-203 precedent, which
   also preferred a row with downstream references).
2. Create both partial indexes in a migration, **declared in `shared/schema.ts`** — the deploy-push
   rule: an index that file does not declare is dropped at publish and never recreated, because the
   migration is already stamped. Add the columns to `preflight-prod-constraints.cjs`'s manifest.
3. **Only then** convert the three guards to `INSERT … ON CONFLICT DO NOTHING` — the statement
   becomes the guard (§15), and the check-then-insert reads are deleted rather than left beside it.
   `ON CONFLICT` requires an index to target, which is why this step cannot come first.
4. Decide whether `storage.createDestinationEvent` — the writer with no dedupe — should carry the
   same clause. It is the admin/contributor path, where a deliberate duplicate may be legitimate.

## Negative space

No money path, no fee, no entitlement, no authorization. This is a data-integrity lane on a content
table. It changes nothing about what anyone is charged. **Nothing in it is buildable in the checkout
before the identity is ruled AND the census is back** — and writing an index on a guess is precisely
how the publish-time trap is sprung.
