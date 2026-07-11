# Structural Fix — Phase 0: Doc-Delta + Behavioral Confirm

**Brief:** Experts & Services Structural Consolidation dispatch, Phase 0 (read-only).
**Code @** `main` HEAD `e931e1bf` (branch `claude/sync-local-repo-2j7ghv` = main + audit docs only; no app code differs). Audit line numbers re-verified against this HEAD — all citations below re-checked live, none carried stale.
**Behavioral method:** app run locally — PostgreSQL 16 (fresh cluster), full migration chain applied by `runMigrations()` at startup, background seed completed (`/api/ready` → `ready:true`), CI stub env (`STRIPE_SECRET_KEY`/`AMADEUS_*` stubs per `.github/workflows/selection-controls-gate.yml:105–126`). Auth caveat: email login requires `REPL_ID` because `passport.serializeUser` registration sits *after* the no-REPL_ID early return (`server/replit_integrations/auth/replitAuth.ts:103–106` vs `:148`) — worked around with a stub `REPL_ID` + local mock OIDC issuer. That is itself a finding (email/password auth is dead in any non-Replit environment unless OIDC discovery succeeds).

---

## 0a — Doc-delta table

| # | Topic | Doc ref | Code ref | Class | Consequence for this brief |
|---|---|---|---|---|---|
| 1 | `GET /api/expert/services` "filters by userId + approvalStatus" | CLAUDE.md:49 | server/routes.ts:5536 → storage.ts:1231–1240 — filters by `userId` + optional `status` **only**; `approvalStatus` never consulted | **DRIFT** | The documented read-side approval gate doesn't exist. Phase 2's gate wording ("every expert create path sets approvalStatus") is necessary but not sufficient — nothing on the expert console list distinguishes approved from not. |
| 2 | Approval workflow "draft → submitted → approved stored as approval_status" | CLAUDE.md:21 | shared/schema.ts:563 — column **defaults `"approved"`**; wizard (`service-wizard.tsx:267–284`) and live from-template handler (routes.ts:5617–5629) never set it → born-approved. Only ServiceForm sets draft/submitted (ServiceForm.tsx:490–496) | **DRIFT → feeds DECISION D1** | The lifecycle the doc describes is implemented in storage (`submitExpertCustomService`/`approve…`/`reject…`, storage.ts:2484–2516) and mounted admin endpoints (admin.routes.ts:1322–1377) but bypassed by 2 of 3 create paths and **surfaced by no admin UI** (see D1). |
| 3 | ESO is "a read-only template/offerings catalog **for the signup flow**" | CLAUDE.md:22, :154 | Signup (travel-experts.tsx) never reads ESO; it reads the zombie `/api/expert-service-categories` (routes.ts:3852 → storage.ts:2214–2216 `return []`). ESO templates are consumed by the **wizard** instead (content.routes.ts:1667 → content-query.service.ts:186–201, read-only) | **DRIFT** | The doc's stated consumer is wired to a dropped table; the actual ESO consumer is the create wizard. Phase 3's replacement source is `/api/offering-types/experts` (content.routes.ts:236 → `expert_offering_types`) — consistent with the doc's read-only rule; no ESO write anywhere. **MATCH on the "read-only" half:** no live code writes ESO. |
| 4 | Offering-type table contracts (keys, 5 tiers, `deliveryFormats[]`, `marketScoped`, `isSurprising`) | docs/planning/master-integration-phase-0-audit.md:65–66 | shared/schema.ts:5786–5823 (`service_offering_types`, `expert_offering_types`) | **MATCH** | Canonical catalogs exist exactly as specified; Phase 3 can rely on them. (`marketScoped` is `text[]` of city slugs, NULL = universal — schema.ts:5794.) |
| 5 | "All service creation writes to provider_services" | CLAUDE.md:19, :46–49 | POST /api/provider/services (routes.ts:2018), from-template (routes.ts:5578 → `storage.createProviderService`), deprecated custom-services POST (storage.ts:2420–2455) — all insert `provider_services` | **MATCH** | Canonical-table rule holds on every live write path. The brief's "no second fork" rule is about the *client*; the server side is already converged. |
| 6 | Expert application + service creation "✅ Built" with evidence pointing at `experts.routes.ts:195–298`, `:472` | docs/planning/gap-audit.md:30–31 | `expertsRoutes` imported (routes.ts:104) but never `app.use`'d — the cited file is **dead code**; the live handlers are inline (routes.ts:1418, :2018) | **DRIFT** | gap-audit's evidence column canonizes the unmounted router. Any future agent following those refs edits dead code (this already happened once — route-defragmentation-brief.md documents the FEE-A gate landing in dead `trips.routes.ts`). |
| 7 | experts.routes.ts = "163 endpoints, 160 duplicated in routes.ts" | docs/planning/route-defragmentation-brief.md:23, :58 | Measured at HEAD (method+path, param-normalized, all 17 mounted routers + prefixes accounted): 163 registered, **90 duplicated, 73 exist ONLY there** (list: scratchpad diff, reproduced in §0a-Annex) | **DRIFT → feeds DECISION D2** | The brief's premise (near-total duplication → safe to dedupe) understates what the module uniquely owns by ~24×. Deleting the file discards 73 handler implementations; ~24 endpoint families among them have **live client callers today** (EA console `/api/ea/*` — all 8 resources; `/api/expert/role`; `/api/expert/service-templates`; `/api/expert/knowledge-nuggets*` (content-studio); `/api/expert/contracts/recent`; `/api/expert/assignments/:id/workspace-status` (workspace); `/api/expert/trips/:id/vendors|constraints` + `/api/expert/vendors/:id` (logistics hub); `/api/provider/availability/*`, `/api/provider/blackout-dates`, `/api/provider/booking-requests(+respond)`, `/api/provider/settings`, `/api/provider/earnings/summary`, `/api/provider/payouts` (provider console); `/api/visa/experts`, `/api/visa/requirements` (visa-help)). All of these currently fail at runtime. |
| 8 | `offeringTypeKey` carried from /earn into signup | earn.tsx:1–22 header contract + earn-roles.ts:87–116 (`signupPath` with `?offeringTypeKey=&offeringName=`) | travel-experts.tsx:166 reads it, stamps a `data-` attribute (:502), submits only the display name into `specializations` (:384–386); services-provider.tsx:101/:187–189 same. Wanted-slot Apply sends `?offering=&neighborhood=` (discover-location.tsx:492) that travel-experts.tsx:160–167 never reads | **DRIFT** | Confirms Phase 3.1 exactly as briefed. Target column exists nowhere on the application forms — `local_expert_forms` / `service_provider_forms` have no offering-key column (schema.ts:323–411, :413–455), so "reach the submit payload" implies either a jsonb field reuse or a schema addition (flag: migration coordination rule). |
| 9 | Provider signup fields have storage targets | (no doc claims this; audit #9 flagged the drops) | `service_provider_forms` (schema.ts:413–455) has **no** `taxId`, `capacity`, `priceRange`, `amenities`, `hasInsurance`, `city` columns. `gst` (:425) and `infoConfirmation` (:442) exist — the renames are the only reason those two survive | **DECISION D4** | "Submit them correctly" requires a schema migration (coordination rule → decision-maker); "remove the inputs" is code-only. Cannot be resolved by code inspection — product choice. |
| 10 | Delivery-method canonical set | shared/schema.ts:508 `deliveryMethodEnum = ["pdf","video","call","in_person","voice_notes","async_messaging"]` + :530 column comment | Enum is exported and **referenced nowhere** (grep: 1 hit, its own declaration). Writers disagree: wizard `video/document/in-person/hybrid` (service-wizard.tsx:100–122), ServiceForm `in-person/video-call/hybrid` (ServiceForm.tsx:242–257, :942–944), server canonical templates `video/document/hybrid` (routes.ts:259–319), booking-concierge seed `async_messaging` (routes.ts:1645), from-template copies raw ESO values (routes.ts:5611) | **DECISION D3** | "Collapse to the schema's set" (Phase 2.3) is under-determined: the schema's declared set excludes `hybrid`, which every client writer and existing seed rows use. Choosing the target set decides whether Phase 2 includes a data migration over existing `provider_services.delivery_method` values. |
| 11 | Migration 057 (`expert_offering_type_id` FK) & 061 (booking_concierge offering type) | CLAUDE.md:100–109 | shared/schema.ts:592; server/migrations/057_expert_offering_type_fk.sql:5; 061 seed registered in migration-files.ts | **MATCH** | The Phase-3 selection payload has a real FK to point at. |
| 12 | "Experts opt in by creating an **APPROVED** provider_services row" (booking_concierge eligibility) | CLAUDE.md:107 | Eligibility/read surfaces that do filter `approvalStatus='approved'`: recommendation.service.ts:796–803, expert-availability.service.ts:50, storage.ts:2523–2529 | **MATCH (and raises D1's stakes)** | Approval isn't cosmetic: born-draft services are invisible to recommendations/availability until approved. Enforcing draft-first *without an approval surface* would make expert services vanish from these paths permanently. |
| 13 | Application-approval lifecycle (admin approves expert/provider **applications**) | docs/planning/per-expert-commission-override-brief.md:27, :44; gap-audit.md:32 | admin.routes.ts:675 (list), :699 (PATCH status, role promotion at :710–721); provider twin :807–850 — mounted (routes.ts:489) and consumed by `client/src/pages/admin/experts.tsx` | **MATCH** | Two distinct lifecycles confirmed: **application** approval (users; has admin UI, works) vs **service** approval (provider_services rows; server-complete, UI-headless — D1). Do not conflate them in Phase 2 wording. |
| 14 | Live `/api/experts` role filter | (audit) | routes.ts:3919–3921 filters `expert.role === role`; dead twin experts.routes.ts:588–592 has no role param | **MATCH w/ audit** | Confirms the danger of mounting experts.routes.ts *before* the inline block (its no-role copy would win). Any mount must come after inline registration — or the duplicate copies must be deleted from the module first. |

### 0a-Annex — the 73 endpoints existing only in unmounted `experts.routes.ts`

Method+path diff at HEAD (param names normalized; all mounted routers incl. prefix mounts `/api` booking-actions, `/api/instagram`, `/api/bookings`, `/api/messages`, `/api/expert-workspace`, `/api/identity`, `/api/webhooks` accounted). Families with live client callers marked ★:

```
★ /api/ea/{ai-tasks,clients,communications,events,executives,gifts,travel,venues} — full CRUD (34 routes; pages/ea/*.tsx)
★ GET/PATCH /api/expert/role                       (expert/services.tsx:102, expert/profile.tsx:224)
★ GET /api/expert/service-templates                (expert/services.tsx:98, orphan service-templates.tsx:60)
★ /api/expert/knowledge-nuggets CRUD + /api/knowledge-nuggets/city   (expert/content-studio.tsx)
★ GET /api/expert/contracts/recent                 (expert/contract-categories.tsx:111)
★ PATCH /api/expert/assignments/:id/workspace-status (expert/workspace.tsx:551)
★ GET/POST /api/expert/trips/:id/{vendors,constraints}, PUT/DELETE /api/expert/vendors/:id  (logistics hub components)
★ GET/POST/PATCH/DELETE /api/provider/availability/{rules,blackout-dates}  (provider/availability-management.tsx — orphan page)
★ POST/DELETE /api/provider/blackout-dates         (provider-availability-manager.tsx — live component)
★ GET /api/provider/booking-requests, PUT …/:id/respond  (provider-booking-context.tsx, provider/dashboard.tsx:64)
★ GET/PATCH /api/provider/settings                 (provider/settings.tsx — routed page)
★ GET /api/provider/earnings{,/details,/summary}, GET /api/provider/payouts, POST /api/provider/payouts/request  (provider/payouts.tsx — orphan)
★ GET /api/visa/experts, POST /api/visa/requirements  (visa-help.tsx — routed page)
  GET /api/expert/earnings/details · GET /api/expert/payouts · POST /api/expert/payouts/request
  POST /api/expert/find-providers · POST /api/leads/route · GET /api/leads/score-preview
```

(`GET /api/expert/assigned-trips` — flagged dead in the prior audit's caller sweep — is actually **live** via the prefix-mounted `booking-actions.ts:535`; the prior audit's grep missed prefix mounts. Corrected here.)

---

## 0b — Behavioral confirm (observed, not inferred)

Environment: local run as described in the header. Screenshots in session scratchpad (`shot-signup-*-services.png`, `shot-expert-services.png`, `shot-experts-*.png`, `shot-discover-services.png`).

### 1. Audit #1 — expert application dead-end: **CONFIRMED, all four types**

Drove `/become-expert?type=` for `travel_expert`, `event_planner`, `executive_assistant` (steps 1–2 filled validly) and `local_expert` (steps 1–4 incl. three 50-word essays). Observed at the Services step, per type:

```
[travel_expert]        SERVICES STEP: reached=true offeringChips=0 nextDisabled=true api=["200 application/json"]
[event_planner]        SERVICES STEP: reached=true offeringChips=0 nextDisabled=true api=["200 application/json"]
[executive_assistant]  SERVICES STEP: reached=true offeringChips=0 nextDisabled=true api=["200 application/json"]
[local_expert]         SERVICES STEP: reached=true offeringChips=0 nextDisabled=true api=["200 application/json"]
```

The "Services You Offer" card renders with **zero** offerings and no explanatory message; Next is disabled with nothing selectable (screenshot confirms). `/api/expert-service-categories` returned `200` with body `[]` (live-probed). **The funnel is dead at this step for every expert type**, exactly as the audit predicted from `storage.ts:2214–2216`.

### 2. Audit #7 — `/expert/services` role banner: **CONFIRMED**

Logged in as a role=`expert` user and loaded `/expert/services`:

```
rendered=true  roleBannerPresent=false  createCTA=true
dead-endpoint responses seen by page:
  /api/expert/service-templates → 200 text/html
  /api/expert/role              → 200 text/html
```

The page works (list, analytics, create CTA — `/api/expert/services` and `/api/expert/analytics` return JSON) but the role-callout banner never renders. **Mechanism refinement over the audit:** the dead endpoints do not 404 — the Vite dev catch-all serves `index.html` with **200 text/html** for any unregistered `/api/*` GET, so the client's `res.json()` throws a parse error that the `= []` defaults swallow. Same net effect (silent feature death), different mechanism than "404" — worth knowing for Phase 4's error-surfacing conversation and for anyone probing prod (prod static serving may differ).

### 3. FIND-HELP presets: **meaningful, not cosmetic — with a data-taxonomy hole**

- `/experts?role=local_expert` → **0** expert cards, "No experts found" shown.
- `/experts?role=travel_expert` → **1** expert card (the sole `role='travel_expert'` user).
- Unfiltered `/api/experts` → **14** experts.

The presets genuinely filter (different populations → the dropdown items are functional, and the live handler's `role` support at routes.ts:3919–3921 is real). **But** 12 of 14 experts carry the generic role `expert`, which matches *neither* preset — the presets hide ~86% of the expert population, and the local-experts preset is empty against seeded data. Not a router bug; a `users.role` taxonomy inconsistency. Noted for Phase 5: keep the presets, but they're only as good as the role data.

- `/discover?tab=services` → opens directly on the **Browse Services** tab, populated (4 pages of service cards with category filters). The header's choice of `/discover?tab=services` over the orphan `/service-providers` page is behaviorally sound — redirecting `/service-providers` there (Phase 5.2) loses nothing observed.

### Incidental behavioral findings (not in the audit)

- **Email/password login is broken in any non-Replit environment**: `setupAuth` returns before `passport.serializeUser` when `REPL_ID` is unset (replitAuth.ts:103–106 vs :148), so `req.login()` in the email handler (emailAuth.ts:251) fails with "Failed to serialize user into session"; if OIDC discovery then *fails* (unreachable/HTTP issuer), routes.ts swallows the error ("Auth setup failed (OK for development)") and **all** auth routes vanish — `POST /api/auth/login` itself falls through to the Vite catch-all. Anyone running behavioral checks (or a non-Replit deploy) hits this first.
- The unregistered-`/api/*`-returns-200-HTML behavior above generalizes: every dead-router endpoint in §0a-Annex fails as a silent JSON-parse error in the client, invisible without a network tab.

---

## DECISIONS required before Phase 1 (do not proceed without these)

**D1 — Expert service-approval lifecycle (blocks Phase 1 & 2).**
The dispatch mandates "never born-approved." Facts: the column defaults `approved` (schema.ts:563); submit/approve/reject storage functions and mounted admin endpoints exist (`/api/admin/custom-services/pending|:id/approve|:id/reject`, admin.routes.ts:1322–1377); **no admin UI calls them** (grep `admin/custom-services` in client: zero hits); recommendation/availability surfaces already filter `approvalStatus='approved'` (delta #12). If Phase 1/2 makes every expert create born-`draft`/`submitted` with no approval surface, expert services will be created but **never become visible or bookable** — the funnel un-breaks at signup and re-breaks at listing. Options:
  a. Enforce draft/submitted AND add the missing admin approval surface (small: a pending-list + approve/reject actions wired to the existing mounted endpoints — but it widens this brief's scope into admin UI).
  b. Enforce `submitted` + keep an explicit auto-approve (server-side, logged) until the admin surface ships — honest interim, no invisible services.
  c. Keep born-approved for experts, update CLAUDE.md to match reality, and drop the "never born-approved" requirement.
  My read: (a) if you'll accept the scope, else (b). (c) contradicts CLAUDE.md:107's eligibility semantics.

**D2 — `experts.routes.ts` disposition (blocks Phase 5; changes its size).**
The dispatch default ("delete unless a registration exists only there and is needed") was premised on near-total duplication. Measured: **73 endpoints exist only there; ~24 families have live client callers** (EA console entirely, expert workspace/content-studio/logistics, provider settings/availability/booking-requests/payouts, visa-help — §0a-Annex). Options:
  a. **Mount it after the inline registrations** (one `app.use` at the end of `registerRoutes`): its 90 duplicate twins lose to the earlier inline copies (safe per Express first-wins; the dangerous no-role `/api/experts` copy stays shadowed), and the 73 unique handlers go live — resurrecting EA console + the rest at a stroke. Cost: 73 unreviewed handlers (auth/ownership quality unknown) go live at once.
  b. Port only what this brief needs (`GET/PATCH /api/expert/role`, `GET /api/expert/service-templates` — the #7 banner) into a mounted router; file the other ~22 broken families as a separate brief; delete nothing yet.
  c. Delete the file and accept/file the broken features (the dispatch's default — now knowably expensive).
  My read: (b) for this brief (scope-safe), with (a) evaluated in the route-defrag program (its P4 already plans this module). Decision is yours — (a) is tempting but un-auditable inside this lane.

**D3 — Canonical delivery-method vocabulary (blocks Phase 2.3).**
The schema's declared set (`pdf, video, call, in_person, voice_notes, async_messaging`, schema.ts:508) is enforced nowhere and excludes `hybrid`, which every current writer and seeded row uses. Pick one:
  a. Schema enum as-is + migrate existing rows (`document`→`pdf`, `video-call`→`call`?, `hybrid`→??) — `hybrid` has no target; lossy.
  b. Schema enum **+ `hybrid`** added, then collapse writers to it and migrate rows (my read: this is the real canonical set).
  c. Freeze on ServiceForm's set (`in-person`, `video-call`, `hybrid`) and update the schema comment/enum.
  Any option touching stored rows is a data migration → coordination rule applies.

**D4 — Provider-signup collected-but-dropped fields (blocks Phase 3.4).**
No columns exist for `taxId`/`capacity`/`priceRange`/`amenities`/`hasInsurance` (schema.ts:413–455). Submit-them = schema migration (5 columns) + payload; remove-them = shorter form, code-only. Also: keep the `registrationNumber`→`gst` mapping (relabel the input "GST/registration number") or add a real column? Same for `hasLicense`→`infoConfirmation`. My read: remove `capacity`/`priceRange`/`amenities` (listing-level data that belongs on provider_services, not the application), keep+relabel `gst`, decide `taxId`/`hasInsurance` by whether ops actually wants them at application time.

**D5 — Where the Phase-3 selection lands (blocks Phase 3.1).**
`offeringTypeKey` must "reach the submit payload," but neither application table has a column for it. Options: (a) add a nullable `offering_type_key` (or FK) column to `local_expert_forms` + `service_provider_forms` (schema migration ×2); (b) stuff it into the existing jsonb (`specializations` / `serviceOffers`) as a structured entry (no migration, weaker integrity). My read: (a) — it's the datum the whole selection-only redesign pivots on; hiding it in jsonb recreates the current drop with extra steps.

**Pre-confirmed (no decision needed, noting for the record):** from-template creation should write through `POST /api/provider/services` (the canonical writer with zod + publish gates + coverage sync); the live from-template handler (routes.ts:5578) is unvalidated and born-approved, and the only "fixed" born-draft variant lives in the dead router (experts.routes.ts:1764/1790). Phase 1 ports the *pre-population* client-side and uses the canonical POST.

---

**HARD STOP.** No application code touched (verified: working tree clean except this file). Awaiting D1–D5 resolutions and behavioral-results sign-off before Phase 1.
