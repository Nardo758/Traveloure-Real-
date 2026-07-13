# Dark-Families Triage — `server/routes/experts.routes.ts`

**Status:** 🔶 **STAGE 1 — family inventory complete; awaiting checkpoint before per-endpoint classification.**
**Type:** Read-only. Change nothing (not even "obviously dead" ones — removal is a separate go-ahead).
**Subject:** `server/routes/experts.routes.ts` — **imported** (`server/routes.ts:104`) but **never mounted** (`app.use(expertsRoutes)` count = 0). Its endpoints return **200-HTML from the Vite catch-all**, not a 404 — so live vs dead is indistinguishable over HTTP (§9). Only the inline-twin + caller-trace tells the truth.

**Correction to the prior estimate:** the finding said ~73 endpoints / ~24 families. **Actual: 166 endpoints across 27 families.** (Grep of `router.(get|post|patch|put|delete)` = 166.)

**Internal-duplicate flag (within this file):** `/api/provider/availability` is defined **twice** in `experts.routes.ts` itself (GET/POST/PATCH/DELETE at 2628-2690 **and** GET/POST/DELETE at 3329-3374) — an intra-file collision to resolve during classification.

## Stage 1 — family inventory

| # | Family | Endpoints (method path @line) | Count |
|---|--------|-------------------------------|-------|
| 1 | Applications & intake | GET/POST `/api/vendors` (191/201); GET/POST `/api/expert-application` (219/227); POST `/api/expert-forms` (250); GET/POST `/api/provider-application` (270/278); POST `/api/provider-forms` (301); GET `/api/expert/application-status` (321); GET `/api/provider/application-status` (382) | 10 |
| 2 | Provider services CRUD | GET `/api/provider-services` (461); GET `/api/provider/services` (468); GET `/:id` (481); POST (496); PATCH `/:id` (522); DELETE `/:id` (555) | 6 |
| 3 | Expert service categories | GET `/api/expert-service-categories` (570); GET `/:categoryId/offerings` (581) | 2 |
| 4 | Public expert browse | GET `/api/experts` (588); `/:id` (642); `/:id/services` (653); `/:id/reviews` (666) | 4 |
| 5 | Expert neighborhoods | GET/PATCH `/api/expert/neighborhoods` (680/696) | 2 |
| 6 | Expert role & profile | PATCH `/api/expert/role` (738); GET `/api/expert/role` (1733); PATCH `/api/expert/profile-notes` (776) | 3 |
| 7 | Expert selected-services | GET (793); POST (801); DELETE `/:serviceOfferingId` (810) | 3 |
| 8 | Expert specializations | GET (818); POST (826); DELETE `/:specialization` (835) | 3 |
| 9 | Expert custom-services | GET (845); GET `/:id` (857); POST (871); PATCH `/:id` (895); POST `/:id/submit` (921); DELETE `/:id` (946) | 6 |
| 10 | Expert templates / marketplace | GET `/api/expert-templates` (971); `/:id` (989); GET `/api/expert/templates` (1006); POST (1019); PATCH `/:id` (1035); DELETE `/:id` (1057); POST `/api/expert-templates/:id/purchase` (1079); GET `/api/my-purchased-templates` (1151); GET `/:id/reviews` (1173); POST `/:id/reviews` (1185) | 10 |
| 11 | Expert earnings / revenue / tips | GET `/api/expert/earnings` (1214); `/template-sales` (1290); POST `/api/expert/:expertId/tip` (1314); GET `/tips` (1353); `/referrals` (1366); `/affiliate-earnings` (1391); `/revenue-optimization` (1405) | 7 |
| 12 | Public verification | GET `/api/providers/:userId/public-verification` (1601) | 1 |
| 13 | Expert services management | GET `/api/expert/services` (1616); PATCH `/:id/status` (1625); POST `/:id/duplicate` (1645); GET `/api/expert/service-templates` (1664); POST `/api/expert/services/from-template/:templateId` (1764) | 5 |
| 14 | Bookings (expert/provider/client) | GET `/api/expert/bookings` (1826); `/api/provider/bookings` (1852); `/api/client/:clientId` (1877); PATCH `/api/expert/bookings/:id/status` (1935); POST `/api/expert/reviews/:id/respond` (1952) | 5 |
| 15 | Analytics & dashboards | GET `/api/expert/analytics` (1972); `/api/expert/dashboard` (2000); `/api/provider/dashboard` (2031); `/api/expert/analytics/dashboard` (2052); `/api/expert/market-intelligence` (2184); `/api/provider/analytics/dashboard` (2499); `/api/dashboard/trip-scores` (2569) | 7 |
| 16 | Recommendations engine | GET `/api/recommendations/expert` (2306); `/provider` (2340); `/user` (2369); `/market-intelligence/:city` (2402); `/seasonal/:city` (2418); POST `/refresh/:city` (2435); `/:id/convert` (2452); `/:id/dismiss` (2483) | 8 |
| 17 | Expert AI-task delegation | GET `/api/expert/ai-tasks` (2705); POST `/delegate` (2728); `/:taskId/approve` (2815); `/reject` (2842); `/regenerate` (2866); GET `/api/expert/ai-stats` (2935) | 6 |
| 18 | Earnings & payouts (provider+expert) | GET `/api/provider/earnings` (2976); `/summary` (2988); `/details` (3007); `/api/provider/payouts` (3021); POST `/api/provider/payouts/request` (3033); POST `/api/expert/payouts/request` (3071); GET `/api/expert/payouts` (3109); `/api/expert/earnings/details` (3122) | 8 |
| 19 | Expert trip constraints & vendor sourcing | GET `/api/expert/trips/:tripId/constraints` (3137); POST `/api/expert/find-providers` (3186); GET/POST `/api/expert/trips/:tripId/vendors` (3231/3249); PUT/DELETE `/api/expert/vendors/:vendorId` (3282/3311) | 6 |
| 20 | Provider availability & booking-requests ⚠️ | GET/POST/PATCH/DELETE `/api/provider/availability` (2628/2640/2664/2690); **dup** GET/POST/DELETE `/api/provider/availability` (3329/3346/3374); POST/DELETE `/api/provider/blackout-dates` (3390/3417); GET `/api/provider/booking-requests` (3435); PUT `/:requestId/respond` (3451); GET/POST/PATCH/DELETE `/api/provider/availability/rules` (3536/3549/3564/3586); GET/POST/DELETE `/api/provider/availability/blackout-dates` (3603/3616/3631) | 18 |
| 21 | Lead routing | POST `/api/leads/route` (3484); GET `/api/leads/score-preview` (3510) | 2 |
| 22 | Provider settings | GET/PATCH `/api/provider/settings` (3648/3672) | 2 |
| 23 | Expert workspace / assignments | PATCH `/api/expert/assignments/:assignmentId/workspace-status` (3694); GET `/api/expert/assigned-trips` (3724) | 2 |
| 24 | EA console (executive assistant) | clients GET/POST/PATCH/DELETE + `/:id/push` (3772-3884 = 5); executives CRUD (3919-3955 = 4); events CRUD (3973-4009 = 4); travel CRUD (4025-4061 = 4); gifts CRUD (4077-4113 = 4); venues CRUD (4129-4165 = 4); communications GET/POST/DELETE (4181-4204 = 3); ai-tasks CRUD (4220-4260 = 4) | 32 |
| 25 | Knowledge nuggets (content studio) | GET/POST/PATCH/DELETE `/api/expert/knowledge-nuggets` (4277-4326 = 4); GET `/api/knowledge-nuggets/city` (4342) | 5 |
| 26 | Visa help | POST `/api/visa/requirements` (4376); GET `/api/visa/experts` (4490) | 2 |
| 27 | Expert contracts | GET `/api/expert/contracts/recent` (4502) | 1 |

