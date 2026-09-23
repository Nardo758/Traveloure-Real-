# A suspended session's remaining reach — board #1434, the half that is NOT fixed

**Status:** the `/api/admin` half is FIXED and pinned
(`server/__tests__/admin-gate-account-status.test.ts`, CI job *Admin-gate account-status pin*).
This brief records the other half, which needs a ruling before code.

---

## What the board row said, and what is actually true

> #1434 — "Suspension enforced only in auth strategies (replitAuth/emailAuth/facebookAuth); no
> suspension middleware. Mid-session bypass plausible."

**That premise is stale.** `isAuthenticated` (`server/replit_integrations/auth/replitAuth.ts:217`)
*is* the suspension middleware: it does one indexed PK lookup per request and refuses a deleted
account (403), a missing account (401) and a suspended account (403), failing closed to 503 if the
lookup throws. It is the gate on the overwhelming majority of authenticated routes.

**The real defect was divergence, not absence** — three middlewares answered one question, three
different ways:

| Gate | deleted | suspended |
|---|---|---|
| `isAuthenticated` (`replitAuth.ts`) | refused | refused |
| `requireAdminLocal` (`admin.routes.ts:281`) | **no** | refused |
| `adminApiGuard` (`server/routes.ts:755`, the §2 blanket guard) | **no** | **no** |
| `requireAdmin` (`content.routes.ts:5632`) | **no** | **no** |

It only mattered where a gate was the *sole* gate, and it was:

- **15** of the **248** `/api/admin/*` routes carry no per-route middleware at all and ride
  `app.use("/api/admin", adminApiGuard)` alone — six of them mutations
  (`POST /api/admin/markets`, `POST /api/admin/markets/:slug/refresh-geography`, the three
  `demand/onepager` writes, `PATCH /api/admin/service-requests/:id`).
- **13** of `admin.routes.ts`'s **16** `requireAdminLocal` routes carry no `isAuthenticated`.
- The **four** `/api/travelpulse/ai/*` routes (three of them writes) sit *outside* the
  `/api/admin` prefix entirely, behind their own `requireAdmin` copy.

All three are now fixed, in place, with the same check in the same order and the same wording.

**A surviving session is a state the code already admits can happen.** The suspend handler's
session purge is deliberately non-fatal — `admin.routes.ts`, `"[admin/suspend] session purge
failed (non-fatal)"` — so a purge that throws leaves the row and logs a warning.

---

## What is NOT fixed: session users resolved outside `isAuthenticated`

A scan of every route registration in `server/routes.ts` and `server/routes/*.ts` finds **36**
that read a session user (`getUserId(req)` / `req.user`) with no auth middleware in the chain.
Twenty-one are analytics and tracking writes where the id is pure attribution. The remaining
group uses it for an authorization or ownership decision:

| Route | Why it has no `isAuthenticated` |
|---|---|
| `PATCH /api/transport-legs/:legId/mode` (`trips.routes.ts:2252`) | deliberate **share-token** branch — an unauthenticated holder of a `suggest` token may edit |
| `POST /api/concierge/requests` and 3 siblings (`concierge.routes.ts`) | deliberate **guest** branch — a request is created before sign-in and claimed later by HMAC token |
| `POST /api/cross-sell-events` (`cross-sell.routes.ts:38`) | attribution, but writes a row |
| `GET /api/revenue-splits` (`payments.routes.ts:300`) | does its own inline admin check |
| `GET /stripe/connect/return`, `/refresh` (`payments.routes.ts:2828`, `:2837`) | Stripe redirect targets |
| `POST /api/optimization-preview` (`optimization.routes.ts:59`) | free heuristic preview (LD 41 (d)) |

**Adding `isAuthenticated` to these is wrong** — it would break the guest and share-token branches
those routes exist to serve. So this is not a mechanical fix.

## RULED 2026-09-23 — option 2, reviewed and left as is

The decision-maker took **option 2**: the 36 routes are recorded as REVIEWED, not missed, and no
`resolveActingUserId` resolver is built.

**The reasoning, so it can be re-argued rather than rediscovered.** All 36 make only *narrowing*
decisions — ownership checks, possession tokens, share tokens — so the session user never widens
what the caller may reach. A suspended traveler acting on their own trip is not the threat
suspension exists to stop. Option 1 would have cost a database read on hot tracking paths, and
excluding those paths reopens "which of the 36 count" as a per-route judgement, which is exactly
the list §18d says must then state its own negative space.

**ONE CARVE-OUT, NAMED:** `PATCH /api/transport-legs/:legId/mode` (`trips.routes.ts:2252`) is the
only one of the 36 that MUTATES A PLAN. If a single route ever gets the resolver, it is that one.
It is not built today because its share-token branch means the caller may legitimately be nobody.

**What would reopen this:** a route in this set gaining a *widening* decision — anything where the
session user grants reach rather than narrowing it — or `PATCH /api/transport-legs/:legId/mode`
losing its share-token branch, which would make the plain resolver applicable at no cost.

---

## The ruling this needs (as originally put — kept for the record)

Two shapes, and the choice is the decision-maker's:

1. **A resolver, not a middleware.** `getUserId(req)` gains a sibling — say
   `resolveActingUserId(req)` — that returns `null` for a deleted or suspended account, and the
   authorization-bearing routes above adopt it. A `null` there already means "guest", which every
   one of these routes already handles, so a suspended user degrades to the guest branch rather
   than being refused. One predicate, several callers (§18 rule 1). Cost: one indexed PK lookup on
   routes that currently do none.
2. **Do nothing, and say so.** Argue that the id on these routes is attribution, that the
   authorization decisions they make are all *narrowing* (ownership, possession token), and that a
   suspended user acting on their own trip is not the threat suspension exists to stop. Then the
   36 are documented as reviewed, not missed.

**Not decided here.** Option 1 costs a DB read per call on some hot tracking paths and would need
those excluded, which reopens "which of the 36 count" as a per-route judgement — exactly the kind
of list §18d says must state its own negative space. Option 2 is cheap and may well be right.

## Recorded, not fixed: eight copies of the admin predicate

`requireAdmin` is defined **six** times (`server/routes.ts:11865`, `content.routes.ts:5632` and
`:8381`, `cross-sell.routes.ts:14`, `neighborhood-claims.routes.ts:44`, `admin.routes.ts:7307`)
beside `requireAdminLocal` and `adminApiGuard` — eight implementations of "is this an admin who
may act", with three different signatures (middleware, boolean-returning, object-returning). This
divergence *is* what produced #1434. Consolidating them is a separate lane and a §18-rule-1 debt,
recorded here rather than fixed: the blanket guard now covers every `/api/admin/*` path regardless
of which copy a route uses, so the account-status question is answered for all of them today.
