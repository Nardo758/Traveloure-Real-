# Traveloure — Technical Architecture Document

**Date:** June 2026  
**Audience:** Engineering Team, CTO, Technical Stakeholders  
**Status:** Current State + Recommended Improvements

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Architecture Decision Records (ADRs)](#2-architecture-decision-records-adrs)
3. [Database Schema Improvements](#3-database-schema-improvements)
4. [API Layer Structure](#4-api-layer-structure)
5. [Lead Routing Service Improvements](#5-lead-routing-service-improvements)
6. [Payment Architecture](#6-payment-architecture)
7. [Auth & Role Architecture](#7-auth--role-architecture)
8. [Funnel Analytics Architecture](#8-funnel-analytics-architecture)
9. [Viral / Sharing Architecture](#9-viral--sharing-architecture)
10. [Sequence Diagrams](#10-sequence-diagrams)
11. [Market Launch Scalability](#11-market-launch-scalability)
12. [Security & Compliance](#12-security--compliance)
13. [Priority Order & Production Risks](#13-priority-order--production-risks)

---

## 1. System Architecture Overview

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│                                                                 │
│  React 18 + Vite + TypeScript + Tailwind + shadcn/ui           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Traveler │  │  Expert  │  │ Provider │  │    Admin     │   │
│  │   Pages  │  │  Pages   │  │  Pages   │  │  Dashboard   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │              │               │            │
│  TanStack Query (caching, optimistic updates, invalidation)     │
└───────┼──────────────┼──────────────┼───────────────┼───────────┘
        │              │              │               │
        └──────────────┴──────┬───────┴───────────────┘
                               │ HTTPS / JSON REST
┌──────────────────────────────▼──────────────────────────────────┐
│                       API GATEWAY LAYER                         │
│                                                                 │
│  Express + TypeScript (Node.js)                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐    │
│  │  Middleware  │  │  Rate Limit  │  │   Session (pg-store) │   │
│  │  Auth Guard  │  │  Helmet/CORS │  │   Passport.js        │   │
│  └─────────────┘  └──────────────┘  └─────────────────────┘    │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   ROUTE MODULES (20+)                    │   │
│  │  auth | trips | leads | experts | providers | bookings   │   │
│  │  payments | admin | content | transport | messages | ... │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                      SERVICE LAYER                              │
│                                                                 │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │ Lead Routing │  │  AI Orchestrator │  │  Stripe Service  │   │
│  │   Service    │  │  (Grok + Claude) │  │ (Connect+Webhook) │  │
│  └──────────────┘  └─────────────────┘  └──────────────────┘   │
│                                                                 │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │   Amadeus    │  │  Viator / Fever  │  │  Cache Scheduler │   │
│  │   Service    │  │    Services      │  │  (24h TTL)       │   │
│  └──────────────┘  └─────────────────┘  └──────────────────┘   │
│                                                                 │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │  Commission  │  │  Funnel Events  │  │  Notification    │   │
│  │   Service    │  │   Service (NEW) │  │   Service        │   │
│  └──────────────┘  └─────────────────┘  └──────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                      DATA LAYER                                 │
│                                                                 │
│  PostgreSQL (via Drizzle ORM)                                   │
│  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │ users  │ │  trips   │ │ bookings │ │  itinerary_comparisons│ │
│  └────────┘ └──────────┘ └──────────┘ └──────────────────────┘ │
│  ┌────────────────┐ ┌────────────┐ ┌────────────────────────┐  │
│  │ expert_requests│ │lead_routing│ │  funnel_events (NEW)   │  │
│  └────────────────┘ └────────────┘ └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                    EXTERNAL SERVICES                            │
│  Stripe (Connect + Identity + Treasury) │ Google Maps           │
│  Amadeus API │ Viator API │ Fever API │ SerpAPI │ 12Go          │
│  Grok (xAI) │ Anthropic Claude │ Instagram Business API        │
└─────────────────────────────────────────────────────────────────┘
```

### How the Three Parties Interact at a Data Level

```
TRAVELER ──creates──► trip
                        │
                        ├──triggers──► AI itinerary generation
                        │               └──saves──► itinerary_comparisons
                        │                           └──variants──► itinerary_variants
                        │
                        ├──selects variant──► cart_items
                        │
                        └──requests expert──► expert_requests (status=pending)
                                                │
                                                ▼
                                    LEAD ROUTING ENGINE
                                    (scores all approved experts)
                                                │
                                                ▼
                              expert_requests (status=assigned)
                                    assignedExpertId = expert.id
                                                │
                              LOCAL EXPERT ◄────┘
                                    │
                                    ├──accepts──► expert_requests (in_progress)
                                    ├──recommends──► service_provider services
                                    └──completes──► bookings + payout trigger
                                                        │
                              SERVICE PROVIDER ◄────────┘
                                    │
                                    └──receives booking──► revenue (4-12% fee)
```

### Where Smart Lead Routing Sits

```
T5 Trigger: expert_requests INSERT (status=pending)
                │
                ▼
POST /api/leads/route
                │
                ▼
lead-routing.service.ts
  1. Query: approved experts WHERE status='approved'
  2. Score each: destination(40) + specialty(25) + availability(20) + response_rate(15)
  3. Sort descending, pick top expert
  4. UPDATE expert_requests SET assignedExpertId, status='assigned'
  5. INSERT lead_routing_logs (audit trail)
  6. Notify expert (email / in-app)
```

---

## 2. Architecture Decision Records (ADRs)

### ADR-001: Commission Rate Architecture — Booking Surface Governs Rate

**Status:** DECISION REQUIRED (current conflict)

**Context:**  
Two conflicting commission models exist in the codebase:
- `server/routes.ts` experience/cart checkout: flat **30% platform fee**
- Business plan for expert-mediated bookings: **75/25 split** (expert/platform)
- Provider direct bookings: **4-12% by insurance tier**

**Decision:**  
Route commission calculation through a single `CommissionService` that determines rate based on **booking surface**, not booking type alone.

| Booking Surface | Commission Model | Rate |
|---|---|---|
| Cart checkout (traveler self-service) | Platform fee | 30% |
| Expert-recommended booking | Expert split | 75/25 (or 85/15 for new experts) |
| Provider direct booking | Insurance tier | 4-12% |
| Discount partner booking | Affiliate | 3% |

```typescript
// server/services/commission.service.ts
type BookingSurface = 'cart' | 'expert_mediated' | 'provider_direct' | 'affiliate';

function calculateCommission(surface: BookingSurface, amount: number, expertTenure?: 'new' | 'standard') {
  switch (surface) {
    case 'cart':            return { platform: amount * 0.30, provider: amount * 0.70 };
    case 'expert_mediated': return expertTenure === 'new'
                              ? { platform: amount * 0.15, expert: amount * 0.85 }
                              : { platform: amount * 0.25, expert: amount * 0.75 };
    case 'provider_direct': return tierBasedSplit(amount); // 4-12%
    case 'affiliate':       return { platform: amount * 0.03, partner: amount * 0.97 };
  }
}
```

**Consequence:** All booking creation endpoints must pass `surface` to CommissionService before creating a `bookings` row. The current 30% flat rate on expert-mediated bookings is incorrect and must be fixed.

---

### ADR-002: Role Verification Gate — Server-Side Enforcement at Signup

**Status:** IMMEDIATE FIX REQUIRED

**Context:**  
`emailAuth.ts:92` writes `role=userType` directly from the request body with no server-side gate. Any user can self-declare `role=admin`.

**Decision:**  
All users create with `role='user'` only. Role upgrades require a verified application.

```typescript
// emailAuth.ts — REPLACE
const role = req.body.userType; // ← DANGEROUS, remove this

// WITH
const role = 'user'; // Always. Role upgrades happen via approved applications only.
```

Role upgrade path:
```
user → local_expert:    local_expert_forms.status = 'approved' → UPDATE users SET role='local_expert'
user → service_provider: service_provider_forms.status = 'approved' → UPDATE users SET role='service_provider'
user → admin:           Manual DB update by existing admin only (no API endpoint)
```

**Consequence:** Existing users who self-declared expert/provider roles must be audited. A one-time migration should set `role='user'` for all users without a corresponding approved application form.

---

### ADR-003: Approved vs Payable — Two Independent Flags

**Status:** SCHEMA EXISTS, ENFORCEMENT MISSING

**Context:**  
An expert can be `status='approved'` (routing-eligible) but have incomplete Stripe Connect (`stripe_account_status != 'active'`). Currently the system may assign leads to experts who cannot receive payouts.

**Decision:**  
Track both flags independently and enforce both at payout time.

```
approved (routing gate):  local_expert_forms.status = 'approved'
payable (payout gate):    users.can_receive_payments = true
                          (set by Stripe Connect webhook: account.updated)
```

Rules:
- **Lead routing:** requires `status='approved'` only (experts should still receive leads even without Connect)
- **Payout execution:** requires `can_receive_payments = true` 
- **Admin dashboard:** must display both flags separately with a "Payable" column

**Consequence:** Add a background job that checks for experts with `status='approved'` but `can_receive_payments=false` and sends a reminder to complete Connect onboarding.

---

### ADR-004: Funnel Events — Single Audit Table Over Join Hell

**Status:** NOT YET BUILT

**Context:**  
Answering "how many users reached T5 this week?" currently requires joining 5+ tables: users + trips + itinerary_comparisons + expert_requests + lead_routing_logs. This is fragile, slow, and missing T0/T1/T2 data entirely.

**Decision:**  
Introduce a `funnel_events` append-only table that fires at each stage transition.

```
T0: anonymous_session_started
T1: user_registered
T2: trip_created
T3: itinerary_generated
T4: item_added_to_cart
T5: expert_request_created / lead_routed / lead_assigned
T6: payment_completed / credits_purchased / booking_confirmed
T7: trip_shared / participant_invited / viral_entry
```

Events are **fire-and-forget** — application logic never waits on them. Use `process.nextTick()` or a lightweight queue.

**Consequence:** All major API endpoints must emit a funnel event. This is additive (no existing logic changes). Start with T3→T6 where revenue attribution is most critical.

---

### ADR-005: routes.ts Decomposition — Module Boundaries by Domain

**Status:** IN PROGRESS (20 modules exist, 12,769-line routes.ts remains)

**Context:**  
`server/routes.ts` has 12,769 lines and 433 endpoints. It is the single largest source of merge conflicts, deployment risk, and onboarding friction. 20 route modules have already been extracted but the monolith remains the primary file.

**Decision:**  
Complete the decomposition in two phases:

**Phase 1 (immediate):** Extract the highest-risk endpoints from routes.ts into existing modules:
- All `/api/leads/*` → `leads.routes.ts` (NEW)
- All `/api/commission/*` → `commission.routes.ts` (NEW)  
- All `/api/wallet/*` and `/api/credits/*` → `payments.routes.ts` (exists)
- All `/api/ai/*` → `ai.routes.ts` (NEW)

**Phase 2 (next sprint):** Deprecate routes.ts entirely. Each module registers its own router and is mounted in `server/index.ts`:
```typescript
app.use('/api/auth',      authRoutes);
app.use('/api/trips',     tripRoutes);
app.use('/api/leads',     leadRoutes);
app.use('/api/experts',   expertRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/bookings',  bookingRoutes);
app.use('/api/payments',  paymentRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/ai',        aiRoutes);
```

**Consequence:** routes.ts shrinks by ~80%. Every new endpoint must go into its domain module. No new code in routes.ts.

---

## 3. Database Schema Improvements

### 3A. funnel_events Table (New)

```typescript
// shared/schema.ts addition
export const funnelEvents = pgTable('funnel_events', {
  id:          uuid('id').primaryKey().defaultRandom(),
  sessionId:   varchar('session_id', { length: 128 }),      // anonymous or userId
  userId:      uuid('user_id').references(() => users.id),   // null until T1
  tripId:      uuid('trip_id').references(() => trips.id),   // null until T2
  eventType:   varchar('event_type', { length: 64 }).notNull(),
  stage:       varchar('stage', { length: 4 }).notNull(),    // T0–T7
  properties:  jsonb('properties'),                           // flexible payload
  createdAt:   timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userIdx:     index('funnel_events_user_idx').on(t.userId),
  typeIdx:     index('funnel_events_type_idx').on(t.eventType),
  stageIdx:    index('funnel_events_stage_idx').on(t.stage),
  createdIdx:  index('funnel_events_created_idx').on(t.createdAt),
}));

// Event types
export const FUNNEL_EVENT_TYPES = {
  ANONYMOUS_SESSION:    'anonymous_session_started',
  USER_REGISTERED:      'user_registered',
  TRIP_CREATED:         'trip_created',
  ITINERARY_GENERATED:  'itinerary_generated',
  CART_ITEM_ADDED:      'item_added_to_cart',
  EXPERT_REQUESTED:     'expert_request_created',
  LEAD_ROUTED:          'lead_routed',
  LEAD_ASSIGNED:        'lead_assigned',
  LEAD_NULL_ASSIGNED:   'lead_null_assigned',        // GAP 4 tracking
  PAYMENT_COMPLETED:    'payment_completed',
  CREDITS_PURCHASED:    'credits_purchased',
  BOOKING_CONFIRMED:    'booking_confirmed',
  TRIP_SHARED:          'trip_shared',
  PARTICIPANT_INVITED:  'participant_invited',
  VIRAL_ENTRY:          'viral_entry',
} as const;
```

### 3B. expert_requests — Add Null-Assign Escalation Fields

```typescript
// Add to expert_requests table
nullAssignReason:   varchar('null_assign_reason', { length: 128 }),
escalatedAt:        timestamp('escalated_at'),
escalatedToAdminId: uuid('escalated_to_admin_id').references(() => users.id),
fallbackQueuedAt:   timestamp('fallback_queued_at'),
```

### 3C. users — Add Funnel Stage Tracking

```typescript
// Add to users table  
funnelStage:             varchar('funnel_stage', { length: 4 }).default('T1'),
funnelStageUpdatedAt:    timestamp('funnel_stage_updated_at'),
// Separate approved vs payable (stripe columns already exist — document them)
// stripeAccountStatus:  varchar (EXISTS)
// canReceivePayments:   boolean (EXISTS) ← set by webhook only, never by API
```

### 3D. expert_city_queues — Deprecation Plan

```typescript
// Migration: add deprecated marker
// migration_XXX_deprecate_expert_city_queues.ts
await sql`ALTER TABLE expert_city_queues ADD COLUMN deprecated_at TIMESTAMP DEFAULT NOW()`;
await sql`COMMENT ON TABLE expert_city_queues IS 'DEPRECATED: Use lead_routing_logs + expert_requests. Remove in migration 075.'`;

// Application: remove all writes to expert_city_queues
// Keep table for 2 sprints for read-only analytics, then DROP in migration 075
```

### 3E. Missing Indexes for Lead Routing

```typescript
// Add to local_expert_forms table
index('lex_status_idx').on(localExpertForms.status),
index('lex_destinations_idx').on(localExpertForms.destinations), // GIN for array

// Add to expert_requests table  
index('er_status_assigned_idx').on(expertRequests.status, expertRequests.assignedExpertId),
index('er_destination_idx').on(expertRequests.destinationCity),
index('er_created_idx').on(expertRequests.createdAt),

// Add to lead_routing_logs table
index('lrl_expert_idx').on(leadRoutingLogs.assignedExpertId),
index('lrl_created_idx').on(leadRoutingLogs.createdAt),
```

### 3F. membership_subscriptions Table (Prepare for Membership Tier)

```typescript
export const membershipSubscriptions = pgTable('membership_subscriptions', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  userId:             uuid('user_id').notNull().references(() => users.id),
  tier:               varchar('tier', { length: 20 }).notNull(), // 'basic' | 'premium'
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 128 }),
  status:             varchar('status', { length: 20 }).default('active'),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd:   timestamp('current_period_end'),
  cancelledAt:        timestamp('cancelled_at'),
  createdAt:          timestamp('created_at').defaultNow(),
});
// Pricing: basic=$19.99/mo, premium=$39.99/mo
// Not yet live — schema only. Gates applied when status='active'.
```

---

## 4. API Layer Structure

### Current State vs Target State

```
CURRENT (routes.ts = 12,769 lines, 433 endpoints)
server/
├── routes.ts              ← 433 endpoints, all domains mixed
├── routes/
│   ├── admin.routes.ts
│   ├── content.routes.ts
│   ├── experts.routes.ts
│   ├── payments.routes.ts
│   ├── trips.routes.ts
│   ├── bookings.ts
│   ├── messages.ts
│   └── ... (12 more)

TARGET (routes.ts → 0 lines, all in domain modules)
server/
├── routes/
│   ├── index.ts           ← mount all routers here
│   ├── auth.routes.ts     ← /api/auth/*
│   ├── trips.routes.ts    ← /api/trips/*, /api/itineraries/*
│   ├── leads.routes.ts    ← /api/leads/*, /api/expert-requests/*  [NEW]
│   ├── experts.routes.ts  ← /api/experts/*, /api/expert/*
│   ├── providers.routes.ts← /api/providers/*, /api/provider/*
│   ├── bookings.routes.ts ← /api/bookings/*, /api/cart/*
│   ├── payments.routes.ts ← /api/payments/*, /api/credits/*, /api/wallet/*
│   ├── ai.routes.ts       ← /api/ai/*, /api/grok/*  [NEW]
│   ├── admin.routes.ts    ← /api/admin/*
│   ├── content.routes.ts  ← /api/content/*, /api/discover/*
│   ├── transport.routes.ts← /api/transport-legs/*, /api/transport/*
│   ├── messages.routes.ts ← /api/conversations/*, /api/messages/*
│   ├── sharing.routes.ts  ← /api/shared-itineraries/*, /api/trips/shared/*
│   └── webhooks.routes.ts ← /api/webhooks/stripe
```

### Middleware Stack (in execution order)

```typescript
// server/index.ts — middleware registration order matters
app.use(helmet());                    // 1. Security headers
app.use(cors(corsOptions));           // 2. CORS
app.use(express.json({ limit: '10mb' })); // 3. Body parsing
app.use(sessionMiddleware);           // 4. Session (pg-store)
app.use(passport.initialize());       // 5. Passport
app.use(passport.session());          // 6. Session deserialization
app.use(requestLogger);               // 7. Logging
app.use(rateLimiter);                 // 8. Global rate limit (100 req/min)
app.use('/api/ai', aiRateLimiter);   // 9. Strict AI rate limit (10 req/min)

// Route-level middleware pattern
router.get('/protected-endpoint',
  isAuthenticated,    // must have valid session
  hasAcceptedTerms,   // must have termsAccepted
  requireRole('local_expert'), // must have correct role
  handler
);
```

### Three-Gate ProtectedRoute Pattern (Frontend)

```typescript
// client/src/components/ProtectedRoute.tsx
function ProtectedRoute({ children, requiredRole }: Props) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <PageSkeleton />;

  // Gate 1: Authentication
  if (!user) return <Navigate to="/?openSignIn=true" />;

  // Gate 2: Terms acceptance
  if (!user.termsAccepted) return <Navigate to="/accept-terms" />;

  // Gate 3: Role check
  if (requiredRole && user.role !== requiredRole) return <Navigate to="/dashboard" />;

  return children;
}
```

---

## 5. Lead Routing Service Improvements

### Current Gaps and Fixes

#### Gap 1: Silent log swallowing

```typescript
// CURRENT (problematic)
try {
  await db.insert(leadRoutingLogs).values(logEntry);
} catch (err) {
  // swallowed silently — analytics under-count
}

// FIX: structured logging, never swallow
} catch (err) {
  console.error('[LeadRouting] Failed to write routing log', {
    expertRequestId: logEntry.expertRequestId,
    error: err instanceof Error ? err.message : String(err),
  });
  // Still don't throw — routing succeeds even if log fails
  // But now the error is visible in logs and monitoring
}
```

#### Gap 2: Null-assign fallback path (GAP 4)

```typescript
// server/services/lead-routing.service.ts — AFTER scoring

if (!bestExpert || bestExpert.score === 0) {
  // Log null-assign with reason
  await db.update(expertRequests)
    .set({
      status: 'queued',                          // new status for null-assign queue
      nullAssignReason: bestExpert ? 'zero_score_no_destination_match' : 'no_approved_experts',
      fallbackQueuedAt: new Date(),
    })
    .where(eq(expertRequests.id, requestId));

  // Emit funnel event
  await funnelEventService.emit('lead_null_assigned', {
    expertRequestId: requestId,
    reason: bestExpert ? 'zero_score' : 'no_experts',
    destinationCity: request.destinationCity,
  });

  // Notify admin (non-blocking)
  notificationService.notifyAdmins({
    type: 'null_lead_assigned',
    message: `Lead ${requestId} to ${request.destinationCity} has no eligible expert`,
    priority: 'high',
  }).catch(console.error);

  return { assigned: false, reason: 'no_eligible_expert' };
}
```

#### Gap 3: Score preview caching

```typescript
// Cache score previews for 5 minutes — they're read-heavy, write-light
// server/services/lead-routing.service.ts
const PREVIEW_CACHE_TTL = 5 * 60 * 1000;
const previewCache = new Map<string, { result: any; expiresAt: number }>();

async function getScorePreview(destination: string) {
  const key = `preview:${destination}`;
  const cached = previewCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const result = await computeScorePreview(destination);
  previewCache.set(key, { result, expiresAt: Date.now() + PREVIEW_CACHE_TTL });
  return result;
}
```

#### Gap 4: Thin-market handling

```
For destinations with < 3 approved experts:
  1. Widen destination matching: "Kyoto" → "Japan" (country fallback)
  2. If still no match: assign to top-scoring "generalist" expert
     (specialty=any, destination=null)
  3. If still no match: null-assign → admin queue
  4. Notify traveler: "Your destination is new to our network. 
     An advisor will reach out within 48 hours."
```

---

## 6. Payment Architecture

### Booking Type → Commission Surface Mapping

```
┌─────────────────────────────────────────────────────────────────┐
│                    PAYMENT FLOWS                                │
│                                                                 │
│  FLOW 1: Cart Checkout (traveler self-service)                  │
│  Traveler → Stripe PaymentIntent → Platform (30%) + Provider   │
│  Source: /api/cart/checkout → commission.service('cart')        │
│                                                                 │
│  FLOW 2: Expert-Mediated Booking                                │
│  Traveler → Stripe PaymentIntent → Platform (25%) + Expert(75%)│
│  New Expert: Platform (15%) + Expert (85%)                      │
│  Source: /api/bookings/create → commission.service('expert')    │
│                                                                 │
│  FLOW 3: Provider Direct Booking                                │
│  Traveler → Stripe PaymentIntent → Platform (4-12%) + Provider │
│  Tier determined by: service_provider_forms.insuranceTier       │
│  Source: /api/bookings/create → commission.service('provider')  │
│                                                                 │
│  FLOW 4: Credits Purchase                                       │
│  Traveler → Stripe Checkout Session → credits table             │
│  $10=10cr │ $25=27cr │ $50=55cr │ $100=120cr                   │
│  Source: /api/credits/purchase → creditService.grant()          │
│                                                                 │
│  FLOW 5: Expert Payout (Stripe Connect)                        │
│  Platform → Stripe Transfer → Expert's Connected Account        │
│  Trigger: booking status → 'completed'                          │
│  Gate: can_receive_payments = true                              │
│  Source: /api/admin/payouts/execute → stripeConnect.transfer()  │
└─────────────────────────────────────────────────────────────────┘
```

### Stripe Connect Flow

```
Expert onboards:
  POST /api/stripe/connect/onboard
    → stripe.accountLinks.create({ type: 'account_onboarding' })
    → redirect expert to Stripe hosted page
    → expert completes KYC/bank account
    → Stripe webhook: account.updated
      → SET can_receive_payments = true (if charges_enabled + payouts_enabled)

Payout execution:
  Admin triggers: POST /api/admin/payouts/execute
    → verify can_receive_payments = true
    → stripe.transfers.create({ destination: expert.stripeAccountId })
    → INSERT payout_records row
    → notify expert
```

### Credit System — Deferred Revenue Accounting

```
Purchase:  User pays $25 → grant 27 credits → INSERT wallet_transaction (type=purchase)
Usage:     AI call costs 5 credits → DEDUCT 5 credits → INSERT wallet_transaction (type=usage)
Revenue recognition: Credits are deferred revenue until used.
  - Purchased but unused credits = liability on balance sheet
  - Expiration policy (recommend: 12 months) converts to revenue
  - Report: wallet_transactions WHERE type='purchase' GROUP BY month = deferred revenue
```

### Membership Tier Gating (Prepare Now, Launch Later)

```
Gate pattern:
  function requireMembership(tier: 'basic' | 'premium') {
    return async (req, res, next) => {
      const sub = await db.query.membershipSubscriptions.findFirst({
        where: and(
          eq(membershipSubscriptions.userId, userId),
          eq(membershipSubscriptions.status, 'active'),
          inArray(membershipSubscriptions.tier, tier === 'basic' ? ['basic', 'premium'] : ['premium'])
        )
      });
      if (!sub) return res.status(403).json({ error: 'membership_required', tier });
      next();
    };
  }

// Applied to premium routes:
router.post('/ai/optimize-premium', isAuthenticated, requireMembership('premium'), handler);
```

---

## 7. Auth & Role Architecture

### Three Login Methods — Session Shape Difference (Critical)

```typescript
// This inconsistency exists in production RIGHT NOW.
// Email auth:   req.user.claims.sub  (string UUID)
// Replit Auth:  req.user.id          (string UUID)
// Facebook:     req.user.id          (string)

// FIX: Normalize in a shared helper used by ALL routes
export function getUserId(req: Request): string | null {
  const user = req.user as any;
  if (!user) return null;
  return user.id ?? user.claims?.sub ?? null;
}

// Every route that needs userId must use this helper:
const userId = getUserId(req);
if (!userId) return res.status(401).json({ error: 'unauthorized' });
```

### Role Upgrade Flow (User → Expert)

```
1. user submits local_expert_forms (6 steps)
2. Admin reviews → sets local_expert_forms.status = 'approved'
3. Approval webhook/job:
   UPDATE users SET role = 'local_expert' WHERE id = form.userId
   INSERT funnel_events (type='expert_approved', userId)
   SEND email: "Your expert account is active"
4. Stripe Connect onboarding starts (separate, not blocking approval)
5. On Stripe webhook account.updated:
   UPDATE users SET can_receive_payments = true
```

### Deep-Linkable Signup Page (GAP 6)

```typescript
// Add dedicated route alongside modal:
// /signup?ref=campaign&role=expert&destination=tokyo

// This enables:
// - Paid acquisition attribution (ref parameter stored in funnel_events)
// - Pre-filling intent (destination, role)
// - Google Ads landing pages that don't rely on modal state
```

---

## 8. Funnel Analytics Architecture

### Events to Fire at Each Stage

```
Stage | Trigger Location                     | Event Type
------|--------------------------------------|---------------------------
T0    | Middleware on first request           | anonymous_session_started
T1    | POST /api/auth/register               | user_registered
T2    | POST /api/trips                       | trip_created
T3    | POST /api/ai/generate-itinerary       | itinerary_generated
T4    | POST /api/cart/items                  | item_added_to_cart
T5a   | POST /api/expert-requests             | expert_request_created
T5b   | lead-routing.service (on assign)      | lead_assigned
T5c   | lead-routing.service (on null)        | lead_null_assigned
T6a   | POST /api/bookings (on complete)      | booking_confirmed
T6b   | POST /api/credits/purchase (webhook)  | credits_purchased
T6c   | Stripe webhook payment_intent.success | payment_completed
T7a   | POST /api/shared-itineraries          | trip_shared
T7b   | POST /api/trip-participants           | participant_invited
T7c   | GET /itinerary-view/:token (first)    | viral_entry
```

### Admin Funnel Dashboard Queries

```sql
-- Conversion rate T1 → T5 (last 30 days)
SELECT 
  COUNT(DISTINCT CASE WHEN stage = 'T1' THEN user_id END) as registered,
  COUNT(DISTINCT CASE WHEN stage = 'T3' THEN user_id END) as generated_itinerary,
  COUNT(DISTINCT CASE WHEN stage = 'T5' THEN user_id END) as requested_expert,
  COUNT(DISTINCT CASE WHEN stage = 'T6' THEN user_id END) as converted_to_revenue
FROM funnel_events
WHERE created_at > NOW() - INTERVAL '30 days';

-- Lead null-assign rate by destination (thin market indicator)
SELECT 
  properties->>'destinationCity' as destination,
  COUNT(*) FILTER (WHERE event_type = 'lead_null_assigned') as null_assigns,
  COUNT(*) FILTER (WHERE event_type = 'lead_assigned') as successful_assigns
FROM funnel_events
WHERE event_type IN ('lead_assigned', 'lead_null_assigned')
GROUP BY destination
ORDER BY null_assigns DESC;
```

---

## 9. Viral / Sharing Architecture

### Token System

```
Shared itinerary token:
  - Generated at: POST /api/shared-itineraries
  - Format: UUID v4 (already in shared_itineraries table)
  - Public route: /itinerary-view/:token (no auth required)
  - Expiration: 30 days default (configurable per share)

Trip sharing token:
  - Format: short alphanumeric (8 chars, e.g. "TKY-X7P2")
  - Public route: /trips/shared/:token
  - Requires: trip owner consent (privacy flag)
  
Viral attribution:
  - When /itinerary-view/:token is visited:
    1. INSERT funnel_events (type='viral_entry', properties={token, sourceUserId})
    2. Set cookie: viral_source={token} (30 days)
    3. If visitor signs up → link userId to source via cookie
    4. If visitor books → credit original sharer with referral event
```

### Bulk Invite Flow

```
POST /api/trip-participants/bulk-invite
  body: { tripId, emails: string[], role: 'viewer' | 'participant' }
  
  For each email:
    1. Check if user exists → send "you've been added" email
    2. If not → INSERT pending_invites + send "join Traveloure" email
    3. INSERT funnel_events (type='participant_invited')
    4. On signup with invite token → link to trip + T7 event
```

---

## 10. Sequence Diagrams

### Diagram A: T5 Qualified Lead → Routing → Assignment

```
Traveler        API              LeadRouting        Database           Expert
   │              │                  │                  │                │
   │──POST ───────►│                  │                  │                │
   │ /expert-req  │                  │                  │                │
   │              │──INSERT──────────────────────────────►│                │
   │              │  expert_requests                     │                │
   │              │  (status=pending)                    │                │
   │              │                  │◄─────────────────►│                │
   │              │──CALL────────────►│  query approved  │                │
   │              │  routeLead()     │  experts          │                │
   │              │                  │──SELECT──────────►│                │
   │              │                  │  WHERE status=    │                │
   │              │                  │  'approved'       │                │
   │              │                  │◄──[experts]───────│                │
   │              │                  │                   │                │
   │              │                  │  score each expert│                │
   │              │                  │  (40+25+20+15)    │                │
   │              │                  │                   │                │
   │              │                  │  [if no match]    │                │
   │              │                  │──UPDATE───────────►│                │
   │              │                  │  status='queued'  │                │
   │              │                  │──NOTIFY admin─────────────────────►│
   │              │                  │                   │                │
   │              │                  │  [if match found] │                │
   │              │                  │──UPDATE───────────►│                │
   │              │                  │  status='assigned'│                │
   │              │                  │  assignedExpertId │                │
   │              │                  │──INSERT───────────►│                │
   │              │                  │  lead_routing_logs│                │
   │              │                  │──INSERT───────────►│                │
   │              │                  │  funnel_events    │                │
   │              │                  │  (lead_assigned)  │                │
   │              │◄─────────────────│                   │                │
   │◄─────────────│                  │                   │──NOTIFY────────►│
   │  { assigned: │                  │                   │  (email/in-app)│
   │    true,     │                  │                   │                │
   │    expertId }│                  │                   │                │
```

### Diagram B: Expert Payout Flow

```
Admin           API              StripeService        Stripe          Expert
  │               │                   │                  │               │
  │──POST─────────►│                   │                  │               │
  │ /admin/payouts│                   │                  │               │
  │ /execute      │                   │                  │               │
  │               │──CHECK────────────►│                  │               │
  │               │  can_receive_     │                  │               │
  │               │  payments=true?   │                  │               │
  │               │◄─[yes/no]─────────│                  │               │
  │               │                   │                  │               │
  │               │  [if no → 422]    │                  │               │
  │◄──[422]───────│                   │                  │               │
  │  "incomplete  │                   │                  │               │
  │   Connect"    │                   │                  │               │
  │               │                   │                  │               │
  │               │  [if yes]         │                  │               │
  │               │──CREATE TRANSFER──►│                  │               │
  │               │                   │──stripe.transfers─►│              │
  │               │                   │  .create()        │              │
  │               │                   │◄──[transfer]──────│              │
  │               │──INSERT───────────────────────────────►│              │
  │               │  payout_records   │                  │               │
  │               │──INSERT───────────────────────────────►│              │
  │               │  funnel_events    │                  │               │
  │◄──[200]───────│                   │                  │               │
  │  { payoutId } │                   │                  │──funds──────►│
  │               │                   │                  │  deposited   │
```

### Diagram C: Credit Purchase → Usage → Recognition

```
Traveler        API              CreditService        Stripe          Database
   │              │                   │                  │               │
   │──POST─────────►│                   │                  │               │
   │ /credits/    │                   │                  │               │
   │ purchase     │                   │                  │               │
   │ {package:25} │                   │                  │               │
   │              │──VALIDATE─────────►│                  │               │
   │              │  package price    │                  │               │
   │              │  SERVER-SIDE      │                  │               │
   │              │──CREATE SESSION───►│                  │               │
   │              │                   │──stripe.checkout──►│              │
   │              │                   │  .create()        │              │
   │              │◄──[sessionUrl]────────────────────────│              │
   │◄──[redirect]─│                   │                  │               │
   │  Stripe      │                   │                  │               │
   │  Checkout    │                   │                  │               │
   │              │                   │                  │               │
   │  [user pays] │                   │◄─Webhook──────────│              │
   │              │                   │ checkout.session  │              │
   │              │                   │ .completed        │              │
   │              │                   │──GRANT CREDITS────────────────────►│
   │              │                   │  INSERT credits   │               │
   │              │                   │  +27 credits      │               │
   │              │                   │──INSERT───────────────────────────►│
   │              │                   │  wallet_transactions│              │
   │              │                   │  (type=purchase)  │               │
   │◄─[notify]────│                   │                  │               │
   │  "27 credits │                   │                  │               │
   │   added"     │                   │                  │               │
   │              │                   │                  │               │
   │──USE AI──────►│                   │                  │               │
   │  (5 credits) │──DEDUCT───────────►│                  │               │
   │              │                   │──UPDATE credits───────────────────►│
   │              │                   │  -5 credits       │               │
   │              │                   │──INSERT───────────────────────────►│
   │              │                   │  wallet_transactions│              │
   │              │                   │  (type=usage)     │               │
```

---

## 11. Market Launch Scalability

### 8 Markets in 12 Months — Architecture Requirements

```
Market 1:  Tokyo, Japan          (Month 1 — current)
Market 2:  Kyoto, Japan          (Month 2)
Market 3:  Paris, France         (Month 3)
Market 4:  Bangkok, Thailand     (Month 5)
Market 5:  Bali, Indonesia       (Month 6)
Market 6:  Barcelona, Spain      (Month 8)
Market 7:  New York, USA         (Month 10)
Market 8:  Dubai, UAE            (Month 12)
```

### Multi-Currency Handling

```typescript
// Store all amounts in base currency (USD cents) in the DB
// Display in local currency using exchange rates

export const exchangeRates = pgTable('exchange_rates', {
  currency:   varchar('currency', { length: 3 }).primaryKey(), // 'JPY', 'EUR'
  rateToUsd:  decimal('rate_to_usd', { precision: 12, scale: 6 }).notNull(),
  updatedAt:  timestamp('updated_at').defaultNow(),
});

// Pricing per market stored in USD, displayed in local currency
// Stripe handles multi-currency natively via presentment currency
```

### Localization Layer

```
Content:    JSON locale files per market (en, ja, fr, th, id, es, ar)
Dates:      Store UTC in DB, display in user's timezone via Intl.DateTimeFormat
Currency:   Store USD cents, display via Intl.NumberFormat with currency code
Comms:      Email templates per locale, fallback to English
Experts:    Filter by languages_spoken array (already in local_expert_forms)
```

### Onboarding 20-30 Providers Per Market

```
Batch Onboarding Flow:
  1. Admin creates market (INSERT markets row)
  2. Admin uses bulk invite: POST /api/admin/providers/bulk-invite
     { emails[], market, tier }
  3. Each provider gets branded invite email with pre-filled city
  4. Provider completes 7-step form (city pre-filled, non-editable)
  5. Admin reviews batch (market filter in admin dashboard)
  6. Bulk approval: POST /api/admin/providers/bulk-approve { ids[] }
  
Target: 20 providers onboarded in < 5 business days per market
```

---

## 12. Security & Compliance

### KYC/KYB Data Handling

```
Stripe Identity results → stored as:
  local_expert_forms.identityVerificationStatus = 'verified' | 'failed' | 'pending'
  service_provider_forms.businessVerificationStatus = 'verified' | 'failed'

⚠️ RAW KYC DATA (photos, documents) is NEVER stored on Traveloure servers.
   It lives exclusively in Stripe's infrastructure.
   Only the result status is stored in our DB.
```

### PII Isolation for GDPR (EU Markets)

```
EU Users (France, Spain, UAE):
  - Store explicit consent timestamp: users.termsAccepted (exists)
  - Add: users.gdprConsentAt, users.dataRegion
  - Right to deletion: DELETE user row + anonymize funnel_events
    (replace userId with 'DELETED_USER', keep event counts for analytics)
  - Data portability: GET /api/account/export → JSON with all user data
  - Data processor agreements: Required with Stripe, Amadeus, Grok/xAI
```

### Rate Limiting on AI Endpoints

```typescript
// server/middleware/rate-limit.ts

// Global: 100 requests/minute per IP
const globalLimiter = rateLimit({ windowMs: 60_000, max: 100 });

// AI endpoints: 10 requests/minute per user (authenticated)
const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => getUserId(req) ?? req.ip,
  message: { error: 'rate_limit_exceeded', retryAfter: 60 },
});

// Stripe webhook: IP allowlist only
const stripeWebhookGuard = (req, res, next) => {
  // Verify Stripe-Signature header — MUST be present on all /api/webhooks/stripe
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing signature');
  // stripe.webhooks.constructEvent() throws if invalid
};
```

### Stripe Webhook Security

```typescript
// ALL webhook endpoints must use raw body (not parsed JSON)
// server/routes/webhooks.routes.ts

router.post('/stripe',
  express.raw({ type: 'application/json' }), // raw body for signature
  async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return res.status(400).send(`Webhook signature failed: ${err.message}`);
    }
    // process event...
  }
);
```

---

## 13. Priority Order & Production Risks

### 🔴 PRODUCTION RISKS — Fix Immediately

| Risk | Severity | What Can Go Wrong | Fix |
|---|---|---|---|
| **Self-declared admin role** | CRITICAL | Any user can POST `{role:'admin'}` at signup and gain full admin access | Hardcode `role='user'` at registration, remove userType from body |
| **Auth user shape mismatch** | HIGH | Routes using `req.user.id` fail for email-auth users (have `req.user.claims.sub`) — returns 500 or wrong userId | Add `getUserId(req)` helper, apply to all routes |
| **30% commission on expert bookings** | HIGH | Platform takes 30% of expert-mediated bookings instead of 25% — overpaying platform, underpaying experts | Route through CommissionService by surface type |
| **Stripe webhook raw body** | HIGH | Webhook signature verification fails if body is parsed as JSON — Stripe events silently rejected | Ensure `express.raw()` on webhook route, not `express.json()` |
| **can_receive_payments set by API** | MEDIUM | If any route can set this flag (not just Stripe webhook), experts can fake payment eligibility | Remove any non-webhook path that sets this flag |

### 🟡 Fix This Sprint

| Item | Why Now |
|---|---|
| **funnel_events table** | Revenue attribution is blind without it — can't tell what's converting |
| **Lead null-assign fallback** | Qualified leads (revenue-generating) disappear silently into the void |
| **Log swallowing in lead routing** | Analytics under-count is getting worse as volume grows |
| **routes.ts Phase 1 decomposition** | Every sprint adds to the 12,769-line file — tech debt compounds |
| **Score preview caching** | Admin opens lead routing screen → N+1 queries hit every expert |

### 🟢 Next Quarter

| Item | Notes |
|---|---|
| **Membership tier gating** | Schema ready, Stripe products needed, feature flags required |
| **Multi-currency support** | Needed for EU and Asia-Pacific market launches |
| **GDPR delete/export endpoints** | Required before France/Spain launch (legal obligation) |
| **Bulk provider onboarding** | Manual today — blocks market velocity |
| **expert_city_queues deprecation** | Dead table adding confusion to new engineers |
| **Deep-linkable /signup page** | Blocks paid acquisition campaigns |
| **Funnel analytics dashboard** | Build after funnel_events table is live and populated |

### Recommended Fix Order

```
Week 1:  🔴 Role vulnerability (emailAuth.ts)
         🔴 getUserId() helper in all routes
         🔴 Stripe webhook raw body check

Week 2:  🔴 CommissionService routing by surface type
         🟡 Lead null-assign fallback + admin notification
         🟡 Fix log swallowing in lead-routing.service.ts

Week 3:  🟡 funnel_events table + emit at T3, T5, T6 (highest value stages)
         🟡 routes.ts Phase 1: extract leads, ai, commission modules

Week 4:  🟡 Score preview caching
         🟡 Approved vs Payable flag enforcement
         🟡 funnel_events emit at T1, T2, T4, T7

Month 2: 🟢 Membership schema + Stripe product setup
         🟢 Multi-currency exchange rate table
         🟢 GDPR compliance endpoints
         🟢 expert_city_queues deprecation migration
```

---

*End of Architecture Document — Traveloure v2 — June 2026*
