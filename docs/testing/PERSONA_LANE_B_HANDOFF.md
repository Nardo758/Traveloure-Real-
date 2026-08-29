# Kyoto Persona Marketplace — Lane B Handoff

This is the implementation handoff for the external Claude Code lane. Lane B
must not start until Lane A has completed the development seed and the manual
Kyoto supply pass. Do not recreate the seed in the Playwright suites.

## Personas and credentials

Use the fixed accounts from `docs/testing/PERSONA_JOURNEYS.md`, all with
`TestPass123!`:

- `persona-gion-expert@traveloure.test`
- `persona-kyoto-planner@traveloure.test`
- `persona-kyoto-event-planner@traveloure.test`
- `persona-kyoto-provider@traveloure.test`
- `persona-kyoto-free-traveler@traveloure.test`
- `persona-kyoto-trip-pass@traveloure.test`
- `persona-kyoto-plus@traveloure.test`
- Guest is a signed-out browser context.

The provider has a manually seeded active `pro_monthly` membership. The Plus
member has a manually seeded active `plus_annual` membership.

`trip_entitlements` now EXISTS (migration 262). The seed still does not
grant a Trip Pass row, and that is by design, not a gap: the table's sole
writer, `grantTripPass()` (server/services/trip-entitlement.service.ts),
requires a real Stripe-verified PaymentIntent id (§19a) and carries no
manual/beta source vocabulary the way `plan_memberships.source` does — a
direct seed insert would make the seed a second, unaudited writer of a
§19a-protected column. The Trip Pass suite instead exercises the real,
fully shipped purchase flow (`POST /api/trips/:tripId/trip-pass/purchase` +
`.../purchase/confirm`) under the SAME Stripe-test-mode gate the checkout
journeys already use: a real `sk_test_` key runs the full positive path and
asserts the resulting `trip_entitlements` row; a stub key asserts the honest
negative (no row created) rather than a guess either way.

## Suite ownership

| Suite | Personas | Responsibility |
|---|---|---|
| `supply-expert.spec.ts` | Gion local expert, Kyoto trip planner, Kyoto event planner | Create and publish expert-owned Kyoto supply through UI/API flows, with DB proof. |
| `supply-provider.spec.ts` | Kyoto provider | Create and publish two provider services and verify availability/Pro behavior. |
| `journey-guest.spec.ts` | Guest | Verify browse access, protected-action prompt, and signed-out boundaries. |
| `journey-traveler.spec.ts` | Free traveler, Trip Pass traveler, Plus member | Verify browse → plan/cart/checkout and membership/occasion states. |

## Required ordering

1. Run `npx tsx scripts/seed-personas.ts --apply` against the local
   development database.
2. Run `supply-expert.spec.ts` and `supply-provider.spec.ts` first. These are
   the supply lanes and must leave Kyoto with the expert, provider services,
   and planner listing needed by demand journeys.
3. Run `journey-guest.spec.ts`.
4. Run `journey-traveler.spec.ts`.
5. Run the full four-suite matrix again for idempotence.

Do not parallelize supply and demand. Demand journeys must consume the supply
created by the supply suites rather than direct SQL fixtures.

## Exact journey steps and assertions

### `supply-expert.spec.ts`

1. Log in as `persona-gion-expert`.
2. Navigate using the expert console link (`data-testid="link-expert-console"`)
   or the role route exposed after login.
3. Complete the local expert form, selecting Kyoto and Gion, and submit.
4. Assert the saved profile/application state in the UI and query
   `local_expert_forms` by the seeded user id.
5. Create two services through the service authoring UI. Prefer stable
   selectors from the live form: `data-testid="service-name"`,
   `service-description`, `service-price`, `service-duration`, and the
   service save control.
6. Assert two owned service rows; do not insert `provider_services` directly.
7. Publish/submit through the visible approval path, then assert the public
   expert/storefront route and approval fields.
8. Repeat the run using a stable persona marker and assert no duplicate
   profile/services/listing are created.

