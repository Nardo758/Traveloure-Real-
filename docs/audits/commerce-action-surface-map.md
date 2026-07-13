# Commerce Action-Surface Map

**Status:** ✅ **COMPLETE — Stage 1 inventory + Stage 2 endpoint gate trace done.** Ranked findings at the bottom of this file.
**Type:** Read-only audit. No code changed. Verified against current `main` (post-`9d170e09`, Marketplace Phase A merged).
**Scope:** every user action that moves money, moves commerce/booking/approval state, or is a step in a purchase / booking / earn path — across traveler/buyer, expert, provider, admin. Pure account/settings/nav chrome excluded unless it is a commerce action.

**Risk legend:** 🔴 money-moving (charge / price / fee / payout) · 🟠 state-changing (book / cart / add / publish / submit / approve / cancel / delete) · 🟢 navigation / read.

**Stage 2 will add, per row:** endpoint called → gated? (auth/role/approval/price-lock/whitelist/IDOR/idempotency, or NONE) · UI-gated? · server-gated? · finding. This Stage-1 table captures *button, location, actor, apparent target, provisional risk* only.

---

## A. DEMAND-SIDE (buyer/traveler)

### A1. Discover main feed — `pages/discover.tsx` (`/discover`, public)
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Add to Cart `button-add-to-cart-{id}` | discover.tsx:460 (handler :840) | guest+traveler | POST `/api/cart` {serviceId} or guest localStorage — **service only** | 🟠 |
| AI Suggestions `button-ai-suggestions` | discover.tsx:1001 | traveler | POST `/api/discover/recommendations` | 🟢 |
| Connect expert `button-connect-expert-{id}` | discover.tsx:1177 | traveler | `/experts/:id` | 🟢 |
| Create first template `button-create-first-template` | discover.tsx:2108 | expert roles | `/expert/templates` (publish funnel) | 🟢 |
| Become an expert `button-become-expert` | discover.tsx:2115 | non-expert | `/expert-status` | 🟢 |
| Tabs, filters, search, pagination, category chips | discover.tsx:517–1557 | traveler | local filter/query state | 🟢 |

### A2. Discover `packages` / `articles` tabs — **UNREACHABLE** (not in `VISIBLE_TABS`, discover.tsx:637)
| button / testid | file:line | actor | target | risk / note |
|---|---|---|---|---|
| **View & Purchase** `button-view-template-{id}` | discover.tsx:1721 | (any, if reachable) | `/expert-templates/:id` | 🟠 purchase — **DOUBLE-DEAD: tab hidden AND route unregistered → 404** |
| View All Templates `button-view-all-templates` | discover.tsx:1735 | — | **no onClick/href** | 🟢 dead-end + unreachable |
| View All Creators `button-view-all-creators` | discover.tsx:2047 | — | **no onClick** | 🟢 dead-end + unreachable |
| Create first template / Become expert | discover.tsx:1615/1622 | expert/non-expert | `/expert/templates` / `/expert-status` | 🟢 unreachable |

### A3. Discover by-date — `components/travelpulse/GlobalCalendar.tsx` (embedded in "By Date" tab)
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Plan This Trip `button-plan-event-{id}` | GlobalCalendar.tsx:672 | traveler | `/experiences/travel?…` | 🟢 |
| City click → location | GlobalCalendar.tsx:768 | traveler | `/discover/location/:city` | 🟢 |
| Plan-experience chips `button-plan-{city}-{slug}` | GlobalCalendar.tsx:858 | traveler | `/experiences/:slug?…` | 🟢 |
| vibe filters, calendar toggle, retry | GlobalCalendar.tsx:368–589 | traveler | local | 🟢 |

> **Note:** standalone `/global-calendar` page (`pages/global-calendar.tsx`) has **zero commerce CTAs** — informational only. The commercial by-date surface is the embedded component above.

