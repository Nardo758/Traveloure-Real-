# Provider batch exercise — a full Kyoto catalog, authored through the real console

> **SUPERSEDED FOR CURRENT STATE — historical record (Run 1).** The console was rebuilt after this run
> (Wave 3 lanes S7/S8/S9/S11 + Catalog/Workstation rebuilds, ledger rows 103–111): the P0 (A1) and findings
> B2/B3/B4b/B5/B6/B7/B8/B9/C1(part)/C9/C12/D2/D4 are **verified fixed** in
> **`PROVIDER_BATCH_EXERCISE_RUN2.md`** (Aug 14, 2026), which re-executed the full exercise at SHA `2737569`
> and is the current-state document. This file stays as-was: its findings carry this run's as-of SHA and its
> fixture DB (`traveloure_batch`) lived on a bench container that no longer exists.

**As-of SHA:** `127ffb5eb21f0c533db4c5b4da28aaed1259faa1` (branch `lane/provider-batch-exercise`, doc/asset commits only — zero product-code changes).
**Run date:** Aug 12, 2026. **Assets:** `docs/testing/assets/provider-batch/`.

One provider account was created from scratch through the real onboarding funnel, approved by a real admin
through the real queue, and then used to author **twelve listings across every product shape the platform
supports** — three place-anchored in-person services, a two-room property, a PDF artifact, a live call, an
async engagement, two bundles, and one custom-offering listing. Every listing was then followed all the way
through to the traveler-facing storefront and detail page, and every authored field was checked for arrival.
Assessment was captured while using each surface, not reconstructed afterwards.

---

## 0. Environment, identity and fixture surgery

| Item | Value |
|---|---|
| Database | **`traveloure_batch`** on this bench's local Postgres (`postgres://postgres:postgres@localhost:5432/traveloure_batch`) — deliberately **not** the default bench DB, so a concurrent session could not collide. |
| Server | `PORT=5001`, `NODE_ENV=development`, `OBJECT_STORAGE_DRIVER=memory`, `RATE_LIMIT_LOOPBACK_SKIP=1`, `STRIPE_SECRET_KEY=sk_test_dummy`. Boot applied **208/208 migrations** (`[Migrations] Done — 208 newly applied`). |
| Seeds | Fresh DB; the boot seeders produced the Kyoto market + the 5 E2E accounts. `test-admin@traveloure.test` / `TestPass123!` existed from `server/seeds/e2e-test-accounts.seed.ts` — **no fixture surgery was needed to obtain an admin.** |
| Browser | Preinstalled Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, 1440×1000 (phone pass at 390×844). |
| Provider identity | **`batch-provider-1@traveloure.test` / `BatchPass123!`** — created through `/signup`, then the real `/become-provider` funnel. No bench fixture or `{market}-{specialty}` account was touched. |

### Fixture surgery — one statement, recorded verbatim

Publishing requires `service_provider_forms.identity_verification_status = 'verified'` **and**
`business_verification_status = 'verified'` (`resolvePublishVerification`, ruling 53/56). Both are written only
by Stripe Identity and Stripe Connect. On this bench `STRIPE_SECRET_KEY=sk_test_dummy`, so the real UI path is
impossible — **attempted first and captured** (see finding **B1**, screenshot `14-verify-attempt-verify-owner-id.png`:
`POST /api/identity/create-session → 500 {"message":"Invalid JSON received from the Stripe API"}`). One
statement was then applied:

```sql
UPDATE service_provider_forms
   SET identity_verification_status = 'verified',
       business_verification_status = 'verified'
 WHERE user_id = (SELECT id FROM users WHERE email = 'batch-provider-1@traveloure.test');
-- UPDATE 1
```

Nothing else was written by hand. The **background-check** gate on risk-bearing categories was cleared through
the real admin UI (`/admin/providers` → **Mark Verified** → `PATCH /api/admin/users/:id/verification → 200`,
screenshot `15-admin-mark-verified.png`), not by SQL. Every listing, room, bundle, slot, route stop, handle and
short link below was created by driving the UI.

---

## 1. The catalog

Twelve rows. "Storefront status" is the read-path verdict — *intact* / *degraded* / *missing*.