For the trip planner, repeat the same login/form proof with
`persona-kyoto-planner`, then use the ready-made authoring flow to create one
Kyoto itinerary. The public completion assertion is a published
`expert_templates`/ready-made listing owned by that account with at least one
itinerary day. For the event planner, use
`persona-kyoto-event-planner` and assert the event-planner role-specific saved
plan/workspace without treating it as a travel-expert account.

### `supply-provider.spec.ts`

1. Log in as `persona-kyoto-provider`.
2. Open the provider console with `data-testid="link-provider-console"`.
3. Complete/save provider profile and verification using the visible provider
   flow; prove the form row and user profile state in the DB.
4. Create two services with the live service form selectors:
   `service-name`, `service-description`, `service-price`,
   `service-duration`, and `service-currency` when present.
5. Assert both `provider_services` rows are owned by the provider and start in
   the product’s normal approval state.
6. Save availability using the calendar UI and assert the corresponding
   `vendor_availability_slots` rows.
7. Submit/publish via UI and assert approved/active rows plus public
   service-detail links (`link-service-<id>` or the corresponding stable
   service-card test ID).
8. Repeat and assert no duplicate services or availability slots.

### `journey-guest.spec.ts`

1. Start a clean signed-out context.
2. Open the Kyoto discover/feed route.
3. Assert public content selectors: `text-page-title`,
   `card-service-*`, `card-expert-*`, and the ready-made listing link/card when
   the manual supply pass has published it.
4. Attempt a protected action such as `button-add-to-cart-*` or the relevant
   booking CTA.
5. Assert the sign-in control/prompt appears and the browser remains usable
   after dismissal; assert no 500 response is used as an authentication
   fallback.
6. Assert no authenticated-only console link or private trip data is present.

### `journey-traveler.spec.ts`

1. Log in as `persona-kyoto-free-traveler`.
2. Create or select a Kyoto trip through the traveler UI; use
   `button-create-new`, `input-search`, and the visible trip form controls
   rather than direct trip inserts.
3. Browse the Kyoto expert/service surfaces and assert
   `text-page-title`, `card-expert-*`, `card-service-*`, and the selected
   service CTA.
4. Add a service with `button-add-to-cart-<serviceId>` and assert the cart
   state. Query the cart/booking row by the logged-in traveler id.
5. At checkout, refuse to continue unless the configured Stripe secret key is
   test mode. Use the existing Stripe test helper/card path; never send a live
   card or live-key request.
6. Complete the test checkout and assert the UI confirmation plus the
   `service_bookings`/payment linkage in the development DB.
7. Repeat with `persona-kyoto-trip-pass`: purchase the real Trip Pass on that
   persona's own trip through `POST /api/trips/:tripId/trip-pass/purchase` +
   `.../purchase/confirm` (migration 262), gated on Stripe test mode like the
   free traveler's checkout leg. A real `sk_test_` key runs the full positive
   path and asserts the `trip_entitlements` row (`status='active'`,
   `source_payment_id` set to the confirmed PaymentIntent id) plus the
   one-active-pass-per-trip rejection on a second purchase attempt; a stub
   key asserts the honest negative (purchase fails, zero `trip_entitlements`
   rows) — never a guessed row, per §19a.
8. Log in as `persona-kyoto-plus`, verify active Plus state and the seeded
   Kyoto home city, and create one occasion 14 days out through the UI. Assert the
   `plan_memberships`, `users.home_city`, and `occasions` rows plus the visible
   occasion state. Re-run and assert occasion idempotence.

## Selector notes

Selectors above are anchors already present in the application/tests or
established by the existing journey helpers. Before relying on a guessed
selector, inspect the rendered page and add a focused `data-testid` in the
product code rather than using brittle text or positional selectors. Use the
existing Playwright login pattern (`page.request.post('/api/auth/login')`) and
wait for the destination document to be ready before querying live data.

## Reporting

Each suite must emit the existing journey report shape:

```json
{
  "journey": "supply-expert",
  "steps": [
    { "n": 1, "action": "...", "ui": "...", "db": "...", "verdict": "PASS" }
  ],
  "failures": []
}
```

Mutation steps are not complete without direct DB proof. Use `PASS` only when
both UI and DB assertions hold; use `UNSUPPORTED`/`EXTERNAL` only when the
condition is explicit and documented; use `FAIL` for an unexpected product
failure. Capture screenshots at the manual-check checkpoints and on failures.

