# Expert Console Audit — Follow-Up Discoveries
**Out-of-scope items discovered during audit. Not absorbed into fixes.**

---

## F1. `expert_templates` purchase delivery gap
`template_purchases` rows can reach `status = 'completed'` but no clone service materializes the JSONB itinerary into a traveler trip. Buyers who purchased a template have no mechanism to receive the itinerary as a usable trip. Needs: a `fulfillTemplatePurchase` service mirroring `fulfillReadyMadePurchase`, or a refund sweep if no purchases exist.

## F2. Content Studio share-card UI disconnection
`share-image.service.ts` generates PNG share cards (mounted, working). Content Studio has no "Generate share card" action in its UI — the endpoint is only reachable via the share-link flow, not from the content authoring surface. An expert who wants a promotional image for their listing has no path to it from Content Studio.

## F3. Event Planner silently excluded from Store Listings
The Store Listings tile is hidden when `isEventPlanner` is true (`workspace.tsx` launcher). No comment explains why. If event planners are permitted to sell plans, this is a silent exclusion bug. If they are not, the exclusion should be documented as a business rule and an explicit message should explain it to the user rather than hiding the tile.

## F4. `expert_templates` not surfaced on public Ready Made Trips page
The public store (`/ready-made-trips` and related pages) reads exclusively from `ready_made_trips`. Approved/published `expert_templates` records are invisible to buyers. Any expert who built and got approval for a template via the Itinerary Templates tile has no public storefront presence for that work.

## F5. No smart-landing for Workspace nav
The Workspace nav link always opens the 5-tile launcher regardless of active assignments. An expert with one active assignment clicks "Workspace" and must click again to reach their build surface. See CONSOLIDATION_PROPOSAL.md §3 for the recommended fix.

## F6. `local_knowledge_nuggets` gated to `requireLocalExpertOrAdmin`
`expert-console.routes.ts:379` — the POST/PATCH/DELETE knowledge-nugget endpoints require `requireLocalExpertOrAdmin`. `travel_expert` and `event_planner` roles cannot save knowledge nuggets. If Content Studio is intended for all expert family roles, this gate is too narrow.

## F7. Itinerary Templates uses inline route handler, not a router file
`GET /api/expert/templates` is an inline handler in `server/routes.ts:2962` rather than a dedicated router file. This is inconsistent with the rest of the expert route surface and makes the endpoint harder to locate during audits (the unmounted-router bug class was triggered precisely because the pattern is inconsistent).

## F8. `ready_made_trips` market column scoped to Kyoto only (v1 launch constraint)
`ready_made_trips.market` comment: "launch: Kyoto only (§12)". No code enforcement of this constraint was found — it is a schema comment, not a DB CHECK or application-layer guard. If the market scope is still a live constraint, it should be enforced at the submit gate.
