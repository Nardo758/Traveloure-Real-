# FULL PLATFORM SWEEP — Findings Register

| | |
|---|---|
| Date | September 6, 2026 |
| Codebase | `main` @ `f3933dfc6` (after PR #823) |
| Environment | Local: PostgreSQL 18, Node 24, full key set (XAI, Anthropic, Resend, Stripe test + webhook, X bearer) |
| Method | Phase 1: full Playwright persona + journey suites in canonical CI order. Phase 2: per-role write-path drives (API + UI verification) with real content creation per account |

## Confirmed working (evidence-backed)

- **Money paths:** provider-service checkout, ready-made purchase, Trip Pass $19 real Stripe charge, Trip Pass COVERED branch (fee waiver), Plus occasion via UI — journey-traveler 4/4
- **Two-surface model:** Trip Card correctly shows "Not final yet" guard for unfinalized trips; expert work delivers to the slip (`/plans/:id`, `slip-expert-note` renders "Note from Mika…") — verified manually after test mis-assertion
- **Expert supply:** profile, 2 services, "Quiet Gion" ready-made, admin approval, public rendering — supply-expert 4/4
- **Gem rail end-to-end:** expert creates knowledge nugget → propose-gem → admin queue → admin approves (gemScore + placeName gates) → gem born (`3a969b0c`, score 85, status hidden)
- **Concierge:** quote resolves priced tiers (AI $5.99 visible), draft request creation, guest possession model
- **EA:** client list/create, travel arrangement create
- **Handoff chain:** grant → accept → expert item (server-stamped origin) → delivered note — all DB-correct
- **AI entry checkout (J2), wishlist chains (J7), public share view (J13)** — pass

## Findings

### P1 — Broken journeys

**F1. Provider ServiceForm wizard: second service cannot be created (UI-only)** — ✅ RESOLVED (not reproducible)
- Where: `client/src/components/ServiceForm.tsx` wizard driver; supply-provider.spec.ts step 6
- Evidence: first service "Kyoto Portrait Route Planning Call" created/approved/public via wizard; second service ("Gion Photo Session Preparation Call") — wizard never reaches a submit/publish button within the step guard. API level is clean: two `POST /api/provider/services` calls both return 201 (tracking TRV-202609-00026/27)
- Impact: providers cannot build multi-listing catalogs through the UI — supply-side blocker for the 20–30 providers/market recruitment playbook (Appendix D)
- Resolution (Phase 4): final supply-provider.spec.ts run fully green — service #2 "Gion Photo Session Preparation Call" created via wizard (row `84c7c1e3`), admin-approved, public 200. Deterministic product bug NOT reproducible. Loose end: a manual repro showed a silent no-POST submit path (wizard button clicked, zero POST fired, zero DB rows) — unexplained, possibly the `notice-review-before-live` interstitial; gates to inspect if it resurfaces: ServiceForm.tsx:4949 (submit-disabled predicate) and the offering-first throw at 1337–1340. No code changed.

**F2. Optimizer apply-best does not discard losing unshared variants** — ✅ RESOLVED (test drift, not app bug)
- Where: j1-golden-path.spec.ts J1.3 (line 584); optimizer apply flow
- Evidence: paid TEST-mode optimizer run succeeds, best variant applies, but variant count stays 4 (expected < 4) — losing UNSHARED variants not discarded
- Root cause: the discard was DELIBERATELY removed — adopt-finalize-conform D-4 supersedes ruling 14's R3. The review board stays revisitable after apply ("pick stops from any proposal"); `server/routes/plancard.routes.ts` apply-to-trip comments document the removal, and no code path anywhere deletes `itinerary_variants`. CLAUDE.md line 890 ratifies "the revisitable board". The TEST still asserted the old R3 contract.
- Resolution (Phase 4): J1.3 updated to the D-4 contract — header comment, test name, and assertions now require ALL variants retained (`variantsAfter === variantsBefore`) + selected variant stamped. J1.3 passes green (2.2m, real paid TEST-mode run). Open product question (owner decision, NOT changed): no discard exists at Finalize Plan either — variants live forever; if storage/cleanliness matters, a finalize-time discard would be new app behavior requiring a ruling.

### P2 — Test debt & robustness

**F3. journey-handoff.spec.ts asserts the wrong surface** — ✅ RESOLVED (PR #825)
- Step 9 navigates to `/trip/:id` (Trip Card) and expects `expert-note-callout-<id>`; per the two-surface model, delivered expert work lives on the slip (`/plans/:id`, testid `slip-expert-note`). Product is correct; the test is wrong
- Resolution (Phase 4, PR #825): step 9 retargeted to `/plans/:id` + `slip-expert-note` filtered by note text (the slip block prepends a "Note from {expertName}" label — SlipView.tsx:514 — so the assertion is CONTAINS). Full suite green, 9/9 steps PASS (7.3s); the §12 pinned negatives still pass.

**F4. `POST /api/provider/services` returns 500 on DB constraint violation** — ✅ RESOLVED (PR #826)
- Zod schema (`insertProviderServiceSchema`) accepts `deliveryMethod` values the DB check constraint rejects (allowed: pdf, video, call, in_person, voice_notes, async_messaging, hybrid) — schema/constraint drift; a client-side-invalid value surfaces as 500 instead of 400
- Resolution (Phase 4, PR #826): `deliveryMethod: z.enum(deliveryMethodEnum)` added field-level in shared/schema.ts (survives `.partial()` on the PATCH path); POST + PATCH catches map pg `23514` (read through Drizzle's `.cause`, same pattern as admin `offeringWriteError`) to `400 CONSTRAINT_VIOLATION` as defense-in-depth. Verified live: `'virtual'` → 400 with a clear enum message (was 500); canonical `'video'` → 201. The client was never the source — ServiceForm's `toCanonicalDelivery` already maps UI values at the write boundary.

**F5. Local test-env gaps (documented, fixed in dev-local.sh)**
- Persona suite requires `seed-personas.ts --apply` + `seed-ci-test-users.ts` + `DATABASE_URL` in the test process; J6 needs Stripe Connect env (skipped locally); Amadeus flows blocked-external (dead API)

## Not findings (checked and cleared)

- Expert-note visibility (was finding B in Phase 1) — product correct per two-surface model; see F3
- Admin approval 401s in first supply-expert run — missing ci-admin seed, not a product bug
- Guest journey step 3 — downstream of F1, not independent

## Phase 4 remediation log (complete — all landed on main)

1. **F1** — provider wizard second-service: NOT reproducible; final supply-provider run fully green, no code change. Loose end (silent no-POST submit path) documented in the F1 entry.
2. **F2** — PR #824 (merged `a7269caa7`): J1.3 aligned to adopt-finalize-conform D-4 (variants retained, not discarded). Open product question: no variant discard exists at Finalize Plan either — needs an owner ruling if cleanup is wanted.
3. **F3** — PR #825 (merged `085710a4e`): handoff step 9 retargeted to the Trip Slip.
4. **F4** — PR #826 (merged `0c4dbf7a4`): deliveryMethod zod enum + 23514→400 mapping on POST/PATCH /api/provider/services.
