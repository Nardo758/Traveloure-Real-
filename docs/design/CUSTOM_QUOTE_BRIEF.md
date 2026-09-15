# Custom quotes — a quote is an object with an expiry, not a conversation

**Status:** DESIGN BRIEF. The ruling is made (decision-maker, 2026-09-15, punchlist **D-8**,
option A); the columns are **not**. No migration is written by this lane. Ledger row:
`2026-09-15-d8-quotes-with-expiry`. Facts verified against `4d1c0c4`.

**The ruling.** A custom quote becomes a **real object**. The provider issues a **quoted amount
with an explicit expiry**; the traveler **accepts inside the window**; acceptance mints the
`service_bookings` row with **the quoted amount as the SERVER-derived total** (§14) through an
**atomic claim** (§15). The listing's existing deposit settings then apply **unchanged**
(`provider_services.deposit_*` → `service_bookings.deposit_amount` → the §15d balance rail). An
**expired quote is re-quoted** — never silently honoured and never silently refused: the traveler
is told it expired, when, and how to ask for a new one. **Validity is config, or a provider choice
under a configured ceiling — never a literal** (§8's posture, applied to a time value the way
`completion-windows.config.ts` already does).

---

## 1 · Facts on the ground today

**`custom_quote` is a price TYPE and nothing else.** `provider_services.price_type` is
`varchar(20)` with no DB CHECK, its comment listing eight values including `custom_quote`
(`shared/schema.ts:930`). Nothing in `server/` stores a quote against it.

**The commerce contract already RESOLVES the quote shape, and the resolution is honest about
being unbuilt.** `server/services/offering-commerce-contract.ts` maps `priceType ===
"custom_quote"` to archetype **P5** (`:363`, its comment naming "register D-8" as the reason
generic checkout is forbidden), to `priceAuthority: "server_quote"` (`:411`) and — through P5's
unconditional `commitmentMode: "quote_approve"` (`:382`) — to `chargeMode: "after_quote"`
(`:424`). The activation gate refuses `instant` + `custom_quote` at publish
(`offering-activation-gate.service.ts:102,117`) so a quote listing can only ever be `request`.
Every one of those strings is snapshotted onto each booking at birth
(`server/services/offering-contract-snapshot.ts`, `service_bookings.offering_contract_snapshot`, `shared/schema.ts:1470`), so the
platform has been recording "this was sold after a quote" on rows where **no quote exists**.

**`chargeMode` cannot see the deposit on a quote listing.** `chargeModeFor` tests
`commitment === "quote_approve"` **before** `input.depositEnabled === true`
(`offering-commerce-contract.ts:424-425`), so a custom-quote listing with deposits switched on
resolves `after_quote` and the deposit fact never reaches the contract. The ruling's "deposits
then apply unchanged" therefore has no representation in the contract today; that is **D-31**.

**The buy resolver lands a quote listing on `booking_request`, and that store does not exist.**
`resolveBuyAction` row 11 returns `request_to_book` for `request` mode and for the priceless case,
landing on `store: "booking_request"` (`shared/buy-action.ts:357-377`). The traveler surface says
so out loud: `client/src/pages/service-detail.tsx:1774-1779` — *"There is no platform request rail
on `main` (the quote lane is unbuilt)"* — and the button opens the **LD 40 conversation** with
`{ serviceId }` through `useAskExpert`, **writing nothing**. That refusal-as-a-sentence posture is
this lane's starting point, not a defect to route around.

**A priceless listing is refused on four rails — and not on the fifth.**
`hasPublishedPrice` + `PRICELESS_LISTING_REFUSAL` (`server/services/buy-action-payload.ts:111,144`)
are enforced at `POST /api/bookings` (`server/routes.ts:6686`), the second add rail (`:6558`),
`GET /api/cart` (`:8190`) and checkout (`server/routes/payments.routes.ts:1008-1016`). The
refusal's own sentence already promises this lane: *"A custom-quote listing is requested and
quoted before anything is committed."* **`POST /api/expert-booking-requests` carries no such
check.** It reads `const totalAmount = Number(service.price ?? 0)` (`server/routes.ts:1779`) and
calls `storage.createServiceBooking({ …, status: "pending", totalAmount: String(totalAmount) })`
(`:1855-1866`) — so a `custom_quote` listing requested through that rail births a **real
`service_bookings` row priced `"0"`**, with a commission split computed off zero. Nothing charges
it, because a `pending` row has no PaymentIntent; it is a $0 obligation on the traveler's plan
that no quote ever repriced. **This is the hole the ruling closes, and it is where the quote must
attach.**

