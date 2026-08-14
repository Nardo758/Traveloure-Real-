# Provider batch exercise — Run 2: the same catalog, on the rebuilt console

**As-of SHA:** `273756935dd3ddbb7d9103810137d9bbdc73fd26` (branch `claude/provider-console-batch-exercise-viater`, doc/asset commits only — zero product-code changes).
**Run date:** Aug 14, 2026. **Assets:** `docs/testing/assets/provider-batch-run2/` (147 screenshots).
**Run 1:** `docs/testing/PROVIDER_BATCH_EXERCISE.md` (Aug 12, SHA `127ffb5` — kept intact as the historical record).

Two days after Run 1, four lanes landed on exactly the surfaces this exercise probes — **S7** availability
model (migration 210), **S8** property-builder fields (211), **S9** session/async fields + joinLink (212),
**S11** stay booking (213) — plus the Catalog and Workstation rebuilds from the ratified mock (ledger rows
110–111). Run 1's biggest findings were therefore stale the day after they were filed. This run re-executes
the full dispatch against the rebuilt console: a fresh hermetic provider, twelve listings across every product
shape, the full approval arc, availability (including the weekly-pattern and blackout affordances Run 1 found
missing), tracked short links, and the complete traveler-side read-path verification.

**Headline: the platform closed its P0 and six of its ten P1s in two days.** The custom-offering dead end
(Run 1's A1, the one P0) is fixed — the custom listing published and sells. The deliverable gate now blocks;
the call has a timezone and a concealed join link; async has a real SLA; weekly patterns and blackouts exist
and materialize correctly; the property builder grew every innkeeper field Run 1 listed as missing, and all of
them render to the traveler. The biggest survivors: **five of twelve listings still resolve no commission
band**, and the **approval notification promise is still not kept**.

---

## 0. Environment, identity and fixture surgery

| Item | Value |
|---|---|
| Database | **`traveloure_batch2`** on this bench's local Postgres (`postgres://postgres:postgres@localhost:5432/traveloure_batch2`) — fresh; boot applied **214/214 migrations** including 210–213. |
| Server | `PORT=5001`, `NODE_ENV=development`, `OBJECT_STORAGE_DRIVER=memory`, `RATE_LIMIT_LOOPBACK_SKIP=1`, `STRIPE_SECRET_KEY=[REDACTED_STRIPE_TEST_KEY]`. |
| Seeds | Boot seeders produced the Kyoto market + E2E accounts; `test-admin@traveloure.test` / `TestPass123!` boot-seeded — no fixture surgery to obtain an admin. |
| Browser | Preinstalled Chromium (`/opt/pw-browsers/chromium-1194`), 1440×1000; phone pass at 390×844. |
| Provider identity | **`batch-provider-1@traveloure.test` / `BatchPass123!`** — created through `/signup` + the real `/become-provider` funnel. No bench fixture or `{market}-{specialty}` account touched. |

### Fixture surgery — one statement, recorded verbatim

The real Stripe Identity path was attempted first and captured: `POST /api/identity/create-session → 500
{"message":"Invalid JSON received from the Stripe API"}` (`21-verify-attempt-result.png` — stub-key sandbox;
the raw-error presentation is finding **R1**). Then, exactly as documented in Run 1:

```sql
UPDATE service_provider_forms
   SET identity_verification_status = 'verified',
       business_verification_status = 'verified'
 WHERE user_id = (SELECT id FROM users WHERE email = 'batch-provider-1@traveloure.test');
-- UPDATE 1
```

Nothing else was written by hand. The background-check gate was cleared through the real admin UI
(`/admin/providers` → **Mark Verified** → `PATCH /api/admin/users/:id/verification → 200`,
`23-admin-mark-verified.png`). The application itself was approved through the real queue
(`18-admin-applications-tab.png`, `19-after-approve.png`); the unverified-applicant override is still a
`window.prompt`, but it now names exactly which verifications are incomplete before demanding a reason.
Every listing, room, bundle, pattern, blackout, slot, route stop, handle and short link below was created by
driving the UI.

---

## 1. The catalog

Twelve rows, all authored through the console, all approved through the real queue. "Storefront" is the
read-path verdict: **intact** / degraded / missing.

| # | Name | Shape · delivery | Category (DB) | Band · rate | Price | Approval | Storefront | Public URL | Creation shot | Live shot |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | Nishiki & Gion Evening Food Walk | service · `in_person` | Tours & Experiences | `limited` · 0.12 | $95 | approved / active | **intact** (route 0/5 honestly unlocated; party size, window, timezone, meeting point all render) | `/services/b4536db8-7…` `b4536db8-a977-44c0-a98a-9e8e6bc063de` | `s1-1-basics.png`…`s1-6-after-publish.png` | `71-public-s1.png` |
| S2 | Arashiyama Dawn Portrait Session | service · `in_person` | Photography & Videography | `limited` · 0.12 | $240 | approved / active | **intact** (but calendar says "no availability" while its one slot sits in September — R5) | `3ab1dee7-a2c0-4584-8649-0c25faafccc3` | `s2-1-basics.png` | `71-public-s2.png` |
| S3 | Obanzai Cooking Class in a Nishijin Machiya | service · `in_person` | Arts & Crafts Instruction | `moderate` · 0.08 | $130 | approved / active | **intact** (17 pattern-materialized slots render) | `27935aee-b40d-4ac8-bdcf-7f347b45c700` | `s3-1-basics.png` | `71-public-s3.png` |
| S4 | Machiya Nishijin — Two-Room Guesthouse | **property** · `in_person` | *(none)* | *(none)* | Custom quote | approved / active | **intact-minor** (check-in/out, house rules, amenities, gallery, cancellation text all render; "Custom quote" price box beside priced rooms — R10) | `99c05556-02e0-4b2a-9305-f4f9f194f55e` | `37-property-filled.png`, `41-property-details-filled.png` | `71-public-s4-property.png` |
| S4a | Garden-View Tatami Double (Tsubo-niwa) | property_room · `in_person` | *(none)* | *(none)* | $185/night | approved / active | **intact** (per-night price, S11 stay widget; inherited house rules not shown on room page — R13) | `dda83357-94eb-4ecf-91c7-baa8f09b8e6c` | `38-property-created.png` | `71-public-s4a-room1.png` |
| S4b | Loom-Room Twin (Street Side) | property_room · `in_person` | *(none)* | *(none)* | $150/night | approved / active | **intact** (same) | `d076096f-cbf5-4912-86bf-025cb1265c14` | `38-property-created.png` | `71-public-s4b-room2.png` |
| S5 | Nishijin Off-Hours: A Local's Neighbourhood Guide (PDF) | service · `pdf` | Tours & Experiences | `limited` · 0.12 | $18 | approved / active | **intact** (no location chip; deliverable gated at publish; date calendar still renders for a PDF — R11) | `8a04b48c-5559-4698-8fcb-873f4499b8f5` | `s5-2b-deliverable-filled.png` | `71-public-s5-pdf.png` |
| S6 | 60-Minute Kyoto Trip Consultation Call | service · `video` | Personal Assistance | `limited` · 0.12 | $65 | approved / active | **intact** (timezone + window + party size render; join link stripped from public API — by design) | `d240b535-32d4-4205-9edf-68f7dcdac51f` | `s6-8-session-details-filled.png` | `71-public-s6-call.png` |
| S7 | Ask a Kyoto Local — Questions by Message (7 Days) | service · `async_messaging` | Tours & Experiences | `limited` · 0.12 | $40 | approved / active | **intact** ("Replies within 1 day" + full scope statement render) | `4d92efb7-4a59-47b3-be58-9d1e6270f1e9` | `s7-8-async-details-filled.png` | `71-public-s7-async.png` |
| S8 | Machiya Restoration Walk with a Nishijin Carpenter | service (**custom offering**) · `in_person` | **Custom / Other** | `moderate` · 0.08 | $110 | **approved / active — LIVE** | **intact** (Run 1's never-publishable P0 is closed; renders on the Kyoto city page with a Book button) | `ab9bac28-1d9d-446b-a158-3cfa9d6f2498` | `s8-2-request-submitted.png`, `s8-4-review.png` | `71-public-s8-custom.png` |
| S9 | Nishijin Weekend: Food Walk + Neighbourhood Guide | **bundle** · `hybrid` | *(none)* | *(none)* | $105 | approved / active | **intact** (components are linked cards with method chips) | `8e35d641-4e80-4535-81a5-9d6a5934ee5d` | `s9-a-filled.png` | `71-public-s9-bundle.png` |
| S10 | Plan It, Then Walk It: Consultation + Food Walk | **bundle** · `hybrid` | *(none)* | *(none)* | $145 | approved / active | **intact** (same) | `a47ad74c-cae1-43d8-bc72-5178b1941454` | `s10-a-filled.png` | `71-public-s10-bundle.png` |

Bands exercised: `limited` (0.12), `moderate` (0.08) — and **five listings still resolve no band** (R2).
Offering→category placement: cooking class → Arts & Crafts Instruction, etiquette coach → Tours &
Experiences (same surprising-but-consistent placements as Run 1); the custom offering now lands in a real
**Custom / Other** category that resolves a real band.

**Also authored and verified:** storefront handle `@machiya-miyako-kyoto` (Settings → claim,
`64-handle-claimed.png`); **5 route stops** on S1 (all honestly unlocated); **weekly patterns** S1 Tue/Thu/Sat
17:00–20:00 ×6 and S3 Wed/Sun 10:00–13:30 ×6, materialized to 24 and 17 dated slots; **one blackout**
Sept 22–23 on S1 (its pattern-Tuesday Sept 22 was correctly *not* materialized); **60 room-nights**
(Sept 1–30 × 2 rooms via the room date-range publisher); 2 hand-dated slots (S2, S6); **2 tracked short
links** (`rwv79war` → S1, `hl2152ff` → S9).

---

## 2. Assessment findings

FEATURE = is the thing I need here at all · LOGIC = does it behave correctly · WORKFLOW = does the sequence
make sense. Severity P0 (quit or lose money) → P3 (polish). Run-1 cross-references in brackets.

### P0

None found. Run 1's A1 (custom-offering dead end) is **verified fixed**: the "Don't see your offering?
Request it" flow posts the request (`POST /api/me/offering-requests → 201`), files the listing under a real
**Custom / Other** category, and the listing published, was approvable, resolves a `moderate` band, and
renders publicly (`s8-2-request-submitted.png`, `71-public-s8-custom.png`).

### P1

| # | Kind | Finding | Expected vs actual | Shot |
|---|---|---|---|---|
| **R2** | **LOGIC** | **Five of twelve listings still resolve no commission band** [Run 1 B10 — unchanged]. Property, both rooms and both bundles carry `category_id = NULL`; neither the property builder nor the bundle builder asks for a category, so `service_categories.commission_band_key` is unresolvable and the money rate falls to the platform default band. The two per-night products and both bundles — the highest-ticket items in the catalog — are exactly the ones affected. | Expected: every sellable listing resolves a provider category band. Actual: the accommodation and bundle rates fall through to a default named for a different actor. | DB block §4 |
| **R3** | **WORKFLOW** | **The review promise is not kept: no notification exists anywhere after approval.** The wizard says *"you'll be notified when it's been looked at"*; ten listings were approved and nothing appeared. The bell icon (which shows an unread dot) navigates to the **Inbox**, which is bookings-only ("No bookings waiting") — the dot never resolves to anything a provider can find. The only approval signal is the Catalog pill quietly flipping to "Live". | Expected: an inbox line, a notification, or an email per decision. Actual: a promise in the wizard, a dot with no referent, and silence. | `47-notifications-open.png`, `49-catalog-live-pills.png` |
| **R4** | **LOGIC** | **Two interaction defects on the new availability drawer.** (a) The weekly-pattern **day-of-week dropdown cannot be clicked**: the Select's options render underneath the sheet's `z-[100]` overlay, which intercepts every pointer click (keyboard typeahead works, which is how this run proceeded). (b) The **first-ever pattern save returned 409** *"Patterns changed elsewhere — reload and try again"* on a service with zero stored patterns; the identical payload saved cleanly after a reload. A provider meeting either of these on their first visit to the new surface would reasonably conclude it is broken. | Expected: options clickable; first save succeeds. Actual: pointer-blocked dropdown; spurious conflict error on a fresh service. | `53-pattern-row.png`, `54-patterns-filled.png` (409 in net log), `54b-patterns-filled.png` |
| **R5** | **WORKFLOW** | **"No availability published yet for this month" still shows on listings whose slots are all in a future month** [Run 1 C1 — narrowed but alive]. The detail-page calendar opens on the current month with no next-available pointer: S2's September 4 slot renders as an August "contact the provider to check dates". S1/S3 escape only because the pattern materializer happens to start generating from tomorrow. Same for the property page, which shows no availability while its two rooms hold 60 September nights (no aggregation, and no pointer). | Expected: open on the first month with inventory, or say "next available: Sep 4". Actual: a bookable listing reads as unbookable until the traveler manually pages forward. | `71-public-s2.png`, `71-public-s4-property.png` |
| **R6** | **FEATURE / LOGIC** | **Remote and composite shapes are still invisible to the market page** [Run 1 B4a — halved, not closed]. 7/12 reach the Kyoto payload (vs 4/11 in Run 1) and — new since Run 1 — **they actually render**, with Book buttons (`76-city-services-scrolled.png`). But S5 (PDF), S6 (call), S7 (async), S9/S10 (bundles) never enter it: their `location` column still defaults to the literal `'Unknown'`, city scoping still substring-matches that free-text field, and `city` is only derived when the wizard's neighborhood step runs (in-person flows). A Kyoto-only provider's guide-to-Kyoto PDF is not findable from the Kyoto page. | Expected: a listing whose provider, subject and audience are Kyoto reaches the Kyoto page regardless of delivery method. Actual: only in-person/property shapes do. | `76-city-services-scrolled.png`, DB block §4 |

### P2

| # | Kind | Finding | Expected vs actual | Shot |
|---|---|---|---|---|
| **R7** | **LOGIC** | **The neighborhood multi-select stores only the first pick.** Step 4 offers checkbox multi-select; three were ticked for S1 (Downtown/Kawaramachi, Gion, Pontocho); the schema has a single `neighborhood` column and only the first survived. Two of three authored facts silently dropped at write time. | Expected: all picks stored (or a single-select UI). Actual: a multi-select façade over a scalar column. | `s1-4-logistics.png`, DB block §4 |
| **R8** | **FEATURE** | **The application funnel still gates on data it never records** [Run 1 C5 — partially improved]. Registration number is stored — but in a column named `gst`, while `business_registration_number` sits empty (semantic mis-map). The **required insurance attestation is still not persisted** (`has_insurance` NULL after a ticked, blocking checkbox); tax ID, capacity, price range and amenities still reach no column. New since Run 1: city/country get real fields (city is folded into `address`), and the admin card now shows ID/Business verification chips. | Expected: a blocking attestation leaves a durable record. Actual: the row still has no memory that insurance was ever attested. | `12-step3-filled.png`, DB block §4 |
| **R9** | **WORKFLOW** | **The admin application card still shows a fraction of what review needs** [Run 1 C6 — improved by the verification chips, otherwise unchanged]: name, email, date, business type, address, categories, truncated description + ID/Biz chips. Phone, website, registration number and tax ID — fields the applicant was required to enter — are not shown to the person deciding. | Expected: the review surface shows what was collected for review. Actual: seven-ish fields of fifteen. | `18-admin-applications-tab.png` |
| **R10** | **LOGIC** | **The property page's price box reads "Custom quote — contact the provider for pricing" directly above two rooms priced $150 and $185 a night.** The parent property row has no price, and the price-box component doesn't know about rooms. A generic "Contact the provider about cancellations" line also renders immediately above the provider's actual authored cancellation policy — the two statements contradict. | Expected: "From $150/night" derived from rooms; the generic cancellation line suppressed when a real policy exists. Actual: both generic lines render beside the real data. | `71-public-s4-property.png` |
| **R11** | **LOGIC** | **A dated-availability calendar still renders on products that have no dates** [Run 1 C2 — unchanged]: the instant PDF (S5) and the 7-day async engagement (S7) both show "Availability / August 2026 / No availability published yet… Or request a date & time". | Expected: no date UI for artifact/async shapes. Actual: the same calendar as a tour. | `71-public-s5-pdf.png`, `71-public-s7-async.png` |
| **R12** | **WORKFLOW** | **The global neighborhood wall persists** [Run 1 C7 — unchanged]: Step 4 lists every neighborhood of ~20 launch cities (Canggu → Yanaka), unscoped and unsearchable; Kyoto's ten sit mid-list between Jaipur and Lisbon. | Expected: scoped to the provider's market, or searchable. Actual: a global alphabetical wall. | `s1-4-logistics.png` |
| **R13** | **FEATURE** | **Room pages don't show the property-level facts the console says they inherit.** The editor states "Property-level only — rooms inherit these, there is no per-room override", but the room detail page shows neither house rules nor check-in/check-out; a traveler booking the room (the page with the actual booking widget) never sees the rules they're agreeing to. | Expected: inherited fields render on the room page (or the room page links the property). Actual: rules and times live only on the property page. | `71-public-s4a-room1.png`, `40-property-details-tab.png` |
| **R14** | **LOGIC** | **Kyoto-page cards for native listings carry an "Affiliate link" corner badge.** Our Book-on-Traveloure rows (S8, property, both rooms) each render with an "Affiliate link" chip in the card corner — mislabeling first-party inventory as partner outbound (§16 vocabulary on the wrong cards). | Expected: no affiliate badge on native listings. Actual: every native card carries one. | `76-city-services-scrolled.png` |
| **R15** | **LOGIC** | **Signup ends at a "Sign in to continue" modal even though the session is already authenticated.** `POST /api/auth/register` sets the session (verified: `/api/auth/user → 200` with the same cookie), but the post-signup redirect races the client auth state and lands on a modal demanding the credentials just chosen. | Expected: signup → authenticated landing. Actual: an authenticated user is asked to sign in. | `03-after-signup.png` |
| **R16** | **WORKFLOW** | **`/provider` (the bare console root) is a 404** ("Lost at Sea", traveler shell). Every station lives under `/provider/<station>`; the root of the namespace — the most guessable URL a provider will type — resolves to nothing. | Expected: redirect to `/provider/dashboard`. Actual: 404 page. | `24-console-landing.png` |
| **R17** | **LOGIC** | **First-touch-wins ref attribution** [Run 1 C4 — *confirmed as known, needs ruling; not re-litigated*]. Second link visit: URL carries `?ref=hl2152ff`, `sessionStorage.acquisitionRef` stays `rwv79war`. Clicks counted correctly on both rows. | (Ruling needed on intended attribution rule; both links here belong to one provider.) | `74-shortlink-bundle.png` |

### P3

| # | Kind | Finding | Shot |
|---|---|---|---|
| **R18** | WORKFLOW | Verification failure still surfaces as a raw transport error to the applicant — "500: Invalid JSON received from the Stripe API" under "Verification unavailable" [Run 1 B1; stub-key sandbox causes the failure, the presentation is the finding]. | `21-verify-attempt-result.png` |
| **R19** | WORKFLOW | `/provider-status` still renders inside the traveler shell [Run 1 D3 — unchanged]. | `20-provider-status-approved.png` |
| **R20** | WORKFLOW | The unverified-applicant approval override is still a native `window.prompt` [Run 1 D1] — though its message now names exactly which verifications are incomplete, which is better than Run 1. | `19-after-approve.png` |
| **R21** | LOGIC | The photography offering still defaults to "Package tiers" with no visible price input until the Pricing Model select is discovered [Run 1 C11 — unchanged]. | `s2-0-no-base-price.png` |
| **R22** | WORKFLOW | The become-provider wizard still loses all entered data on revisit — *confirmed as known, ref punch list (wizard persistence); not re-investigated.* | — |
| **R23** | LOGIC | Escape does not close the availability drawer (the sheet overlay stays up; the Close button works). Cosmetic but it compounds R4's clickability problem on the same surface. | `52-availability-drawer.png` |

### Positives — what the rebuild genuinely fixed (verified this run, each against its Run-1 finding)

| # | What | Run 1 ref | Evidence |
|---|---|---|---|
| **P+1** | **The custom-offering flow works end to end.** Request posts, listing files under Custom / Other, publishes, approves, resolves a real band, renders publicly and on the city page with a Book button. | **A1 (P0)** | `s8-*`, `71-public-s8-custom.png`, `76-city-services-scrolled.png` |
| **P+2** | **The deliverable gate blocks.** A `pdf` listing cannot be submitted without a deliverable ("Still needed … Deliverable file (upload or link)"); the card is honest about pasted-link risk ("we can't revoke it — use a link you're willing to rotate") and documents the protected-upload path (save draft → reopen → upload). | **B7** | `s5-5-review.png` (blocked state), `s5-2b-deliverable-filled.png` |
| **P+3** | **The call product has real session logistics**: timezone (+detect), earliest/latest window, cutoff, party size, and a join-link field whose copy — "Shown to the traveler only after their booking is confirmed — never before" — is enforced: the public API response contains no `joinLink`. | **B5** | `s6-8-session-details-filled.png`, API check §4 |
| **P+4** | **Async has a structured SLA**: `responseWindowHours` + a scope statement ("the promise a traveler can hold you to"), and both render on the traveler page ("Replies within 1 day" + Included/Not-included). | **B6** | `s7-8-async-details-filled.png`, `71-public-s7-async.png` |
| **P+5** | **Weekly patterns + blackouts exist and the materializer is correct**: Tue/Thu/Sat ×6 produced 24 dated slots on an 8-week horizon; the Sept 22–23 blackout suppressed exactly the pattern-Tuesday that fell inside it; room date-range publishing coexists. | **B8** | `55b-patterns-saved.png`, `57-blackout-saved.png`, DB §4 |
| **P+6** | **The property builder grew the innkeeper fields** — cover + gallery, check-in/out, house rules (with an explicit inheritance statement), amenities, cancellation text — **and every one renders on the property page**. | **B9** | `41-property-details-filled.png`, `71-public-s4-property.png` |
| **P+7** | **Delivery-method labels are honest everywhere**: property/rooms born `in_person`, mixed bundles born `hybrid`; no "PDF guide" on a guest room, no literal `pdf` anywhere a traveler looks. | **B2** | storefront + detail shots |
| **P+8** | **No "Unknown" location chips** — the storefront and detail pages simply omit the chip when there is no location. (The DB default `'Unknown'` survives underneath — see R6.) | **B3** | `70-storefront-full.png` |
| **P+9** | **The Stay tab shows the guesthouse** and the city Services tab renders the listings that reach the payload. | **B4b** | `77-city-stay.png`, `76-city-services-scrolled.png` |
| **P+10** | **The write-only logistics cluster now renders**: party size ("Party size: 2–6 people"), start window ("Between 17:00 and 17:30"), timezone, lead time ("Book at least 1 day ahead"), meeting point. Run 1's biggest write-vs-read gaps are closed. | gap list | `71-public-s1.png` |
| **P+11** | **Publish leaves the form** — the wizard redirects to the listing's home (checklist hub) with status visible; the hub's copy is exemplary ("rows navigate to the surface that owns the work; nothing here ticks itself"; "a listing with no slots can be approved and still sell nothing"). | **C9** | `s1-6-after-publish.png`, `32-s1-edit-page.png` |
| **P+12** | **Bundle components are linked cards** with thumbnails and method chips, under the honest "not a sum" note. | **C12**, P+6(r1) | `71-public-s9-bundle.png` |
| **P+13** | **The Direct-link card displays the URL** it generates (plus Copy/WhatsApp/QR), and short links resolve end to end: `/r/rwv79war → /services/<S1>?ref=rwv79war`, ref persisted, clicks counted. | **D4**, P+10(r1) | `65-shortlink-foodwalk.png`, `74-shortlink-foodwalk.png` |
| **P+14** | **§13 honesty scaled up**: the map workspace states "Services without a confirmed location stay off the map — nothing is dropped on the city centre"; the route card explains connectors are "sequence, not travel routing — no distance or duration is invented"; 5 unlocated stops render to the traveler as "Route — 0 of 5 stops located". | P+1(r1) | `31-catalog-map-view.png`, `71-public-s1.png` |
| **P+15** | **The dynamic step rail explains itself** — "5 steps for this delivery method… because this one happens somewhere" / "3 steps… the Logistics step never appears" — what Run 1 experienced as fields silently vanishing is now stated design. | B5/B6 context | `s1-0-offering-picked.png`, `s5-*` |
| **P+16** | **Phone width stays clean** (storefront, property, bundle at 390×844: no horizontal overflow), and the review-before-live promise, verification banner, and "This screen is enough to save" draft note make the wizard's contract explicit up front. | P+9(r1) | `80-phone-*.png` |

---

## 3. Write-vs-read gap list

Dramatically shorter than Run 1's. Every field authored in the console that still fails to reach a traveler:

| Field | Authored on | Result |
|---|---|---|
| `neighborhood` picks beyond the first | wizard step 4 multi-select | **dropped at write** — scalar column (R7); and even the stored one renders nowhere traveler-facing |
| Insurance attestation, tax ID, capacity, price range, amenities | `/become-provider` | **never persisted** (R8) — unchanged from Run 1 |
| Registration number | `/become-provider` | persisted **into `gst`**; `business_registration_number` empty; not shown to the approving admin (R8/R9) |
| House rules + check-in/out on **room** pages | property Details tab | render on the property page only — the room page (the one with the booking widget) shows neither (R13) |
| `location` for remote shapes | never asked (by design for these methods) | column keeps literal `'Unknown'` → excluded from city scoping (R6); suppressed from display (good) |
| Duration for video call | "How long does it take?" (`delivery_timeframe` "60 minutes") | renders only inside prose/`Delivery` line; not structured on the session card — minor |
| `content_affinity_tags` | step 5 | internal by design; noted for completeness |

Formerly on this list and now **closed**: party size, start window, timezone, cutoff, lead time, meeting
point/transport, gallery (property), check-in/out, house rules, amenities, cancellation text, response window,
scope statement, bundle component identity, route stops, delivery languages.

---

## 4. DB verification block

All reads against `traveloure_batch2`. Provider `user_id = 4e9e0dca-7f7a-4d70-a488-5a705a4c0bdc`.

**Per-service coherence** (price · category · band · rate · method · shape · status) — every row matches what
the storefront and detail pages display:

```
    id    |                    name                    | price  |   unit    |         category          |   band   |  rate  |     method      |     shape     | approval | status
----------+--------------------------------------------+--------+-----------+---------------------------+----------+--------+-----------------+---------------+----------+-------
 b4536db8 | Nishiki & Gion Evening Food Walk           |  95.00 |           | Tours & Experiences       | limited  | 0.1200 | in_person       | service       | approved | active
 3ab1dee7 | Arashiyama Dawn Portrait Session           | 240.00 |           | Photography & Videography | limited  | 0.1200 | in_person       | service       | approved | active
 27935aee | Obanzai Cooking Class in a Nishijin Machiy | 130.00 |           | Arts & Crafts Instruction | moderate | 0.0800 | in_person       | service       | approved | active
 d076096f | Loom-Room Twin (Street Side)               | 150.00 | per_night | (none)                    | (none)   |        | in_person       | property_room | approved | active
 99c05556 | Machiya Nishijin — Two-Room Guesthouse     |        |           | (none)                    | (none)   |        | in_person       | property      | approved | active
 dda83357 | Garden-View Tatami Double (Tsubo-niwa)     | 185.00 | per_night | (none)                    | (none)   |        | in_person       | property_room | approved | active
 d240b535 | 60-Minute Kyoto Trip Consultation Call     |  65.00 |           | Personal Assistance       | limited  | 0.1200 | video           | service       | approved | active
 4d92efb7 | Ask a Kyoto Local — Questions by Message ( |  40.00 |           | Tours & Experiences       | limited  | 0.1200 | async_messaging | service       | approved | active
 8a04b48c | Nishijin Off-Hours: A Local's Neighbourhoo |  18.00 |           | Tours & Experiences       | limited  | 0.1200 | pdf             | service       | approved | active
 ab9bac28 | Machiya Restoration Walk with a Nishijin C | 110.00 |           | Custom / Other            | moderate | 0.0800 | in_person       | service       | approved | active
 8e35d641 | Nishijin Weekend: Food Walk + Neighbourhoo | 105.00 |           | (none)                    | (none)   |        | hybrid          | bundle        | approved | active
 a47ad74c | Plan It, Then Walk It: Consultation + Food | 145.00 |           | (none)                    | (none)   |        | hybrid          | bundle        | approved | active
```

**City / location** (drives R6): `city='Kyoto'` on S1/S2/S3 only (derived from the wizard's neighborhood
step); NULL on the other nine. `location` holds real text on the six in-person/property rows and the literal
default **`'Unknown'`** on S5/S6/S7/S9/S10 — which is exactly the set missing from the Kyoto payload (7/12
present).

**Property fields** (S4): `check_in_time 15:00`, `check_out_time 10:30`, house rules text, `amenities`
`["Pocket WiFi","Cedar bath (shared)","Courtyard garden","Tea service","Futon bedding"]`, cancellation text,
cover + 2 gallery URLs — all present, all rendering (`71-public-s4-property.png`).

**Session/async fields**: S6 `join_link https://zoom.us/j/9123…` (present in DB, **absent from
`GET /api/services/:id`** — strip verified), `service_timezone Asia/Tokyo`; S7 `response_window_hours 24` +
scope statement.

**Route stops** (`service_route_points`, S1) — 5 rows, positions 1–5, lat/lng NULL on every row (nothing
guessed):

```
 1 Nishiki Market west entrance | 2 Nishiki-koji covered arcade — tasting stops | 3 Teramachi crossing pickle counter
 4 Shirakawa canal, Gion Shinbashi | 5 Pontocho alley — final skewers
```

**Availability**: `service_availability_patterns` — S1 ×3 (dow 2/4/6, 17:00–20:00, cap 6), S3 ×2 (dow 3/0,
10:00–13:30, cap 6). `service_availability_blackouts` — S1 Sept 22–23. `vendor_availability_slots` — 103
rows: S1 **24** (Aug 15–Oct 10, **no Sept 22** — blackout suppressed), S3 **17**, S2 **1** (Sept 4), S6 **1**
(Sept 7), rooms **30 + 30** (Sept 1–30).

**Bundle links** (`bundle_components`, positions server-derived):

```
 8e35d641 → b4536db8 (pos 0, Food Walk) ; 8a04b48c (pos 1, PDF guide)
 a47ad74c → d240b535 (pos 0, Consultation) ; b4536db8 (pos 1, Food Walk)
```

**Short links**: `rwv79war → service b4536db8` clicks=1 · `hl2152ff → service 8e35d641` clicks=1; resolution
verified `/r/<code> → 302 → /services/<id>?ref=<code>` with `sessionStorage.acquisitionRef` set (first-touch —
R17).

**Provider application** (`service_provider_forms`): `status=approved`, both verification columns `verified`
(one is §0's fixture surgery), `service_offers` = the five chosen categories, `gst='7130001012345'` (the
registration number — R8), `business_registration_number` empty, `has_insurance` NULL (R8),
`info_confirmation=t`, `terms_and_conditions=t`.

**Offering request** (`offering_requests`): `04f03628… requestedName='Machiya restoration walk'
status='pending'` — S8 published without waiting on it (P+1).

---

## 5. Handoff — durable fixture inventory

Registered, prefixed, **not deleted**. Lives in **`traveloure_batch2`** on this bench's local Postgres —
container-local: a future session on a fresh bench must re-run this recipe (or restore from this doc's DB
block) rather than expecting the rows to exist.

| Item | Value |
|---|---|
| Provider login | `batch-provider-1@traveloure.test` / `BatchPass123!` (id `4e9e0dca-7f7a-4d70-a488-5a705a4c0bdc`) |
| Admin login | `test-admin@traveloure.test` / `TestPass123!` (boot-seeded) |
| Business | Machiya & Miyako Experiences · application `7d349692-8ac6-4fbe-9c2f-83fb241682c5` |
| Storefront | `/p/machiya-miyako-kyoto` |
| S1 food walk | `b4536db8-a977-44c0-a98a-9e8e6bc063de` (5 route stops, 3 patterns, 1 blackout, 24 slots) |
| S2 photography | `3ab1dee7-a2c0-4584-8649-0c25faafccc3` (1 slot Sept 4) |
| S3 cooking class | `27935aee-b40d-4ac8-bdcf-7f347b45c700` (2 patterns, 17 slots) |
| S4 property | `99c05556-02e0-4b2a-9305-f4f9f194f55e` |
| S4a / S4b rooms | `dda83357-94eb-4ecf-91c7-baa8f09b8e6c` (Garden-View $185) · `d076096f-cbf5-4912-86bf-025cb1265c14` (Loom-Room $150) — 30 nights each |
| S5 PDF guide | `8a04b48c-5559-4698-8fcb-873f4499b8f5` (deliverable URL set) |
| S6 call | `d240b535-32d4-4205-9edf-68f7dcdac51f` (join link set; stripped from public API) |
| S7 async | `4d92efb7-4a59-47b3-be58-9d1e6270f1e9` (24h window + scope) |
| S8 custom — LIVE | `ab9bac28-1d9d-446b-a158-3cfa9d6f2498` (Custom / Other, moderate band) |
| S9 / S10 bundles | `8e35d641-4e80-4535-81a5-9d6a5934ee5d` · `a47ad74c-cae1-43d8-bc72-5178b1941454` |
| Short-link codes | `rwv79war` (S1) · `hl2152ff` (S9) |
| Offering request | `04f03628-d5e8-458c-8d58-8996dbc39f6e` (pending — admin disposition unexercised) |

**Environment limits, stated plainly:** no Google Maps key, so no listing has coordinates and the pin/locate
affordances degrade (honestly — P+14); Stripe is a dummy key, so identity/Connect and any checkout leg were
out of scope by construction. No booking, payment, rails-pricing or waiver behaviour was exercised (D6's pin,
not this lane's). Discover-browse ordering (Run 1 C3) was not re-audited; name search verified working.

---

## 6. Mockup conformance (Part 3) — **BLOCKED**

The dispatch's prerequisite directory **`docs/design/provider-console-mockup/` does not exist in the repo**
(checked at `2737569`). Per the dispatch's explicit rule — *"the committed directory is the only reference;
absent means BLOCKED — do not attempt to fetch the URL or reconstruct the mockup from memory"* — Part 3 was
not attempted: no artifact URL was fetched, nothing was reconstructed, and no conformance grades are recorded.

What does exist, for Leon's disposition:

- `docs/design/catalog-rebuild/mock-reference.png` and `docs/design/workstation-rebuild/mock-reference.png` —
  single-surface mock exports the rebuild lanes worked from (ledger rows 110–111 record Catalog and
  Workstation as "rebuilt from the ratified mock"). They cover 2 of the ~12 surfaces Part 3 requires, carry no
  README stating authority scope, and were not used as a substitute here.
- This run's screenshot set (`docs/testing/assets/provider-batch-run2/`) already contains the live-side half
  of every comparison pair Part 3 calls for — Dashboard, Catalog list/map/edit, every wizard step across four
  delivery methods, the property builder, the availability drawer, Calendar, Inbox, Money, Distribute,
  Settings, the storefront and detail pages, at desktop and phone widths — so once the mockup export is
  committed, Part 3 is a comparison pass over existing assets, not a re-drive of the console.

*(The above was the state at first publish. The decision-maker then supplied the artifact URL and directed
its use — the export now exists and Part 3 follows.)*

## 6b. Mockup conformance — graded against the exported click-through mock

The mock (`d1c16852-4f7e-483b-916c-fe00ce7e5a76`, "Provider console — service creation redesign") was
exported to **`docs/design/provider-console-mockup/`** — `mockup.html` (self-contained, clickable) + 20
per-view screenshots + a README stating authority scope — and Part 3 was run as a comparison pass against
this run's live screenshots.

**Headline: the live console was visibly built FROM this mock.** The shell matches element-for-element (same
three sidebar groups, same eleven stations, Distribute present); the create flow's method-derived step rails
match **verbatim** — In person → `Basics / Scheduling / Capacity / Logistics / Review & submit`, Video →
`Session details`, Async → `Async details`, PDF → `What they get` — and the mock's signature copy ("rows
navigate, they do not tick", the §13 route-connector language, "Measurement stays on Performance") appears in
the build nearly word-for-word. Divergences cluster in two places: surfaces where a **later ratified ruling**
moved past the mock (availability's form, the property builder's scope), and the mock's **self-labelled
proposals** (gaps #1/#2/#17/#18), which are Leon's to ratify, not build defects. Two genuine BUILD-GAPs
matter: the Logistics consolidation is half-done, and autosave was never built.

### Conformance matrix

Desktop 1440px throughout (the mock is a fixed desktop shell — no phone-width claims to grade; the live phone
pass is §2 P+16). Mock refs: `docs/design/provider-console-mockup/mock-*.png`; live refs:
`docs/testing/assets/provider-batch-run2/*.png`.

| Surface | Grade | Mock ↔ live | One-line delta |
|---|---|---|---|
| Console shell / sidebar | **MATCH** | `mock-01` ↔ `30-catalog-list` | WORK/BUSINESS/ACCOUNT groups, all 11 stations, order identical; Distribute (the mock's one proposed nav entry) is built and live. |
| Catalog — list | **MATCH** + BUILD-AHEAD | `mock-01`, `mock-13` (top) ↔ `30-catalog-list` | Card anatomy identical (thumb · name · method·place·price · status pill · storefront toggle · health note · Availability → · Promote this → · Edit); build adds Manage/Preview modes and the CARD SHOWS block (price toggle, Instant/Request/Hidden) the mock never drew. |
| Catalog — map view | **MATCH** | mock's Aug-12 note: authoring on Logistics, Catalog read-only ↔ `31-catalog-map-view` | Both agree post-ruling; live's honesty copy ("nothing is dropped on the city centre") exceeds the mock's. |
| Workstation (one door) | **MATCH** | `mock-03-workstation` ↔ `27-workstation` | Headline + 3-tile ladder + category quick-start verbatim; mock's Property tile still reads "gap #1 — builder not yet specified" while the build has a real builder → that half **MOCKUP-STALE**. |
| Create — Basics/Scheduling/Capacity | **MATCH** | `mock-04/05/06` ↔ `s1-1-basics`, `s1-2-scheduling`, `s1-3-capacity` | Step rails and the self-explaining step-count note match verbatim; field sets align (duration, earliest/latest, timezone, cutoff, party min/max). |
| Create — Logistics (map canvas) | **BUILD-GAP (P2)** + MOCKUP-STALE | `mock-07-create-step4-logistics` ↔ `33-s1-logistics-step`, `s1-4-logistics` | Mock's core idea — *"one card, one vocabulary": six questions collapsed into one canvas + one rail* — is half-built: armed pin/stop placement, §13 connector copy and the confirm-gated pin are there, but the build **retains** the free-text Service Area and the global neighborhood wall the mock deletes (→ R7/R12), lacks the display-only travel-surcharge-zones layer, and authors route stops after save rather than in-flow. Transport: mock has one pickup toggle, build a richer 4-state control (**MOCKUP-STALE**, plausibly better). §Q1–§Q3. |
| Create — Review & submit | **MATCH** | `mock-08` ↔ `s1-5-review-filled` | Attestation gate + explicit missing-required copy in both. |
| Create — Video/Async/PDF variants | **MATCH** | `mock-10-create-{video,async,pdf}-step2` ↔ `s6-2-step`, `s7-2-step`, `s5-2-step` | Step names verbatim; join-link, response-window/scope and deliverable fields all present — the S9 lane implemented these screens. |
| Draft autosave | **BUILD-GAP (P2)** | `mock-07` ("Draft · autosaved… closing this tab keeps everything") ↔ R22 | Mock specifies autosave; build has manual Save Draft and loses wizard state on revisit (known punch-list). §Q4. |
| Listing home | **MATCH** + inventory | `mock-12-listing-home` ↔ `32-s1-edit-page` | Draft hero, plain-language checklist ("rows navigate, they do not tick" ↔ live "nothing here ticks itself"), availability-makes-it-bookable row, Pricing & fees "tune later" card: all built. Mock's rail adds Photos & media + Availability settings cards (live: checklist rows only — §Q7); mock's "Editing a live listing" split is **gap #17, a proposal** — live implements the pre-#17 blanket re-check posture (§Q8; not graded a defect). |
| Availability engine | **MOCKUP-STALE** (ratified S7 lane) + 1 felt gap | `mock-13-availability` ↔ `52-availability-drawer`, `54b/55b/56/57` | Semantics match exactly — three primitives (weekly repeats / one-off slots / subtract-only blackouts), one editor, Catalog as its home, deep-linked from rows. Form diverges: mock is a month-grid editor with a **"Next available:" chip**; the ratified S7 build is a drawer with list rows. The chip's absence is the same hole R5 found on the traveler calendar; the drawer's own R4 defects are regressions against either design. §Q5. |
| Property builder | **MOCKUP-STALE** (ratified row 102) + **BUILD-GAP (P2/P3)** | `mock-14-property-0`, `mock-15-property-*` ↔ `36/37/39/40/41` | Mock = full-page 3-step flow (gap #1, proposed); build = ratified dialog whose migration deliberately added only check-in/out + house rules + amenities. Deltas that survive the ruling: **minimum stay** absent (P2), cancellation free text vs the mock's stay-shaped band select (P3), pin/privacy card not in the dialog — though the privacy circle IS built server-side (`locationApproximate` + approximate badge on the traveler page; unobservable this run, no Maps key). §Q6. |
| Bundle builder | *(ungraded)* | mock's bundle tile is locked in its seed; no bundle view exportable | Live builder (`50-bundle-builder-blank`) matches the mock tile's contract (unlock at 2 approved, one price, no auto-sum). |
| Calendar | **MATCH** + BUILD-AHEAD | `mock-17-calendar` ↔ `81-calendar` | Both read-only month grids whose chips deep-link to the owning editor ("Nothing on this page edits anything"); build adds All/Bookings/Availability channel filters. Chip deep-link not click-verified this run. |
| Distribute | **MATCH** + 1 divergence | `mock-18-distribute` ↔ `62-distribute`, `65-shortlink-*` | Storefront card, three share frames (Feed/Story/**Route** with the same no-invented-distance note), copy-link + QR, Promote opportunities with reasons, "measurement stays on Performance": all built. Divergence: mock edits handle & bio on Distribute; build sends you to Settings (§Q9). |
| Dashboard / Inbox / Money / Customers / Performance / Settings / Playbook | **BUILD-AHEAD** | `mock-19-stub-*` ↔ `46`, `47`, `81-*`, `63` | The mock stubs all seven ("proposed structure — Distribute is the one new entry"); the build has real pages for every one. Inventory, not defects. |
| Traveler surfaces (storefront, detail pages) | *(out of mock scope)* | — ↔ `70/71-*` | The mock draws no traveler-facing pages; Part 2's read-path verdicts stand on their own. |
| Visual styling | **MATCH** (token question) | all | Build's console chrome uses the mock's exact palette (#1A1A18 ink / #FAFAF8 ground / #35605A teal accent). The dispatch named Navy `#1E3A5F` / Teal `#2E8B8B` / Gold `#E8B339` as brand tokens; mock and build agree with each other, not with that triple. §Q10. |

### §-numbered questions for Leon (which side moves)

- **§Q1 — Logistics consolidation (BUILD-GAP P2).** The mock's "one card, one vocabulary" deletes the
  free-text Service Area and the neighborhood picker in favour of pin + radius; the build kept both old
  controls beside the new canvas (and the picker is the R7 scalar-column / R12 global-wall offender). Finish
  the consolidation, or amend the mock?
- **§Q2 — Transport vocabulary.** Mock: one "I collect travelers and drop them back" toggle. Build: 4-state
  segmented control (pickup included / pickup available / meet at point / n-a). The build looks richer —
  ratify it and mark the mock stale?
- **§Q3 — Travel-surcharge zones layer.** Mock draws display-only zone rings on the Logistics map with
  amounts living in Pricing & fees. Nothing in the build. Build it, or drop it from the mock?
- **§Q4 — Autosave (BUILD-GAP P2).** Mock: "Draft · autosaved… closing this tab keeps everything." Build:
  manual Save Draft, wizard state lost on revisit (punch-list). The mock has picked a side; ratify?
- **§Q5 — Availability editor form.** S7's ratified drawer vs the mock's month-grid (gap #2 proposal). At
  minimum: adopt the mock's **"Next available"** chip — its absence is the same hole R5 found on the traveler
  calendar — and fix the drawer's R4 interaction bugs regardless of which form wins.
- **§Q6 — Property builder deltas.** Minimum-stay field (mock has it, build doesn't — P2) and stay-shaped
  cancellation *bands* vs free text (P3). Row 102 scoped these out; does the mock's fuller field set get a
  follow-up ballot?
- **§Q7 — Listing-home rail.** Mock: Pricing & fees + Availability + Photos & media as three settings cards.
  Build: Pricing & fees card only, the rest as checklist rows. Cosmetic; which layout is the target?
- **§Q8 — Edit-split policy (mock gap #17, proposal).** Mock proposes safe edits go live immediately while
  identity-changing edits re-enter review with the approved version staying live; build re-checks everything.
  The mock itself says "ratify or amend" — this is the ruling it was waiting for.
- **§Q9 — Where handle & bio are edited.** Mock: on Distribute ("Catalog is what you sell; this is how you
  sell it"). Build: Settings, with Distribute linking out. Pick one.
- **§Q10 — Which token set governs the provider console.** Mock and build both use the earthy User-Console
  palette (#1A1A18/#FAFAF8/#35605A); the dispatch's brand tokens are Navy/Teal/Gold. If the earthy set is the
  console's ratified palette, record it in the mockup README so future conformance passes don't flag it.
- *(Standing, from §2:)* both mock and build promise a decision notification ("you'll be notified" / "We'll
  email you when it's decided") and neither delivers one on this bench — R3 is a defect under either design.

---

## 7. Could a real Kyoto provider have built this — and would a traveler trust it?

**Building it: yes — and this time the shape of the product no longer stops matching the form.** Run 1's
Haruka hit a wall every time she left the in-person happy path: her call lost its timezone, her async service
couldn't promise a response time, her guesthouse was five fields and a wrong label, and the one thing the
platform invited her to do — request a missing offering — produced a listing that could never publish. Run 2's
Haruka built the same twelve products and the console met her at every shape: the wizard told her up front
which steps her delivery method gets and why; the PDF refused to publish until it had something to deliver and
was honest about the risk of a pasted link; the call asked for her timezone and promised — truthfully, we
checked the API — that her Zoom link stays hidden until a booking is confirmed; the async form asked for "the
promise a traveler can hold you to" and printed it on her public page; her machiya got its check-in time,
house rules, amenities and photographs, and her weekly Tue/Thu/Sat rhythm became 24 real bookable dates with
her memorial-days blackout correctly punched out of them. The custom restoration walk — Run 1's dead end — is
live on the Kyoto city page with a Book button. The remaining friction is real but narrow: the new
availability drawer fought her twice (a dropdown that swallows clicks, a spurious "changed elsewhere" on her
very first save), nobody ever told her her listings had been approved, and her five neighborhood-less products
are still invisible on Kyoto's own market page.

**A traveler's view: the pages are now trustworthy end to end; the paths to them still have gaps.** Every one
of the twelve listings arrived intact — names, prices, honest method chips, party sizes, start windows,
timezones, house rules, linked bundle components, and a route card that says "0 of 5 stops located" rather
than inventing a map. Nothing a traveler reads on these pages is wrong, and several things (the concealed join
link, the un-invented route, the "not a sum" bundle note) are quietly better than most marketplaces. What
remains is reachability and reassurance: a September-only listing still greets an August visitor with "no
availability published yet"; the guesthouse page says "Custom quote" above two perfectly priced rooms and "no
availability" above sixty published nights; the PDF guide to Nishijin cannot be found from the Kyoto page at
all; and the room page a guest actually books on never shows the house rules she's agreeing to. Close the band
gap on the five money-heaviest listings, keep the approval promise, and point the calendar at the first real
date — and this catalog is one a Kyoto host would proudly stand behind, on a console that finally deserves it.

---

## 8. Ruling 112 — outcomes applied (same session, same bench)

The decision-maker ruled all ten §Q questions (ledger row 112) and delegated §Q10 + the R3 fix. All ten are
**implemented and verified on this bench** (assets `95-…`–`106-…`; every check below was executed against the
running app, not asserted from code):

| Ruling | Landed as | Verified |
|---|---|---|
| Q1 consolidation | Global neighborhood wall + free-text Service Area retired for ONE scoped searchable pick; literal `'Unknown'` client writes gone; display location composed from the pick; city derivation unchanged (server-side). | `99-neighborhood-search.png` — search "nishij" → Nishijin; wall and service-area input absent. |
| Q2 transport | No change — build's 4-state control ratified, mock marked stale (README). | — |
| Q3 zones | Display-only dashed surcharge rings (+fee popups, "amounts are set in Pricing & fees") on the Logistics and Catalog maps, drawn from the ruling-81 tier rows. *Bench note: no listing has coordinates (no Maps key), so the layer is type-checked and code-mounted but not visually exercised here.* | code + tsc; ring layer renders only around a confirmed pin (§13). |
| Q4 autosave | Debounced localStorage checkpoint + "Picked up where you left off" restore banner + Start fresh; cleared once the row exists. | `102-autosave-restored-step1.png` — name AND step survive a reload. |
| Q5 | Kit-level fix: `SelectContent` z-50→z-[110] (the pricing-drawer per-instance patch predicted this class); duplicate-window payloads now 400 with a truthful message instead of the spurious 409; "Next available: Sat, Aug 15 · 17:00" chip; Calendar "Edit availability →" access point; Escape verified closing the drawer. | `96/97/98-*.png` — day-option click PASSES headless. |
| Q6 | Migration 214 `min_stay_nights` + editor field; cancellation band select copy = the ENFORCED windows from cancellation-policy.service.ts; traveler page renders "Minimum stay: 2 nights". | `103/104-*.png`, API `minStayNights=2`. |
| Q7 | Listing Home rail = Pricing & fees + Availability + Photos & media cards, each navigating to the owning surface. | `105-listing-home-rail.png`. |
| Q8 edit-split | Migration 215 `pending_changes`/`edit_review_status` (§19-stripped on every client rail — an injected `pendingChanges` never landed, verified in DB); PATCH splits server-side against the STORED row (unchanged fields are no-ops); safe edits apply immediately (price 95→99 live at once); identity edits stage (name change staged, live + public name untouched); adding a route to a routeless approved listing stages under `__routePoints`; admin queue lists edit reviews with the exact staged patch; approve applies atomically (double-click = one effect), reject discards with the listing untouched; Catalog shows "Edit in review" beside Live. | 8/8 API checks + `95-admin-edit-review-queue.png`; staged route applied as 2 child rows on approve. |
| Q9 | Handle & bio edited on Distribute — inline editor (claim card + new bio field riding `PATCH /api/me/storefront`); bio persisted to `users.bio`. | `106-distribute-handle-bio.png`, DB read. |
| Q10 (delegated) | The earthy User-Console palette (#1A1A18/#7A7A72/#E8E8E2/#FAFAF8 + #35605A) governs the provider console; Navy/Teal/Gold stay traveler-brand tokens. Recorded in the mockup README so future conformance passes don't flag it. | README. |
| R3 (delegated) | Every listing decision now writes a notification (approve / reject / edit-approve / edit-reject, dedupe-keyed), and the provider Inbox gains a **Notifications** tab — the bell's unread dot finally resolves somewhere. | `101-inbox-notifications.png` — decision rows render. |

Guards after the batch: money-endpoint guard ✅ (229 files), unmounted-router guard ✅ (48/48), tsc 170 =
baseline throughout, pricing-fees units 43/43, migrations 216/216. Bench fixture deltas from verification:
S1 is now "…— Autumn Edition" at $99 (the staged-name apply), S2 carries 2 route stops (the staged-route
apply), the property has `min_stay_nights=2` + a `moderate` band, and the provider has a bio.