### A4. Discover by-location — `pages/discover-location.tsx` + `city-feed-card.tsx` / `city-feed-card-expert.tsx` (`/discover/location/:city`, public)
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Book (recommendation) `btn-book-rec-{pos}` | discover-location.tsx:626 | traveler | logClick + nav `/discover?categoryKey=` | 🟠 |
| Add (recommendation) `btn-add-rec-{pos}` | discover-location.tsx:635 | traveler | AddToExperienceDialog | 🟠 |
| Add to {month} `button-date-event-add` | discover-location.tsx:996 | traveler | **no onClick** | 🟠 dead-end |
| Book (companion) `button-date-companion-book` | discover-location.tsx:1026 | traveler | `/experiences/photo\|gear` | 🟠 |
| Affiliate add-ons `addon-*` | discover-location.tsx:1173 | traveler | external URL + POST `/api/affiliates/track` | 🟠 off-site |
| Gem Book/Reserve | city-feed-card.tsx:651 | traveler | `<a href={suggestion?.href ?? "#"}>` + track | 🟠 **dead-links to `#` when no suggestion** |
| Gem Add `btn-add-gem-{id}` | city-feed-card.tsx:670 | traveler | AddToExperienceDialog {type:gem} | 🟠 |
| Request service `btn-request-service-{id}` | city-feed-card.tsx:179 | traveler | POST `/api/services/request` | 🟠 |
| Event Tickets / Add `btn-add-event-{id}` | city-feed-card.tsx:842/862 | traveler | external + track / content add | 🟠 |
| Vendor Inquire / Website | city-feed-card.tsx:1032/1041 | traveler | `/services/:id` / external + track | 🟢 / 🟠 |
| Supply Book/Add `btn-book-supply-{id}` | city-feed-card.tsx:1220/1236 | traveler | external bookingLink + track / add | 🟠 |
| Apply (wanted) `link-wanted-apply` | discover-location.tsx:491 | traveler→provider | `/become-expert?…` | 🟢 |

### A5. Service detail + browser — `pages/service-detail.tsx` (`/services/:id`), `components/service-browser.tsx`
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Add to Cart `button-add-to-cart` | service-detail.tsx:341 | traveler (signin gate for guest) | POST `/api/cart` {serviceId} | 🟠 |
| Contact Provider `button-contact-provider` | service-detail.tsx:366 | traveler | `/chat?provider=` | 🟢 |
| Flag review / Submit report | service-detail.tsx:463/492 | authed non-author | POST `/api/reviews/:id/flag` | 🟠 |
| Add to Cart (browser) `button-add-to-cart-{id}` | service-browser.tsx:187 | traveler | `onAddToCart` prop (only if parent passes it) | 🟠 |

> Service-detail shows a hardcoded "Provider earns 90% / Platform fee 10%" (service-detail.tsx:381) — display literal (§13 trust-cluster), not a button.

### A6. Expert browse & detail — `pages/experts.tsx` (`/experts`), `components/expert-card.tsx`, `pages/expert-detail.tsx` (`/experts/:id`)
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Book Now (per service) `button-book-service-{id}` | expert-detail.tsx:415 | authed buyer | nav `/cart?expertId=&serviceId=` | 🟠 |
| Schedule Consultation `button-schedule-consultation` | expert-detail.tsx:519 | authed buyer | `/cart?…` or toast (dead-ends if expert has 0 services) | 🟠 |
| Contact Expert `button-contact-expert` | expert-detail.tsx:514 | authed buyer | `/chat?expertId=` | 🟠 |
| Message (card) `button-message` | expert-card.tsx:249 | any | `/chat?expertId=` | 🟠 |
| Become a … Expert `button-become-expert` | experts.tsx:858 | any | `/become-expert?type=` | 🟠 |
| Find AI Matches / Load More / Filters / View Profile | experts.tsx:525–809, expert-card.tsx:259 | any | mutation/nav | 🟢 |
| Heart / Share2 (icons) | expert-detail.tsx:212/215 | any | **no onClick** | 🟢 dead |

### A7. Ask/book-an-expert & Concierge — `components/travelpayouts/BookWithExpertButton.tsx`, `pages/concierge/index.tsx`, `components/concierge/{IntentForm,DeliveryOptions}.tsx`
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Work with a Trip Planner `button-ask-expert` | BookWithExpertButton.tsx:29 | any | `/experts?…&role=travel_expert` | 🟠 |
| Show me options `button-concierge-submit` | IntentForm.tsx:131 | guest+traveler | POST `/api/concierge/quote` (priced tiers) | 🟠 |
| Use AI tool `button-concierge-pick-ai` | DeliveryOptions.tsx:170 | guest+traveler | PATCH `/api/concierge/requests/:id` tier=ai → `/cart?…` (paid) | 🔴 |
| Request expert `button-concierge-pick-expert` | DeliveryOptions.tsx:223 | guest+traveler | PATCH tier=expert + POST `/api/expert-requests` | 🟠 |
| Request quote (full) `button-concierge-pick-full` | DeliveryOptions.tsx:263 | guest+traveler | PATCH tier=full | 🟠 |

### A8. Coordination / event-fee path (runs through Concierge "event" branch — no standalone page)
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Event type select `select-concierge-event-type` | IntentForm.tsx:94 | guest+traveler | sets eventType → $49.99 override band | 🔴 (fee-band selection) |
| Add coordinator `button-concierge-pick-expert` (event copy) | DeliveryOptions.tsx:223 | guest+traveler | PATCH tier=expert + POST `/api/expert-requests` | 🟠→🔴 coordination fee |
| Use AI tool (event) `button-concierge-pick-ai` | DeliveryOptions.tsx:170 | guest+traveler | AI fee credited toward coordination | 🔴 |