**No quote table and no quote columns exist.** Grepped at `4d1c0c4`: no `service_quotes`, no
`quoted_amount`, no `quote_expires_at` anywhere in `shared/schema.ts`, `server/` or `client/`.
The nearest things, and why neither is the answer:

- `booking_requests` (`shared/schema.ts:8495`) carries `counter_price`, `expires_at` and
  `response_expires_at` — and has **one reader in the whole repo**
  (`server/routes/experts.routes.ts:312`), no writer, no client. It is a dormant legacy table.
- `provider_booking_requests.counter_offer` (`shared/schema.ts:7209`) is jsonb
  `{newStartTime, newEndTime, newPrice, reason}`, written by
  `PUT /api/provider/booking-requests/:requestId/respond`
  (`server/routes/experts.routes.ts:545-596`) and rendered as a dollar figure by
  `client/src/components/logistics/provider-booking-context.tsx:248`. It is the **expert's
  vendor-wrangling** rail, not the traveler's, and **no checkout reads it**. Note the route
  declares `counterOffer: z.string()` over a jsonb column the client reads as an object — a
  live shape mismatch, recorded here, **not fixed by this lane**. Do not extend either table;
  a third meaning for "a price a provider proposed" is the drift class §18 rule 1 names.

**Deposits are already one server-side derivation.** `resolveDepositPlan`
(`server/services/deposit.service.ts:53`) reads the listing's `depositEnabled` / `depositType` /
`depositPercentage` / `depositFlatAmount` (`shared/schema.ts:1060-1063`) against a server-derived
`lineTotal` and returns `{depositAmount, balanceAmount}` or `null`; its one caller is checkout
(`payments.routes.ts:1623`). The booking row holds `deposit_amount` / `balance_amount` /
`balance_due_at` / `stripe_deposit_intent_id` / `stripe_balance_intent_id`
(`shared/schema.ts:1441-1450`), and `total_amount` / `platform_fee` / `provider_earnings` stay the
**FULL** values — the split is the payment schedule, not a re-split. The balance is paid under
§15d by the owner or a `payer`-role participant through `canPayBalance`
(`server/services/balance-payer.service.ts:81`). **None of that needs to change for a quote**:
feed the accepted amount in as the line total and every deposit behaviour follows.

**Booking birth is already an allowlist.** `createBookingRequestSchema`
(`shared/schema.ts:2807`) is the §19d pick — `serviceId`, `tripId`, `contractId`,
`bookingDetails`, `bookingMetadata`, the last two narrowed by `clientSuppliedBookingJsonb`. There
is **no amount in it**, which is exactly the shape a quote rail must keep.

---

## 2 · The state machine

```
requested ──> quoted(amount, expires_at) ──> accepted ──> booking minted (deposit, then §15d balance)
     ▲              │             │
     │              │             └── window elapses ──> expired ──> re-quote (a NEW quote row)
     └── re-quote ──┘
                    └── withdrawn (provider) / declined (traveler) — terminal, never reused
```

**Rules that are not negotiable in the build.**

1. **The amount comes from the stored quote row, never from `req.body` (§14).** The traveler's
   accept carries a **quote id and nothing else**; the server reads the amount off the row it
   itself wrote. A quote id is an identity the server can check; an amount is not.
2. **Acceptance is an atomic claim (§15).** `UPDATE service_quotes SET accepted_at = NOW() WHERE
   id = ? AND accepted_at IS NULL AND superseded_by IS NULL AND expires_at > NOW()` — the
   statement is the guard, and a check-then-mint is the TOCTOU bug. A double-click mints **one**
   booking. **The expiry is part of the claim's WHERE clause**, so the window is enforced by the
   transition itself and not by a prior read that could go stale between the two.
3. **A quote is never edited; it is superseded.** A re-quote writes a NEW row and stamps
   `superseded_by` on the old one. The traveler's record of what they were offered, and when it
   died, survives — which is what makes "expired on X" a fact rather than a reconstruction.
