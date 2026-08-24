# Traveloure Codebase Audit: Business Model Alignment

## Executive Summary

The Traveloure codebase is **significantly aligned** with the reframed Experience Planning business model (weddings, birthdays, proposals, corporate events in foreign cities). The schema, expert marketplace, vendor management, landing page marketing, and guest invite system all support event planning. However, there are **critical gaps** in monetization, terminology, and event-specific AI/coordination logic that need to be addressed before the platform fully matches the $5K-$50K event planning vision.

**Overall Assessment: 7/10 alignment** — Strong foundation, but monetization and AI sequencing need event-specific refactoring.

---

## What IS Aligned (The Strong Foundation)

### 1. Database Schema: Full Event Type Support ✅

The schema already supports all reframed event types:

```typescript
// shared/schema.ts:1044
export const experienceTypeSlugEnum = [
  "travel", "wedding", "proposal", "romance", "birthday", "corporate", 
  "boys-trip", "girls-trip", "date-night", "corporate-events", "reunions", 
  "wedding-anniversaries", "retreats", "baby-shower", "graduation-party", 
  "engagement-party", "housewarming-party", "retirement-party", 
  "career-achievement-party", "farewell-party", "holiday-party"
];
```

**Evidence:** `shared/schema.ts:1044-1049`

The schema also includes event-specific fields:
- `paymentFlowType`: group_split, joint, single_payer, multi_stakeholder
- `paymentComplexity`: low, medium, high, very_high
- `timingComplexity`: low, medium, high, very_high, extreme
- `contingencyLevel`: flexible, important, critical
- `typicalGroupSizeMin/Max` and `typicalDurationMin/MaxDays`

**Verdict:** The data model is ready for high-complexity events.

### 2. Landing Page: Experience-First Marketing ✅

The landing page (`client/src/pages/landing.tsx`) markets all event types with proper positioning:

| Event Type | Description | Expert Rates |
|-----------|-------------|-------------|
| Wedding | "Plan the perfect day" | $85-150/hr |
| Proposal | "Make it unforgettable" | $500-2,500 |
| Celebrations | "Mark special moments" | $200-1,500 |
| Corporate | "Team experiences" | $75-200/hr |

**Evidence:** `client/src/pages/landing.tsx:66-86` and `client/src/pages/landing.tsx:128-178`

**Verdict:** Marketing copy is already reframed. Users see an experience platform, not a travel app.

### 3. Expert Marketplace: Event Planner Role ✅

The expert marketplace has a dedicated **Event Planner** role:

```typescript
// client/src/pages/experts.tsx:345
{ role: "event_planner", label: "Event Planners" }
```

With role-specific copy:
> "Specialist event planners for weddings, proposals, and group celebrations. Let an expert make it unforgettable."

**Evidence:** `client/src/pages/experts.tsx:316-325`

The expert sidebar also distinguishes event planners:
```typescript
// client/src/components/expert/expert-sidebar.tsx:35
const isEventPlanner = expertType === "event_planner";
```

**Verdict:** Event planners are first-class citizens in the marketplace.

### 4. Guest Invite System: Destination Wedding Ready ✅

The guest invite system (`shared/guest-invites-schema.ts`) is explicitly built for destination weddings and events:

```typescript
// shared/guest-invites-schema.ts:8-11
// === GUEST INVITE SYSTEM ===
// Game-changing feature for destination weddings and events
// Allows per-guest personalized travel logistics based on their origin city
```

Features include:
- Per-guest RSVP tracking with dietary restrictions
- Origin city-based travel recommendations (SERP API-powered)
- Accommodation preferences (hotel block, own booking, with family)
- Transportation needs
- Personalized invite links (`/invite/{token}`)
- Guest travel plans table with flight/hotel data

**Evidence:** `shared/guest-invites-schema.ts:1-238`

**Verdict:** The guest invite system is a genuine competitive advantage for destination events.

### 5. Wedding Coordination Service: Ceremony-Aware Scheduling ✅

The `wedding-coordination.service.ts` builds ceremony-anchored timelines:

