# Rohit’s Traveloure Work, Testing, Findings, and Fixes Report

**Report date:** August 28, 2026  
**Project:** Traveloure  
**Scope:** Structural inventory, authentication and account behavior, customer transactional flows, public production surfaces, expert discovery, role-change auditing, production configuration, database backfill analysis, pull-request review, and final deployment verification.

## 1. Executive summary

Rohit completed a broad source-based and production-based review of Traveloure, then carried two important fixes through review, CI, merge, and deployment:

1. **Role-change audit history fix** — corrected a database result-shape bug that could make the protected admin audit endpoint fail.
2. **Destination-scoped expert search fix** — corrected the expert directory so a destination such as Mumbai populates the **Where** filter without being copied into the independent **What** text search.

The work also verified account deletion, login/OAuth return behavior, public pricing controls, expert and storefront routes, production health, an internal endpoint’s authentication gate, the Plus-sales production flag, and a proposed user-bio backfill.

The final production deployment is healthy and is running the exact merged `origin/main` build:

- Production version: `3bd36b49`
- Production environment: `production`
- Health: `status=ok`, `db=true`
- Public pricing page: HTTP `200`
- Plus sales: disabled
- Unauthorized occasion-draft execution: HTTP `401`

The bio backfill was **not applied** because the production report found zero eligible rows.

---

## 2. What Rohit did

### 2.1 Built a structural inventory of Traveloure

Rohit worked through the application area by area and documented:

- SPA routes and public pages
- Authenticated and role-protected pages
- Forms, fields, buttons, and interactive controls
- API endpoints used by each surface
- Database tables and important keys
- Access roles and authorization boundaries
- Existing automated test coverage and missing coverage

The review used repeated reconciliation passes rather than a single source scan:

- **Public/unauthenticated surfaces:** reviewed but retained as `LARGE/COMPLEX — OPEN`
- **Authentication/account surfaces:** reviewed but retained as `LARGE/COMPLEX — OPEN`
- **Customer transactional flows:** closed after two consecutive clean reconciliation passes

The structural inventory work was preserved in:

- `docs/audits/TRAVELOURE_STRUCTURAL_INVENTORY.md`

### 2.2 Verified sensitive account and authentication behavior

Before closing the transactional-flow review, Rohit live-checked:

- Account deletion behavior
- OAuth return-target sanitization
- Safe restoration of internal paths, query strings, and fragments
- Normal password-login return behavior
- External redirect resistance

### 2.3 Verified major public production surfaces

Rohit checked production behavior for:

- Pricing and Plus-sales gating
- Expert directory pages
- Destination-scoped expert results
- Expert profile details
- Provider storefront routing
- Role-based navigation
- Templates and ready-made content state
- Bundle markers
- Application and database health

Verification screenshots were preserved under `prod-verify/`, including Mumbai expert-search, pricing, expert-profile, and route-display evidence.

### 2.4 Preserved fixes on isolated branches and reviewed them through PRs

Rohit preserved unreviewed work instead of leaving it only on a local `main` branch:

- `lane/role-change-audit`
- `lane/expert-destination-search`

He opened draft pull requests, reviewed their diffs and checks, promoted them from draft status, and merged them in the required order:

1. **PR #609 — Fix role-change audit history query**
   - Head: `cd1ce747`
   - Merge commit: `544846ae`
   - Merged first

2. **PR #608 — Fix destination-scoped expert search results**
   - Head: `780f78bc`
   - Merge commit: `3bd36b49`
   - Merged second, after required checks passed

After merge, local `main` was reset to and verified against `origin/main` before the final publish.

### 2.5 Closed the production deployment thread

Rohit completed the requested production checks:

- Confirmed the internal occasion-draft endpoint rejects requests without its secret.
- Confirmed and then explicitly set the production `PLUS_SALES_ENABLED=false` environment variable.
- Ran the user-bio backfill in report-only mode against production.
- Ran additional read-only production queries to explain the zero-candidate backfill result.
- Published the merged build.
- Confirmed the deployed build SHA matches `origin/main`.
- Rechecked health and a public pricing display path.

---

## 3. What Rohit tested

### 3.1 Account deletion

The account-deletion flow returned success and was checked for referential integrity and privacy behavior.

Observed behavior:

- The account row was retained in anonymized/deleted form.
- Active sessions were removed.
- Related bookings were preserved.
- Related messages were preserved.
- Service bookings were preserved.
- Reviews were preserved.
- No foreign-key orphaning was observed.

This confirmed that deletion behaves as an anonymization and session-revocation workflow rather than unsafe physical deletion of all relational data.

### 3.2 OAuth return-target security

Rohit tested safe and malicious return targets.

Verified:

