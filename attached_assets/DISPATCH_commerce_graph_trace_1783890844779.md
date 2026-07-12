# DISPATCH — Commerce-graph trace: every path from selection to payment, and where approval holds (READ-ONLY)

**Why:** the marketplace isn't a self-contained storefront — Discover by-date/by-location selections feed the **cart** and the **book-an-expert** rails, the same rails regular commerce uses. So there may be **two (or more) transaction paths to the same product**: the dedicated marketplace Stripe checkout (`3ceeffc3`) and the general cart/booking flow. The danger is a template/expert-package reaching payment through a rail that lacks the approval gate and/or the payment guards. This trace maps every path from selection to money and pins, on each path, **where approval is enforced and which payment guards apply.** It's the prerequisite for both the §10 doc reconciliation and the go/no-go on the live checkout.
**Type:** Read-only. Trace and inventory. Change nothing, fix nothing, decide nothing. Output is a graph + gap list.

**We genuinely don't know the answers here — this trace is how we find out.** Don't assume the paths are clean; assume nothing and follow the code.

---

## What to trace — every product type, from entry to payment

Three product types can potentially reach a transaction: **regular services/experiences**, **expert templates/packages** (the marketplace product), and **expert bookings/matches** (book-an-expert). Trace each from where a user selects it to where money is (or isn't) taken.

Entry surfaces to start from: Discover by-date, Discover by-location, the dedicated marketplace surface (`/expert-templates*`), the CTA-relocation band, and any other place these three product types are selectable.

Rails they can flow into: **cart** → checkout, **book-an-expert** (request/match), the **dedicated marketplace Stripe path** (PaymentIntent → `/confirm`).

---

## The four questions to answer per path

For **every** selection→payment path you find:

1. **What product types can enter this rail?** Can a template/expert-package enter the **cart**? Can it enter **book-an-expert**? Or are those rails regular-services-only? Grep what the cart add / booking-create endpoints accept and whether template/package items are representable in them.
2. **Where does the path terminate — does it charge?** Follow it to the end. Cart → does checkout take payment (Stripe) for this item type? Booking → is it a request (no charge) or does it pay? Dedicated → the `3ceeffc3` Stripe flow. Map each terminus: **charges / free-request / dead-end.**
3. **Does approval gate this path?** The §10/§5 concern: unapproved expert content being sold. For each path that can carry a template/package to a charge, is there an **approval check** (is the template approved/`isPublished`-plus-review) anywhere between selection and payment? Name the check + `file:line`, or state **NO GATE**.
4. **Which payment guards apply?** The dedicated Stripe path has IDOR / ownership / idempotency guards. Does the **cart/booking** path — if it can charge for a template/package — have equivalent guards, or different/none? A second charging path with weaker guards is the finding.

---

## Convergence — the key structural question

Do the paths **converge on one checkout or stay separate?**
- If cart-checkout and the dedicated marketplace `/confirm` both funnel into **one** payment+earning routine → guards/approval enforced there cover all paths (verify it).
- If they're **separate** payment routines → each needs its own approval + guards, and any that lacks them is exposed. Map which routine each rail uses.
- **Two paths that can charge for the same template/package via different routines is the highest-risk finding** — pin it explicitly.

Also settle the cart-vs-booking distinction: booking (book-an-expert) is a request/match — confirm whether it ever terminates in a *payment* for template/expert content, or stays a request. If it's request-only, it's lower risk; if it charges, it's a third payment path.

---

## The two endpoints question (from history)

The old marketplace purchase was a **defanged ledger stub** (fabricated earnings, no real payment). `3ceeffc3` added a **real Stripe flow**. Determine: is the stub **replaced**, or do **both endpoints still exist**? If both exist:
- Which is wired to the UI?
- Does the **dead stub still fabricate earnings** if called directly? (The "two paths, one dangerous" pattern — a live-but-unwired endpoint that still mints money.)
Report both endpoints' current state + `file:line`.

---

## Deliverable

1. **A path graph** (text tree/table): `entry surface → rail (cart / booking / dedicated) → transaction routine → charges? → approval gate? (file:line or NO GATE) → payment guards?` — one row per distinct path, per product type.
2. **The gap list**, ranked: any path where a template/expert-package can reach a **charge without an approval gate**, or with **weaker/absent payment guards** than the dedicated path, or any **live earning-fabricating** stub endpoint.
3. **Bottom line:** do the marketplace's payment paths converge safely, or are there multiple doors to charging for expert content with inconsistent approval/guards? This is the fact that decides whether the live checkout (`3ceeffc3`) is safe as-is, needs gating, or the §10 decision reopens.

---

## What NOT to do

- Don't change code, docs, or the §10 decision — read-only; the decision is Leon's, informed by this map.
- Don't assume the cart/booking paths are safe because the dedicated Stripe path has guards — trace them independently; the whole point is that content may reach payment through a rail nobody designed for it.
- Don't conflate expert *match* (request) with template *purchase* (charge) — follow each to its actual terminus.
- Don't skip the "two endpoints" check — a live earning-fabricating stub is exactly the latent-money-bug class this trace exists to catch.
- Don't infer from CLAUDE.md §10 (it may already be stale vs `3ceeffc3`) — trace the code on current `main`.

---

## Feeds into

- The **§10 reconciliation** — whether CLAUDE.md records the marketplace as live, and under what safety conditions.
- The **go/no-go on the live checkout** — safe as-is / needs a gate / reopen the parked decision.
- Uses the "does marketplace content surface on by-date/by-location" answer (separate dispatch) as an input for which entry surfaces to trace.