```typescript
// server/services/wedding-coordination.service.ts:45-61
const WEDDING_BLOCK_DEFAULTS = {
  hair_makeup:      { offset: -420, duration: 180, label: "Hair & Makeup" },
  getting_ready:    { offset: -240, duration: 60,  label: "Getting Ready" },
  first_look:       { offset: -180, duration: 30,  label: "First Look Photos" },
  ceremony:         { offset: 0,    duration: 30,  label: "Ceremony" },
  cocktail_hour:    { offset: 30,   duration: 60,  label: "Cocktail Hour" },
  reception_start:  { offset: 90,   duration: 30,  label: "Grand Entrance" },
  dinner:           { offset: 120,  duration: 90,  label: "Dinner" },
  speeches:         { offset: 210,  duration: 30,  label: "Speeches & Toasts" },
  first_dance:      { offset: 240,  duration: 15,  label: "First Dance" },
  cake_cutting:     { offset: 255,  duration: 15,  label: "Cake Cutting" },
  dancing:          { offset: 270,  duration: 120, label: "Dancing & Party" },
  send_off:         { offset: 390,  duration: 15,  label: "Send-off" },
};
```

**Evidence:** `server/services/wedding-coordination.service.ts:1-313`

**Verdict:** The wedding coordination service is sophisticated and ceremony-aware. This is a genuine differentiator.

### 6. Vendor Management: Contract + Payment Milestones ✅

The vendor management service supports:
- Vendor contracts with payment milestones
- Payment tracking (pending, paid, completed, overdue)
- Remaining balance calculations
- Communication logs (email, phone, meeting, message)

**Evidence:** `server/services/vendor-management.service.ts:1-480`

**Verdict:** Vendor management is ready for high-stakes event coordination.

### 7. PlanCard: Event Template Support ✅

The PlanCard component supports event-specific templates:

```typescript
// client/src/components/plancard/plancard-types.tsx:43-68
export const TEMPLATES: Record<string, TemplateConfig> = {
  travel: {
    activityLabel: "Activities",
    transportLabel: "Transport",
    statsLabels: ["Days", "Activities", "Transit Legs", "Transit Time"],
  },
  wedding: {
    activityLabel: "Events & Vendors",
    transportLabel: "Transport",
    statsLabels: ["Days", "Events", "Transfers", "Travel Time"],
  },
  corporate: {
    activityLabel: "Agenda",
    transportLabel: "Logistics",
    statsLabels: ["Days", "Sessions", "Transfers", "Travel Time"],
  },
};
```

**Evidence:** `client/src/components/plancard/plancard-types.tsx:36-68`

**Verdict:** PlanCard adapts labels to event type. Good UX alignment.

### 8. Provider Categories: Event Vendor Mapping ✅

The provider category mapping includes all event vendor types:

| Category | Keywords | SERP Types |
|-----------|----------|------------|
| Photography | photographer, videograph, portrait | photographer, photography_studio |
| Florist | florist, floral, bouquet, arrangement | florist, flower_shop |
| Catering | catering, caterer, buffet, banquet | caterer, food_service |
| Venue | venue, hall, ballroom, estate, garden | event_venue, wedding_venue, banquet_hall |
| Entertainment | dj, band, performer, musician | entertainment, live_music, dj_service |
| AV Equipment | projector, screen, microphone | audio_visual_equipment_rental |
| Team Building | team building, corporate, workshop | team_building, corporate_event |
| Decorations | decor, balloon, lighting, centerpiece | event_planner, decorator |
| Rentals | rental, furniture, tent, table, chair | party_equipment_rental |

**Evidence:** `shared/constants/providerCategories.ts:1-353`

**Verdict:** The vendor discovery engine can find all event vendor types.

### 9. Content Surface Map: Event-Specific Tabs ✅

The content surface map has dedicated tabs for event types:

```typescript
// shared/content-surface-map.ts:161-186
// ── Wedding template ──────────────────────────────────────
rehearsal: ["service", "experience"],
"welcome-events": ["experience", "template"],
"local-experiences": ["experience", "template"],

// ── Proposal template ────────────────────────────────────
locations: ["experience", "template", "service"],
"celebration-dining": ["service", "experience"],
"post-proposal": ["experience", "service"],

// ── Party templates ────────────────────────────────────
decorations: ["service"],
rentals: ["service"],
av: ["service"],

// ── Bachelor / bachelorette template ───────────────────
destinations: ["experience", "template"],
"daytime-activities": ["experience", "template"],
"party-services": ["service"],
```

