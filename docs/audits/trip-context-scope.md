# Trip-Context Lane — Scope (Jul 24, 2026)

**Problem statement (decision-maker, Jul 24):** trip details (destination, dates, travelers, event
type) should be consistent between the cart's Trip Details step and the Experience templates, and
ideally set once in a global place the whole site reads — without interfering with the
Discover-by-date calendar.

**Verdict up front:** the site already HAS a de-facto global store — the `experienceContext`
sessionStorage blob — but it is informal: 10 write sites with 3 diverging shapes, 13 read sites,
no owner, clobber-on-write semantics, and one whole flow (quick-start) writing trip details to a
key **nothing reads**. The lane is to formalize it, not invent a new system.

---

## Ground-truth inventory (verified on main @ 5c723622)

### Storage keys in play

| Key | Writers | Readers | Verdict |
|---|---|---|---|
| `experienceContext` | 10 (experience-template ×6, cart ×3, concierge DeliveryOptions ×1) | 13 (all in cart.tsx) | The de-facto global trip context — formalize this |
| `tripContext_${slug}` | 1 (quick-start-itinerary.tsx:414) | **0 — dead write** | Quick-start's trip details are silently lost |
| `externalCart_${slug}` | experience-template, quick-start | cart | External items — separate concern, unchanged by this lane |
| GlobalCalendar `selectedDate` | local component state | local | Browse date ≠ trip dates — **deliberately stays separate** |

Server-side truth (once a trip exists): `trips` row (created by `POST /api/cart/resolve-trip`,
PR #297) carrying title/destination/dates/travelers; `user_experiences.guestCount` for party size.

### Answer to the Discover-by-date concern

`GlobalCalendar.tsx` keeps a purely local `useState<Date> selectedDate` and never reads
`experienceContext`. A global trip-context CANNOT interfere with by-date browsing unless we
deliberately wire it in. Design rule for this lane: **the calendar's browse date stays out of
TripContext.** At most, a later optional one-way affordance ("Use this as my trip start date"
button on the calendar) writes INTO TripContext — never the reverse.

---

## Defects found during scoping (real bugs, fixed by the lane's construction)

- **D1 — Concierge clobber.** `DeliveryOptions.tsx:75` (AI-tier handoff) OVERWRITES
  `experienceContext` with only `{experienceType, destination, intent}` — any dates/travelers/
  slug/tripId already in context are destroyed on the way INTO the cart.
- **D2 — Mobile cart button drops the slug.** `experience-template.tsx:3033` writes the context
  WITHOUT `experienceSlug` (the 5 sibling writes include it). Cart then derives a
  `${type}_${destination}` fallback slug → `externalCart_${slug}` lookups key-miss → the external
  cart can appear empty after the mobile path.
- **D3 — Date format drift.** `experience-template.tsx:1293` writes `startDate` as a full ISO
  datetime (`toISOString()`), the other 5 writes use date-only (`.split('T')[0]`). Cart seeds
  `<input type="date">` from this value — a datetime string doesn't populate the input.
- **D4 — Quick-start dead write.** `tripContext_${slug}` (destination/country/dates/travelers/
  interests/itineraryId) has zero readers; the quick-start flow's collected trip details never
  reach the cart or anything else.

---

## Design

### New module: `client/src/lib/trip-context.ts`

```ts
export interface TripContext {
  experienceSlug?: string;
  experienceType?: string;
  title?: string;
  destination?: string;
  city?: string;
  startDate?: string;   // ALWAYS YYYY-MM-DD — normalized at the write boundary
  endDate?: string;     // ALWAYS YYYY-MM-DD
  travelers?: number;
  eventType?: string;
  tripId?: string;
  userExperienceId?: string;
  intent?: string;
  contextFields?: Record<string, unknown>;
}

export function getTripContext(): TripContext;
export function updateTripContext(patch: Partial<TripContext>): TripContext; // MERGE — never clobber
export function clearTripContext(): void;
export function useTripContext(): [TripContext, (p: Partial<TripContext>) => void]; // React hook, storage-event synced
```

Key semantics:
- **Merge-by-default** (`updateTripContext` spreads over the existing blob) kills the D1 clobber
  class permanently — a surface can only add/override the fields it knows about.
- **Date normalization at the boundary** (accept Date | ISO datetime | YYYY-MM-DD, store
  YYYY-MM-DD) kills D3 permanently.
- **Same storage key** (`experienceContext`) — full back-compat with in-flight sessions; no
  migration, and any straggler read sites keep working mid-lane.

### Precedence rule (recorded so surfaces don't fight)

explicit user edit (cart header dates / Trip Details form)
→ template selection (experience page pickers)
→ server `trips` row (once `tripId` is set, the trip row wins on reload)
→ inference (resolve-trip's destination/date inference, PR #297).

The server stays authoritative once a trip exists; the client context is the pre-trip staging area.

---

## Phases

- **P1 — Formalize (mechanical, low risk).** Add the module; convert all 10 writers + 13 readers
  to `get/updateTripContext`. D1, D2, D3 are fixed by construction (merge semantics, one write
  shape, boundary normalization). Wire quick-start through the module too (its `tripContext_`
  write becomes a real `updateTripContext` — closing D4 by making the data flow, not by deleting
  it). Client-only; no server change; no schema; no money path.
- **P2 — Live propagation.** Cart header + Trip Details step read/write through `useTripContext`
  so an edit in one place shows everywhere immediately; travelers fallback chain becomes
  `ctx.travelers → server guestCount → 2` (today the template's party size is dropped unless the
  server resolves a user_experiences row).
- **P3 — Surface (optional, decision-maker taste).** A compact global trip bar
  (destination + dates) on Discover/experience pages reading the same context; the calendar's
  one-way "Use as trip date" affordance. Build only after P1/P2 prove out.

## Gates / proof

- e2e-cart-redirect, journey-2, discover-tabs, app-routes suites stay green (they exercise the
  affected pages).
- Small unit test for merge + date normalization (the two load-bearing semantics).
- Behavioral spot-check: template → cart carries slug/dates/travelers on BOTH desktop and mobile
  buttons; concierge AI-tier handoff no longer wipes dates.

## Out of scope

- GlobalCalendar internals (deliberately untouched).
- Server/date schema changes (none needed — resolve-trip already accepts the payload).
- `externalCart_${slug}` mechanics (unchanged; PR #297 covers its resolve-trip path).