| # | Name | Shape · delivery | Category (DB) | Band · rate | Price | Approval | Storefront | Public URL | Creation shot | Live shot |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | Nishiki & Gion Evening Food Walk | service · `in_person` | Tours & Experiences | `limited` · 0.1200 | $95 | approved / active | **degraded** (capacity, lead time, timezone, neighbourhoods, gallery dropped) | `/services/d950bbd2-7b94-4126-aba6-fbb03f698a91` | `s1-4-step4.png` | `61-public-s1-foodwalk.png` |
| S2 | Arashiyama Dawn Portrait Session | service · `in_person` | Photography & Videography | `limited` · 0.1200 | $240 | approved / active | **degraded** (same class) | `/services/f5273221-6847-4561-805c-fa28394ba953` | `s2-4-step4.png` | `61-public-s2-photo.png` |
| S3 | Obanzai Cooking Class in a Nishijin Machiya | service · `in_person` | Arts & Crafts Instruction | `moderate` · 0.0800 | $130 | approved / active | **degraded** (same class + gallery) | `/services/83f84425-5e41-4670-a94e-d37da19677a2` | `s3-4-step4.png` | `61-public-s3-cooking.png` |
| S4 | Machiya Nishijin — Two-Room Guesthouse | **property** · `pdf` (default, wrong) | *(none)* | *(none)* | Custom quote | approved / active | **degraded** (labelled "PDF guide"; no photo/policy/check-in fields exist to author) | `/services/854be453-7126-4fdb-9dcb-7c0a65f959a7` | `23-property-created.png` | `61-public-s4-property.png` |
| S4a | Garden-View Tatami Double (Tsubo-niwa) | property_room · `pdf` (default, wrong) | *(none)* | *(none)* | $185/night | approved / active | **degraded** (chip reads "PDF guide") | `/services/b388232d-cc2c-401a-8d8d-79e74494b688` | `23-property-created.png` | `61-public-s4a-room1.png` |
| S4b | Loom-Room Twin (Street Side) | property_room · `pdf` (default, wrong) | *(none)* | *(none)* | $150/night | approved / active | **degraded** (same) | `/services/1516661d-6c42-47d8-931f-2fbd57ecbe26` | `23-property-created.png` | `61-public-s4b-room2.png` |
| S5 | Nishijin Off-Hours: A Local's Neighbourhood Guide (PDF) | service · `pdf` | Tours & Experiences | `limited` · 0.1200 | $18 | approved / active | **degraded** (location chip "Unknown"; irrelevant date calendar) | `/services/997011c0-ac1e-46bb-a109-80ba2f302901` | `s5-4-step4.png` | `61-public-s5-pdf.png` |
| S6 | 60-Minute Kyoto Trip Consultation Call | service · `video` | Personal Assistance | `limited` · 0.1200 | $65 | approved / active | **degraded** (no timezone, no join method, chip "Unknown") | `/services/2cb6a3e5-9773-4e49-8723-30e6fbd86c35` | `s6-4-step4.png` | `61-public-s6-call.png` |
| S7 | Ask a Kyoto Local — Questions by Message (7 Days) | service · `async_messaging` | Tours & Experiences | `limited` · 0.1200 | $40 | approved / active | **degraded** (no SLA field exists; chip "Unknown") | `/services/4c47904d-e584-4785-a215-0f9f0ab2d83d` | `s7-4-step4.png` | `61-public-s7-async.png` |
| S8 | Machiya Restoration Walk with a Nishijin Carpenter | service (**custom offering**) · `in_person` | *(none — unresolvable)* | *(none)* | $110 | **submitted / draft — cannot publish** | **missing** (correctly: `/services/…` renders "Service Not Found") | `/services/4f4ec9d8-f823-48e7-a411-711e006b6066` | `s8-4-step4.png` | `61-public-s8-custom.png` |
| S9 | Nishijin Weekend: Food Walk + Neighbourhood Guide | **bundle** · `pdf` (default, wrong) | *(none)* | *(none)* | $105 | approved / active | **degraded** (chip "Unknown"; components unlinked) | `/services/21813fe5-d66f-429a-b44f-542035034a3c` | `s9-c-bundle-created.png` | `61-public-s9-bundle1.png` |
| S10 | Plan It, Then Walk It: Consultation + Food Walk | **bundle** · `pdf` (default, wrong) | *(none)* | *(none)* | $145 | approved / active | **degraded** (same; mixes `video` + `in_person`) | `/services/f70c2ffd-77e7-4f37-94d8-cd1566510d0e` | `s10-c-bundle-created.png` | `61-public-s10-bundle2.png` |

Bands exercised: **`limited` (0.12)** and **`moderate` (0.08)** — plus **five listings with no band at all** (F2).
Category placement is offering-derived and sometimes surprising: an *etiquette coach* (S7) lands in
**Tours & Experiences**, a *cooking class* (S3) in **Arts & Crafts Instruction**, not Food & Culinary.

**Also authored and verified:** storefront handle `@machiya-miyako-kyoto`; **5 route stops** on S1
(`service_route_points`, all honestly unlocated); **11 dated slots** across S1/S2/S3/S6 plus **60 room-nights**
(Sept 1–30 × 2 rooms); one withdrawn slot standing in for a blackout; **2 tracked short links**.

---

## 2. Assessment findings

FEATURE = is the thing I need here at all · LOGIC = does it behave correctly · WORKFLOW = does the sequence
make sense. Severity P0 (quit or lose money) → P3 (polish). Every row has a screenshot.

### P0

| # | Kind | Finding | Expected vs actual | Shot |
|---|---|---|---|---|
| **A1** | **WORKFLOW / LOGIC** | **The "don't see your offering?" custom flow produces a listing that can never be published.** Picking *Something else / not listed* sets `service_offering_type_id`, which makes Category a **locked read-only display** — and that display renders `—`, because `service_offering_types.custom_other_offering.category_key = 'custom_other'` while the `service_categories` row named "Custom / Other" has `category_key = NULL`, so `categories.find(c => c.categoryKey === o.category_key)` matches nothing (`ServiceForm.tsx:922`). `formData.categoryId` therefore stays empty, and Publish is permanently disabled ("Still needed: Category (Step 1)"). The only escape is **Change offering**, which discards the custom choice. The custom-offering *request* itself posts fine (`POST /api/me/offering-requests → 201`) and returns honest copy — "meanwhile your listing continues under Custom / Other" — which is exactly what does **not** happen. | Expected: a custom listing files under Custom / Other and publishes. Actual: it can only ever be a draft; S8 is the one listing in this catalog that never reached a traveler. | `s8-b-custom-after-request.png`, `s8-4-step4.png` |