**Evidence:** `shared/content-surface-map.ts:140-186`

**Verdict:** Content discovery is event-aware.

### 10. Optimization Fees: Event-Type Pricing ✅

The optimization fee service supports event-type-specific pricing:

```typescript
// server/services/optimization-fee.service.ts:20-26
// Per §4.8, event-type overrides ($49.99 for wedding/proposal/corporate) 
// live as seeded DB rows — not as code constants
```

Resolution order:
1. Event-type-specific row (e.g., wedding = $49.99)
2. Tier-level default (simple/standard/complex = $9.99)
3. Code fallback ($9.99)

**Evidence:** `server/services/optimization-fee.service.ts:1-79`

**Verdict:** The AI optimization fee structure already recognizes that weddings/proposals/corporate events have higher willingness-to-pay.

### 11. Admin Event Packages: Full Catalog Support ✅

The admin event packages page supports:
- Event types: wedding, proposal, corporate, honeymoon, anniversary, birthday, other
- Market-specific packages (city/region)
- Price-from (cents) or "Quote on request"
- Status: active, paused, archived

**Evidence:** `client/src/pages/admin/event-packages.tsx:1-277`

**Verdict:** Admin can curate event packages by market and type.

### 12. Multi-Person Coordination: Group Event Management ✅

The multi-person coordination component supports:
- Attendee RSVP tracking (pending, confirmed, declined, maybe)
- Payment tracking (pending, partial, paid)
- Per-person cost tracking
- Group messaging (announcements + chat)
- Dietary restrictions and accessibility needs
- Payment reminders

**Evidence:** `client/src/components/logistics/multi-person-coordination.tsx:1-506`

**Verdict:** Group event coordination is ready. Just needs to be integrated into the event workflow.

---

## Critical Gaps (What Needs Work)

### Gap 1: Monetization is Still Travel-Focused ❌

**Problem:** The pricing page (`client/src/pages/pricing.tsx`) and credit system are designed for frequent travelers, not event planners.

```typescript
// client/src/pages/pricing.tsx:48-66
{
  name: "Pro",
  price: "$14.99",
  period: "/month",
  description: "For frequent travelers who want more",
  features: [
    "25 credits per month",
    "Priority AI processing",
    "Unlimited trip saves",
    "Expert chat access",
    "Advanced itinerary features",
    "Trip collaboration tools"
  ]
}
```

**Issues:**
- $14.99/month with 25 credits is wrong for a $5K-$50K event platform
- Credits are meaningless for one-time events (weddings, proposals)
- "Frequent travelers" copy is off-brand
- No event-specific pricing tier

**Evidence:** `client/src/pages/pricing.tsx:27-80`

**Impact:** HIGH — This directly undermines the $5K-$50K transaction model.

**Fix:** Replace credit-based pricing with event coordination fees:
- **Free**: AI planning + basic itinerary
- **Event Coordination ($49.99-$499)**: Expert review, vendor booking, timeline management
- **Full Service (5-15% of event cost)**: Done-for-you planning

---

### Gap 2: "Trip" Terminology Everywhere ❌

**Problem:** The create-trip page and all user-facing flows still use "trip" language.

```typescript
// client/src/pages/create-trip.tsx:70-76
const steps = [
  { id: 1, title: "Event Type", description: "What kind of trip is this?" },
  { id: 2, title: "Destination", description: "Where do you want to go?" },
  { id: 3, title: "Dates", description: "When are you traveling?" },
  { id: 4, title: "Preferences", description: "Customize your experience" },
  { id: 5, title: "Review", description: "Confirm your trip details" },
];
```

Even though the event types are correct (wedding, proposal, birthday, corporate), the copy still says "trip" and "traveling."

**Evidence:** `client/src/pages/create-trip.tsx:70-76`

**Impact:** MEDIUM — Confusing UX. Users creating a wedding see "When are you traveling?"