4. **Acceptance mints through the EXISTING spine.** `POST /api/checkout`'s CLAIM → AUTHORIZE →
   PROMOTE (§15b, `server/services/checkout-claim.service.ts`) stays the one purchase machine;
   the quote supplies the **line total**, the way a listing price does. No second booking-birth
   rail, no second promotion path, and `stripePaymentIntentId` keeps its sole writers (§19a).
5. **The provider is the session (§14).** Only the listing's owner issues or withdraws a quote;
   only the booking's traveler accepts. Neither actor is read from a body.
6. **Validity is a config value.** The `completion-windows.config.ts` posture — a day count is
   not a fee, so §8's `fee_bands` rule does not bind it, but the "no literal" half does. A
   provider-chosen window is clamped to a configured ceiling server-side, and a value outside the
   ceiling is refused with the ceiling stated, never silently clamped.

---

## 3 · Money posture

**What moves:** nothing, until acceptance. A quote is an offer; it mints no booking row, no
PaymentIntent, no `fee_ledger` leg and no earning. **What changes at acceptance:** the line total
fed to the existing checkout derivation is the quote's amount instead of `provider_services.price`.
**What does not change:** the fee resolution (`fee_bands` via `resolveCommissionRates`, §8/§18),
the traveler service fee, the deposit derivation, the balance rail, the earnings mint at
completion, the hold window. No rate is read differently and no new fee type is introduced.

**Deposits, precisely.** `resolveDepositPlan(listingConfig, acceptedAmount)` — same function, same
listing config, a different line total. A deposit that would be ≥ the quoted amount degrades to a
full charge (its existing `null` return), which is the honest behaviour for a small quote under a
large flat deposit. `balance_due_at` is derived by the existing `resolveBalanceDueAt` and is **not**
the quote's expiry: the quote window governs the OFFER, the balance window governs the SCHEDULE,
and conflating them would let a long quote validity quietly extend a payment deadline.

**What §17 must scan.** The drift job reads PaymentIntents, charges and refunds and derives the
expected charge from the persisted booking rows (`expectedChargeForRow`,
`server/jobs/stripeReconciliation.ts:276`). A quote-born booking is an **ordinary cart-rail row**
— it carries `total_amount`, `platform_fee` and a PI like any other — so it is already in scope
and needs **no new exception kind**. The one thing that would break it is writing the quoted
amount anywhere other than `total_amount`: the expected sum is computed from that column, so a
quote amount held only on the quote row while the booking kept the listing price would raise a
false `amount_mismatch` on every pass (`:602-608`). **The quote is the source; `total_amount` is
where it lands.**

---

## 4 · Honesty rules (§13)

- **An expired quote says expired, and when.** "This quote expired on 3 October. Ask
  {provider} for a new one." Never a silent refusal, never a silently honoured stale price, and
  never a re-quote generated on the traveler's behalf at the old number.
- **A quote is never rendered as a price on the listing.** A quoted amount is an offer to **one
  traveler**; publishing it on the card or the detail page would make one person's negotiation
  look like the listing's price. The card keeps its existing "Enquire for pricing" affordance
  (`provider_services.show_price`, `shared/schema.ts:1074`) and the priceless refusal keeps
  its sentence.
- **"Accepted" is never inferred.** Not from a reply in the conversation thread, not from the
  window closing, not from the traveler opening the quote. Only the accept claim accepts.
- **A quote with no expiry is not a quote.** If a build path cannot state one, it does not issue
  the quote — it says why. An absent expiry is never rendered as "no deadline".
- **Nothing is zero-filled.** A listing awaiting a quote shows *no amount*, not `$0.00` — which
  is the same §13 lie `hasPublishedPrice` already exists to refuse
  (`buy-action-payload.ts:105-109`).
- **A withdrawn quote and an expired one are different facts** and are named differently; a
  declined one is the traveler's answer and is never re-offered automatically.

---

## 5 · Columns proposed — decision rows, not a migration

Filed in `docs/PUNCHLIST.md` §1 as **D-28 … D-31**. Every proposal is additive, **NO DEFAULT and
NO DB CHECK** (publish-trap posture — migrations 181/195/273/275/277/279/281/282/284/287),
**declared in `shared/schema.ts`** (deploy-push durability rule — an object that file does not
declare is dropped at publish and never recreated), **no backfill**, and written only through a
pick-based allowlist or a targeted server-side UPDATE (§19).