### P1

| # | Kind | Finding | Expected vs actual | Shot |
|---|---|---|---|---|
| **B1** | **WORKFLOW** | **Verification is a hard wall with an unhelpful failure.** An admin-approved provider still cannot publish anything until Stripe Identity **and** Stripe Connect both return `verified`. That is the ratified design (ruling 53/56) and is correct — but when the call fails the applicant is shown the raw transport error **"500: `Invalid JSON received from the Stripe API`"** under a heading "Verification unavailable". A real provider is stranded with nothing to act on and no support route on the page. | Expected: a typed, actionable failure ("we couldn't reach our ID partner — try again / contact support"). Actual: a Stripe SDK parse error rendered to a business owner. | `14-verify-attempt-verify-owner-id.png` |
| **B2** | **LOGIC** | **Property, room and bundle listings are all stored as `delivery_method = 'pdf'`** — the column default — because the Workstation builders never set one. This is not internal: the storefront card for a 1912 machiya guest room reads **"PDF guide"**, and the property/bundle detail pages print the literal string `pdf`. A bundle containing an in-person food walk and a video call (S10) is also `pdf`. The same column drives the D8 completion rule and the fundamentals checks. | Expected: `property`/`property_room` → an accommodation shape; a mixed bundle → `hybrid`. Actual: everything the Workstation creates is "PDF guide" to the traveler. | `60-storefront.png`, `61-public-s4-property.png`, `61-public-s9-bundle1.png` |
| **B3** | **LOGIC** | **Traveler-facing location chip renders the literal word "Unknown"** on S5, S6, S7, S9 and S10. `provider_services.location` defaults to `'Unknown'`; the console only fills it for delivery methods that render the "Service area" input (in-person / hybrid), and the Workstation bundle builder never asks. The detail page prints the column verbatim. | Expected: no chip when there is no location (§13 honesty). Actual: a chip that asserts "Unknown" as if it were a place. | `61-public-s5-pdf.png`, `61-public-s9-bundle1.png` |
| **B4** | **FEATURE / LOGIC** | **The Kyoto market page shows none of this Kyoto provider's eleven listings — for two stacked reasons.** (a) **City scoping is a substring match on a free-text field the console does not always collect.** `GET /api/discover/location/Kyoto` returns 28 services, and **only 4 of the provider's 11 are in it** — the four whose free-text `location` happens to contain the word "Kyoto". S2 and S3 are excluded because the provider typed neighbourhoods ("Arashiyama, Sagano, Kinkaku-ji" / "Nishijin, Kamigyo-ku"); S5, S6, S7, S9 and S10 are excluded because their `location` is the literal default **`'Unknown'`** (B3). Meanwhile `provider_services.city` is **NULL on all 12 rows** and no console field anywhere sets it — the seeded Kyoto vendors carry `city='Kyoto'` written by a seeder. (b) **Even the 4 that are in the payload never render:** the **Services** spine tab draws exactly **4 cards** after a full scroll, all seeded wedding/affiliate content. And the **Stay** tab says **"No stay found in Kyoto"** while the approved 2-room machiya guesthouse with 60 published room-nights sits in the very same payload — the `property` shape is not routed into the Stay spine at all. | Expected: an approved Kyoto guesthouse appears under Kyoto → Stay; approved Kyoto services appear under Kyoto → Services. Actual: 7/11 never reach the city payload, and the 4 that do are not rendered; Stay reports Kyoto has no accommodation. | `86-kyoto-services-scrolled.png`, `87-kyoto-stay-scrolled.png` |
| **B5** | **FEATURE** | **The live-call product has no timezone, no join method and no scheduling logistics.** Selecting *Video Call* (or Phone) **removes the entire Service Logistics card** — duration-minutes, buffer, earliest/latest start, `input-service-timezone`, party size and change-cutoff all disappear (8 fields, all present for in-person). There is no join-link/meeting-URL field anywhere. A Kyoto provider selling a 09:00 call to a New York buyer cannot state which 09:00, and the buyer's page shows no time zone and no way to learn how the call happens. | Expected: a scheduled remote product keeps at least timezone + duration + how-we-connect. Actual: `!! logistics field missing:` ×8, and the public page says only "Delivery: 60 minutes / video". | `s6-2-step2.png`, `61-public-s6-call.png` |
| **B6** | **FEATURE** | **The async product has no SLA, scope or response-window field.** *Async Messaging* also drops the whole logistics card. The only place to state "replies within one Japan business day" or "7 days of access" is free text inside the description / What's Included. A buyer is promised nothing structured, and nothing the platform could enforce. | Expected: a response-time / duration-of-access / scope-limit field. Actual: prose only. | `s7-2-step2.png`, `61-public-s7-async.png` |
| **B7** | **FEATURE / LOGIC** | **The protected-deliverable upload rail has no client surface, and the field marked required is not enforced.** `POST /api/provider/services/:id/deliverable-file` (ruling 58 / R4) appears in the client **only inside a comment** — zero callers. Every provider-authored PDF is therefore necessarily a pasted, unrevokable link *(the pasted-URL half is **confirmed as known, ref punch list**)*. New here: the field is labelled **"Deliverable File URL \*"** yet S5 **published approved and live with it empty** — the amber warning ("needs a deliverable file before travelers can receive anything") never blocks, and the traveler-facing page says nothing about it. A buyer could pay $18 and receive nothing. | Expected: a `*` field blocks publish, or the listing is not sellable. Actual: it publishes, sells, and delivers nothing. | `s5-4-step4.png`, `96-edit-deliverable.png` |
| **B8** | **FEATURE** | **There is no weekly/recurring availability and no blackout affordance anywhere in the provider console.** The only primitive is one dated slot at a time (`section-catalog-availability` → date + start time + capacity). `provider-availability-manager.tsx` documents that the weekly-schedule and blackout-date sections were **removed** in the C2 repair because they were never backed by a working round-trip. A tour that runs Tue/Thu/Sat must be hand-entered date by date, and "closed for Obon" can only be expressed by *deleting* slots one at a time (done here: added 2026-09-15 then `DELETE /api/me/slots/:id → 200`). Rooms are the exception and get it right — a date-**range** publisher exists for property rooms only. | Expected: a weekly pattern generator and a blackout control (the dispatch assumed both). Actual: neither exists for services; only rooms have a range publisher. | `40-availability-filled.png`, `41-slot-before-blackout.png`, `42-slot-after-blackout.png`, `43-room-availability-dialog.png` |
| **B9** | **FEATURE** | **The property builder is missing most of what an innkeeper must state.** The whole dialog is: name, location text, optional map pin, description, and per-room `{name, price/night, units}`. There is **no** photo, cancellation policy, check-in/check-out time, house rules, amenities, guest capacity per room, bed configuration, minimum-stay or cleaning fee. The public property page consequently reads "Contact the provider about cancellations before booking" and shows no image. | Expected: enough fields to sell a room honestly. Actual: five fields, and the resulting page cannot answer "what time can I check in". | `22-property-builder-filled.png`, `61-public-s4-property.png` |
| **B10** | **LOGIC** | **Five of twelve listings resolve to no commission band.** Property, both rooms and both bundles carry `category_id = NULL`, so `service_categories.commission_band_key` is unresolvable; for provider lines `decideBandKey` then returns `defaultBandKey` (`default_commission_band_key = 'expert_standard'`, a 0.25 **expert** band) rather than a provider category band. Two of those five are the only per-night products in the catalog. No UI in the property or bundle builder asks for a category. | Expected: every sellable listing resolves a provider category band. Actual: the money rate for accommodation and bundles falls to a platform default named for a different actor. | DB block §4 |