**Total: 166 endpoints / 27 families.**

## Notable at inventory time (to resolve in Stage 2)
- **Known Phase-7 ports** present here as sole-impl candidates: `/api/expert/role` (738/1733) and `/api/expert/service-templates` (1664) — slated to move to a mounted router.
- **High inline-twin suspicion** (families that almost certainly have live inline twins in `routes.ts`, since these features demonstrably work in production): expert templates/marketplace (§10 — purchase/confirm/approve are live in `routes.ts`), provider/expert services CRUD, expert browse, applications. Stage 2 confirms each twin `file:line` + whether they diverge.
- **High dark-sole-impl suspicion** (rich features with no obvious inline twin): EA console (32 endpoints), AI-task delegation, knowledge-nuggets/content-studio, provider availability/rules/booking-requests, expert workspace/assignments, market-intelligence, visa help. These are the "broken features with live UIs" candidates (List B).
- **Intra-file duplicate:** `/api/provider/availability` defined twice (family 20).

## Next (after checkpoint)
Stage 2 per-endpoint: inline-twin? (`routes.ts` grep, note divergence) · live caller? (`client/src` grep) · UI reachable? → fate (DEAD DUPLICATE / DARK SOLE-IMPL / ORPHANED / DIVERGENT). Stage 3: List A (safe-delete) + List B (dark-features-decide).
