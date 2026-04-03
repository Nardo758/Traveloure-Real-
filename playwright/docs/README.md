# Traveloure E2E Test Suite

Complete end-to-end testing framework for the Traveloure travel marketplace platform covering all 57 test accounts across 8 testing phases.

## Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL (for test database)
- Platform running at `http://localhost:5000`

### Installation
```bash
npm install
# Playwright is already included in devDependencies
```

### Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Debug specific test with inspector
npm run test:e2e:debug

# Run only Phase 1 tests
npm run test:e2e:phase1

# View HTML report of last test run
npm run test:e2e:report
```

### Configuration

Tests use `http://localhost:5000` by default. To change:
```bash
BASE_URL=http://your-url.com npm run test:e2e
```

## Test Structure

```
playwright/
├── fixtures/
│   └── test-accounts.ts          # All 57 test account credentials
├── utils/
│   ├── auth.ts                   # Login/logout helpers
│   ├── navigation.ts             # Route navigation helpers
│   ├── forms.ts                  # Form filling helpers
│   └── assertions.ts             # Common assertions
├── tests/
│   ├── phase-1-expert-setup.spec.ts              # Expert profile setup (21 experts)
│   ├── phase-2-provider-setup.spec.ts            # Provider setup (12 providers)
│   ├── phase-3-traveler-flows.spec.ts            # Traveler trip creation (5 trips)
│   └── phase-4-7-advanced-flows.spec.ts          # Collaboration, EA, transport, booking
├── docs/
│   ├── README.md                 # This file
│   ├── TEST-ACCOUNTS.md          # All 45 account details
│   ├── TEST-SCENARIOS.md         # Detailed test matrix
│   └── ASSERTIONS.md             # Validation checklist
└── playwright.config.ts          # Playwright configuration
```

## Test Phases Overview

### Phase 1: Expert Profile Setup (21 experts)
- Login to each expert account
- Complete profile (bio, rate, languages, specialties)
- Create 2 services per expert
- Verify dashboard pages load

**Markets covered:** Kyoto (5), Edinburgh (4), Cartagena (4), Jaipur (4), Porto (3)

**Example:** `[Phase 1] Expert Setup - Yuki Tanaka (kyoto)`

### Phase 2: Service Provider Setup (12 providers)
- Login to provider accounts
- Create business profile
- Create 1-2 service listings
- Set availability calendar
- Verify earnings/bookings pages

**Markets covered:** Kyoto (3), Edinburgh (3), Cartagena (5), Jaipur (2), Porto (2)

**Example:** `[Phase 2] Provider Setup - Takeshi Ito (kyoto)`

### Phase 3: Traveler Flows (5 complete trips)
- Register traveler accounts (one per market)
- Create trip with destination, dates, guests, budget
- Add 5+ activities to itinerary
- Browse and message experts
- Book services
- View itinerary with map and transport
- Generate shareable links

**Trips:** Kyoto Couples, Edinburgh Whisky, Cartagena Proposal, Jaipur Family, Porto Digital Nomad

**Example:** `[Phase 3] Traveler Flow - Kyoto Couples Trip`

### Phase 4: Expert Review & Collaboration
- Expert reviews traveler itineraries
- Accept/reject/modify activities
- Send recommendations with attribution tracking
- Traveler receives updates

**Example:** `[Phase 4] Expert Review - Aiko Reviews Kyoto Trip`

### Phase 5: Executive Assistant Flows
- EA views dashboard with client overview
- Access master calendar
- View and coordinate multiple client trips
- Assign experts to trips

**Example:** `[Phase 5] Executive Assistant Dashboard`

### Phase 6: Transport & Itinerary Verification
- Verify transport legs calculate between activities
- Check transport appears in timeline
- View transport operations dashboard
- Test shareable itinerary with map
- Toggle map layers

**Example:** `[Phase 6] Transport Verification - Kyoto Trip`

### Phase 7: Cross-Role Booking & Payment
- Traveler adds service to cart
- Complete checkout with Stripe
- Verify booking appears in traveler's list
- Expert receives and confirms booking
- Verify earnings and payouts

**Example:** `[Phase 7] Full Booking Flow - Food Tour Booking`

## Test Accounts

All accounts use password: `TestPass123!`

### Test Account Categories