- Normal internal path restoration works.
- Query strings can be restored safely.
- Hash fragments can be restored through the OAuth restoration path.
- Absolute external URLs did not redirect users to an attacker-controlled origin.
- Protocol-relative URLs did not escape the application origin.
- `javascript:` and encoded authority/separator variants did not produce executable or external redirects.
- Unsafe values fell back to a safe same-origin destination or remained harmless same-origin paths.

### 3.3 Normal password-login restoration

Verified:

- Path restoration works.
- Query-string restoration works.
- The hash fragment is dropped in the normal password-login path.

This was recorded as a real behavioral difference from the OAuth restoration path. A follow-up was considered but later cancelled, so the report treats it as a known limitation rather than a completed fix.

### 3.4 Route and page behavior

Rohit verified:

- The Not Found page’s **Return Home** action works.
- Role-based routes resolve to the expected destinations.
- Public expert and storefront routes render.
- Legacy storefront links remain available.
- Production pricing renders.
- Plus sales follow the disabled/coming-soon path when the flag is false.
- Expert detail pages render available facts, destination/language/neighborhood chips, and biography content.

### 3.5 Expert destination-search contract

The expected product contract was explicitly confirmed:

- **Where** contains the destination/city scope.
- **What** is independent free text.
- A destination URL parameter must not be copied into **What**.
- Free-text filtering must only narrow results when the user actually enters free text.

Testing included:

- A focused source contract test
- Expert-search helper tests
- Production build validation
- Local preview verification
- Mumbai route verification
- Visual evidence showing Mumbai selected in **Where**, an empty **What**, scoped planner results, and Raj Patel visible

### 3.6 Role-change audit query

Testing included a focused regression test that:

- Executes the read-only role-change audit query
- Confirms `logs` is an array
- Confirms `total` is numeric
- Confirms `total` is non-negative

This protects the response contract consumed by the admin route and page.

### 3.7 Pull-request CI gates

For PR #609:

- Required route-coverage checks passed.
- Required money-endpoint/build protection passed.
- Required navbar/route checks passed.

For PR #608:

- All required checks passed.
- The app-route Playwright gate passed.
- The authenticated-route test passed.
- One non-required “report PR comment” job failed because GitHub’s comment API returned HTTP `500` with an incomplete JSON response.
- That failure was isolated to posting the summary comment; it was not a product test failure.

### 3.8 Internal endpoint authentication

Request:

```text
POST https://traveloure.com/internal/run-occasion-drafts
```

The request intentionally omitted the internal secret.

Result:

```text
HTTP 401
```

This proves the endpoint is gated and cannot be triggered anonymously.

### 3.9 Production Plus-sales configuration

Initial inspection found that `PLUS_SALES_ENABLED` was absent as an explicit production environment variable, even though the application default safely disabled Plus sales.

Rohit then set:

```text
PLUS_SALES_ENABLED=false
```

in the production environment and confirmed the key is explicitly present there.

The public pricing API subsequently reported:

```json
{"plusSalesEnabled":false}
```

### 3.10 Production bio backfill

The backfill was run against production with no apply flags:

```text
npx tsx scripts/backfill-users-bio.ts
```

Report-only result:

```text
expert (local_expert_forms.bio): 0 candidates
provider (service_provider_forms.description): 0 candidates
total would-write rows: 0
```

No updates were applied.

Rohit then ran a more precise read-only production breakdown:

| Role group | Approved forms | Approved forms with nonblank source bio | Approved users with blank `users.bio` | Backfill candidates |
|---|---:|---:|---:|---:|
| Expert | 12 | 12 | 0 | 0 |
| Provider | 1 | 0 | 0 | 0 |

Interpretation:

- All 12 approved expert forms have nonblank source bios.
- None of their associated users has a blank `users.bio`.
- The one approved provider form has no nonblank source description, but its associated user also does not have a blank `users.bio`.
- Therefore, no approved earner requires this backfill.
- Applying the script would write zero rows, so correctly no apply was performed.

### 3.11 Final production verification

After publishing:

```json
{"sha":"3bd36b49","env":"production"}
```

This matches the short SHA of merged `origin/main`:

```text
3bd36b4957efdfe0e8a0da4801f13ec9471a1701
```

Health:

```json
{"status":"ok","db":true}
```

Display spot-check:

- `/pricing`: HTTP `200`
- `/api/pricing`: `plusSalesEnabled=false`

---

## 4. What Rohit found

### 4.1 Role-change audit count query used the wrong result shape

The database execution API returns a query-result object with a `.rows` array.

The audit service incorrectly destructured the result:

```ts
const [countResult] = await db.execute(...)
```

The later code expected `countResult.rows[0]`, which is inconsistent with that destructuring and could cause the role-change history endpoint to return an error.

### 4.2 Destination URLs polluted the expert free-text filter

The expert page copied a URL destination into both:

- The selected destination/Where state
- The free-text/What state