### P2

| # | Kind | Finding | Expected vs actual | Shot |
|---|---|---|---|---|
| **C1** | **WORKFLOW** | **The traveler is told "no availability" when availability exists.** Every detail page opens its calendar on the **current** month (August 2026) and says "No availability published yet for this month. Contact the provider to check dates." — while S1 has five September slots and each room has thirty September nights. There is no "next available date" pointer and no month pre-selection. | Expected: land on the first month with slots, or say "next available: Sept 1". Actual: a live, bookable listing reads as unbookable. | `61-public-s1-foodwalk.png` |
| **C2** | **LOGIC** | **A calendar is shown for products that have no dates.** The instant-download PDF (S5) and the 7-day async engagement (S7) both render "Availability / August 2026 / Or request a date & time". | Expected: no date UI for artifact/async delivery. Actual: the same calendar as a tour. | `61-public-s5-pdf.png`, `61-public-s7-async.png` |
| **C3** | **WORKFLOW** | **New listings land at the back of browse.** `/discover?tab=services` paginates 12 per page; all eleven of this provider's listings sit on **pages 3–4 of 4**, behind the seeded catalog. They *are* reachable (corrected after a first pass suggested otherwise) and every one is findable by name search, but the default sort is not recency and a brand-new Kyoto catalog is three clicks deep on day one. The pager's next/prev buttons also expose no accessible name. | Expected: new approved listings are discoverable near the top, or a "New" sort is the default for a fresh market. Actual: page 3 of 4. | `83-browse-page1.png`, `84-browse-lastpage.png` |
| **C4** | **LOGIC** | **A second tracked link does not re-attribute.** Visiting `/r/4pe1tdjh` sets `sessionStorage.acquisitionRef = "4pe1tdjh"`; then visiting `/r/5nwr6ub6` in the same session leaves it at **`4pe1tdjh`** while the URL correctly carries `?ref=5nwr6ub6`. Both links belong to the same provider here so nothing was mis-paid — but across two providers this is first-touch-wins, and whether that is the intended rule is not stated anywhere on the surface. Clicks are counted correctly on both rows (`short_links.clicks = 2` each). Recorded as observed behaviour needing a ruling, **not** asserted as a defect. | Expected: a documented attribution rule visible to the earner. Actual: last link wins the URL, first link wins the stored ref. | `85-shortlink-foodwalk.png`, `85-shortlink-bundle1.png` |
| **C5** | **FEATURE** | **The application funnel gates on data it never records.** Step 3 refuses to advance until **Insurance** and **Licence/permit** are both ticked, and collects Tax ID, capacity, price range and amenities — but the submit payload sends none of the four, and maps the *licence* tick to a field named `infoConfirmation`. `hasInsurance` is never transmitted at all: the row has no memory that insurance was ever attested. | Expected: a required attestation is stored, so the platform can later show it was made. Actual: a blocking checkbox with no persistence and a semantic mis-map. | `06-onboard-step3-attestations.png`, DB block §4 |
| **C6** | **FEATURE** | **The admin review card shows a fraction of the application.** The pending-application card renders name, email, date, business type, location, service categories and a truncated description — not phone, website, registration number, tax ID, capacity, price range, amenities or the attestations. An admin approving a Kyoto business cannot see the registration number the applicant was required to supply. | Expected: review surface shows what review needs. Actual: seven fields of fifteen. | `09-admin-applications-queue.png` |
| **C7** | **WORKFLOW** | **The neighbourhood picker is a global list.** Step 2 lists every neighbourhood for **all ~20 launch cities** (Bali → Tokyo), unsearchable and unscoped, so a Kyoto provider scrolls past Bogotá and Marrakech to reach Nishijin. Nothing scopes it to the market the provider registered in. | Expected: scoped to the provider's market, or searchable. Actual: a global alphabetical wall. | `s1-2-step2.png` |
| **C8** | **LOGIC** | **"Save Draft" writes `approval_status = 'submitted'`.** The provider draft save (S8) returned `approvalStatus: submitted, status: draft` — the migration-111 born-submitted default (a documented design choice) — so a private, unfinished draft is already sitting in the admin review queue while its owner is told it is a draft. | Expected: a draft is not in the review queue, or the copy says it is. Actual: silently both. | `s8-5-created.png` |
| **C9** | **WORKFLOW** | **Publishing does not leave the form.** After a successful publish the wizard stays on `/provider/services/new` (URL unchanged 3.5 s later) rather than returning to the catalog. On a batch of ten this reads as "did that work?" every single time. | Expected: land on the catalog with the new listing highlighted. Actual: same blank-ish form. | `s1-5-created.png` |
| **C10** | **FEATURE** | **Gallery images are write-only.** `gallery_images` is stored (S1, S3 each carry one) but the public detail page renders exactly **one** `<img>` — the cover. No gallery, no lightbox, no thumbnails. | Expected: authored gallery appears somewhere a traveler looks. Actual: nowhere. | `61-public-s1-foodwalk.png` |
| **C11** | **LOGIC** | **The default pricing model for a photography offering is "Package tiers", with no base price field** — a provider who wants one flat price must first discover the Pricing Model select and change it. Not wrong, but it is the only offering in the batch where Step 1 has no price input at all until you change a dropdown you were not told about. | Expected: a discoverable path to a flat price. Actual: silent absence of the field. | `s2-1-step1.png` |
| **C12** | **FEATURE** | **Bundle components are names, not links.** The public bundle page lists "Nishiki & Gion Evening Food Walk" and "Nishijin Off-Hours…" as plain text — no link, no price, no delivery method, no image. A buyer cannot inspect what they are buying without leaving and searching. | Expected: component cards or links. Actual: two lines of text. | `61-public-s9-bundle1.png` |

