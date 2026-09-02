# Security & data-integrity audit — findings of record

**as-of** `4644af6689760ede78cd8f44ac1971d34c464bfe` (`origin/main`, 2026-09-01 18:22 ET)
**Lanes run:** security, data integrity. **Not run:** UX/content, perf/a11y, journeys (see *Not checked*).
**Method:** repo guards first, then their declared negative space; 1,105 route registrations (541 mutations)
extracted with their middleware; the `/api/expert/*` + `/api/provider/*` prefix backstop diffed against the
real route set; admin-page client callers diffed against the `/api/admin` prefix; migration-created tables
diffed against declared schema. Every candidate was traced to its storage writer and checked for a shadowing
gated twin before being called live.

**No write vulnerability was confirmed by performing a write.** Nothing was verified against production:
this session's network policy denies `www.traveloure.com` (`connect_rejected`, gateway 403 to CONNECT).

Line numbers are `as-of` the SHA above and will drift.

---

## Disposition summary

| Sev | # | Finding | State |
|---|---|---|---|
| P1 | 1 | Affiliate partner writes were world-writable (admin-guard hole + §18 rate) | **PR #704** |
| P1 | 2 | SSRF via the affiliate scraper's unrestricted outbound fetch | open |
| P1 | 3 | `track-click` trusted a body `userId` and skipped the partner-approval gate | **PR #705** |
| P2 | 4 | `user-experience-items` IDOR (PATCH/DELETE, no ownership check) | open |
| P2 | 5 | `PATCH /api/user-experiences/:id` took the raw body — owner reassignable | **PR #707** |
| P2 | 6 | `GET /api/user-experiences/:id` read IDOR | open |
| P2 | 7 | Custom venue owner was a body field (§19 denylist schema) | **PR #706** |
| P2 | 8 | Admin tier on `GET /api/bookings/:id` reads a 7-day-stale session role | open |
| P2 | 9 | Nine LLM endpoints with no AI rate limit and no budget enforcement | open |
| P3 | 10 | Seven unauthorized trip-mutation twins in `trips.routes.ts` (shadowed today) | open |
| P3 | 11 | A CI-only seed endpoint is live in production | open |
| P3 | 12 | Five unannotated affiliate margin literals, invisible to the fee gate | open |
| P3 | 13 | CORS fails open when `REPLIT_DOMAINS` is empty | open |
| P3 | 14 | Two admin checks read `req.user.role` instead of the DB | open |
| P3 | 15 | `POST /api/optimization-preview` accepts an unbounded `items` array | open |
| P3 | 16 | Landing moment attribution drops every email-auth user | open |
| P3 | 17 | Importing a route module starts a background scheduler | open |
| — | F1–F5 | Internal-jobs scheduler reliability findings | **closed by PR #702** |

Four PRs are open, one per finding, each off `origin/main` with a negative test verified to fail against the
unfixed code. Everything marked *open* is left for prioritisation — no fix was pushed for it.

---

## P1

### 1. Affiliate partner writes were world-writable — **PR #704**

`server/routes/content.routes.ts:7850, 7913, 7930, 7944`

Four write endpoints gated on `isAuthenticated` alone. Any authenticated account could rewrite a platform
affiliate partner's `commission_rate` — read at `server/services/affiliate.service.ts:145` `resolveCommission`
as the platform's affiliate commission, a **§18 rate-bearing field** — or its `affiliate_tracking_id` and
`website_url`, flip `is_active`, or delete the row. Only client callers are
`client/src/pages/admin/affiliate-partners.tsx`. Same shape as §2's world-writable `POST /api/admin/fee-config`:
an intended-admin endpoint outside the `/api/admin` prefix.

Two aggravating details. `PATCH` (`:7913`) strips only approval fields by destructure and spreads the rest — a
denylist, so `commission_rate` was never named. And `resolveCommission` selects `WHERE name = $1 LIMIT 1` with
**no `ORDER BY` and no approval filter**, so creating a second partner named after a real one can hijack the
rate lookup without touching an approved row.

*Rule:* §2, §18, §19. *Why the guards missed it:* `check-money-endpoints`' schema pass reads
`createInsertSchema` call sites and this route hand-destructures; its line-level pass needs a money-named file
or handler. Both are stated blind spots.