**Fix:** Rename all user-facing "trip" → "experience" or "event":
- "What kind of trip is this?" → "What are you planning?"
- "When are you traveling?" → "When is your event?"
- "Confirm your trip details" → "Confirm your event details"
- "Unlimited trip saves" → "Unlimited experience saves"

---

### Gap 3: Budget Controls are Travel-Focused ❌

**Problem:** The budget options in create-trip are per-day travel budgets, not event budgets.

```typescript
// client/src/pages/create-trip.tsx:64-68
const budgetOptions = [
  { id: "budget", label: "Budget", description: "$50-100/day" },
  { id: "moderate", label: "Moderate", description: "$100-250/day" },
  { id: "luxury", label: "Luxury", description: "$250+/day" },
];
```

For a wedding with 50 guests over 3 days, $250/day is irrelevant. The user needs a total event budget ($10K, $25K, $50K, $100K+).

**Evidence:** `client/src/pages/create-trip.tsx:64-68`

**Impact:** HIGH — Event planners need total budget, not per-day budget.

**Fix:** Replace per-day budgets with event budget tiers:
- Micro (under $5K): Intimate proposals, small birthdays
- Standard ($5K-$25K): Most weddings, corporate retreats
- Premium ($25K-$75K): Destination weddings, large corporate events
- Luxury ($75K+): High-end weddings, VIP corporate

---

### Gap 4: Smart Sequencing is Travel-Only ❌

**Problem:** The smart sequencing service (`smart-sequencing.service.ts`) only has travel activity rules (spa after hiking, walk after heavy meal). It has ZERO event-specific sequencing rules.

```typescript
// server/services/smart-sequencing.service.ts:37-50
{
  id: 'spa-after-adventure',
  name: 'Recovery Spa',
  description: 'Schedule spa or massage after high-intensity adventure activities',
  triggerActivity: ['adventure', 'hiking', 'water_sports', 'skiing', 'climbing'],
  suggestedFollowUp: ['spa', 'wellness', 'massage'],
}
```

Missing rules for:
- Wedding: Ceremony → Cocktail Hour → Reception → Dancing
- Proposal: Location scout → Setup → Proposal moment → Celebration dinner
- Corporate: Registration → Keynote → Breakout sessions → Networking
- Birthday: Arrival → Activities → Cake → Dancing → Send-off

**Evidence:** `server/services/smart-sequencing.service.ts:1-1610`

**Impact:** MEDIUM — The AI optimizer can't build event timelines without event-specific rules.

**Fix:** Add event-specific sequencing rules:
```typescript
{
  id: 'cocktail-after-ceremony',
  name: 'Wedding Flow',
  description: 'Cocktail hour must follow ceremony immediately',
  triggerActivity: ['ceremony'],
  suggestedFollowUp: ['cocktail_hour'],
  timeGapMinutes: { min: 0, max: 15 },
  priority: 10,
  category: 'event_flow'
}
```

---

### Gap 5: Only Wedding Coordination Service Exists ❌

**Problem:** The only event-specific coordination service is `wedding-coordination.service.ts`. There are no equivalent services for:
- Proposal coordination (location scout, photographer, musician timing)
- Birthday party coordination (venue, entertainment, catering, cake timing)
- Corporate event coordination (registration, AV, catering, speaker schedule)
- Anniversary coordination (romantic dinner, photographer, special touches)

**Evidence:** `server/services/wedding-coordination.service.ts` exists, but no `proposal-coordination.service.ts`, `birthday-coordination.service.ts`, or `corporate-coordination.service.ts`.

**Impact:** HIGH — Each event type needs its own coordination logic.

**Fix:** Create coordination services for each major event type:
- `proposal-coordination.service.ts`: Location scout → Setup → Proposal → Celebration
- `birthday-coordination.service.ts`: Arrival → Activities → Cake → Dancing → Send-off
- `corporate-coordination.service.ts`: Registration → Keynote → Breakouts → Networking → Dinner

---

### Gap 6: Guest Invite System is Wedding-Only ❌

**Problem:** The guest invite system is hardcoded for weddings. The UI labels, default templates, and flows assume a wedding context.