### P3

| # | Kind | Finding | Shot |
|---|---|---|---|
| **D1** | WORKFLOW | The admin override for approving an unverified applicant is a native `window.prompt()` + `alert()`. It works and it *requires* a reason (good), but it is browser chrome in an otherwise designed console, and it silently no-ops if dismissed. | `09-admin-applications-queue.png` |
| **D2** | LOGIC | On the Catalog **map view** the "Meeting pin" card renders as an empty titled box when no Maps key is configured — the picker returns `null` by design, but here it is the card's only content. The ServiceForm variant degrades honestly ("Map unavailable — your typed location is still saved"); this surface says nothing. | `32-map-pin-attempt.png` |
| **D3** | WORKFLOW | `/provider-status` renders inside the **traveler** shell (PLAN / My plans / AI planner sidebar), not the provider console, even for an approved provider. | `13-provider-status-approved.png` |
| **D4** | WORKFLOW | The Distribute "Direct link" card never displays the URL — only *Copy link* / *WhatsApp* / *Show QR*. A provider who wants to paste it into a printed flyer or read it aloud cannot see it. | `53-shortlink-nishiki-gi.png` |
| **D5** | LOGIC | Free-text **Duration** is stored in `delivery_timeframe`; the `duration` column stays NULL. Harmless today, but two columns for one concept is how the next reader gets it wrong. | DB block §4 |

### Positives — things that genuinely work

