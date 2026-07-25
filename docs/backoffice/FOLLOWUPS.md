# Provider Back-Office Program — Phase 0 Discovered Follow-Ups

**Date:** Jul 25, 2026  
**Status:** Out-of-scope discoveries from Phase 0 audit. Log-only (no fixes written). Recommend prioritization for future lanes.

---

## A. Schema & Modeling Gaps

### A1: Provider/Expert Handle/Slug (High Priority)

**Discovery:** No `handle` or `slug` field exists for providers or experts. Required by Primitive #1 (`/p/{handle}/{offering-slug}`).

**Impact:** Phase 1 blocker (cannot implement clean URLs without schema change).

**Recommendation:** **Phase 1 includes this.** Add `handle` to `users`, `slug` to `provider_services` + `expert_templates`. Additive-nullable migration.

**Filed for:** Phase 1 scope update.

---

### A2: Offering Slug Uniqueness (High Priority)

**Discovery:** `provider_services.slug` proposed in Phase 1. Uniqueness constraint must be scoped: per-user or global?

**Current model:** Service names are not unique globally; two experts can offer "Trip Planning" in Kyoto.

**Question:** Should `/p/alice/trip-planning` and `/p/bob/trip-planning` both be valid (unique within `user_id`) or should slugs be globally unique (only one "trip-planning" service across all providers)?

**Recommendation:** Scope uniqueness to `(user_id, slug)` — allows name reuse across providers, simple URL routing (`p/handle/slug` is unambiguous per user).

**Filed for:** Phase 1 design decision.

---

### A3: Capacity Model (Medium Priority)

**Discovery:** ServiceForm captures `capacity` (travelers per session), but the availability model doesn't enforce per-slot capacity. A slot can be overbooked if multiple bookings fit the calendar time window (see D11 audit).

**Example:** Service "Group yoga" capacity=10; two bookings of 6 travelers each = 12 travelers in same 2h slot. Conflict check in Phase 1 gates on time, not traveler count.

**Current behavior:** No enforcement; overbooking possible.

**Recommendation:**
- Phase 1 conflict check should also validate `traveler_count` (if available from booking data) against `capacity`
- Schema may need: `service_bookings.traveler_count` (number of travelers in booking)
- Backfill: assume 1 traveler per historic booking (conservative, may undercount groups)

**Filed for:** Phase 1 scope update (if scoping out capacity enforcement, document why).

---

## B. Attribution & Acquisition Modeling

### B1: Provider-Sourced Earnings Split Reporting (Medium Priority)

**Discovery:** Phase 3 adds `service_bookings.provider_id` + source field. Provider earnings view (D13) currently shows no per-source breakdown.

**Current UI:** Provider sees total held/releasable/paid_out, no detail on "how much is from my link vs. platform".

**Recommendation:** Phase 5 (analytics) should break down earnings by source when displaying to the provider. Example:
- Platform-sourced: $450 (15 bookings × $30 avg)
- Provider-sourced: $120 (10 bookings × $12 avg)
- Repeat-pair: $80 (5 bookings × $16 avg)

**Filed for:** Phase 5 analytics scope, or separate Phase 3+ brief if priority.

---

### B2: Acquired-Via Provider Matching (Medium Priority)

**Discovery:** Phase 2 captures `users.acquired_via_provider_id` at signup. No logic yet to "surface providers this user came from" or notify the acquiring provider of a cohort.

**Example:** 50 users signed up via Provider X's link. Does Provider X see "you acquired 50 travelers"? (Yes, Phase 5 analytics. But no proactive notification or thank-you.)

**Recommendation:** Phase 5+ builds a "Acquired travelers" cohort view + optional notification trigger (e.g., "Congrats, you've acquired 10 new travelers!").

**Filed for:** Phase 5 follow-up or separate acquisition-engagement brief.

---

### B3: Cross-Booking Referral Credit (Low Priority, Defer)