> `logistics/multi-person-coordination.tsx`, `expert-coordination-hub.tsx`, `expert/workspace.tsx` are dashboards — no traveler checkout CTA.

### A9. Cart + Checkout — `pages/cart.tsx`, `components/booking/StripeCheckout.tsx`
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| **Complete Booking** `button-complete-booking` | cart.tsx:2185 | traveler | POST `/api/checkout` (idempotencyKey) → Stripe | 🔴 |
| **Unlock Full Optimization** `button-unlock-optimization` | cart.tsx:1841 | traveler | POST `/api/optimization-payments` (Stripe) | 🔴 |
| Stripe pay (optimize / checkout) | cart.tsx:1777 / 2072, StripeCheckout.tsx:123 | traveler | `stripe.confirmPayment` → confirm endpoints | 🔴 |
| Currency selector `select-display-currency` | cart.tsx:1452 | all | updatePreferredCurrency (affects charged price) | 🔴 |
| Generate Itinerary `button-generate-itinerary-comparison` | cart.tsx:1542 | traveler | POST `/api/cart/resolve-trip` | 🟠 |
| Confirm & Optimize `button-confirm-trip-details` | cart.tsx:1651 | traveler | PATCH `/api/trips/:id` + POST `/api/optimization-preview` | 🟠 |
| Add N to trip `button-confirm-planning` | cart.tsx:2360 | traveler | POST `/api/cart/convert-to-itinerary` | 🟠 |
| Remove / qty ± (service, content, external, guest) | cart.tsx:1233–1428 | traveler/guest | DELETE/PATCH `/api/cart/:id` or local | 🟠 |
| Proceed to Payment (×2) | cart.tsx:1560/2024 | traveler | flow step | 🟠 |

### A10. Itinerary-variant booking — `components/itinerary/VariantActionButtons.tsx`, `BookingFlowModal.tsx` (on `itinerary-comparison.tsx`)
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Book Now `button-book-now-{id}` | VariantActionButtons.tsx:280 | traveler | opens BookingFlowModal | 🟠 |
| Expert Review `button-expert-review-{id}` | VariantActionButtons.tsx:292 | traveler | POST `/api/expert-requests/payment-intent` | 🔴 |
| Continue to Payment (expert) `button-submit-expert` | VariantActionButtons.tsx:362 | traveler | **client-side price $50 / +5% / +8% (:88-105)** → Stripe | 🔴 ⚠️ client-priced |
| Proceed to Payment `button-proceed-to-payment` | BookingFlowModal.tsx:499 | traveler | POST `/api/bookings/process-cart` → Stripe; **"Platform fee 12%" hardcoded (:477)** | 🔴 ⚠️ |
| Stripe pay → confirm | BookingFlowModal.tsx:225+ | traveler | POST `/api/bookings/confirm-payment` | 🔴 |
| Save for Later / Share | VariantActionButtons.tsx:665/676 | traveler | POST `/api/saved-trips` / `/api/shared-trips` | 🟠 / 🟢 |

### A11. Transport booking — `components/itinerary/TransportBookingCard.tsx`, `PartnerizeBookingCTA.tsx`
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Book — {price} (platform) `button-book-platform-{id}` | TransportBookingCard.tsx:202 | traveler | POST `/api/transport-booking-options/:id/book` → checkoutUrl | 🔴 |
| View on {partner} (affiliate) | TransportBookingCard.tsx:216 | traveler | POST `/…/click` → `window.open` off-site | 🟠 |
| Mark as booked / confirm | TransportBookingCard.tsx:303/336 | traveler | PATCH `/…/status` {booked} | 🟠 |
| Book with an expert `button-partnerize-book-with-expert` | PartnerizeBookingCTA.tsx:118 | traveler | POST `/api/expert-requests` | 🟠 |
| Open on {partner} `button-partnerize-direct-link` | PartnerizeBookingCTA.tsx:133 | traveler | `<a href={directUrl ?? "#"}>` off-site | 🟠 **`#` when externalUrl null** |

### A12. Experience-template wizard add-to-cart — `pages/experience-template.tsx` (`/experiences/:slug/new`)
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Add service `button-add-{id}` | experience-template.tsx:2781 | traveler | addToCart (service) / POST `/api/cart` | 🟠 |
| Add custom venue `button-add-custom-{id}` | experience-template.tsx:2729 | traveler | addToCart {venue} (external/local) | 🟠 |
| Proceed to Checkout `button-checkout` | experience-template.tsx:2179 | traveler | nav `/cart` | 🟠 |
| Compare AI Alternatives `button-compare-ai` | experience-template.tsx:2166 | traveler | POST `/api/itinerary-comparisons` | 🟠 |
| Notify Me When Available `button-notify-me` | experience-template.tsx:2805 | traveler | **no onClick** | 🟢 dead |