| # | What | Evidence |
|---|---|---|
| **P+1** | **§13 honesty holds under real pressure.** Five route stops were authored with no geocoder available. The console kept every one flagged **"Not on map"**, refused to invent coordinates, and the *traveler* page renders **"Route — 0 of 5 stops located"** with each stop listed and marked. Nothing was guessed onto a map. This is the single best behaviour observed. | `38-route-saved.png`, `61-public-s1-foodwalk.png` |
| **P+2** | **The catalog health rail is honest and specific.** Each card shows `Health 2/7 — no photo · no exact pin · no price · no availability · no deliverable`, and marks inapplicable checks `n/a: pin, calendar` rather than failing them. A provider can see exactly what is missing. | `93-catalog-after-approval.png` |
| **P+3** | **Cancellation policy is a real enforced band plus free text**, and the UI says so: "these windows are applied automatically… not from the notes below", with an explicit *Not declared — no policy shown to travelers* default instead of a fabricated one. Both halves reach the traveler page. | `s1-4-step4.png`, `61-public-s1-foodwalk.png` |
| **P+4** | **Attestations are method- and category-derived, and they block.** In-person listings demanded `in_person_safety_basics`; guide-titled listings demanded `title_claim_honesty` (with the correct Japanese 通訳案内士 framing); the call listing was asked for **none**. The Publish button reads "Confirmations Required" until ticked, and the card explains why. | `s1-4-step4.png`, `s6-4-step4.png` |
| **P+5** | **The draft/approval gate genuinely holds.** S8 (draft) returns "Service Not Found" on its public URL while all eleven approved listings render. Bundles refused to unlock until two components were approved ("You have 0 approved active services — bundles unlock at 2"). | `61-public-s8-custom.png`, `20-workstation-ladder.png` |
| **P+6** | **The bundle builder refuses to auto-sum** and says so — "You set the bundle's price — component prices below are shown for reference only, nothing is auto-summed" — with live component prices for reference. §14-correct and well phrased. | `s10-a-bundle-builder.png` |
| **P+7** | **Rooms are modelled properly.** Two rooms, per-night pricing, a **date-range** availability publisher that states its own semantics ("Dates already published are left untouched"), and both rooms render on the property page with `From $150 / night`. 60 room-night rows landed correctly. | `43-room-availability-dialog.png`, `61-public-s4-property.png` |
| **P+8** | **Delivery language is asked for without guessing.** "Leave blank if you would rather not say — we will not guess one for you." Stored and rendered as *Delivered in: English, 日本語*. | `s1-2-step2.png`, `61-public-s1-foodwalk.png` |
| **P+9** | **Phone width is clean.** Storefront, property and bundle at 390×844 all report `scrollWidth == clientWidth` — no horizontal overflow anywhere. | `90-phone-storefront.png`, `91-phone-property.png`, `92-phone-bundle.png` |
| **P+10** | **Short links work end to end.** `/r/4pe1tdjh → 302 → /services/<id>?ref=4pe1tdjh`, ref persisted to `sessionStorage.acquisitionRef`, `short_links.clicks` incremented. | `85-shortlink-foodwalk.png` |

---

## 3. Write-vs-read gap list

Every field authored in the console that reaches no traveler surface, or reaches one wrong.

### Authored → renders nowhere

| Field | Authored on | Where a traveler looks | Result |
|---|---|---|---|
| `party_size_min` / `party_size_max` (2–6, 1–5, 2–8) | Step 2 logistics | detail page, storefront card | **nowhere** — no group size shown for any listing |
| `lead_time` ("48 hours", "3 days", "72 hours") | Step 4 | detail page | **nowhere** |
| `change_cutoff_hours` (24/48/72) | Step 2 logistics | detail page | **nowhere** |
| `service_timezone` (`Asia/Tokyo`) | Step 2 logistics | detail page | **nowhere** — critical for S6, the call |
| `earliest_start_time` / `latest_start_time` | Step 2 logistics | detail page | **nowhere** |
| `buffer_minutes` | Step 2 logistics | detail page | **nowhere** |
| `neighborhood` (`downtown_kawaramachi`, `arashiyama`, `nishijin`) | Step 2 picker | detail page, storefront, market page | **nowhere** — only the free-text service area appears |
| `transport_provision` ("Meet at point") | Step 2 | detail page | **nowhere** — despite the field's own copy: "This is shown to travelers so they can plan" |
| `gallery_images` | Step 3 | detail page | **nowhere** — exactly one `<img>` renders |
| `content_affinity_tags` | Step 4 | — | internal by design; noted for completeness |
| Application: Tax ID, capacity, price range, amenities, **insurance attestation** | `/become-provider` steps 1+3 | admin review card, provider profile | **nowhere** — never sent to the server (C5) |

### Authored → renders wrong

| Field | Authored value | Rendered | Where |
|---|---|---|---|
| `delivery_method` on property/rooms/bundles | never asked | **"PDF guide"** / literal `pdf` | storefront cards, both detail pages (B2) |
| `location` on S5/S6/S7/S9/S10 | never asked for these methods | **"Unknown"** as a location chip | detail pages (B3) |
| `city` on all 12 | never asked | `NULL`; city scoping falls back to substring-matching `location`, so 7/11 miss the Kyoto payload and 0/11 render | market page (B4) |
| `product_shape = 'property'` + 60 room-nights | Workstation | "No stay found in Kyoto." | `/city/kyoto` → Stay (B4b) |
| Availability (11 slots + 60 room-nights, all September) | authored | "No availability published yet for this month" | detail pages, August view (C1) |
| Bundle components | 2 approved services each | plain unlinked text | bundle pages (C12) |

---

## 4. DB verification block

All reads against `traveloure_batch`. Provider `user_id = 82373a50-ccc4-453c-804b-5b93d886bb7a`.

**Per-service coherence** (price · category · band · status) — matches the storefront in every case except where
noted above:

```
                  id                  |                   service_name                    | price  | pricing_unit |         category          |   band   |  rate  | delivery_method |     shape     | approval | status
 d950bbd2-7b94-4126-aba6-fbb03f698a91 | Nishiki & Gion Evening Food Walk                  |  95.00 |              | Tours & Experiences       | limited  | 0.1200 | in_person       | service       | approved | active
 f5273221-6847-4561-805c-fa28394ba953 | Arashiyama Dawn Portrait Session                  | 240.00 |              | Photography & Videography | limited  | 0.1200 | in_person       | service       | approved | active
 83f84425-5e41-4670-a94e-d37da19677a2 | Obanzai Cooking Class in a Nishijin Machiya       | 130.00 |              | Arts & Crafts Instruction | moderate | 0.0800 | in_person       | service       | approved | active
 997011c0-ac1e-46bb-a109-80ba2f302901 | Nishijin Off-Hours … (PDF)                        |  18.00 |              | Tours & Experiences       | limited  | 0.1200 | pdf             | service       | approved | active
 2cb6a3e5-9773-4e49-8723-30e6fbd86c35 | 60-Minute Kyoto Trip Consultation Call            |  65.00 |              | Personal Assistance       | limited  | 0.1200 | video           | service       | approved | active
 4c47904d-e584-4785-a215-0f9f0ab2d83d | Ask a Kyoto Local — Questions by Message (7 Days) |  40.00 |              | Tours & Experiences       | limited  | 0.1200 | async_messaging | service       | approved | active
 4f4ec9d8-f823-48e7-a411-711e006b6066 | Machiya Restoration Walk …                        | 110.00 |              | (none)                    | (none)   | -      | in_person       | service       | submitted| draft
 1516661d-6c42-47d8-931f-2fbd57ecbe26 | Loom-Room Twin (Street Side)                      | 150.00 | per_night    | (none)                    | (none)   | -      | pdf             | property_room | approved | active
 b388232d-cc2c-401a-8d8d-79e74494b688 | Garden-View Tatami Double (Tsubo-niwa)            | 185.00 | per_night    | (none)                    | (none)   | -      | pdf             | property_room | approved | active
 854be453-7126-4fdb-9dcb-7c0a65f959a7 | Machiya Nishijin — Two-Room Guesthouse            |        |              | (none)                    | (none)   | -      | pdf             | property      | approved | active
 21813fe5-d66f-429a-b44f-542035034a3c | Nishijin Weekend: Food Walk + Guide               | 105.00 |              | (none)                    | (none)   | -      | pdf             | bundle        | approved | active
 f70c2ffd-77e7-4f37-94d8-cd1566510d0e | Plan It, Then Walk It: Consultation + Food Walk   | 145.00 |              | (none)                    | (none)   | -      | pdf             | bundle        | approved | active
```

**Room rows** — `parent_service_id = 854be453-…` on both, `pricing_unit = per_night`, `product_shape =
property_room`, both `approved`/`active`.

**Bundle links** (`bundle_components`) — positions server-derived from pick order:

```
 21813fe5-… → d950bbd2-… (pos 0, Food Walk) ; 997011c0-… (pos 1, PDF guide)
 f70c2ffd-… → 2cb6a3e5-… (pos 0, Consultation) ; d950bbd2-… (pos 1, Food Walk)
```

**Route stops** (`service_route_points`, service `d950bbd2-…`) — 5 rows, positions 1–5, **`latitude` and
`longitude` NULL on every row**, which is exactly what the UI reports:

```
 1 Nishiki Market west entrance                    | (null) | (null)
 2 Nishiki-koji covered arcade — tasting stops 2–4 | (null) | (null)
 3 Teramachi crossing & pickle counter             | (null) | (null)
 4 Shirakawa canal, Gion Shinbashi                 | (null) | (null)
 5 Pontocho alley — final skewers                  | (null) | (null)
```

**Attestations** (`service_attestations`) — 7 rows, all `affirmed_at NOT NULL`: `title_claim_honesty` on S1/S5/S7,
`in_person_safety_basics` on S1/S2/S3/S8.

**Availability** (`vendor_availability_slots`) — 71 rows:

```
 60-Minute Kyoto Trip Consultation Call      |  2 | 2026-09-07 … 2026-09-14
 Arashiyama Dawn Portrait Session            |  2 | 2026-09-04 … 2026-09-11
 Garden-View Tatami Double (Tsubo-niwa)      | 30 | 2026-09-01 … 2026-09-30
 Loom-Room Twin (Street Side)                | 30 | 2026-09-01 … 2026-09-30
 Nishiki & Gion Evening Food Walk            |  5 | 2026-09-01 … 2026-09-10
 Obanzai Cooking Class in a Nishijin Machiya |  2 | 2026-09-02 … 2026-09-09
```

(a sixth food-walk slot, 2026-09-15, was created and then deleted as the blackout stand-in — `DELETE
/api/me/slots/5e6f0ae8-2ccc-4c55-820a-6edcc8c4ac6f → 200`.)

**Short links** (`short_links`):

```
 code=4pe1tdjh  target=service d950bbd2-… (Food Walk)   clicks=2  frame=null  expires_at=null
 code=5nwr6ub6  target=service 21813fe5-… (Bundle #1)   clicks=2  frame=null  expires_at=null
```

**Provider application** (`service_provider_forms`) — `status=approved`, both verification statuses `verified`
(one is the fixture surgery in §0), `service_offers` holds all five chosen categories, `offering_type_key` NULL,
and **no column holds** tax ID, capacity, price range, amenities or the insurance attestation (C5).

---

## 5. Handoff — durable fixture inventory

This catalog is registered, prefixed and **not deleted**. It lives in the **`traveloure_batch`** database on this
bench — **not** the default bench DB, and not on any deployed environment. A future session must boot against
`DATABASE_URL=postgres://postgres:postgres@localhost:5432/traveloure_batch` to see any of it.