- **5 Original Accounts:** Global travel expert, local expert, event planner, provider, EA
- **Kyoto (8 accounts):** 5 local experts + 3 providers
- **Edinburgh (7 accounts):** 4 local experts + 3 providers
- **Cartagena (9 accounts):** 4 local experts + 5 providers
- **Jaipur (8 accounts):** 4 local experts + 4 providers
- **Porto (8 accounts):** 4 local experts + 4 providers
- **Travelers (5 accounts):** One per market for testing trips

See `TEST-ACCOUNTS.md` for complete account list with specialties.

## Common Issues & Troubleshooting

### Test Fails: "Cannot find element"
- Verify application is running at localhost:5000
- Check that test database is initialized with seed data
- Review screenshot/video in `playwright/test-results/` folder

### Test Fails: "Timeout waiting for navigation"
- Application may be loading slowly
- Increase timeout in specific test: `page.waitForNavigation({ timeout: 30000 })`
- Check for console errors in browser

### Tests Pass Locally But Fail in CI
- CI may have different environment
- Check `BASE_URL` environment variable is set
- Verify database is initialized in CI environment

### Payment Tests Failing
- Ensure Stripe test mode keys are configured
- Use Stripe test card: 4242 4242 4242 4242
- Mock card elements may need iframe handling

## Performance

- **Smoke tests:** ~5 minutes (basic flows only)
- **Functional tests:** ~15 minutes (full flows, smaller subset)
- **Integration tests:** ~30 minutes (all 8 phases, all accounts)
- **Full suite:** ~45-60 minutes (all tests, parallel execution)

## Debugging

### View Test Report
```bash
npm run test:e2e:report
```

Opens HTML report with:
- Test status and timing
- Screenshots of failures
- Video recordings (on failure)
- Detailed error messages

### Debug Mode
```bash
npm run test:e2e:debug
```

Opens Playwright Inspector allowing you to:
- Step through test code
- Inspect elements
- Execute commands in console
- See DOM at any point

### Screenshots & Videos

Automatically captured on test failure in:
- `playwright/.playwright/test-results/`

## Writing New Tests

### Example Test Pattern

```typescript
import { test } from '@playwright/test';
import { loginAs, logout } from '../utils/auth';
import { navigateToDashboard } from '../utils/navigation';
import { verifyDashboardLoaded } from '../utils/assertions';
import { testAccounts } from '../fixtures/test-accounts';

test('test name', async ({ page }) => {
  // Setup
  const expert = testAccounts.kyoto[0];
  
  // Execution
  await test.step('Step description', async () => {
    await loginAs(page, expert.email, expert.password);
    await navigateToDashboard(page, 'expert');
    await verifyDashboardLoaded(page, 'expert');
  });

  // Verification  
  await test.step('Verify result', async () => {
    // assertions here
  });

  // Cleanup
  await logout(page);
});
```

### Using Utilities

All utilities in `/utils/` folder:

```typescript
// Auth
import { loginAs, logout, isLoggedIn, acceptTerms } from '../utils/auth';

// Navigation
import { navigateToDashboard, navigateTo, expectRoute } from '../utils/navigation';

// Forms
import { fillExpertProfile, createService, createTrip } from '../utils/forms';

// Assertions
import { verifyDashboardLoaded, verifyServiceListing, verifyElementVisible } from '../utils/assertions';

// Test Accounts
import { testAccounts, getAccountsByRole, getAccountByEmail } from '../fixtures/test-accounts';
```

## CI/CD Integration

Tests run on:
- Pull requests
- Commits to develop/main
- Manual trigger

### GitHub Actions
See `.github/workflows/e2e-tests.yml` for configuration.

Results include:
- Test pass/fail summary
- Failed test artifacts (screenshots/videos)
- Performance metrics

## Contributing

When adding tests:

1. Follow existing naming conventions: `[Phase X] Description - Context`
2. Use test steps with `test.step()` for better reports
3. Add error handling for optional UI elements
4. Reuse utilities from `/utils/` folder
5. Add comments for non-obvious assertions
6. Test across multiple accounts when possible

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Test Accounts List](./TEST-ACCOUNTS.md)
- [Detailed Assertions Reference](./ASSERTIONS.md)
- [Test Scenario Matrix](./TEST-SCENARIOS.md)
