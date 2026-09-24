# Action → Effect Audit — Phase 1 working notes

## A1: Switch catch-all check

**PASS. No route is dead because of ordering.**

The only **pathless `<Route>`** in the router is the 404 at `client/src/App.tsx:1258`:

```tsx
<Route>
  <Layout><NotFound /></Layout>
</Route>
```

It is the last child of the `<Switch>` (which closes at `App.tsx:1260`). It comes after `/signup` (`:1252`) and
`/booking/confirmation` (`:1255`).

A grep for other catch-all shapes found none: no `path="/:…"`, `path="*"`, `path="/*"` or `:rest*`
(`grep -nE 'path="/:|path="\*|path="/\*|:rest|\*"' client/src/App.tsx` returns nothing).

wouter `^3.3.5` matches routes exactly unless they use `nest`, so `<Route path="/">` (`:363`) does not act as a
prefix match. Where a longer path could shadow a shorter one, the longer path is registered first:
- `/plans/:tripId/guests` (`:666`) before `/plans/:tripId` (`:673`)
- `/experiences/:slug/new` and `/experiences/:slug` do not collide, because matching is exact.

**No P1 filed.**

## A2: Tier-1 count, reported before tracing

Tier 1 means the trigger calls an API, writes web storage or context, or mints, adds or claims something. Every
trigger on the J1–J6 paths is also Tier 1. The split comes from re-classifying the Phase 0 inventory rows, with no
new tracing.

| Group | Tier 1 | Tier 2 | Total |
|---|---|---|---|
| Global shell (App, contexts, PlanModal, Layout, Landing) | 38 | 95 | 133 |
| Marketplace (Discover ×4, city, service, ready-made, gems, deals, transport) | 51 | 93 | 144 |
| Entry and commerce (experiences, template, concierge, cart, auth, bookings, inbox, chat …) | 103 | 93 | 196 |
| Console (shell, Home, My Plans, slip, guests, Trip Card, comparison, AI assistant) | 120 | 220 | 340 |
| **Total** | **312** | **501** | **813** |

**Caveats:**
- **Opening a modal is classified inconsistently across groups.** The entry-and-commerce and console groups count
  opening a context-held modal (sign-in, PlanModal) as Tier 1. The shell and marketplace groups count it as Tier 2
  unless it writes trip-context. Normalising to Tier 2 would lower the total by about 20. These rows get a single
  Tier-2 row in the matrix unless they sit on a J-path.
- **About 20 rows are shared** across groups (auth plumbing, IntakePanel), so the de-duplicated Tier-1 count is
  **about 295**.
- **Money rows** (observed only, never exercised): 15 in entry and commerce, 12 in the console (8 unique).
- **Analytics-only Tier-1 rows** in marketplace (about 14) are traced to the endpoint and not beyond.

## A3: J1

Delivered on its own: [`journeys/J1/README.md`](journeys/J1/README.md).
