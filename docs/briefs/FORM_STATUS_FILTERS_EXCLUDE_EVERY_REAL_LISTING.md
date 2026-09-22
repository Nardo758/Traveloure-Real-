# `provider_services.form_status` — three live filters on a column nothing writes

**Status:** found 2026-09-22 while verifying punchlist §7. **Not fixed.** One decision inside.
**Class:** Locked Decision 12's rule, inverted — *a read gate that names a column nothing writes is
not a grant*. There it REFUSED a legitimate reader. Here it silently EXCLUDES every legitimate row.
**§7 of the punchlist is wrong and this supersedes it:** `form_status` is not "a dead column" for
§18c delete-or-annotate. It is live in three production filters, which is strictly worse than dead.

## The finding

`provider_services.form_status` has **zero writers**. Census over `server/ client/ shared/ scripts/`,
excluding `__tests__` and `server/seeds/`:

| Site | What it does |
|---|---|
| `shared/schema.ts:1425` | declares it, `.default("pending")` |
| `server/migrations/000_baseline_schema.sql:2568` | `DEFAULT 'pending'::character varying` |
| `shared/schema.ts:2918` | `insertProviderServiceSchema.omit({ formStatus: true, … })` — correctly not client-settable |
| `server/services/recommendation.service.ts:716` | **reads** `eq(formStatus, "approved")` |
| `server/services/recommendation.service.ts:1066` | **reads** `eq(formStatus, "approved")` |
| `server/services/recommendation.service.ts:1402` | **reads** `eq(formStatus, "approved")` |
| `server/services/admin-query.service.ts:309` | selects it for an admin projection |
| `server/storage.ts:3067`, `:4034` | strips it to `null` on public reads (correct — §14/§19 projection) |
| `client/src/pages/admin/{services,providers}.tsx` | displays it |
| `scripts/check-privileged-field-completeness.cjs:223` | names it as a privileged field |

No `UPDATE`, no `INSERT` value, in any migration or any `server/` path. **The only code that ever
writes a non-null value is `server/seeds/beta-data-extended.ts`, which writes `"approved"`.**

So every genuine listing is born `'pending'` by default and stays `'pending'` for its whole life,
and all three filters above exclude it. **They match seeded rows and nothing else.**

## Why it is not visible

Three things hide it, and they compound:

1. The column is **stripped to `null` on every public read** (`storage.ts:3067`, `:4034`), so no
   traveler-facing payload ever shows the value that is doing the excluding.
2. The queries **succeed**. They return `[]` or a short list — never an error, never a log line.
3. **Seeded environments look correct**, because the seeder is the one writer. The defect appears
   only where the data is real.

## The canonical column is `approval_status`, and this file already knows it

CLAUDE.md, *Service Model*: "The approval workflow (draft → submitted → approved) is stored as
`approval_status` on `provider_services`", born `submitted` since migration 111, and public reads
gate on `approval_status = 'approved'`.

`recommendation.service.ts` itself gates a **fourth** query correctly at `:803`, under a comment
that states the rule outright (`:795-796`):

> `expert_selected_services` table dropped in migration 013; approved services now live in
> `provider_services` with `approvalStatus = 'approved'`.

Four approval gates in one file; three use the legacy column. That is the §18 rule 1 drift class in
its purest form — one question answered two ways in one file.

## Blast radius

`GET /api/recommendations/user` (`server/routes.ts:8366`, **live and unauthenticated**) calls both
`getUserRecommendations` (→ `:1066`) and `getTrendingRecommendations` (→ `:1402`).
`generateDemandSignals` (→ `:716`) has no caller under `server/` — it feeds the demand-signal path
and is the one of the three that may be inert; that is stated, not assumed.

## The fix, and the ONE decision in it

The mechanical part is not in doubt: the three filters read `approvalStatus` instead. The decision
is **what else the gate carries**, because the canonical public pair is *two* predicates
(`content-query.service.ts:553`):

```ts
and(eq(providerServices.status, "active"), eq(providerServices.approvalStatus, "approved"))
```

The three broken queries carry no `status` filter at all, so swapping the column alone would start
returning **paused** listings — which is a different defect, not a fix. Options:

- **(a) Swap the column and add `status = 'active'`** — matches every other public reader. This is
  the recommended reading: a recommendation surface is a public browse, and the canonical public
  browse is that pair.
- **(b) Swap the column only.** Cheaper, and wrong for paused listings.

**Then `form_status` itself.** Once nothing reads it, it is genuinely the §18c case §7 claimed:
either delete it, or annotate it in `shared/schema.ts` as written-by-nothing the way Locked
Decision 12 annotates `trips.expert_id` — *do not build a new gate, fallback or display on it
without first giving it a writer*. The two admin surfaces that display it are showing every real
listing the same `'pending'`, which is its own §13 problem; they are named here, not fixed.

## Stated negative space

This brief establishes that nothing in the **repository** writes the column. It does **not**
establish what production holds: a historical backfill or a hand-run `UPDATE` could have set real
rows to `'approved'` at some point, which would change the blast radius from "all listings" to
"listings created since". That is a one-line read and it belongs to whoever has the production
database:

```sql
SELECT form_status, approval_status, count(*)
FROM provider_services GROUP BY 1, 2 ORDER BY 3 DESC;
```

Until that comes back, the honest claim is the one made above — *no code writes it* — and not a
count of affected rows.