| Item | Value |
|---|---|
| Provider login | `batch-provider-1@traveloure.test` / `BatchPass123!` (role `service_provider`, id `82373a50-ccc4-453c-804b-5b93d886bb7a`) |
| Admin login | `test-admin@traveloure.test` / `TestPass123!` (boot-seeded) |
| Business | Machiya & Miyako Experiences · form `da025ae5-be75-45e4-9bab-a216ea6a0feb` |
| Storefront | `/p/machiya-miyako-kyoto` |
| S1 food walk | `d950bbd2-7b94-4126-aba6-fbb03f698a91` (5 route stops, 5 slots) |
| S2 photography | `f5273221-6847-4561-805c-fa28394ba953` |
| S3 cooking class | `83f84425-5e41-4670-a94e-d37da19677a2` |
| S4 property | `854be453-7126-4fdb-9dcb-7c0a65f959a7` |
| S4a / S4b rooms | `b388232d-cc2c-401a-8d8d-79e74494b688` · `1516661d-6c42-47d8-931f-2fbd57ecbe26` (30 nights each) |
| S5 PDF guide | `997011c0-ac1e-46bb-a109-80ba2f302901` |
| S6 call | `2cb6a3e5-9773-4e49-8723-30e6fbd86c35` |
| S7 async | `4c47904d-e584-4785-a215-0f9f0ab2d83d` |
| S8 custom (draft, unpublishable) | `4f4ec9d8-f823-48e7-a411-711e006b6066` |
| S9 / S10 bundles | `21813fe5-d66f-429a-b44f-542035034a3c` · `f70c2ffd-77e7-4f37-94d8-cd1566510d0e` |
| Short-link codes | `4pe1tdjh` (S1) · `5nwr6ub6` (S9) |
| Offering request | `custom_other_offering` request row from S8's flow (`POST /api/me/offering-requests`) |

**Environment limits that shaped this run, stated plainly:** no `GOOGLE_MAPS_API_KEY` / `VITE_GOOGLE_MAPS_API_KEY`,
so the meeting-pin picker renders nothing and `POST /api/geocode` cannot resolve — **no listing in this catalog
has coordinates**, and the route-stop "Locate" affordance never appeared. That is a bench limitation, not a
product defect; what it *did* let us prove is that every downstream surface degrades honestly (P+1). Stripe is a
dummy key, so identity/Connect verification and any checkout leg were out of scope by construction. No booking,
payment, rails-pricing or waiver behaviour was exercised.

---

## 6. Could a real Kyoto provider have built this — and would a traveler trust it?

**Building it: yes, and mostly with pleasure — until the shape of the product stops matching the form.**

The offering-first wizard is the best thing here. Haruka picks *Food Market Guide* from a catalog of ~100
plain-language offerings, and the category, the risk profile, the applicable attestations and the delivery
options all follow from that one choice; she never confronts a taxonomy. The confirmations she is asked to tick
are specific to what she actually sells — the guiding-title statement carries the real 通訳案内士 framing and the
correct legal note that Japan deregulated paid guiding in 2018, which is more care than most marketplaces take.
The cancellation policy is a real enforced band with an honest "not declared" default rather than a fabricated
one. The catalog health rail tells her exactly which listing is missing a photo and which has no deliverable,
and marks the checks that do not apply as `n/a` instead of failing them. All three of her in-person products
went from empty form to live public page in one pass each.

Then the shape changes and the ground goes soft. Her consultation **call** loses all eight scheduling fields the
moment she picks *Video Call* — no timezone, no start window, no join method — so the one product whose entire
value is "we are on a call at a specific hour" is the one the platform lets her say least about. Her **async**
service has nowhere to promise a response time. Her **guesthouse** can be created in five fields, none of which
is a photograph, a check-in time or a cancellation policy, and both rooms then appear on her storefront branded
**"PDF guide"**. Her two **bundles** carry the same wrong label and a location chip that reads **"Unknown"**.
And the one thing she tried that the platform explicitly invites — *don't see your offering?* — produced a
listing that can never be published at all, because the custom offering type points at a category key that does
not exist. She would have filed a support ticket on that, and she would have been right to.

**A traveler's view: the individual pages are strong; the path to them is weak; two labels break trust.**

The food-walk page is genuinely good. It shows her verified badges, her real description, the languages she runs
it in, the meeting point twice, both halves of the cancellation policy, and — the detail that would win a careful
buyer — **"Route — 0 of 5 stops located"** with all five stops named and each honestly marked *not on map*. That
is a platform choosing to look incomplete rather than to guess, and it reads as trustworthy precisely because it
is unflattering. Phone width is clean throughout.

But the same buyer is told **"No availability published yet for this month"** on a listing with five September
dates already loaded, because the calendar opens on August and never points forward — the single most likely
reason a real booking would be lost here. If she opened Kyoto's own market page she would not find Haruka at
all — seven of the eleven listings never even enter the city payload, because city scoping substring-matches a
free-text field that is `'Unknown'` for half the catalog, and the Stay tab flatly reports that Kyoto has no
accommodation while a 2-room machiya with sixty published nights sits in the same response. If she browsed the
marketplace instead she would find her on page 3 of 4. And if she reached the guesthouse she would see a
machiya room labelled *PDF guide*
priced *from $185 / night*, with no photograph and no check-in time — a combination that reads less like a real
inn than like a listing someone abandoned halfway.

The write path is in much better shape than the read path. Everything Haruka typed was stored faithfully; a
large fraction of it simply never reaches anyone. Close the "Unknown"/"PDF guide" labels, give a listing a real
city instead of substring-matching prose, route properties into Stay, open the calendar on the first month that
has dates, and give the call and the property the fields their shapes require — and this becomes a catalog a
Kyoto host would be proud to send people to.
