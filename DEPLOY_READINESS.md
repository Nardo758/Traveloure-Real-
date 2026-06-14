# Deploy Readiness: E2E-1 Exit Gate

> **Branch:** `fix/phase-3-0-1-prestep`  
> **Status:** Ready for deploy. All structural changes committed.  
> **Blocker:** E2E-1 must run green before Stage 2 (multi-currency) starts.

---

## 1. What Changed (Summary)

| Stage | Commits | Changes |
|---|---|---|
| **Stage 0** | `a70d8b86`, `024cae0e`, `5bd450c2` | Fixed `POST /api/cart/resolve-trip` 404, deleted dead `bookings-domain.routes.ts`, fixed `cart/migrate` and `cart/convert-to-itinerary` 404s, added ownership checks to cart PATCH/DELETE |
| **Stage 1** | `3c9a7ab0`, `a95c2ab5` | Wired `/local-experts` route, surfaced `EscalationCTA` in trip-details, `ExpertMatchCard` in discover via `AIMatchedExpertsSection`, `SmartServiceRecommendations` in discover, `ItineraryComparisonWithBooking` already merged |
| **IDOR** | `bb1b5767` | Added ownership check to `custom-venues` PATCH/DELETE |
| **E2E** | `f2dd4d94` | Added `server/seeds/e2e-test-accounts.seed.ts` + `npm run seed:e2e-accounts` |

**Total commits on branch:** 7 (since `main` at `4c1503ed`)

---

## 2. Build Verification

```bash
npm run build
```

- ✅ **Output:** `dist/index.cjs` (3.0 MB)
- ✅ **4 warnings:** `import.meta` in CJS (expected, harmless)
- ✅ **No errors**

This matches the `.replit` deploy config: `run = ["node", "./dist/index.cjs"]`.

---

## 3. Deploy Steps (Replit Autoscale)

### 3.1 Push branch to remote
```bash
git checkout fix/phase-3-0-1-prestep
git push origin fix/phase-3-0-1-prestep
```

### 3.2 Deploy on Replit
1. Open the Replit project
2. Switch to the `fix/phase-3-0-1-prestep` branch
3. Click **Deploy** (autoscale target from `.replit`)
4. Wait for build + deploy (uses `npm run build` → `node ./dist/index.cjs`)
5. Copy the HTTPS deploy URL (e.g., `https://traveloure-abc123.replit.app`)

### 3.3 Seed E2E test accounts on the deploy's database
```bash
# On the deployed Replit (or via shell):
export E2E_TEST_PASSWORD="TestPass123!"
npm run seed:e2e-accounts
```

**Verifies:** Creates 5 accounts the E2E harness expects:
- `test-traveler-kyoto@traveloure.test` (user)
- `kyoto-food@traveloure.test` (travel_expert)
- `kyoto-photography@traveloure.test` (service_provider)
- `test-ea@traveloure.test` (executive_assistant)
- `test-admin@traveloure.test` (admin)

**Critical:** If the deploy uses a fresh database, these accounts do NOT exist by default. The beta seed creates different accounts. E2E-1 will fail with 401s on login if these aren't seeded.

---

## 4. E2E-1 Run

### 4.1 Set environment
```bash
export E2E_BASE_URL="https://your-deploy-url.replit.app"
export E2E_TEST_PASSWORD="TestPass123!"
```

Or create `.env.e2e`:
```
E2E_BASE_URL=https://your-deploy-url.replit.app
E2E_TEST_PASSWORD=TestPass123!
```

### 4.2 Global setup (creates auth sessions)
```bash
npx playwright test --project=chromium -c playwright.e2e.config.ts --grep "harness smoke"
```
This runs `e2e/global-setup.ts` which logs in each role and saves session cookies to `e2e/auth/<role>.json`.

If global setup fails, the error message tells you exactly which of 3 things is wrong:
- `E2E_BASE_URL` not reachable
- `E2E_TEST_PASSWORD` doesn't match seed
- Account doesn't exist in DB

### 4.3 Run E2E-1
```bash
npx playwright test --project=chromium -c playwright.e2e.config.ts e2e/specs/journey-1.spec.ts
```

### 4.4 Expected results
- **Flow A (authed):** 200 + green trace from landing → discover → cart → checkout → confirmation
- **Flow B (guest):** 200 + green trace from landing → discover → add-to-cart (guest) → sign-in → cart/migrate → checkout → confirmation
- **Component wiring:** 4 component assertions pass (EscalationCTA, ExpertMatchCard, SmartServiceRecommendations, /local-experts route)
- **No console errors** across any flow

---

## 5. After E2E-1 Green

1. **Stage 1 is closed.**
2. **Stage 2 (multi-currency)** can start — the charge path is now a verified baseline.
3. **Deferred IDOR routes** (`user-experience-items`, `notifications`, `faqs`, `admin/*`) can be picked up as a low-priority follow-up.
4. **Event fast-follow** stays deferred until after Stage 7.

---

## 6. If E2E-1 Fails

| Failure | Likely cause | Fix |
|---|---|---|
| `login failed for traveler: 401` | E2E test accounts not seeded | Run `npm run seed:e2e-accounts` on deploy DB |
| `authed-confirmation failed: 401` | Cookie dropped (not HTTPS) | Verify `E2E_BASE_URL` starts with `https://` |
| `status 400: cart is empty` | Cart item not added | Check `POST /api/cart` works; check `serviceId` exists |
| `Could not prepare trip` | `POST /api/cart/resolve-trip` 404 | Verify commit `a70d8b86` is in the deployed branch |
| `Failed to migrate cart` | `POST /api/cart/migrate` 404 | Verify commit `5bd450c2` is in the deployed branch |
| Console errors | Component wiring broken | Check specific component render (e.g., `AIMatchedExpertsSection` needs `/api/grok/match-experts`) |

