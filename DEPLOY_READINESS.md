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

---

## 2. Build Verification

```bash
npm run build
```

- `dist/index.cjs` output
- 4 warnings: `import.meta` in CJS (expected, harmless)
- No errors

This matches the `.replit` deploy config: `run = ["node", "./dist/index.cjs"]`.

---

## 3. Deploy Steps (Replit Autoscale)

### 3.1 Deploy on Replit
1. Open the Replit project
2. Click **Deploy** (autoscale target from `.replit`)
3. Wait for build + deploy (uses `npm run build` → `node ./dist/index.cjs`)
4. Copy the HTTPS deploy URL (e.g., `https://traveloure-platform.replit.app`)

### 3.2 Seed E2E test accounts on the deploy's database
```bash
export E2E_TEST_PASSWORD="TestPass123!"
npm run seed:e2e-accounts
```

Creates the 5 accounts the E2E harness expects:
- `test-traveler-kyoto@traveloure.test` (user)
- `kyoto-food@traveloure.test` (travel_expert)
- `kyoto-photography@traveloure.test` (service_provider)
- `test-ea@traveloure.test` (executive_assistant)
- `test-admin@traveloure.test` (admin)

**Critical:** If the deploy uses a fresh database, these accounts do NOT exist by default. E2E-1 will fail with 401s on login if these aren't seeded.

---

## 4. GitHub Actions Secrets (required before CI will pass)

Go to **Repo → Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|--------|-------|
| `E2E_BASE_URL` | `https://traveloure-platform.replit.app` |
| `E2E_TEST_PASSWORD` | `TestPass123!` (or custom — must match seed) |
| `DATABASE_URL` | Production DB connection string |

---

## 5. E2E-1 Run

### 5.1 Set environment
```bash
export E2E_BASE_URL="https://your-deploy-url.replit.app"
export E2E_TEST_PASSWORD="TestPass123!"
```

Or create `.env.e2e`:
```
E2E_BASE_URL=https://your-deploy-url.replit.app
E2E_TEST_PASSWORD=TestPass123!
```

### 5.2 Run E2E-1
```bash
npx playwright test -c playwright.e2e.config.ts e2e/specs/journey-1.spec.ts --project=chromium
```

### 5.3 Expected results
- **Flow A (authed):** landing → discover → cart → checkout → confirmation
- **Flow B (guest):** landing → discover → add-to-cart (guest) → sign-in → cart/migrate → checkout → confirmation
- **Component wiring:** EscalationCTA, ExpertMatchCard, SmartServiceRecommendations, /local-experts — all visible
- **No console errors** across any flow

---

## 6. After E2E-1 Green

1. Stage 1 is closed.
2. Stage 2 (multi-currency) can start — the charge path is now a verified baseline.
3. Deferred IDOR routes (`user-experience-items`, `notifications`, `faqs`, `admin/*`) tracked in `DEFERRED_IDOR.md`.

---

## 7. If E2E-1 Fails

| Failure | Likely cause | Fix |
|---|---|---|
| `login failed for traveler: 401` | E2E accounts not seeded | Run `npm run seed:e2e-accounts` on deploy DB |
| `authed-confirmation failed: 401` | Cookie dropped (not HTTPS) | Verify `E2E_BASE_URL` starts with `https://` |
| `status 400: cart is empty` | Cart item not added | Check `POST /api/cart` works; check `serviceId` exists |
| `Could not prepare trip` | `POST /api/cart/resolve-trip` 404 | Verify the cart routes fix is deployed |
| `Failed to migrate cart` | `POST /api/cart/migrate` 404 | Verify the cart migrate fix is deployed |
| Console errors | Component wiring broken | Check specific component render |
