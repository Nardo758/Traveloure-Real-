# Finding: the traveler service fee is not billed on the direct path

**Id:** `fee-not-billed-on-direct-path` · **Class:** revenue / product decision (NOT an agent bug-fix)
**Surfaced by:** Lane 4 rider 3b (fee-preview × Trip-Pass) · **as-of** `main` @ #692 branch
**Owner:** decision-maker (revenue question) — filed, not fixed.

## What

`GET /api/cart/fee-preview` reports a Trip-Pass waiver via the same `coversAction(tripId,
"traveler_service_fee")` the charge path uses. But the waiver is **informational** — it does not
reduce the cart total — because the traveler service fee **is not actually charged on the direct
path today**. The handler says so in its own words:

`server/routes/payments.routes.ts` (fee-preview handler, ~L2000–2038):

> `billedOnDirectPathToday` is false on the resolver's own record (the D3 traveler-service-fee is
> not yet billed on the direct path today), so this never changes `platformFeeTotal` above — it is
> the same informational parity the booking row carries.

and the response stamps `tripPassFeeWaiver.billedOnDirectPathToday: false`, while `total` is computed
as `subtotal + platformFeeTotal + conciergeFeeTotal + surcharge` — with **no traveler-service-fee
term**.

## Why it matters

The platform's headline promise is a **7% service fee, capped at $25**. On at least one live path
(the cart/direct checkout that fee-preview mirrors), that fee is **not collected** — a pass-holder
and a non-holder pay the same total. So:

- The Trip-Pass "fee waiver" waives a fee that isn't being charged there, which is why it can only
  be shown as a counterfactual (`wouldHaveBeenAmountTotal`), not as a total reduction.
- More materially: revenue the headline promises is not being realized on this path.

This is a **revenue/product decision** (should the direct path bill the D3 fee? when? at what
cap?), not a defect for the agent to "fix" by quietly turning billing on — flipping it changes what
travelers are charged. Hence: filed for the decision-maker.

## Evidence / pins

- The current (informational) behaviour is now pinned by
  `server/__tests__/fee-preview-entitlement.http.test.ts` (gate: `fee-preview-gate.yml`), assertion
  **C**: with an active pass, `total` is **unchanged**. If billing is ever switched on for this
  path (so the waiver should move the total), that assertion flips and the gate fails loudly — the
  intended tripwire that forces this finding back to the table rather than letting the change land
  silently.

## Not doing (until ratified)

- Not enabling traveler-service-fee billing on the direct path.
- Not changing the waiver to reduce the total.
- Not touching the `coversAction` resolution (it is correct; the fee simply isn't charged here).
