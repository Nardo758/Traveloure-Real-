# Backoffice Program — Implementation Map & Agent Designation

**Date:** Jul 25, 2026
**Purpose:** every work item designated to a model tier so the expensive model plans once and cheap models
execute against fences (the docs/briefs/README.md protocol: behavioral gates + CI guards + CLAUDE.md traps
convert executor mistakes into mechanical red/green). **Nothing executes until the roadmap is approved.**

**Tier philosophy**
- **Haiku** — mechanical UI/config work with an enumerated file list and a behavioral gate that fails on the old code.
- **Sonnet** — standard endpoint/wiring work behind the four standard gates (tsc-delta-0, build, money guard, unmounted-router guard) + a brief-specific behavioral gate.
- **Fable** — money-path diffs, schema design, resolver changes, and WRITING the briefs the cheaper tiers execute. Fable never executes what a fenced Sonnet can.
- Items marked **HUMAN READ** stop after gates pass for the decision-maker's diff read (money rule).
- Items marked **⛔ DECISION** cannot start until the named decision is made.

**Role-fit verdicts feeding this map (Jul 25 verification pass):**
- **EA: out of scope for the backoffice program** — the EA console (14 pages, own `EALayout`/`EASidebar`, own `/api/ea` RBAC) sells nothing and keeps its separate static sidebar untouched. But the pass found EAs currently **leak into the expert console** (M1 below) — fixed in Wave 0, not absorbed into the nav redesign.
- **Expert subtypes: fits with a role-computed tool matrix.** The Workspace hub must compute tool visibility `f(user.role)` at render (roles can switch via `PATCH /api/expert/role`): local_expert = full set (incl. nugget composer); travel_expert = full set minus nugget composer; **event_planner = HIDE ready-made authoring** (server-excluded from `AUTHOR_ROLES` — today's unconditional Store Listings entries are a 403 dead-end the hub fixes, not inherits) but keeps itinerary templates (their intended store lane), DMO library, and share tools, in their "Events/Packages/Promo Content" vocabulary.
- **Admin: five pipeline queues exist and absorb the redesign unchanged** (provider-services, expert-templates, ready-made, DMO intake, review moderation — all sidebar-reachable). Four additions required: handle reserved-word enforcement + admin rename/release lever (Phase 1), short-link admin surface shipped WITH Phase 2, review-response moderation (Wave 0 — the respond endpoint is live today with zero admin visibility), and a share-asset persistence decision before any IG activation.
- **Traveler: clean** — zero traveler-facing links into any folded surface.

---

## Phase 0.5 — Verification gating & payout readiness (⛔ Phase-1 DEPENDENCY — see EARN_PIPELINE_EVAL.md)

The KYC + banking spine is BUILT (Stripe Identity + Persona KYB + Connect Express, all mounted/wired) but
NOT enforced as a gate. This wiring must land BEFORE Phase 1 surfaces public `/p/{handle}` pages — an
unverified earner must not be publishable. Mostly wiring existing populated fields; no from-scratch build,
no money-math (the payout block already exists), so **no Fable item**.

| ID | Item | Tier | Stop | Est. tokens | Notes |
|----|------|------|------|-------------|-------|
| V.1 | Gate publish/go-live on `identityVerificationStatus='verified'` (+ `businessVerificationStatus` for businesses) — F2-style read-gate on the already-populated column; preserve §5 build-while-pending (gate publish, not console entry) | Sonnet | — | ~55k | Behavioral gate: verified publishes, unverified 403s at publish |
| V.2 | Sequence Identity/KYB into the application flow (not just a status-page button) so "pending" = pending review, not not-started | Sonnet | — | ~50k | UI sequencing over the existing `/api/identity/*` endpoints |
| V.3 | Sequence Connect onboarding into go-live (offering not publishable/payout-eligible until active Connect account); the payout money-block already exists (admin.routes.ts:3714) | Sonnet | — | ~45k | Adds the surface prompt; money side unchanged |
| V.4 | Normalize `provider` vs `service_provider` role vocabulary across gates | Haiku | — | ~25k | Latent inconsistency; grep-enumerated |
| V.5 | Launch checklist: confirm STRIPE_* / PERSONA_* env keys set (no-key fallbacks are safe → manual review, but must be a conscious choice) | Haiku | — | ~10k | Doc + a startup readiness log line |

## Wave 0 — Hardening & bug fixes (independent of roadmap approval; each is a filed defect)

| ID | Item | Tier | Stop | Est. tokens | Notes |
|----|------|------|------|-------------|-------|
| W0.1 | **EA routing repair (M1):** remove `executive_assistant` from `role-utils.ts` EXPERT_ROLES so the dead `/ea/dashboard` home-path branch goes live and EAs stop booting into `/expert/dashboard`; verify user-menu + ActiveConsoleContext alignment (they already treat EA as not-expert). Decide the deliberate server DMO grant (`expert-workspace.routes.ts:35`): default = keep, file an EA-console DMO entry as follow-up | Sonnet | — | ~45k | Cross-file role logic; behavioral gate: EA login lands on /ea/dashboard, expert routes 403/redirect |
| W0.2 | **Nugget API gate (M2):** `/api/expert/knowledge-nuggets` is `isAuthenticated`-only (any traveler can hit it) — add to `EXPERT_SELF_SERVICE_PREFIXES` or role-gate to local_expert | Sonnet | — | ~30k | Small but security-shaped; gate: traveler 403, local_expert 200 |
| W0.3 | **event_planner 403 dead-end (M3):** hide the 3 unconditional Store Listings surfaces (sidebar entry, launchpad card, create button) for event_planner | Haiku | — | ~15k | Pure conditional rendering; superseded later by N2's tool matrix but cheap to fix now |
| W0.4 | **Tip endpoint gating (L1):** disable/404 `POST /api/expert/:expertId/tip` until a payment leg exists | Sonnet | **HUMAN READ** | ~25k | Money-adjacent; tiny diff; gate: endpoint unreachable, no earning row created |
| W0.5 | **Broken share links (K1):** `/shared-trip/${token}` → the real `/trips/shared/:token` route | Haiku | — | ~10k | One-line class |
| W0.6 | **IG publish one-line fix (L3):** correct the `apiRequest` signature call | Haiku | **⛔ DECISION: Tier-2 activate/dormant** | ~10k | If dormant, skip — don't fix a wire into a deliberately-off rail |
| W0.7 | **Review-response moderation (M4):** surface `responseText` in `getAdminReviews` enrichment + render in review-moderation.tsx + a response-scoped clear action (never deletes the traveler review) | Sonnet | — | ~50k | Respond endpoint publishes instantly today with zero admin visibility; prerequisite for N7 |
| W0.8 | **Fabrication sweep (K5/L7 subset):** hardcoded tickers, 65% bar, month-label-over-all-time, fabricated funnel/CLV/seasonal map → honest empties or removal | Haiku | — | ~35k | Mechanical §13 removals from an enumerated list |

## Phase 1 — Public storefront (⛔ roadmap approval)

| ID | Item | Tier | Stop | Est. tokens | Notes |
|----|------|------|------|-------------|-------|
| P1.1 | Migration: `users.handle` (auth.ts) + `slug` on the three offering tables, additive-nullable; slug backfill from titles; **server-side reserved-word list** enforced at handle claim | Sonnet (Fable-authored brief) | — | ~60k | Schema ratified by roadmap approval; information_schema verify; migration-129 posture |
| P1.2 | `/p/:handle/:slug` resolver (mounted router, F2 gate preserved exactly) + client routes | Sonnet | — | ~45k | |
| P1.3 | Server OG injection for `/p/*` + `/services/:id` — replicate `trips.routes.ts:2860` | Sonnet | — | ~40k | No edge function |
| P1.4 | Service-page presentation: render galleryImages, small public identity endpoint + block, cancellationPolicy display, share button | Sonnet | — | ~55k | §13: identity block shows real service rating or "New" |
| P1.5 | Expert identity stitching on template + ready-made detail (author in DTO + profile link) | Haiku | — | ~20k | Fields exist server-side |
| P1.6 | Availability calendar: traveler slot picker on the existing public slots GET + owner slot-CRUD UI (workspace tool, both roles) | Sonnet | — | ~70k | Substrate exists with zero consumers; fix the ProviderAvailabilityManager payload mismatch (K3) here or delete it |
| P1.7 | **Atomic slot claim at `/api/checkout`** (§15 conditional UPDATE) + 409 SLOT_TAKEN UX (copy the existing contract) | **Fable** | **HUMAN READ** | ~110k | The one Phase-1 money-path diff |
| P1.8 | Admin handle lever: rename/release on /admin/users | Haiku | — | ~20k | |

## Wave N — Console consolidation (parallel with Phase 1; client-heavy)

| ID | Item | Tier | Stop | Est. tokens | Notes |
|----|------|------|------|-------------|-------|
| N1 | Unified sidebar: extend `buildMenuGroups(role)` to provider, delete provider-sidebar, tokenize the duplicated inline hex | Sonnet | — | ~50k | |
| N2 | **Workspace hub fold** (the big one): DMO Library + Content Studio creation half into workspace tools; **role tool matrix `f(user.role)`**; query-param-preserving redirects from `/expert/content-studio(/:contentType)` + `/expert/dmo-library` (wouter Redirect drops search params — forward explicitly); repoint or preserve the 6 `instagram.ts` OAuth redirect targets; repoint the 4 intra-expert links; update `role-routes-config.ts` CI smoke registry | Sonnet (Fable-authored brief carrying the trap list) | — | ~90k | The traps are enumerated from the verification pass — the brief transfers them |
| N3 | Provider workspace mode: third case of the server-resolved mode, **wrapping ServiceForm (§5)** + availability + asset tools | Sonnet (Fable-authored brief) | — | ~65k | |
| N4 | My Offerings merged table + approval badges (incl. serializing `approvalStatus` in the services DTOs — the born-submitted invisibility fix) | Sonnet | — | ~55k | |
| N5 | Orders: provider rename; expert 4-rail aggregation (bookings, assignments, coordination, affiliate) | Sonnet | — | ~60k | Aggregation only — all rails live |
| N6 | Expert calendar page (4 date sources; bookingDetails jsonb parse) | Sonnet | — | ~55k | |
| N7 | Reviews panel: "my reviews" list endpoint (join) + adopt the existing respond endpoint | Sonnet | — | ~45k | After W0.7 so responses are moderatable before we encourage them |

## Phase 2 — Attribution (⛔ roadmap approval; after P1.1)

| ID | Item | Tier | Stop | Est. tokens | Notes |
|----|------|------|------|-------------|-------|
| P2.1 | `share_links` table + `GET /r/:code` (mounted router) + generation service + copy-link UI | Sonnet | — | ~55k | Model on sharedTrips token infra |
| P2.2 | Server-side source stamping at checkout; wire `attributionRef` (write-dead column); add `template_purchases` attribution column | Sonnet | **HUMAN READ** | ~60k | §14: session/server-resolved only; also un-zeroes the cross-sell counters (K2) |
| P2.3 | `users.acquired_via_provider_id` + persist the already-parsed signup `?ref=` | Sonnet | — | ~35k | |
| P2.4 | Referral loop completion: generate at approval, redeem at signup, qualify on first booking (creator already escrow-correct); kill the fabricated REF- fallback (L4) | Sonnet | **HUMAN READ** | ~55k | Creates earnings → human read |
| P2.5 | Admin short-link surface: list/deactivate per provider | Haiku | — | ~25k | Ships WITH Phase 2, not after |

## Phase 3 — Fee source dimension (⛔ roadmap approval)

| ID | Item | Tier | Stop | Est. tokens | Notes |
|----|------|------|------|-------------|-------|
| P3.1 | `fee_bands.source_type` + `resolveCommissionRates` source input + repeat-pair rule + **neutrality proof script both directions** | **Fable only** | **HARD STOP — HUMAN READ** | ~140k | Never delegated; the one resolver, no fork |

## Phase 4 — Social engine Tier 1 (⛔ roadmap approval; P4.4 ⛔ Tier-2 decision)

| ID | Item | Tier | Stop | Est. tokens | Notes |
|----|------|------|------|-------------|-------|
| P4.1 | Caption/hashtag config: `platform_settings` seeds (migration-067 pattern) + interpolation helper | Haiku | — | ~25k | No hardcoded copy — grep-gated |
| P4.2 | Share-asset generator: Satori (new dep) + public asset hosting + Unsplash attribution respected | Sonnet | — | ~70k | Public URL required if IG rail ever consumes it |
| P4.3 | Share & Promote surface: event-driven prompts composed from real signals (reviews, empty slots, market gaps) | Sonnet | — | ~60k | §13: real data or no prompt |
| P4.4 | IG activation: env, ~60-day token-refresh job, persist published-post state | Sonnet | **⛔ DECISION: Tier-2** | ~50k | Plus the share-asset/caption admin-visibility decision if activated |

## Phase 5 — Analytics (⛔ roadmap approval)

| ID | Item | Tier | Stop | Est. tokens | Notes |
|----|------|------|------|-------------|-------|
| P5.1 | Earnings GROUP BY type aggregate + ledger-fed activity feed (fixes L5); exclude `reversed`, match summarizeEscrowEarnings | Sonnet | — | ~50k | Coordination slice omitted until the coordinator-pay decision |
| P5.2 | recharts upgrade of provider/expert analytics + provider-scoped CSV export (clone admin shape, session-scoped §14) | Haiku | — | ~35k | |
| P5.3 | Remaining fabrication replacement + dead-render section removal (L7 list) | Haiku | — | ~30k | |

---

## Totals & sequencing

| Tier | Items | Est. tokens |
|------|-------|-------------|
| Haiku | 9 | ~190k |
| Sonnet | 19 | ~955k |
| Fable (execution) | 2 | ~250k |
| Fable (brief-writing for P1.1/N2/N3 + reviews) | — | ~100k |
| **Program total** | **30** | **~1.5M** |

**Sequencing:** Wave 0 anytime (bug fixes) → on approval: Phase 1 ∥ Wave N → Phase 2 → Phase 3 (hard stop) →
Phase 4 ∥ Phase 5. Human-read stops: W0.4, P1.7, P2.2, P2.4, P3.1.

**Open decisions gating items:** roadmap approval (everything past Wave 0) · Instagram Tier-2 (W0.6, P4.4) ·
coordinator compensation (P5.1's coordination slice) · tip endpoint (W0.4 is the recommended interim gate).

**Execution protocol:** each item gets a brief in `docs/briefs/` per the README (fresh cheap-model session,
four standard gates + behavioral gate, out-of-scope → report not fix). Fable's job is the briefs, P1.7, P3.1,
and reading the human-read diffs' gate output — not executing fenced work.