### 2. SSRF via the affiliate scraper — **open**

`server/services/affiliate-scraper.service.ts:318` (`fetchWebPage`), reached from
`server/routes/content.routes.ts:7944` (`POST /api/affiliate/partners/:id/scrape`), via
`:210` `partner.scrapeConfig?.productListUrl || partner.websiteUrl`

`fetchWebPage` is a bare `fetch()` — no scheme allowlist, no private/link-local CIDR deny, no redirect cap — on
a URL fully controlled by whoever can write a partner row. Not blind: the response is passed to Grok, extracted
rows are written to `affiliate_products`, and are readable back through `GET /api/affiliate/partners/:id/jobs`
and the product feeds — an exfiltration channel, not just a probe.

PR #704 shrinks reachability from *any authenticated account* to *an admin*, which is a real reduction but not
the fix. The fix is an egress allowlist plus a private-CIDR deny and a redirect cap in `fetchWebPage`, and it is
deliberately not bundled: it is a different class from the authorization hole and deserves its own review.

*Rule:* no ruling covers outbound fetch targets. Worth one.

### 3. `track-click` identity + approval gate — **PR #705**

`server/routes/content.routes.ts:8325, 8327`; `server/services/affiliate-scraper.service.ts:528, 549–553`

One unauthenticated handler, two defects. `req.body.userId` was written into `affiliate_clicks.user_id`, a
column with **no FK** (`shared/schema.ts:4975`), which affiliate attribution and revenue reporting read — while
the sibling `POST /api/affiliates/track` (`:8313`) already derived it from the session. And `trackClick` called
`getProductById`/`getPartnerById` with no options, so `approvedOnly` was `undefined` and the migration-121
partner-approval read gate did not apply: an anonymous caller with a product id got the affiliate URL that §16
deliberately keeps server-side.

*Rule:* §14 (identity from the session), §16 (the affiliate URL is not handed out).

---

## P2

### 4. `user-experience-items` IDOR — **open**

`server/routes/content.routes.ts:1789, 1799`; `server/storage.ts:4135, 4143`

`PATCH` and `DELETE /api/user-experience-items/:id` are `isAuthenticated` only and pass the path id straight to
a storage writer keyed on `id` alone. Every sibling in the same block checks `experience.userId !== userId`.
Verified live — no gated twin in `routes.ts`.

Known and still open: listed in `DEFERRED_IDOR.md`. **That document is stale** — its two other rows
(`/api/notifications/:id`, `/api/faqs/:id`) have since been fixed, so this is the only survivor, and its "Low"
rating was set when it had company. Fix: enforce ownership in the UPDATE/DELETE `WHERE` by joining to
`user_experiences`, the shape `markAsRead`/`deleteNotification` already use.

### 5. `PATCH /api/user-experiences/:id` raw body — **PR #707**

`server/routes/content.routes.ts:1732`; `server/storage.ts:4111`

### 6. `GET /api/user-experiences/:id` read IDOR — **open**

`server/routes/content.routes.ts:1679`

No ownership check; returns the experience (`budget`, `location`, `preferences`, `stepData`) plus all its items
for any id. The list sibling at `:1671` correctly scopes by `userId`. Not in `DEFERRED_IDOR.md`. Grouped with
finding 4 — one ownership-check pass over that block closes 4 and 6 together, which is why neither is bundled
into PR #707 (that one is a mass-assignment fix; this is an authorization fix on different lines).

### 7. Custom venue owner was a body field — **PR #706**

`shared/schema.ts:2532`; `server/routes/content.routes.ts:1002`

### 8. Admin tier reads a stale session role — **open**

`server/utils/auth.ts:35` (`getSessionRole`); `server/routes/bookings.ts:49, 59, 71`;
`server/replit_integrations/auth/replitAuth.ts:132–133`, `emailAuth.ts:153, 253`

`GET /api/bookings/:id` grants the full-row admin tier — including `stripePaymentIntentId` — from
`getSessionRole(req)`, which reads `claims.role` off the passport-serialised session.
`serializeUser`/`deserializeUser` store the object verbatim and the login paths stamp `role` with a 7-day TTL,
so **a demoted admin keeps the tier for up to a week**, and the same stale value feeds
`sanitizeBookingForExpert`'s redaction decision.