### A13. Other add-to-cart feeders (all **service-only**, POST `/api/cart` or `/api/cart/items`)
`help-me-decide.tsx:560` · `trip-details.tsx:326` · `itinerary-comparison.tsx:546` · `dashboard/RecommendedServices`, `SmartServiceRecommendations` — all 🟠. **No "add expert package / experience to platform cart" button exists** (packages route through concierge/expert-request; externals via sessionStorage cart).

### A14. PlanCard on-trip — `components/plancard/*`
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Escalate to expert `button-plancard-escalate` | EscalationCTA.tsx:195 | traveler | POST `/api/expert-requests` (ai_plan_polish, $49.99) | 🟠→🔴 |
| Transport mode option `mode-option-{leg}-{mode}` | ActivitiesSection.tsx:239 | traveler | PATCH `/api/transport-legs/:id/mode` (changes cost) | 🟠 |
| Maps / navigate / mark visited | ActivitiesSection.tsx:220–587 | traveler | external / local | 🟢 |

> PlanCard has **no native "add to cart / book activity"** — on-trip commerce routes through EscalationCTA + Concierge rail + transport cards.

### A15. Upsell / cross-sell — `components/UpsellSlot.tsx`, `PlanCardUpsellSlot.tsx`
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Candidate row `upsell-candidate-{surface}-{id}` | UpsellSlot.tsx:202 | traveler | POST `/api/upsell/click` → nav `/discover?categoryKey=` | 🟢 |
| slot renders (cart / checkout / plancard) | cart.tsx:1493/2060, PlanCardUpsellSlot.tsx:46 | traveler | POST `/api/upsell/{cart\|checkout\|plancard-*}` | 🟢 |

---

## B. SUPPLY-SIDE (expert / provider)

### B1. Ways-to-earn & applications — `pages/earn.tsx` (`/earn`), `pages/travel-experts.tsx` (`/become-expert`)
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Offering "I do this →" `earn-offering-{key}` | earn.tsx:159 | provider/expert | `role.signupPath?offeringTypeKey=` | 🟢 → create flow |
| Apply as EA `earn-ea-signup` | earn.tsx:342 | EA | `/become-expert?type=executive_assistant` | 🟢 |
| Submit Application `button-submit` | travel-experts.tsx:1432 | applicant | POST `/api/expert-application` | 🟠 |
| accept-terms | travel-experts.tsx:356 | applicant | POST `/api/auth/accept-terms` | 🟢 |
| Role cards / next-step / retry | earn.tsx:121–426, travel-experts.tsx:1422 | all | nav/local | 🟢 |

> `/become-provider` (`ServicesProviderPage`) is the parallel provider application — same shape, not deep-read this pass.

### B2. Create-listing flows — `components/ServiceForm.tsx` (canonical), `pages/expert/service-wizard.tsx` (legacy)
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| **Submit for Approval** (expert) | ServiceForm.tsx:1678 | expert | POST/PATCH `/api/provider/services` approvalStatus=submitted | 🟠 |
| Save as Draft (expert) | ServiceForm.tsx:1669 | expert | POST/PATCH approvalStatus=draft | 🟠 |
| **Publish Service** (provider) `button-publish-service` | ServiceForm.tsx:1698 | provider | POST/PATCH status=active; disabled when `publishBlocked` (unverified gated category) | 🟠 |
| price / tier inputs `input-base-price` / `input-tier-price-{i}` | ServiceForm.tsx:996/887/848/942 | expert+provider | sets price/pricingTiers | 🔴 |
| Use this template `button-use-template-{id}` | ServiceForm.tsx:700 | expert | local prefill | 🟢 |
| **Quick Create** `button-quick-create-{id}` (wizard) | service-wizard.tsx:836 | expert | **POST `/api/expert/services/from-template/:id` (born-approved path)** | 🟠 ⚠️ bypasses submitted |
| **Publish Service** (wizard) `button-publish-service` | service-wizard.tsx:929 | expert | POST `/api/provider/services` status=active | 🟠 ⚠️ direct publish vs ServiceForm submit |
| Save as Draft (wizard) | service-wizard.tsx:921 | expert | POST status=draft | 🟠 |

