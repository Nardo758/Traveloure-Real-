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
member has a manually seeded active `plus_annual` membership. There is no
`trip_entitlements` table: the Trip Pass suite must detect and report that
unsupported state rather than insert a guessed row.

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
7. Repeat with `persona-kyoto-trip-pass`. If no supported per-trip entitlement
   row exists, record `UNSUPPORTED` with the schema proof and stop that branch;
   do not manufacture `trip_entitlements`.
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

## Manual Kyoto supply pass — 2026-08-29

The development-only manual pass used the seeded personas, the live browser
flows, and the real admin queues. It did not create marketplace content with
SQL and did not touch production or Stripe payment activity.

### Result

| Requirement | Result | Direct proof |
|---|---|---|
| Gion expert application | PASS | `local_expert_forms.status = approved`, city `Kyoto`, neighbourhood `Gion` |
| `/s/kyoto-gion-expert` handle and bio | PASS (saved) | `users.handle = kyoto-gion-expert`; public route correctly remains unavailable without an approved offering |
| Three expert-authored Kyoto/Gion gems | BLOCKED | No expert-facing write path exists for feed gems; `local_knowledge_nuggets` remains `0` |
| Photographer/provider application | PASS | `service_provider_forms.status = approved` |
| Two priced provider services | PARTIAL | UI-created drafts at `$75` and `$95`; both are owned by the seeded provider |
| Provider service queue approval | BLOCKED | Final publish/submit is disabled until identity and business verification complete |
| Planner ready-made itinerary | NOT RUN | The pass stopped on the upstream supply blockers rather than bypassing product gates |
| Complete public storefront and Kyoto feed | BLOCKED | Storefront requires at least one approved offering; blocked drafts/gems cannot appear |

### UI flow and selectors observed

- Expert storefront editor:
  - `input-handle`
  - `button-save-handle`
  - `input-storefront-bio`
  - `button-save-bio`
- Local-expert application:
  - route must include `?type=local_expert`; `/expert/apply` alone defaults to
    the Trip Planner wizard even for a signed-in `local_expert`
  - `input-local-city`, `input-neighborhood`
  - `button-locality-resident_5yr`
  - `badge-language-english`, `badge-language-japanese`
  - `textarea-knowledge-proof-0..2`
  - `button-local-specialty-*`, `badge-service-*`
  - `select-availability`, `select-response-time`, `input-hourly-rate`
  - `checkbox-terms`, `button-submit`
- Expert admin approval:
  - `card-application-<id>`
  - `button-approve-<id>`
  - approving an identity-unverified development persona requires the real
    browser prompt and a non-empty override reason
- Provider application:
  - `select-business-type`, `button-category-*`
  - `checkbox-insurance`, `checkbox-license`, `checkbox-terms`
  - Admin Providers opens on the Platform tab; click
    `button-tab-applications` before locating `card-application-<id>`
  - approval also requires a non-empty verification override reason
- Provider service authoring:
  - `button-choose-offering`, `input-offering-search`
  - `option-offering-couples_photographer`
  - `method-tile-video-call`
  - this offering uses package tiers, not `input-base-price`:
    `button-add-tier`, `input-tier-label-0`, `input-tier-price-0`,
    `input-tier-desc-0`
  - `button-save-draft` successfully persists the priced listing
  - `banner-identity-biz-verification-required` blocks final publication

### Source-linked findings

1. **Experts cannot author feed gems.** The Content Studio explicitly has no
   backend for its social content library and only persists knowledge nuggets
   (`client/src/pages/expert/content-studio.tsx:186-190`,
   `client/src/pages/expert/content-studio.tsx:236-248`). The TravelPulse
   hidden-gem surface is read-only (`server/routes/content.routes.ts:5142-5154`);
   the only discovered-gem write trigger is an admin-only AI scan
   (`server/routes/content.routes.ts:7603-7617`). Therefore creating three
   expert-owned Gion gems through product flows is unsupported.
2. **Provider listings cannot reach the approval queue without external
   verification.** The service form derives `idVerified` and `bizVerified`
   from the provider application and renders the blocking verification banner
   (`client/src/components/ServiceForm.tsx:1756-1764`,
   `client/src/components/ServiceForm.tsx:1888-1889`,
   `client/src/components/ServiceForm.tsx:2685`). The two services were saved
   as drafts instead of bypassing this gate.
3. **Local-expert AI scoring failed during submission.** The saved application
   records the model error ``temperature` is deprecated for this model``.
   The scorer still sends `temperature: 0`
   (`server/services/expertise-scoring.service.ts:180`). The application can
   be reviewed as `unscored`, but automated knowledge scoring did not run.
4. **A claimed storefront is intentionally not public without approved
   supply.** The handle editor tells users that the page goes live only after
   at least one approved offering
   (`client/src/components/backoffice/handle-claim-card.tsx:123-124`).

### Screenshots

Screenshots are under `docs/testing/screenshots/kyoto-persona/`:

- `01-expert-storefront-handle.png`
- `02-expert-application-review.png`
- `03-expert-application-pending.png`
- `04-admin-expert-approval-queue.png`
- `05-admin-expert-approved.png`
- `06-provider-application-review.png`
- `07-provider-application-pending.png`
- `08-admin-provider-approval-queue.png`
- `09-admin-provider-approved.png`
- `10-provider-service-1-priced-draft.png`
- `10-provider-service-2-priced-draft.png`
- `10-provider-service-form-blocked.png`
- `11-provider-service-1-saved.png`
- `11-provider-service-2-saved.png`
- `12-gion-storefront-public-state.png`
- `13-kyoto-feed-final-state.png`