§2's ratified posture is a DB role lookup, which `adminApiGuard` (`server/routes.ts:632`) does correctly. There
is now an in-repo precedent for the fix three lines long: `content.routes.ts:7321` does exactly this with the
comment *"role from the DB (§2 posture — never the session's possibly-stale/absent role string)"*.

### 9. Nine LLM endpoints with no AI rate limit — **open**

`server/routes/content.routes.ts:3574, 3608, 3767, 3815` (`/api/claude/*`), `3965, 4139, 4166, 4226, 4288`
(`/api/grok/*`)

`isAuthenticated` only. The project's own `aiRateLimit` (10/min) is applied to five other AI endpoints
(`advisor.routes.ts:478`, `demand.routes.ts:582`, `trip-context.routes.ts:247`, `content.routes.ts:3648`,
`routes.ts:11457`) but not these; the `/api/ai` prefix limiter does not match these paths, so only the general
100/min IP limiter applies. `POST /api/grok/chat` (`:4288`) forwards arbitrary `messages` and `systemContext` to
the model — an open LLM proxy on the platform's keys for anyone with an account. `aiUsageService` logs spend;
nothing enforces a budget (no quota check in `ai-orchestrator.ts`).

---

## P3

### 10. Unauthorized trip-mutation twins — **open (latent, not live)**

`server/routes/trips.routes.ts:889, 953, 1192, 1205, 1223, 1531, 1544`

Seven trip sub-resource handlers (`participants/bulk-invite`, `contracts`, `transactions`,
`transactions/split`, `budget/calculate-split`, `emergency-contacts`, `emergency/initialize`) run on
`isAuthenticated` with **no trip authorization** and `...req.body` mass-assignment. Their own comments say so
("Left unauthorized rather than mis-gated").

**Not live today**: `routes.ts` registers gated twins at `:11064, 11159, 11324, 11341, 11367, 11818` and
`app.use(tripsRoutes)` is at `:12020`, so the gated copies win on order. The risk is the §9 playbook —
"port, mount, **delete the dark twin**" — which promotes an unauthorized handler onto another user's
money-between-people ledger the moment someone follows it. The stated blocker is that
`authorizeTripOwnerTier` is private to `routes.ts`; exporting it, or deleting the shadowed copies now, closes it.

### 11. A CI-only seed endpoint is live in production — **open**

`server/routes/transport-hub.routes.ts:504`

`POST /api/transport-booking-options/seed/test-variant`, self-described as "CI/test-only", is mounted and live
behind `isAuthenticated`, inserting `transport_booking_options` rows with `bookingStatus: "available"`.
Unbounded junk-row insertion into a traveler-facing table by any account. §18c's precedent (no consumer +
write effect ⇒ delete, don't gate) applies.

### 12. Unannotated affiliate margin literals — **open**

`server/services/transport-booking-options.service.ts:277–282, 317`

`AFFILIATE_MARGIN_DEFAULTS` holds five rate literals (`0.12/0.08/0.10/0.06`) plus a bare `?? 0.08` fallback,
none carrying `fee-literal-ok`. Same DB-first-with-fallback posture as `TRANSPORT_COMMISSION_DEFAULT` at `:276`,
which *is* annotated — so the intent is fine and the annotation is missing. The gate is blind to it by design;
its own negative space names *"a rate held in a map literal (e.g. `AFFILIATE_MARGIN_DEFAULTS`)"*. Filed debt
stays visible on every run; an unannotated literal does not.

*Rule:* §8 (grep-gated every phase), §18d (a guard states its negative space).

### 13. CORS fails open — **open**

`server/index.ts:125–140`

`if (origin && (_corsAllowedOrigins.has(origin) || _corsAllowedOrigins.size === 0))` reflects **any** origin,
and `Access-Control-Allow-Credentials: true` is set unconditionally on `/api`. An empty allowlist — the state in
any non-Replit deployment, which §11 says is now supported — turns the allowlist into a wildcard.