- **D-28 — is a quote a CHILD TABLE or columns on a request row?**
  *Recommend:* a child table, **`service_quotes`**, on the `service_route_points` /
  `dmo_extracted_places` pattern — FK → `provider_services` (the listing quoted) and to the
  requesting traveler, `amount_cents` integer, `currency` varchar(3), `expires_at`, `quoted_by`,
  `accepted_at`, `superseded_by` (self-FK), `note` text. Columns on a request row cannot hold a
  **sequence** of offers, and re-quoting is the ruling's own required behaviour, so a row that is
  edited in place destroys the record of what expired. Amount in **CENTS** because every quote is
  minted integer-exact and only the existing checkout derivations round.
- **D-29 — where does the validity window live, and may a provider choose one?**
  *Recommend:* a config default (`QUOTE_VALIDITY_DAYS`, the `completion-windows.config.ts`
  `envDays` shape) **plus** an optional per-quote provider choice clamped to a configured
  **ceiling**, refused-with-the-number rather than silently clamped. *Sub-question:* whether the
  ceiling is per-listing. *Recommend:* **no** — one platform ceiling; a per-listing ceiling is a
  second authority for the same rule.
- **D-30 — what does a quote REQUEST create, and does acceptance mint through checkout?**
  *Recommend:* the request creates **no `service_bookings` row** — it creates the quote row in
  `requested` state and an LD 40 conversation with `{ serviceId }` for the words. Acceptance then
  mints through the **existing** checkout spine. **This row also owns the fix to
  `POST /api/expert-booking-requests`**, which today births a `"0"`-priced booking for a
  `custom_quote` listing (`server/routes.ts:1779,1855`): it must either carry the same
  `PRICELESS_LISTING_REFUSAL` its four sibling rails carry, or route into this lane. Leaving it
  is the one thing this brief says out loud must not happen.
- **D-31 — does an accepted quote's `chargeMode` become `deposit_balance`?**
  *Recommend:* **yes**, and the contract resolver's ordering changes so `depositEnabled` is
  consulted for an ACCEPTED quote (`offering-commerce-contract.ts:424-425`). Until it is ruled,
  the contract snapshot on a quote-born booking would say `after_quote` on a row that actually
  took a deposit — a snapshot that misdescribes its own money schedule.

---

## 6 · Build sequence, and the negative space

**Schema first, and only after D-28 – D-31 are ruled.**

1. **Lane 1 — the table.** One migration, declared in `shared/schema.ts`, registered in
   `server/migrations/migration-files.ts`. No behaviour.
2. **Lane 2 — issue and withdraw**, owner-gated, pick-based allowlist, validity clamped to the
   config ceiling. No traveler surface yet.
3. **Lane 3 — accept**, the atomic claim with the expiry in its WHERE clause, minting through the
   existing checkout spine with the quoted amount as the line total. **This is the lane that makes
   the ruling true**, and it must not ship before lane 2 or there is nothing to accept.
4. **Lane 4 — the `expert-booking-requests` $0 hole** (D-30's second half), and the contract
   `chargeMode` ordering (D-31), each with its own ledger row.
5. **Lane 5 — surfaces.** The traveler's quote card on the slip's bookings section (LD 42 **D9** —
   owner and `payer`-role audience, gated by the same `canPayBalance` predicate the route runs);
   the provider's issue/withdraw affordance on Catalog; the expired sentence everywhere.

**Negative space — what this brief does not decide, and nobody may take as decided.**

- **Partner quotes.** No external partner issues a quote here; LD 44 governs partner rails and
  no partner booking client exists on `main`.
- **Multi-currency.** `currency` is carried so the column is honest, and **every quote is USD**
  until a currency decision exists. A quote is never converted.
- **A negotiation thread beyond the existing conversation.** The words live in the LD 40
  conversation rail (`{ serviceId }` today, and D-22's `advisor` kind where a plan is involved);
  this lane adds no messaging, no counter-offer object and no revision-of-a-quote.
- **The dormant `booking_requests` and the expert-side `counter_offer`.** Neither is extended,
  merged or retired here.
- **Any change to an amount, a rate, a fee band, a payout, a deposit derivation or the hold
  window.** None is proposed and none may be introduced as a side effect.
