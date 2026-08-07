# Expert-Console UX Walkthrough — Aug 7, 2026

**Run at:** `7f6ba474` (merged main, post-#440). Hermetic sandbox: local Postgres 16 (178 migrations
applied), the **production bundle** (`node dist/index.cjs`) on `:5000`, CI-stub Stripe/AI/Resend keys,
`ALLOW_TEST_ACCOUNTS=1` — the same recipe the journey suite uses. One real authenticated
`travel_expert` session (`ci-expert@traveloure.test`), driven through Chromium the way a first-time
earner would. Screenshots in the session scratchpad (`expert-walkthrough/p1-*`, `p2-*`).

**Why this run exists.** The expert console's last hands-on pass was the five-role walkthrough at
`c43b09b2` (Jul 29) — ~110 PRs and a full nine-station IA rebuild ago — and it recorded its own blind
spot: *"Expert accept-assignment/message-thread paths untested (no seeded data)."* Console-sigma (the
expert test lane) asserts DB facts over HTTP but **never opens a browser**. So the assignment-accept
path — the expert's money-adjacent moment — had never been walked. This run closes that, at current
main, and adversarially probes the two provider-walkthrough P0s (broken logout, negative price) on the
shared code the expert console inherits.

**Scope honesty.** This is Pass 1 (all nine stations, funnel entry) + a targeted Pass 2 (assignment
accept, Money, and the two adversarial probes). It is **not** a re-walk of every Jul-29 finding — L8
(Workstation day-count), A5 (dead Service-Menu links) and D6 (Distribute-first) were **not** re-tested
(no build was created), so their current status is unknown, not cleared. **Findings only; nothing was
fixed.** All seed rows written by this run were deleted in teardown.

---

## 1. What works (verified this run — expected-PASS, worth locking)

- **Login via the new `/login` route works** (the rescued PR #440 work). `/login` opens the sign-in
  modal over the homepage; email/password auth lands the expert at `/expert/today` with a valid
  session (`/api/auth/user` → 200). `p1-01`–`p1-03`.
- **The assignment-accept path works end-to-end — the Jul-29 blind spot, now proven.** A seeded
  `pending` `trip_expert_advisors` invite renders correctly in Inbox → Queue → **Assignment Invites**
  ("WT Kyoto Assignment Trip · Kyoto · 1 Sept – 5 Sept 2026 · WT Traveler"); clicking **Accept**
  transitions the row `status: pending → accepted` (`workspace_status='draft'`) in the DB. First
  behavioral confirmation of this path. `p2-01`–`p2-03`.
- **The Money station is honest at zero-state.** Four **consistent** balances — Available $0.00 /
  Held $0.00 / Paid $0.00 / Total $0.00 — plus an honest "No bookings yet" earnings panel and a
  "Not Connected" Stripe card. This is the **inverse** of the provider console's P2-B1 (four panels,
  four different balances over one ledger). `p1-27`.
- **All nine stations render honest empty states** — Today, Calendar, Inbox, Workstation, Catalog,
  Content Studio, Customers, Performance, Money, AI Assistant, Settings all load with truthful
  zero-data copy ("Nothing scheduled", "No offerings yet", "No content found"). The §13 discipline
  holds across the console. `p1-04`–`p1-29`.
- **Catalog → New Service reaches the template picker cleanly** — no A3-style detour into the trip
  application wizard for this role-holder (contrast the Jul-29 A3 finding). The picker renders the
  template grid; "Use this template" opens the ServiceForm. `p1-30`–`p1-32`.

---

## 2. Findings

### EX-1 — Logout is a no-op off-Replit; the expert stays logged in and sees a raw 404 (P0, CONFIRMED)

Clicking **Logout** in the expert sidebar navigates to **`GET /api/logout`**, which **does not exist**
off-Replit. The expert is shown a raw JSON error page —
`{"error":{"message":"Route GET /api/logout not found","code":"NOT_FOUND","statusCode":404,…}}` — and
**the session survives**: `/api/auth/user` still returns **200** afterward. `p2-06`.

**Root cause (traced to the line):**
- Client: `client/src/hooks/use-auth.ts:21` — `window.location.href = "/api/logout"` (a full-page GET).
- Server: the only `GET /api/logout` handler is `replit_integrations/auth/replitAuth.ts:202`, but
  `setupAuth` **early-returns at line 130** (`if (!process.env.REPL_ID) return;`) — *before* that
  registration — on any non-Replit host. So the route exists on Replit and nowhere else.