Impact is bounded today by `sameSite: "lax"` on the session cookie (`replitAuth.ts:44`), which blocks cross-site
credentialed XHR. This is defence-in-depth that has failed open, not an active session-theft path. **Confidence
is medium and the reason is stated:** the deployed `REPLIT_DOMAINS` value could not be checked from this
session. One `curl -I -H 'Origin: https://evil.example' https://www.traveloure.com/api/pricing` settles it.

### 14. Admin checks reading `req.user.role` — **open**

`server/routes/content.routes.ts:6665, 6687`

`POST /api/fever/cache/refresh/:cityCode` and `/refresh-all` check `req.user?.role !== 'admin'` against the
session object rather than the DB. The Replit OIDC session shape has no top-level `role`, so this fails
**closed** for OIDC admins — a functional bug — and is stale-tolerant for email-auth admins. Same class as
finding 8, opposite failure direction.

### 15. `POST /api/optimization-preview` unbounded input — **open**

`server/routes/optimization.routes.ts:56`

No auth by design, but `items` has no maximum length and `calculateItineraryMetrics` runs over all of it, behind
only the 100/min IP limiter and a 10 MB body cap (`server/index.ts:98`). CPU amplification. A `z.array(...).max()`
closes it.

### 16. Landing moment attribution drops email-auth users — **open**

`server/routes/landing.routes.ts:203`

`const userId = (req.user as any)?.id ?? null` instead of `getUserId(req)`. Email-auth sessions are built as
`{claims:{sub}}` with no top-level `id` (`emailAuth.ts:148, 250`), so **every logged-in email-auth user is
attributed as anonymous** in `landing_moment_events`. `server/utils/auth.ts:1–15` documents this exact shape
mismatch and says to always use the helper; this is the mirror image of the crash it warns about. Silent
under-attribution in the moment → trip → purchase funnel.

*Rule:* §13 (an honest null is not the same as a wrong one); repo convention.

### 17. Importing a route module starts a scheduler — **open**

`server/routes/content.routes.ts` (module scope) → `travelpulse-scheduler.service`

Importing the module starts the TravelPulse daily-refresh timer at load. Every test that imports this router
must run with `--test-force-exit` or the process never exits, and any tool that merely imports it acquires a
background timer. Found while writing the negative tests for findings 1, 3 and 5.

Related, and worth knowing before writing any test against this router: **~700 lines of routes, including all
the `/api/affiliate/*` ones, are registered by `registerDiscoveryRoutes()` at startup, not at module import**
(`server/routes.ts:12012`). A test that only imports the router gets a 404 for every one of them and passes for
entirely the wrong reason. This happened to me on the first draft of the PR #704 test; the corrected suites call
it explicitly.

---

## Closed by PR #702 (internal-jobs hardening)

F1 the cron's `code == 200` health check against a SPA fallback that answered dead `/internal` routes with
200-HTML · F2 `skipped:true` on every call for the two void-returning jobs · F3 `/internal` as the only
session-less surface with no rate limit, plus a length-leaking `safeEqual` · F4 response bodies echoed to a
public Actions log · F5 no detection of a cron that stopped firing. Recorded in
`docs/DECISIONS.md` `2026-09-01-internal-jobs-hardening`.

---

## Checked, clean

- **Money spine** — `/api/checkout`, `promotePaidCheckout`, the TTL sweep, `stampAuthorization`/`resolveAndStamp`,
  `/api/bookings/:id/pay-balance`, `/api/payouts/request` (server-derived, correctly annotated
  `money-derive-ok`), the coordination-fee confirm/refund pair (`routes.ts:9956` has an inline DB admin lookup),
  Trip Pass purchase/confirm. §14/§15/§15b/§15c/§17/§19a all hold on the paths read.
- **Stripe webhooks** — `webhooks.routes.ts:42, 575` and `bookings.ts:488` verify against `req.rawBody` and
  refuse in production when the secret is unset.
- **Admin surface** — the `/api/admin` blanket guard (`routes.ts:632–650`) is a real default-deny DB role lookup
  registered before every admin route. Of 138 admin-boundary mutations, finding 1 is the only intended-admin
  write outside the prefix.