**Discovery:** Dispatch §1 mentions the flywheel: "A traveler who clicks a provider's link lands in OUR ecosystem. Their bookings of OTHER providers/services are platform-sourced at full band." Suggests a later "referral credit" lever (provider X gets a small cut of their acquired traveler's OTHER bookings).

**Current state:** Only `acquired_via_provider_id` is captured (infrastructure for this); no payout logic exists.

**Recommendation:** **Explicitly deferred.** This is a complex pricing decision (how much credit? how to prevent gaming?) that needs a separate brief and decision-maker input. Do not build infrastructure speculatively.

**Filed for:** Separate brief (Phase 6+), only if leadership confirms the flywheel strategy.

---

## C. Fee & Commission

### C1: Dynamic Pricing Integration (Medium Priority)

**Discovery:** Phase 4 surfaces "last-minute slot" posting prompt (Tier 1 social engine). No dynamic pricing logic exists (e.g., "discount 20% on empty slots").

**Current state:** ServiceForm captures static `price`; no per-date or per-demand adjustments.

**Recommendation:** Gap-fill pricing (discount % or exact price on low-availability dates) is a separate design effort. Social engine can reference it in the caption ("Last slot this week — $25 off") but the pricing logic itself must be built separately.

**Filed for:** Separate dynamic-pricing brief (Phase 4+ follow-up, if prioritized).

---

### C2: Deposit & Cancellation Policy (Medium Priority)

**Discovery:** ServiceForm doesn't capture deposit % or required cancellation policy (e.g., "50% non-refundable, 7-day cancellation window").

**Current behavior:** All bookings are fully refundable via Traveloure (platform merchant model). No provider-side cancellation policy exists.

**Recommendation:** For provider-sourced bookings (Primitive #1), custody is "contact provider directly" — but no terms are stored or displayed. Phase 1+ should add optional fields to ServiceForm:
- `depositPercent` (0-100, default 0 = no deposit required)
- `cancellationPolicy` (free-text or enum: "free up to 7 days", "non-refundable", etc.)
- Display on `/p/{handle}/{slug}` page

**Filed for:** Phase 1 scope update (optional for MVP, but recommend including for realism).

---

## D. Messaging & Coordination

### D1: Messaging Abstraction (High Priority)

**Discovery:** Messaging service exists but is incomplete (SMS/WhatsApp defined, not implemented). Dispatch says "Do NOT build WhatsApp BSP integration in early phases without a separate brief."

**Current state:** Email-only channel is production-ready. SMS/WhatsApp are no-ops.

**Recommendation:** Phase 1 adds coordination messaging (confirmation → reminder → day-of messages). Should:
1. Wire email reminders via existing `email.service.ts` (Phase 1 minimum viable)
2. **Do NOT build WhatsApp/SMS now** (separate brief required per dispatch §6)
3. Abstraction must allow swapping in SMS/WhatsApp later without rewriting coordination logic

**Example implementation:**
```typescript
// Coordination message sender (Phase 1, email-only)
async sendCoordinationMessage(
  booking_id: string,
  message_type: 'confirmation' | 'reminder' | 'day_of'
) {
  const channel = 'email'; // hardcoded MVP; later: read from user prefs/config
  const booking = await getBooking(booking_id);
  const template = getMessageTemplate(message_type, booking.offering_type);
  await sendMessage(booking.traveler_email, channel, template, booking);
}
```

**Filed for:** Phase 1 scope (email reminders as minimum viable); separate WhatsApp/SMS brief (Phase 2+).

---

### D2: Webhook on Booking Confirmation (Medium Priority)

**Discovery:** No event-driven hook triggers coordination messages. Phase 4 (social engine) needs "new review → share prompt" — this requires similar infra (webhook or explicit call).

**Current state:** Booking confirmation is synchronous in the checkout flow; no post-confirm side-effect service.

**Recommendation:** Design an event-driven hook system (or at least a post-confirm task):
- Checkout confirms → trigger `onBookingConfirmed(booking_id)`
- Handler: send confirmation message, queue reminder job, check for review prompt opportunity
- **Not a full event bus** (out of scope), but a simple hook pattern (call a service at known points)

**Filed for:** Phase 1 or Phase 3 (coordination messaging brief), not Phase 0.

---

## E. Social Engine & Asset Generation

### E1: Image Generation Infrastructure (High Priority)

**Discovery:** No image-generation capability exists. Satori recommended for Phase 4 (Tier 1).

**Implementation notes:**
- Satori requires `npm install satori` (adds ~1.5MB gzipped)
- Font files must be bundled (e.g., Roboto.ttf) or fetched from Google Fonts at runtime (one-time cost)
- Cache strategy: generated PNGs live in-memory for 24h (limit: ~10 images × 2 files × 500KB ≈ 10MB heap, acceptable)
- Fallback: if Satori fails, return brand-colors-only fallback (never fabricate)

**Recommendation:** Phase 4 should include font-bundling strategy and caching implementation. Satori documentation: https://github.com/vercel/satori.

**Filed for:** Phase 4 scope detail.

---

### E2: Hashtag & Caption Templating (Medium Priority)

**Discovery:** Captions must be per-offering-type (service vs. template vs. event). Hashtags must be per-market (Kyoto vs. other cities).

**Current state:** No template system exists; Phase 4 requires one.

**Recommendation:** Seed hashtag map in `platform_settings` per market + offering type:
```sql
INSERT INTO platform_settings (setting_key, setting_value) VALUES
('hashtags_kyoto_accommodation', '["#kyoto", "#stay", "#japan", "#local"]'),
('hashtags_kyoto_experience', '["#kyoto", "#experience", "#travel", "#local"]'),
…
```

Client-side caption template:
```typescript
const captionTemplate = getCaption(offering.offering_type, offering.city);
// "Book a {service} in {city}. {hashtags} {link}"
const caption = captionTemplate
  .replace('{service}', offering.name)
  .replace('{city}', offering.city)
  .replace('{hashtags}', getHashtags(offering.city, offering.offering_type).join(' '))
  .replace('{link}', shortLink);
```

**Filed for:** Phase 4 scope (config-driven, no code logic).

---

### E3: Tier 2 Social Auto-Posting (Out of Scope, Defer)

**Discovery:** Dispatch explicitly defers Tier 2 (OAuth + Instagram/TikTok APIs). Phase 4 is Tier 1 only (manual share).

**Reason:** Instagram Content Publishing API requires:
- Business or Creator account (not personal)
- Facebook Page connected
- API review process (30–60 days)
- TikTok Content Posting API similarly gated
- ~70% of Traveloure supply is personal accounts

**Recommendation:** **Do not scope Tier 2 in early phases.** If priority later:
1. Add provider preferences: "Auto-post my new reviews to Instagram?" (OAuth + permission grant)
2. Implement post-scheduler (queue + background job)
3. Separate brief + decision-maker sign-off

**Filed for:** Explicitly out-of-scope; requires separate Tier 2 brief.

---

## F. Data & Reporting

### F1: Analytics Data Completeness (Medium Priority)

**Discovery:** Phase 5 analytics backfill computes link views/clicks/conversions from `redirects` + `service_bookings`. No link-click tracking table exists today.

**Current state:** Redirects table has `created_at`; view is implicit (every redirect hit = view). No separate `link_analytics` historical data.

**Recommendation:** Phase 5 backfill should:
1. Compute from existing `redirects.created_at` (group by date, count rows = views)
2. Compute from `service_bookings.source='provider_sourced'` (group by date, count = conversions)
3. **Clicks** between view and conversion are interpolated (no click-drop data exists pre-Phase 5; assume 1:1 view→click)
4. Backfill conservatively (zero data is better than fabricated data per §13)

**Filed for:** Phase 5 scope (data completeness check before seeding analytics).

---

### F2: Review Card Export Metadata (Medium Priority)

**Discovery:** Phase 5 exports reviews as CSV. Export should include enough metadata for downstream use (social posting, print, etc.).

**Recommendation:** Phase 5 export should include:
- Date, reviewer name, rating, comment, verified status (basic)
- Service/offering name, city (context for social caption)
- Short link (to auto-fill caption if provider re-shares)
- Reviewer email (optional, for follow-up — privacy-gated)

**Filed for:** Phase 5 scope (export schema design).

---

## G. UI/UX & Surface

### G1: Provider Settings Page (Medium Priority)

**Discovery:** Provider settings exist (`client/src/pages/provider/settings.tsx`) but Phase 2 requires adding "Copy provider link" action and Phase 1 needs handle editing.

**Recommendation:** Settings page should gain:
- **Edit handle** field (with uniqueness check)
- **Generate short link** button (per-offering link generation)
- **Link copied to clipboard** success toast
- **Settings**: enable/disable provider-sourced bookings (later, v2)

**Filed for:** Phase 1-2 UI scope.

---

### G2: Backoffice Dashboard Layout (Medium Priority)

**Discovery:** Phases 1-5 require a provider backoffice (link copy, share assets, analytics, posting prompts). No unified dashboard exists today.

**Current state:** Provider pages are scattered: `/expert/services` (inventory), `/provider/earnings` (finance), no cohesive backoffice.

**Recommendation:** Create `/provider/backoffice` (or `/backoffice` for both roles):
- **Left sidebar:** Offerings, Analytics, Earnings, Sharing, Settings
- **Main panel:** Context-driven (click Offerings → service list; click Sharing → asset gallery, etc.)
- Unified nav and branding (§4 User Console theme)

**Filed for:** Phase 1 scope (may need UI designer input).

---

### G3: Link Preview Testing (Low Priority)

**Discovery:** Phase 1 requires OG tag implementation (edge function). No testing infra exists to verify link previews work correctly on WhatsApp/Slack/etc.

**Recommendation:** Add testing step to Phase 1 gates:
1. Generate short link
2. Paste into WhatsApp (sandbox account) → screenshot (preview should show offering name/price/photo)
3. Paste into Slack → screenshot
4. Verify meta tags via `curl -I` (OG headers present)

**Tool:** https://www.opengraphcheck.com (external, manual check).

**Filed for:** Phase 1 verification gate (add to behavioral proof).

---

## H. Compliance & Legal

### H1: Provider Cancellation Policy Enforceability (Low Priority)

**Discovery:** Phase 1 recommends capturing provider `cancellationPolicy` text. No backend logic enforces it — platform still refunds travelers via Traveloure (platform-merchant model).

**Question:** Is the cancellation policy display-only (informational) or does it affect refund eligibility?

**Recommendation:** Clarify with legal/product:
- **Option A (v1):** Display-only. Platform still refunds; cancellation policy is provider's responsibility (out of scope for v1).
- **Option B (v2+):** Platform respects policy (e.g., "non-refundable" → refund denied; "50% refundable" → partial refund). Requires logic update + refund flow changes.

**Filed for:** Product/legal decision, not Phase 0 scope.

---

### H2: Provider Earnings Tax Reporting (Low Priority)

**Discovery:** Phase 5 exports earnings for "formalization value in several markets." No tax-reporting helpers (1099, GST, etc.) built.

**Recommendation:** Formalization = documentation for tax purposes. Export format should be:
- Clear date, amount, service name (audit trail)
- CSV standard (importable to accounting software)
- **Do NOT compute taxes** (out of scope; provider handles with accountant)

**Filed for:** Phase 5 export design (keep simple, let provider handle tax calculation).

---

## I. Performance & Scalability

### I1: Short-Link Generation Throughput (Low Priority)

**Discovery:** Phase 2 generates short links on-demand per offering. No rate-limiting or daily quota.

**Current state:** Redirects table has no known size limit; assumes sparse dataset.

**Recommendation:** Phase 2 should consider:
- Rate-limit per provider (e.g., max 10 links/day — prevents spam/enumeration)
- Cleanup stale links (e.g., delete links for deleted offerings)
- Monitor redirects table size (early warning if explodes)

**Filed for:** Phase 2 scalability note (likely not needed for MVP, but flag for production).

---

### I2: Asset Generation Caching (Low Priority)

**Discovery:** Phase 4 generates images on-demand, caches 24h. No eviction strategy if memory fills.

**Recommendation:** Implement bounded cache (e.g., LRU, max 100 images). Satori calls are fast (~100ms), so re-generating on cache miss is acceptable.

**Filed for:** Phase 4 implementation detail.

---

## J. Maintenance & Observability

### J1: Link Attribution Audit Trail (Low Priority)

**Discovery:** Phase 2 captures source/provider_id/campaign_id at checkout. No log of "which provider referred this traveler" elsewhere (raw URL access logs may be lost).

**Recommendation:** For audit/debugging, consider storing one record per short-link resolution:
- Table: `link_resolution_log` (redirect_code, user_id, timestamp, booking_id nullable)
- Retention: 90 days (analytics backfill computes aggregates; raw log deleted after)
- Used for: debugging "why did this booking get provider-sourced rate?" and auditing provider link usage

**Filed for:** Phase 5+ if audit trails become important.

---

### J2: Error Handling in Asset Generation (Low Priority)

**Discovery:** Phase 4 recommends graceful fallback if Satori fails. No error logging strategy.

**Recommendation:** Log Satori errors to a monitoring service (Sentry, DataDog, etc.) so failures surface:
- Example: "Satori failed to render service asset for offering X: font load timeout"
- Alert threshold: > 5% failure rate → PagerDuty notification
- Does not block the endpoint (fallback returns brand-only card)

**Filed for:** Phase 4 observability (depends on platform's error-logging choice).

---

## Summary Table

| Follow-Up | Priority | Phase | Effort | Dependencies |
|-----------|----------|-------|--------|--------------|
| Handle/slug schema | High | 1 | Low | — |
| Offering slug uniqueness | High | 1 | Low | — |
| Capacity enforcement | Medium | 1 | Medium | Conflict-check logic |
| Earnings per-source breakdown | Medium | 5 | Low | Phase 3 data |
| Acquired traveler cohort | Medium | 5+ | Medium | Phase 2 data |
| Cross-booking referral credit | Low | 6+ | High | Pricing decision |
| Dynamic pricing | Medium | 4+ | High | Separate design |
| Deposit & cancellation | Medium | 1 | Low | ServiceForm update |
| Messaging abstraction (email MVP) | High | 1 | Medium | — |
| Webhook on booking confirm | Medium | 3 | Medium | Coordination brief |
| Image-generation (Satori) | High | 4 | Low | npm + fonts |
| Hashtag templating | Medium | 4 | Low | Config seeding |
| Tier 2 auto-posting | Low | 6+ | High | OAuth setup |
| Analytics backfill | Medium | 5 | Low | Data completeness check |
| Review export metadata | Medium | 5 | Low | CSV schema design |
| Backoffice dashboard | Medium | 1-2 | Medium | UI/layout decision |
| Link preview testing | Low | 1 | Low | Manual testing |
| Cancellation policy enforcement | Low | 2+ | Medium | Legal decision |
| Tax reporting helpers | Low | 5+ | Low | Accounting integration |
| Link generation rate-limiting | Low | 2 | Low | Spam prevention |
| Asset caching LRU | Low | 4 | Low | Memory management |
| Link resolution audit log | Low | 5+ | Low | Observability |
| Satori error logging | Low | 4 | Low | Error tracking |

---

## K. Real Defects Discovered by the Integration-Mapping Pass (Jul 25, 2026 — verified, file:line)

Found while mapping the mockups onto existing code. These are **live bugs**, not backoffice scope — filed
here per the do-not-absorb rule. None fixed.

### K1: Broken generated share links (High — user-facing)
`client/src/components/booking/VariantActionButtons.tsx:249` builds share links as `/shared-trip/${token}`,
but `App.tsx` registers only `/trips/shared/:token` (line 344) and `/itinerary-view/:token` (line 339). No
`/shared-trip/:token` route exists — every link generated by those share buttons lands on the SPA fallback.

### K2: Cross-sell conversion counters structurally zero (Medium — analytics integrity)
`service_bookings.source` is never written by any checkout path (the live `/api/checkout` insert at
`payments.routes.ts:473-490` omits it), yet `cross-sell.routes.ts:99,187,196` filter
`source = 'cross_sell'` for conversion analytics. The counts can never be non-zero. Either stamp source at
checkout (Phase 2 does this anyway) or stop reporting the metric.

### K3: ProviderAvailabilityManager sends incompatible payloads (Medium — dead surface)
`client/src/components/logistics/provider-availability-manager.tsx:64-72` POSTs `dayOfWeek`/`pricingModifier`
to `/api/provider/availability`, whose zod schema requires `serviceId`+`date` → every save 400s; it also
expects `{schedule, blackoutDates}` while the server returns a flat array, and its blackout-date calls
(l.92, 110) hit DARK handlers in the unmounted `experts.routes.ts:389-416` (200-HTML per §9). Rendered on
the provider dashboard's Logistics tab — a silently broken surface.

### K4: availability.service.ts queries tables that don't exist (Medium — hollow code)
`server/services/availability.service.ts:69` (`getAvailabilityCalendar`/`checkAvailability`) queries
`service_providers.capacity_per_day`, `capacity_reservations`, `blocked_dates` — none has a CREATE TABLE in
`server/migrations/` (verified). Errors are swallowed (returns `true`/`[]`). Exposed at
`GET /api/bookings/availability-calendar/:providerId`; the client wrappers (`bookingAPI.ts:102,121`) have
zero callers. Candidate for deletion in the dead-code lane, or the substrate decision in Phase 1 supersedes it.

### K5: Fabricated expert-analytics funnel numbers (§13-class — honesty)
`server/routes.ts:4445-4481` (`GET /api/expert/analytics/dashboard`): `profileViews = totalBookings*3.5`,
`quoteSent = *0.85`, `repeatRate = 35` ("Estimated") — invented multipliers rendered as real stats by
`expert/analytics.tsx:466`. Same class: provider analytics hardcoded change-% deltas
(`provider/analytics.tsx:77-102`), hardcoded category benchmarks (`routes.ts:4891-4892` categoryAvg 280 /
topPerformerAvg 450), and the provider dashboard's mock panels (`provider/dashboard.tsx:104-110, 225-245,
280-304, 364, 382-393`). The Phase-5 analytics build must replace, not restyle, these.

### K6: booking_funnel_analytics is writer-starved (Low)
The table (schema.ts:5203) has the right stage vocabulary and `provider_id`/`service_id` columns, and a
write endpoint exists (`POST /api/track/funnel`, content.routes.ts:7740) — but ZERO client callers. Empty
in practice. Phase 5 should either wire writers or use `cross_sell_events` (which has live data flow).

### K7: Referral-code fallback fabricates codes (Low)
`GET /api/expert/referrals` (`server/routes.ts:3469`) fabricates a fallback `REF-<userid>` code at l.3476
when none is stored; `influencer_referrals` (schema.ts:1200) has zero readers/writers. Reconcile when the
short-link lane lands.

### K8: wa.me sanitizer interaction (Design note, not a bug)
`server/utils/data-sanitizer.ts:222,243` deliberately redacts `wa.me`/WhatsApp mentions in provider-authored
content (anti-disintermediation). The Tier-1 share surface's WhatsApp deep-link is platform-generated and
fine — but its copy must never pass through that sanitizer, and the sanitizer must not be weakened for it.

---

**End Phase 0 Discovered Follow-Ups — Ready for Prioritization**