> **Two overlapping expert create flows** with **divergent publish semantics**: the legacy wizard can publish `active` / born-approved; ServiceForm (expert) only Draft/Submit-for-Approval. Which is routed at `/expert/services/new` must be confirmed in Stage 2 (Phase 2 retired the wizard's *use* but did not delete it).

### B3. Expert listing management — `pages/expert/services.tsx` (`/expert/services`)
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Active toggle `switch-service-{id}` | services.tsx:198 | expert | PATCH `/api/expert/services/:id/status` {active/paused} | 🟠 publish/unpublish |
| Duplicate | services.tsx:216 | expert | POST `/api/expert/services/:id/duplicate` | 🟠 |
| Pause/Activate | services.tsx:219 | expert | PATCH `/api/expert/services/:id/status` | 🟠 |
| Edit / Create / Use Template | services.tsx:211–463 | expert | nav | 🟢 |

### B4. Provider listing management — `pages/provider/services.tsx` (`/provider/services`)
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Active toggle `switch-active-{id}` | provider/services.tsx:379 | provider | PATCH `/api/provider/services/:id` {active/paused} | 🟠 |
| Delete `button-delete-{id}` | provider/services.tsx:399 | provider | DELETE `/api/provider/services/:id` | 🟠 |
| Edit `button-edit-{id}` | provider/services.tsx:394 | provider | `/provider/services/:id/edit` (→edit price) | 🟢 |
| Add New / Inspiration cards | provider/services.tsx:205–266 | provider | nav | 🟢 |

### B5. Supply-side payouts — `pages/provider/payouts.tsx` (`/provider/payouts`) — **ENTIRELY INERT**
| button / testid | file:line | actor | target | risk / note |
|---|---|---|---|---|
| Request Payout `button-request-payout` | provider/payouts.tsx:70 | provider | **no onClick — DEAD** | 🔴 dead |
| Add Account `button-add-account` / `-first-account` | provider/payouts.tsx:125/162 | provider | **no onClick — DEAD** | 🟠 dead |
| Download CSV `button-download-csv` | provider/payouts.tsx:187 | provider | **no onClick — DEAD** | 🟢 dead |

> The page has **no `useMutation`/`apiRequest` at all** — the entire provider "get my money / add bank account" surface dead-ends. High-priority gap given `/admin/payouts` exists to process requests providers apparently cannot submit here.

---

## C. ADMIN COMMERCE

### C1. Template approvals — `pages/admin/template-approvals.tsx` (`/admin/template-approvals`) *(landed this session)*
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Approve `button-approve-{id}` | template-approvals.tsx:91 | admin | POST `/api/admin/expert-templates/:id/approve` | 🟠 → purchasable |
| Reject `button-reject-{id}` | template-approvals.tsx:98 | admin | POST `/api/admin/expert-templates/:id/reject` {reason}; disabled unless reason | 🟠 |

### C2. Fee-config — `pages/admin/fee-config.tsx` (`/admin/fee-config`) — **runtime no-op per in-page banner**
| button / testid | file:line | actor | target | risk / note |
|---|---|---|---|---|
| Save (fee) `button-save-fee-{cat}` | fee-config.tsx:291 | admin | POST `/api/admin/fee-config` | 🔴 **no-op (writes dormant `booking_fee_configs`)** |
| Save (opt fee) `button-save-opt-fee-{key}` | fee-config.tsx:394 | admin | POST `/api/admin/optimization-fees` | 🔴 |

### C3. Fee-bands — `pages/admin/fee-bands.tsx` (`/admin/fee-bands`) — **LIVE resolver source**
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Save band `fee-band-save-{key}` | fee-bands.tsx:138 | admin | PATCH `/api/admin/fee-bands/:key` {defaultRate,isActive} — live ~60s | 🔴 live rate |
| Save policy `platform-setting-save-{key}` | fee-bands.tsx:217 | admin | PATCH `/api/admin/platform-settings/:key` (commission policy flip) | 🔴 |

### C4. Category-fees — `pages/admin/category-fees.tsx`
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Save `category-fee-save-{id}` | category-fees.tsx:142 | admin | PATCH `/api/admin/categories/:id` {commissionBandKey, insuranceBand, riskProfile, requiresBackgroundCheck, …} | 🔴 |

### C5. Payouts — `pages/admin/payouts.tsx`
| button / testid | file:line | actor | target | risk |
|---|---|---|---|---|
| Approve `button-approve-{id}` | payouts.tsx:355 | admin | PATCH `/api/admin/payouts/:id` status=processing | 🔴 |
| Reject `button-reject-{id}` | payouts.tsx:365 | admin | PATCH status=failed (reason) | 🔴 |
| **Execute Payout** `button-execute-{id}` | payouts.tsx:378 | admin | PATCH status=completed (Stripe transfer) | 🔴 |

### C6. Revenue / Reconciliation — `pages/admin/revenue.tsx`, `reconciliation.tsx`
| button / testid | file:line | actor | target | risk / note |
|---|---|---|---|---|
| **Process Payouts** `button-process-payouts` | revenue.tsx:411 | admin | **no onClick — DEAD** | 🔴 dead-end |
| Download CSV / PDF | revenue.tsx:381/395 | admin | GET `/api/admin/revenue/unified/export` | 🟢 export |
| Run reconciliation `button-run-reconciliation` | reconciliation.tsx:122 | admin | GET `/api/admin/reconciliation/run-now` | 🟠 |

---

## DEAD / ORPHANED / MISSING (critical for Phase B)
1. **Marketplace purchase path — double-dead end-to-end.** `packages` tab not in `VISIBLE_TABS` (discover.tsx:637) **and** `/expert-templates/:id` unregistered in App.tsx → 404, and **no buyer-facing template purchase page component exists**. The "View & Purchase" CTA (discover.tsx:1721) cannot function. *(This is the orphan protection Phase A relies on; Phase B B1/B2 is exactly this.)*
2. **`/provider/payouts` entirely inert** — Request Payout / Add Account / Download CSV all no-op; page has no mutations. Providers cannot submit the payout requests `/admin/payouts` exists to process.
3. **`/admin/revenue` "Process Payouts"** — money-labelled, no onClick.
4. **Pure dead-ends (no handler):** `button-view-all-templates` (discover:1735), `button-view-all-creators` (discover:2047), `button-date-event-add` (discover-location:996), `button-notify-me` (experience-template:2805), expert-detail Heart/Share2 (:212/215).
5. **`href="#"` fallbacks:** gem Book/Reserve (city-feed-card:665 when no suggestion), PartnerizeBookingCTA directUrl (when externalUrl null).
6. **Expert-detail Schedule Consultation / Book Now** only ever reference `services[0]` — multi-service experts can't book services 2..n from the sidebar; toasts if 0 services.

## FLAGGED FOR STAGE-2 PRIORITY (🔴/🟠 with gate-suspicion — to deep-trace, not yet traced)
- **Client-side price computation** — `VariantActionButtons.tsx:88-105` computes expert-review tiers ($50 / +5% / +8%) in the browser and POSTs the amount; `BookingFlowModal.tsx:477` hardcodes "Platform fee 12%". **Verify server re-derives** (amount-tampering class).
- **Wizard divergent publish** — legacy `service-wizard.tsx` can publish `active` / hit the born-approved `from-template/:id` route, bypassing the `submitted` approval state ServiceForm enforces. Confirm what `/expert/services/new` actually routes to.
- **Verify Phase-A gates hold at the button level** — every marketplace buy/publish/edit-price path (once surfaced) must route through `approved AND published`, field whitelist, price-lock.
- **Admin commerce buttons** — confirm all C1–C6 sit behind the blanket `adminApiGuard` (they're `/api/admin/*`; verify no per-endpoint bypass).
- **Cart/booking item-type boundary** — confirm at the endpoint level that no template/expert-package can enter the cart (`/api/cart`, `/api/cart/items`) or booking rails; Stage-1 buttons agree (service-only) — verify the endpoints agree.
- **`select-display-currency`** (cart:1452) affecting charged price — trace whether server re-prices in the selected currency or trusts the client.

## SURFACES TO CONFIRM IN/OUT OF SCOPE (before Stage 2)
- `/become-provider` (`ServicesProviderPage`), `service-providers.tsx`, `services-provider.tsx`, `experiences-provider.tsx`, `experience-discovery.tsx` — provider-facing variants not deep-read this pass.
- `/booking-demo` (`PlanningWithBooking.tsx`) — appears demo-only, not production commerce.
- Downstream `/experiences/:slug/new` wizard interior beyond the add-to-cart buttons captured in A12.
- Chat/message surfaces (`/chat`) — contact entry points captured; the chat interior is not commerce.

---

# STAGE 2 — Endpoint gate trace & ranked findings

**Status:** ✅ Stage 2 complete. Every 🔴/🟠 action point deep-traced to its server handler (three checks: exists+wired · endpoint gated? · UI-gate vs server-gate). Verified on `main` (post-`9d170e09`). Read-only — no code changed.

> **Key framing:** an endpoint answers **any caller who meets its gate, regardless of the UI.** Several findings below are exploitable by a direct API call even where the button is hidden/orphaned — that is the "UI says one thing, endpoint allows another" class this whole audit exists to catch. "Reachable via UI" is noted, but the endpoint gate is the finding.

## RANKED FINDINGS (most severe first)

### 🔴 CRIT-1 — Amount-tampering: `POST /api/expert-requests/payment-intent` charges the client-sent `amount` verbatim
`server/routes/booking-actions.ts:61-94` reads `amount` from `req.body` (:71) → `stripe-payment.service.ts:455` `Math.round(amount*100)` → Stripe. **No server re-derivation, no config/band lookup, no clamp.** The tier prices ($50 / +5% / +8% / $49.99) are computed **client-side** (`VariantActionButtons.tsx:95-102`) and sent as `amount`. A caller can POST `amount: 0.50` for a Full Concierge and pay 50¢. Also `userId` is taken from the body (:64), not the session. Gated only by `isAuthenticated`. **Live, exploitable by any authenticated caller.** *(Corroborated by two independent traces.)* Contrast: optimize-fee (`getFee`) and coordination (`resolveCoordinationFee`) both re-derive server-side — this path is the outlier.

### 🔴 CRIT-2 — Ungated refund: `POST /api/bookings/refund` has no owner/admin gate
`server/routes/bookings.ts:341-362` — `isAuthenticated` only. **Any logged-in user can refund any `bookingId` for an arbitrary `amount`.** `stripe-payment.service.ts:357` issues `stripe.refunds.create` and sets `bookings.status='refunded'` but **reverses no earning/payout ledger row.** It targets the legacy `bookings` table (real checkout writes `service_bookings`), so it mostly 404s on live bookings *today* — but the missing authorization gate + missing ledger reversal are real defects the moment that table is used.

### 🔴 CRIT-3 — IDOR: `POST /api/bookings/process-cart` takes `userId` from the body
`server/routes/bookings.ts:56-89` — `isAuthenticated` present but the **session user is never compared to `req.body.userId`** (:58). An authenticated user can create trips/bookings under another user's id. AI-generated cart items (no `providerId`) also trust `item.price` from the client (`booking.service.ts:304`) — real-provider items correctly re-read DB price.

### 🔴 CRIT-4 — Expert-request creation decoupled from payment verification
`POST /api/expert-requests` (`booking-actions.ts:118` → `booking.service.ts:674-686`) inserts `status='queued'` **hardcoded**, and **never reads `paymentStatus`/`paymentIntentId`** the client sends. Good: the client can't self-mark paid. Bad: **nothing verifies the PaymentIntent succeeded** before the request is created — the embedded PaymentIntent flow never triggers the `expert_service` webhook (which only fires on `checkout.session.completed`). The paid expert lead is created whether or not payment cleared. `expertFee` stored raw from body (informational).

### 🔴 HIGH-1 — Payout execute has no idempotency → duplicate Stripe transfer
`PATCH /api/admin/payouts/:id` completed-branch (`admin.routes.ts:2887`) calls `createTransfer` with **no `idempotencyKey`** (`stripe-connect.service.ts:104`) and the status update has **no `WHERE status<>'completed'` guard** (`storage.ts:3221`). A retry/double-click/replay on an already-completed payout **re-runs the real Stripe transfer.** Admin-only (behind `adminApiGuard`, so not a privilege issue) — a missing money-safety invariant, not an access hole.

### 🟠 HIGH-2 — F2: LIVE born-approved approval/fee bypass (the pinned determination)
**Determination: LIVE, not latent.** `/expert/services/new` renders the **legacy wizard** (`App.tsx:479-480`), not ServiceForm — the wizard is the mounted create surface, and several routes redirect *into* it. Both wizard write paths create **born-approved** `provider_services`: `POST /api/expert/services/from-template/:id` (`routes.ts:5837`) and `POST /api/provider/services` (`routes.ts:2052`) never set `approvalStatus`, and the column **defaults to `"approved"`** (`schema.ts:578`). This defeats the `draft→submitted→approved` gate ServiceForm's expert path enforces (`ServiceForm.tsx:572-577`). **Load-bearing hole = the server-side default** — retiring the wizard route alone would not close it, because `POST /api/provider/services` itself never sets `approvalStatus`. This is the D1a divergence (§1), confirmed reachable in production.

### 🟠 HIGH-3 — IDOR: `PATCH /api/concierge/requests/:id` has no auth and no ownership
`concierge.routes.ts:116-148` filters by `id` only (:134) — no auth middleware, no `userId` predicate. **Any guest/user can PATCH any concierge request's tier/status.** Low money-sensitivity (lead record, no charge) but a real cross-tenant write. (Create/quote being guest-open is intentional per D6; the unguarded mutation-by-id is the divergence.)

### 🟠 MED — narrower-blast-radius gaps
- **`POST /api/checkout` — no idempotency key** (`routes.ts:7350`): duplicate submits → duplicate bookings. *(Price/fees ARE re-derived server-side — the "12%" label is cosmetic — so not amount-tampering, just double-charge risk.)*
- **`PATCH /api/transport-legs/:legId/mode`** (`trips.routes.ts:2454`): **no `isAuthenticated` middleware**; ownership check is conditional (`if(variantOwner)`) and skipped if the variant owner is falsy. Changes `estimatedCostUsd` (display cost, not a charge; new cost read from server-stored `alternativeModes`, not client).
- **`PATCH /api/transport-booking-options/:id/status`**: no owner check — any auth user flips any option's booking-status label. No money.
- **`POST /api/bookings/purchase/confirm` (marketplace)**: non-atomic status check→update, no `WHERE status='pending_payment'` — TOCTOU double-credit under concurrent confirm. **Orphaned UI (not reachable today).**
- **Currency:** `POST /api/checkout` passes `req.body.currency` to Stripe **without FX conversion or whitelist** (`routes.ts:7442`) — a weak/zero-decimal code charges that currency's magnitude. Latent (single-USD intent); the expert-service path *does* whitelist currency, the cart path does not.

### Ops gaps (money not unwound)
- **No built refund path reverses the earnings ledger** — `/api/bookings/refund`, the `charge.refunded` webhook, and booking cancel all leave `provider_earnings`/`expert_earnings`/`platform_revenue` intact. The mint side-effect (`storage.ts:1360-1420` on `completed`) is never unwound.
- **Booking cancel issues no Stripe refund** on a paid `confirmed` booking (`routes.ts:6268`) — money kept (owner-gated, so not a vuln; an ops gap).
- **Template-purchase refund unbuilt** (as documented; `'refunded'` pre-allowed in the migration-110 CHECK).

### Dead / orphaned / reachability
- **F1 (PHASE-B BLOCKER) — marketplace purchase path double-dead:** `packages` tab hidden *and* `/expert-templates/:id` unregistered → 404, and **no buyer purchase-page component exists.** Purchase + `/confirm` endpoints are correctly gated (approval + IDOR + idempotent + server-price — verified sound) but **unreachable.** **This defines Phase B's first step: register the route + build the purchase page + un-hide the tab, filtered to approved.**
- **Provider payout-request rail dark + UI inert:** `/api/provider/payouts/request` etc. live in the **unmounted** `experts.routes.ts` (§9 → return 200-HTML), and `/provider/payouts` buttons have no onClick/mutation. Providers **cannot submit payout requests**; `/admin/payouts` processes only admin-created rows.
- **`/admin/revenue` "Process Payouts"**, `button-view-all-templates`, `button-view-all-creators`, `button-date-event-add`, `button-notify-me`, expert-detail Heart/Share2 — inert (no handler). `href="#"` fallbacks on gem Book/Reserve and Partnerize direct link.

## GATES THAT HOLD (verified sound — do not "fix")
- **Marketplace purchase + `/confirm`** — approval (`approved AND published`), self-purchase block, IDOR (`metadata.purchaseId`), buyer ownership, idempotent, price server-read, earning from stored row. (Only the TOCTOU hardening note above.)
- **Expert-template create/PATCH** — `pickExpertTemplateFields` whitelist on both; `isPublished:false` forced at create; A3 price-change→re-review.
- **Admin approve/reject/submit** + **all admin commerce** (payouts, fee-bands, platform-settings, category-fees, fee-config, reconciliation, revenue-export) — under the blanket `adminApiGuard` (mounted `routes.ts:523`, after guard `:275`); none outside it.
- **Cart item-type boundary** — only `provider_services` IDs + owned custom venues; **no expert-template-into-cart path.**
- **`/api/checkout`** re-derives subtotal + per-category commission from `fee_bands` config (client amount ignored).
- **`optimization-payments`(+`/confirm`)** — ownership-gated, config fee, idempotent on `sourceId`, confirm verifies `pi.status==='succeeded'` + type/user binding. Best-gated money path.
- **Transport `book`** — price server-side (`option.priceCentsLow`).
- **Coordination-states** — IDOR-gated on every read/patch/delete/fee/bookings path; fee `resolveCoordinationFee` server-side.

## BOTTOM LINE FOR PHASE B
- **Marketplace surfacing is safe *as a mechanism*** — the purchase/confirm/create/approve gates are sound. **Phase B's first step is F1**: register `/expert-templates/:id`, build the buyer purchase page, un-hide the `packages` tab **filtered to `approved AND published`**. No new gate is needed for the marketplace path itself.
- **But the surrounding commerce surface has LIVE money vulnerabilities independent of the marketplace** (CRIT-1..4, HIGH-1) that are exploitable at the endpoint level today. These are **not** Phase-B blockers (different surfaces) but are **higher-severity than Phase B** and should be triaged as their own remediation lane before/alongside surfacing — surfacing more commerce UI while `/api/expert-requests/payment-intent` and `/api/bookings/refund` are open would add reachable paths to an already-open surface.
- **F2 (born-approved bypass)** is live and belongs to the D1a/Phase-3 lane — its root cause is the `provider_services.approvalStatus` default, which Phase 4's `provider_services` wiring must flip.
- **Provider payout rail** is a real supply-side gap (providers can't get paid via UI) — its own fix lane, not Phase B.