- **`itinerary_items` deletes** — 5 sites, all guarded or exempt (D-1 clean).
- **Plus lane** (`occasions.routes.ts`, `plan-membership.service.ts`, `internal.routes.ts`) — session-stamped
  writes, catalog-validated vocabulary, `WHERE`-scoped PATCH/DELETE, `isActivePlus` gate on the draft
  scheduler, `timingSafeEqual` on the internal secret.
- **`PATCH /api/expert/role`** — writes `users.role` but requires an approved expert form, validates against
  `expertTypeEnum`, blocks self-promotion to `local_expert`, and commits role + audit in one transaction.
- **Schema vs migrations** — every migration-created table is declared and reachable by `drizzle-kit push`;
  `check-undeclared-tables` reports 290/290 against a live database. No `ai_cost_tracking`-class publish trap.
- **Redirects** — `routes.ts:6400`, short-links, storefront, discover-redirect and
  `/api/itinerary-share/:token/navigate/...` all target server-owned or builder-constructed URLs. No open redirect.
- **XSS** — 4 `dangerouslySetInnerHTML` sites; the two carrying external data
  (`CityDetailView.tsx:1252, 1296`) are `DOMPurify.sanitize` with `ALLOWED_TAGS:['a']`. Client env exposes only
  publishable keys.
- **SQL injection** — no string-concatenated SQL. The four `sql.raw` sites build `ARRAY[...]` literals with
  correct `''` doubling (hand-rolled, sound under `standard_conforming_strings=on`).
- **Analytics rail** — `/api/tracking/impression`, `/api/track/*` (7), `/api/analytics/*` (3) all take `userId`
  from `getUserId(req)`. Finding 3 was the sole exception.
- **`getUserId`** (`utils/auth.ts:16`) reads only `req.user`; no header or body fallback.
  `check-claims-only-user-lookups` clean over 405 files.
- **All repo guards green** at this SHA: `check-money-endpoints`, `check-omit-schema-ratchet`,
  `check-privileged-field-completeness`, `check-itinerary-rebuild-guard`, `check-unmounted-routers`,
  `check-decision-guards`, `check-duplicate-migration-prefixes`, `check-env-allowlist`,
  `check-claims-only-user-lookups`, `check-coords-preservation`, `check-linkage-preservation`,
  `check-item-removed-logging`, `check-spec-arming`, `check-replit-pending-label`, `phase2-fee-gate` (+ self-test),
  `check-undeclared-tables`. Every finding above sits in a **stated** blind spot of one of these, not in a gap
  a guard claimed to cover.

---

## Not checked / needs a human

1. **The live site.** Network policy denies `www.traveloure.com`, so nothing is production-verified. Finding 13
   in particular turns on the deployed `REPLIT_DOMAINS` value.
2. **UX/content and perf/a11y lanes** — not run. The rubric's "empty/error state the user can't recover from"
   needs a rendered pass; a static count (7 of 69 pages reference `refetch()`, 16 have `isError` branches) is too
   coarse to call.
3. **Journeys lane** — not run. `generated/security/mutation-auth-coverage.md` records **275 of 546** mutation
   endpoints with no authorization test at all (`other`: 0/196; `payments`: 14/31), including 30 explicitly
   excluded expert/provider workflows needing real handler fixtures. Pre-existing and outside a static pass.
4. **Index-level publish-trap check** — `check-undeclared-tables` covers tables. The migration-155
   `sb_idempotency_key_idx` class (an index the code depends on but `shared/schema.ts` does not declare) was not
   separately swept.
5. **`server/routes.ts` (12,023 lines) was sampled, not read end to end** — its admin guard, RBAC backstop,
   money/coordination handlers, trip-auth twins and every extractor-flagged route were walked; roughly 200
   handlers were seen only through the extractor.
6. **`server/jobs/`, `server/utils/`, `server/storage.ts`** are outside `check-money-endpoints`' scan scope and
   were not swept independently for body-sourced amounts.
7. **Whether affiliate `commission_rate` reaches a real payout.** Traced to `resolveCommission` → affiliate link
   generation. Whether `affiliate_earnings` rows are written from that value in production, or only from partner
   reconciliation reports, was not established — it decides whether finding 1 is revenue-affecting or
   config-affecting.
8. **Repository visibility** was reported as public by the dispatch (unauthenticated clone succeeds) and this
   document assumes it; it was not independently re-verified here.