- The real logout for email/password sessions is **`POST /api/auth/logout`** (`emailAuth.ts:531`).
  There is even a `GET /api/auth/logout` that returns **405 "Use POST /api/auth/logout"**
  (`emailAuth.ts:527`) — someone already knew GET was wrong.

**This is the same class as fix #133** ("Passport serializers register in *all* environments, not just
Replit") — the logout leg is still Replit-gated. It is the provider walkthrough's **B1** on the expert
console, with a **worse** presentation (a raw 404 JSON dump rather than an SPA swallow). **It is not
expert-specific:** `provider-sidebar`, `admin-sidebar.tsx:160`, and `ea-sidebar.tsx:74` all navigate to
the same `/api/logout` — every console's logout is broken off-Replit. *Owner: auth/shell. Fix: point
`use-auth` logout at `POST /api/auth/logout`; add a regression pin (authenticated session → logout →
`/api/auth/user` 401).*

### EX-2 — A non-positive price reaches a live, submitted listing (P0, CONFIRMED = provider B4)

`POST /api/provider/services` — CLAUDE.md §5's single shared offering-create endpoint for **both**
experts and providers — accepts and persists non-positive prices with no server floor. Direct probes
(server-derived, correct field names):

| price sent | HTTP | landed row |
|---|---|---|
| `-50` | **201** | persisted, `status=draft` |
| `0` | **201** | persisted, `status=draft` |
| `-99` + `status=active` | **201** | persisted **`active` / `approval_status=submitted`** — enters the admin approval queue at **−$99** |

The client field shows a red outline for `-50` but the value is not blocked, and the server accepts it
regardless. Because the endpoint is shared, this is one bug on both consoles. *Owner: catalog. Fix: a
zod `.positive()` (or `>= configured floor`) on the price at the insert schema **and** a storage-layer
clamp; regression pin: create with `price <= 0` → 4xx, no row.* (Provider-sigma filed this class; this
run confirms it holds expert-side and survives to `active`.)

### EX-3 — The accept transition writes no diary row (LOW, observation)

The `pending → accepted` transition wrote **zero** `item_transition_log` rows (checked: 0 rows in the
5-minute window around the accept). The #1028 diary fix covers `updateExpertAssignmentWorkspaceStatus`
(draft → in_review → delivered); the **accept** itself appears to sit outside that scope. This parallels
provider-sigma **PS8** (status transitions with no diary on the second table). Flagged low-confidence —
it may be deliberately out of the #1028 scope; wants a code trace before it's treated as a defect, not a
UX-visible break.

### EX-4 — "Request Payout" is enabled at $0.00 with no Stripe connected (MINOR)

The Money station's **Request Payout** button is active while Available = $0.00 and the payout account
reads "Not Connected". Harmless (the request would fail server-side), but it's a dead affordance at
zero-state. Note this is the *mirror* of the provider finding (there it was disabled while a balance
showed) — different bug, same "the payout button's enabled-state doesn't track the ledger" theme.
*Owner: money surfaces.*

---

## 3. Explicitly NOT covered (no silent caps)

- **L8 (Workstation day-count self-disagreement), A5 (dead Service-Menu Manage links), D6
  (Distribute-first build)** — the Jul-29 findings — were **not re-tested**; no build/service was
  created this run. Status unknown, not cleared.
- **Message-thread path** (the other half of the Jul-29 blind spot) — not walked.
- **Stripe-real payout / earnings** legs — correctly un-runnable under the stub key.
- **Perf note:** cold station loads measured ~13 s in this sandbox. That is **a sandbox artifact, not
  a product finding** — the proxy blocks `fonts.googleapis.com` (`ERR_CONNECTION_RESET`), and the app
  waits on the font stylesheet before painting. Diagnosed and excluded deliberately; it would not
  reproduce with the font CDN reachable.

---

## 4. Proposed regression pins (so these can't return unnoticed)

1. **Logout pin** (http.test): authenticated email/password session → the logout the client actually
   calls → `/api/auth/user` returns **401**. Would have caught EX-1, and caught it in CI (not just on
   Replit).
2. **Price-floor pin** (db/http): `POST /api/provider/services` with `price <= 0` → 4xx, no row; run
   for both `status=draft` and `status=active`. Would have caught EX-2.
3. **Assignment-accept pin** (db/http): seed a `pending` invite → accept → assert row is `accepted`
   **and** an `item_transition_log` row exists (turns EX-3 into a decision rather than a silent gap).

These belong with whoever picks up EX-1/EX-2, per the repo's guard-with-the-fix convention.