```typescript
// client/src/components/GuestInviteManager.tsx:4
// Guest Invite Manager Component
// For event organizers to create and manage guest invites
```

While the schema is generic, the UI components are wedding-specific.

**Evidence:** `client/src/components/GuestInviteManager.tsx:1-428` and `client/src/pages/GuestInvitePage.tsx:1-593`

**Impact:** MEDIUM — Corporate events and birthdays need guest management too.

**Fix:** Generalize the guest invite system:
- Make RSVP questions event-type aware (dietary for weddings, dietary + accessibility for corporate, age for kids' birthdays)
- Allow custom invite templates per event type
- Support corporate attendee lists (company, title, department)
- Support birthday guest lists (age, parent contact for kids)

---

### Gap 7: Payment Page Has Fixed $45 Fee ❌

**Problem:** The payment page has a hardcoded $45 service fee regardless of event size or value.

```typescript
// client/src/pages/payment.tsx:62-63
const serviceFee = subtotal > 0 ? 45 : 0;
const total = subtotal - discount + serviceFee;
```

For a $50K wedding, a $45 fee is meaningless. For a $500 proposal, it's 9%.

**Evidence:** `client/src/pages/payment.tsx:60-64`

**Impact:** HIGH — The fee structure doesn't scale with event value.

**Fix:** Implement event-scaled fees:
- **AI Planning Fee**: $9.99-$49.99 (flat, based on event type)
- **Coordination Fee**: 5-10% of event budget or $499-$4,999 flat
- **Payment Processing**: 2.9% + $0.30 (standard Stripe)
- **Service Fee**: Scale with event size (e.g., $5 per vendor booked)

---

### Gap 8: AI Optimizer Frames as "Trip" Optimization ❌

**Problem:** The AI optimizer (`trip-optimization.service.ts`) and cart optimization flow still frame everything as "trip" optimization.

```typescript
// server/services/trip-optimization.service.ts:19-31
export interface TripOptimizationRequest {
  destination: string;
  dates: { start: string; end: string };
  travelers: number;
  budget?: number;
  eventType?: string;  // Optional, not primary
  interests: string[];
  pacePreference?: "relaxed" | "moderate" | "packed";
  cartItems?: CartItem[];
}
```

The `eventType` field is optional and the primary context is still a travel itinerary.

**Evidence:** `server/services/trip-optimization.service.ts:1-347`

**Impact:** MEDIUM — The AI optimizer needs to understand event flow, not just travel sequencing.

**Fix:** Make `eventType` primary and add event-specific optimization logic:
- For weddings: optimize around ceremony time, vendor coordination, guest flow
- For proposals: optimize around surprise timing, photographer positioning, backup plans
- For corporate: optimize around session transitions, breakout rotations, networking time
- For birthdays: optimize around activity energy curve, cake timing, parent coordination

---

### Gap 9: No Event-Specific Upsell Slots ❌

**Problem:** The upsell engine (`upsell-engine.service.ts`) has generic surfaces but no event-specific upsell slots.

Surfaces defined:
```typescript
// server/services/upsell-engine.service.ts:33-37
export type Surface =
  | "discover_location" | "discover_date"
  | "template_builder"  | "cart" | "checkout"
  | "optimize_gate"     | "plancard_pretrip" | "plancard_ontrip"
  | "expert_review"     | "ai_concierge" | "post_booking";
```

Missing event-specific upsell slots:
- "wedding_vendor_add_on" (florist, cake, DJ)
- "proposal_photographer_upgrade" (drone, second shooter)
- "corporate_catering_upgrade" (premium menu, dietary options)
- "birthday_entertainment_add_on" (magician, bounce house)

**Evidence:** `server/services/upsell-engine.service.ts:1-429`

**Impact:** MEDIUM — Missing revenue opportunities during event planning.

**Fix:** Add event-specific upsell slots:
```typescript
export type Surface = 
  // ... existing surfaces ...
  | "wedding_vendor_gate" | "proposal_extras_gate" 
  | "corporate_catering_gate" | "birthday_entertainment_gate";
```

---

### Gap 10: Selection Controls are Travel-Biased ❌

**Problem:** The selection control seed data only has budget controls for travel. Wedding and corporate controls have no budget filters because the current $0-$500 engine can't handle event vendor prices.

```typescript
// shared/selection-control-seed.ts:14-21
// Budget (priceRange) is seeded only on travel — its prices (80–2499) span
// the bands. Wedding/corporate vendor prices exceed #462's 0–500 sentinel,
// so a budget band there would empty results; omitted.
```

**Evidence:** `shared/selection-control-seed.ts:1-85`

**Impact:** MEDIUM — Users can't filter vendors by budget for events.

**Fix:** Expand the budget engine to handle event price ranges:
- Wedding vendors: $500-$50,000
- Corporate vendors: $1,000-$100,000
- Proposal vendors: $200-$10,000
- Birthday vendors: $100-$5,000

---

## Feature & Product Recommendations

### Immediate (This Week)

1. **Rebrand "Trip" → "Experience" in User-Facing Copy**
   - Change create-trip page copy: "What kind of trip is this?" → "What are you planning?"
   - Change pricing page: "For frequent travelers" → "For event planners and hosts"
   - Change all "trip saves" → "experience saves"
   - **Files:** `client/src/pages/create-trip.tsx`, `client/src/pages/pricing.tsx`, `client/src/pages/landing.tsx`

2. **Add Event Budget Tiers to Create-Trip**
   - Replace `$50-100/day` with event budget tiers
   - Add `totalBudget` field to the trip schema
   - **Files:** `client/src/pages/create-trip.tsx`, `shared/schema.ts`

3. **Make AI Optimizer Event-Type Aware**
   - Pass `eventType` as primary context to optimization API
   - Add event-specific optimization prompts to Grok service
   - **Files:** `server/services/trip-optimization.service.ts`, `server/services/grok.service.ts`

### Short-Term (This Month)

4. **Create Event-Specific Coordination Services**
   - `proposal-coordination.service.ts`: Proposal timeline builder
   - `birthday-coordination.service.ts`: Birthday party timeline builder
   - `corporate-coordination.service.ts`: Corporate event timeline builder
   - **Pattern:** Follow `wedding-coordination.service.ts` as template

5. **Generalize Guest Invite System**
   - Make RSVP questions event-type aware
   - Add corporate attendee fields (company, title)
   - Add birthday guest fields (age, parent contact)
   - **Files:** `client/src/components/GuestInviteManager.tsx`, `client/src/pages/GuestInvitePage.tsx`

6. **Add Event-Specific Upsell Slots**
   - Add `wedding_vendor_gate`, `proposal_extras_gate`, `corporate_catering_gate`, `birthday_entertainment_gate`
   - Populate with event-specific offerings
   - **Files:** `server/services/upsell-engine.service.ts`, `server/services/upsell-slot-config.service.ts`

7. **Expand Budget Engine for Events**
   - Expand price range engine to $0-$100,000
   - Add budget controls to wedding, corporate, proposal, birthday templates
   - **Files:** `shared/selection-control-seed.ts`, `server/services/selection-control.service.ts`

### Medium-Term (Next Quarter)

8. **Redesign Monetization Model**
   - Replace credit-based pricing with event coordination fees
   - **Free**: AI planning + basic itinerary
   - **Coordination ($49.99-$499)**: Expert review, vendor booking, timeline management
   - **Full Service (5-15% of event budget)**: Done-for-you planning
   - **Files:** `client/src/pages/pricing.tsx`, `server/services/optimization-fee.service.ts`, `shared/schema.ts`

9. **Add Event-Specific Smart Sequencing Rules**
   - Wedding: Ceremony → Cocktail → Reception → Dancing → Send-off
   - Proposal: Scout → Setup → Proposal → Photos → Dinner
   - Corporate: Registration → Keynote → Breakouts → Networking → Dinner
   - Birthday: Arrival → Activities → Cake → Dancing → Send-off
   - **Files:** `server/services/smart-sequencing.service.ts`

10. **Build Event-Specific Contract Templates**
    - Wedding vendor contract template (photographer, florist, caterer, DJ)
    - Proposal vendor contract template (photographer, musician, venue)
    - Corporate vendor contract template (catering, AV, venue, speaker)
    - Birthday vendor contract template (entertainment, catering, venue)
    - **Files:** `server/services/vendor-management.service.ts`, `client/src/pages/expert/contract-categories.tsx`

11. **Integrate Multi-Person Coordination into Event Workflows**
    - Add RSVP tracking to trip details page
    - Add group payment tracking
    - Add group messaging
    - **Files:** `client/src/pages/trip-details.tsx`, `client/src/components/logistics/multi-person-coordination.tsx`

### Long-Term (Next 6 Months)

12. **Build Event-Specific AI Concierge Prompts**
    - Wedding AI: "You're a wedding planner. Build a ceremony-anchored timeline."
    - Proposal AI: "You're a proposal planner. Build a surprise timeline with backups."
    - Corporate AI: "You're a corporate event planner. Build an agenda with breaks."
    - Birthday AI: "You're a party planner. Build a fun timeline with energy curve."
    - **Files:** `server/services/grok.service.ts`, `server/services/itinerary-intelligence.service.ts`

13. **Add Event-Specific Emergency/Contingency Plans**
    - Wedding: Rain backup, vendor no-show, dress emergency
    - Proposal: Location unavailable, weather backup, photographer delay
    - Corporate: Speaker cancellation, AV failure, catering delay
    - Birthday: Entertainer cancellation, venue issue, weather backup
    - **Files:** `server/services/emergency.service.ts`

14. **Build Event-Specific Analytics Dashboards**
    - Wedding: RSVP rate, vendor booked %, budget utilization, guest satisfaction
    - Corporate: Attendance rate, session engagement, networking score, ROI
    - Birthday: RSVP rate, activity engagement, parent satisfaction
    - **Files:** `client/src/pages/expert/dashboard.tsx`, `client/src/pages/provider/dashboard.tsx`

---

## Priority Matrix

| Priority | Gap | Effort | Impact | Fix |
|----------|-----|--------|--------|-----|
| P0 | Monetization model | Medium | HIGH | Replace credits with event fees |
| P0 | "Trip" terminology | Low | MEDIUM | Rename all user-facing copy |
| P0 | Event budget tiers | Low | HIGH | Add total budget field |
| P1 | Wedding-only coordination | Medium | HIGH | Build proposal/birthday/corporate services |
| P1 | Guest invite system | Medium | MEDIUM | Generalize for all event types |
| P1 | Payment fee scaling | Low | HIGH | Make service fee event-scaled |
| P2 | Smart sequencing | Medium | MEDIUM | Add event-specific rules |
| P2 | AI optimizer framing | Medium | MEDIUM | Make eventType primary |
| P2 | Upsell slots | Medium | MEDIUM | Add event-specific gates |
| P3 | Budget engine | Medium | LOW | Expand price range to $100K |
| P3 | Contract templates | Medium | LOW | Build event-specific templates |
| P3 | Analytics | High | LOW | Build event-specific dashboards |

---

## Conclusion

The Traveloure codebase is **significantly ahead** of a typical travel app. The schema, expert marketplace, vendor management, guest invites, and wedding coordination service all prove the platform was built with events in mind. The landing page already markets weddings, proposals, and corporate events correctly.

**The main gaps are:**
1. **Monetization** — Credits and $14.99/mo don't fit $5K-$50K events
2. **Terminology** — "Trip" and "traveling" language undermines the experience brand
3. **AI Logic** — Smart sequencing and optimization are travel-only, not event-aware
4. **Coordination Services** — Only weddings have a coordination service; proposals, birthdays, and corporate events need their own

**The recommendation is to proceed with the reframed model.** The code foundation is solid. The gaps are well-defined and fixable. The biggest risk is the monetization model — if you try to charge wedding planners $14.99/month for credits, you'll fail. But if you charge 5-10% of a $25K wedding ($1,250-$2,500), the unit economics work beautifully.

**Next steps:**
1. Fix the terminology (this week)
2. Add event budget tiers (this week)
3. Redesign the pricing page (this month)
4. Build proposal/birthday/corporate coordination services (this month)
5. Generalize the guest invite system (this month)

The code is ready. The business model is right. Just need to bridge the gaps.