## Nightly workflow

After the four suites are implemented and proven locally, add
`.github/workflows/persona-nightly.yml` to run migrations, the development
seed, supply suites before demand suites, and publish only the concise journey
verdict tables. The workflow must fail closed if a live Stripe key is detected
and must never target production.

## Supply-pass completion — status and findings

The Lane A development supply pass stocked Kyoto (dev) with purchasable
inventory created and approved through real UI flows: two priced provider
services (Kyoto Portrait Route Planning Call $75, Gion Photo Session
Preparation Call $95, both `approved/active`) and one approved `$39`
ready-made itinerary ("Quiet Gion: A Dawn-to-Dusk Kyoto Day"). The follow-on
items below close out the pass before Lane B builds against it.

### 1. Expert persona offering still missing → `/s/kyoto-gion-expert` stays gated

`/s/kyoto-gion-expert` correctly 404s: all current inventory belongs to the
provider and planner personas, and the storefront route lists **only
admin-approved offerings and 404s when the earner has zero approved items**
(`server/routes/storefront.routes.ts` header). The Gion expert persona still
needs to publish its own consultation / "plan-with-me" offering through the
expert flow to flip the storefront public and complete the cast. (The three
expert-authored gems are a separate lane — the gem-chain PR — and are not part
of this pass.)

**Finding for the recruitment funnel — the expert flow hits the same
verification wall the providers did.** Publishing an expert offering resolves
through the single publish predicate `resolvePublishVerification`
(`server/services/publish-verification.service.ts`): for an expert role it
requires `local_expert_forms.identity_verification_status === "verified"`
(identity only; business verification is N/A for an individual expert). Until
verified, an admin-approved expert listing is held `approvalStatus='approved'
AND status='draft'` and is not active/public — the same held state providers
hit, which is why the dev-only provider verification override was created. To
complete this step in a dev environment, verify the expert form or apply the
same dev-only override extended to the expert (`local_expert_forms`) path.
Note: that dev override lane is tracked separately and is **not present on this
branch/main** — extending it to the expert path (dev-only at the server,
reason required, audited, rejected in prod/test/unset) is the prerequisite for
publishing the expert offering without real KYB.

### 2. Stock cover images are a test fixture only, never the production pattern

The dev ready-made used an attributed Unsplash cover. That is an acceptable
**dev fixture**, but it must not become the pattern: **production listings use
the creator's own real photos; stock/Unsplash covers are test-fixture-only**
(the ratified content rule is real-or-gradient for production). The first real
planner must not copy the demo's stock cover.

### 3. Canonical market string is `Kyoto`, not `Kyoto, Japan`

All supply and demand must use the canonical short market string **`Kyoto`**
(`marketKey` `kyoto`; `content-gap-taxonomy.ts` `GAP_CITY = "Kyoto"`;
`city_neighborhoods.city = "Kyoto"`; `dmo-ingestion.service.ts` `CITY =
"Kyoto"`). The long form `"Kyoto, Japan"` is the same string-matching-mismatch
class as the neighbourhood-slug bug.

Grep finding (`"Kyoto, Japan"` write paths, as of this pass): almost every hit
is free-text traveler input or a test fixture and is fine — trip
`destination` fields, form placeholders, `playwright/` fixtures, docs. The one
non-fixture DB write is `server/seeds/beta-data-extended.ts` (a **beta** expert
seed, not a Kyoto persona), which writes a provider-service `location:
"Kyoto, Japan"`; matching is tolerant in some paths
(`client/src/lib/build-formats/registry.ts` keys both `"Kyoto, Japan"` and
`"Kyoto"` to `"kyoto"`) but general destination-matching tolerance is still
an open task (#962). No production Kyoto-persona write emits the long form; the
persona seed and supply flows must keep emitting `Kyoto`.

> Environment note: the follow-on findings above were verified from the code
> (routes, the publish-verification predicate, seeds). Executing the expert
> UI supply pass end-to-end requires a live development DB + dev server, which
> a fresh remote container does not have; run it in the Lane A dev
> environment (the Replit workspace) with `scripts/seed-personas.ts`.