For Mumbai, the server correctly returned Raj Patel as a travel expert for the destination. The client then searched for the word “Mumbai” across free-text fields and filtered Raj out.

This was a client-side contract bug, not a missing server city matcher.

### 4.3 Normal login drops URL hash fragments

Normal password login restored the path and query string but dropped fragments such as `#account`.

OAuth restoration preserved path, query, and hash correctly.

This remains a documented limitation because the proposed follow-up was cancelled.

### 4.4 Deals newsletter control is inert

The Deals newsletter **Subscribe** control was present but had no working submission behavior.

This was identified during the public-surface inventory but was not part of the two merged fixes.

### 4.5 Duplicate city route is unreachable

Both of these route patterns existed:

- `/city/:slug`
- `/city/:city`

Because the slug route is declared first and both patterns match the same shape, the later city route is unreachable.

### 4.6 Production content and identity gaps

The production review found data/content gaps, including:

- No public provider storefront directory records
- No ready-made/template records available for public verification
- No public expert photos in the inspected legacy production data
- No storefront handles in the inspected legacy production data
- Generic `local_expert` directory results were empty
- Mumbai destination content could still surface a legacy expert/travel-planner record

These were treated as production data-state findings rather than code regressions.

### 4.7 Plus sales were safely disabled but not explicit

The application default protected production by returning `plusSalesEnabled=false`, but the production environment did not initially contain an explicit `PLUS_SALES_ENABLED` setting.

That ambiguity was removed by explicitly setting it to false.

### 4.8 The bio backfill had no eligible production rows

The report initially returned zero candidates. The later database breakdown proved this was not a script failure:

- Approved experts already have populated `users.bio`.
- The approved provider also does not have a blank `users.bio`.
- There is no production row matching the safe backfill predicate.

---

## 5. What Rohit fixed

### 5.1 Fixed the role-change audit query result handling

Changed the count query from destructuring the database result to retaining the full result object:

```ts
const countResult = await db.execute(...)
```

The response now safely reads:

```ts
countResult.rows[0]
```

Impact:

- Prevents a protected admin role-change audit endpoint from failing due to an incorrect database result shape.
- Preserves a stable `{ logs, total }` response contract.
- Adds regression coverage for both fields.

Merged through:

- PR #609
- Merge commit `544846ae`

### 5.2 Fixed destination-scoped expert search

Removed the behavior that copied the destination URL parameter into the free-text search field.

The corrected design:

- Hydrates **Where** from the destination URL.
- Leaves **What** empty unless the user enters free text.
- Applies destination scoping and text filtering independently.
- Uses a dedicated expert-search helper and focused tests.

Impact:

- City-filtered result pages no longer hide valid experts simply because the expert’s profile text does not repeat the city name.
- Mumbai correctly displays scoped planners, including Raj Patel.
- The UI now follows the approved search-field contract.

Merged through:

- PR #608
- Merge commit `3bd36b49`

### 5.3 Made the production Plus-sales state explicit

Set the production environment variable:

```text
PLUS_SALES_ENABLED=false
```

Impact:

- Removes ambiguity between an application fallback and an intentional production configuration.
- Keeps the public Plus page on the Coming Soon/waitlist path.
- Prevents Plus checkout from being exposed unintentionally.

### 5.4 Reconciled source control and production

Rohit:

- Preserved both fixes on remote branches.
- Opened and reviewed PRs.
- Waited for required CI checks.
- Merged in the required order.
- Reset local `main` to `origin/main`.
- Published once after both merges.
- Confirmed `/api/version` matches the merged remote commit.

This removed the earlier state where production was running a descendant fix commit that had not yet been represented by merged `main`.

---

## 6. Items found but not changed

The following were documented but intentionally not changed in this work:

- Password-login hash-fragment restoration
- Inert Deals newsletter subscription
- Duplicate/unreachable city route cleanup
- Missing production storefront-directory content
- Missing ready-made/template production data
- Missing public profile photos and storefront handles
- Empty generic local-expert directory

These are separate product, data, or follow-up decisions and were not required to close the deployment thread.

---

## 7. Final status

The reviewed fixes are merged and deployed.

| Check | Final result |
|---|---|
| PR #609 | Merged |
| PR #608 | Merged |
| Production SHA | `3bd36b49` |
| Matches `origin/main` | Yes |
| Database health | Healthy |
| Occasion-draft endpoint without secret | Rejected with HTTP `401` |
| Explicit production Plus flag | Present and false |
| Public pricing page | HTTP `200` |
| Bio backfill candidates | 0 |
| Bio backfill applied | No |

**Conclusion:** Rohit completed the audit and verification work, fixed the role-change audit and destination-search defects, confirmed the production safety gates and data state, and closed the deployment with production aligned exactly to the merged source.