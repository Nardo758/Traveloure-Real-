# Traveloure Deep UI QA Report

**Audit date:** August 24, 2026  
**Environment:** Local development database and test-mode Stripe only  
**Evidence root:** `docs/audits/tier4-evidence/`

## Launch verdict

**NO-GO for an unrestricted production launch: the real booking path is functionally healthy across all three engines, but recurring critical accessible-name/form-label defects remain on provider, expert, and admin surfaces after the six-loop structural-risk cap.**

## Executive summary

- The stale preview environment was recovered and the managed `Start application` workflow is healthy.
- The prior Add to Cart fallback was selector drift, not a missing product control. The audit now requires the real rendered service-detail button and contains no booking API fallback.
- Chromium, Firefox, and WebKit each completed a real UI Add to Cart journey, test-mode Stripe payment, and an exact confirmed booking.
- Auth, messaging/reviews, expert, provider, and admin surfaces each completed six varied loops: desktop and mobile-responsive conditions in all three engines.
- Chromium and WebKit mobile loops used mobile/touch emulation. Firefox used the same 390×844 responsive viewport because Playwright Firefox does not support `isMobile`.
- No tested deep loop had horizontal overflow, uncaught application/page errors, or duplicate message bubbles inside the message log.
- Admin verification compared 18 displayed user records with the development database: three records in each of six loops.
- Six isolated audit accounts were suspended and immediately reactivated through rendered admin confirmation controls. No existing user-owned or production data was altered.
- Axe findings repeated across all six loops. These are structural risks, not clean accessibility passes.

## Loop count

| Surface | Chromium | Firefox | WebKit | Total | Outcome |
|---|---:|---:|---:|---:|---|
| Public booking | 1 | 1 | 1 | 3 | PASS |
| Account/auth | 2 | 2 | 2 | 6 | FUNCTIONAL PASS; accessibility structural risk |
| Messaging/reviews | 2 | 2 | 2 | 6 | FUNCTIONAL PASS; review-authoring limitation and contrast risk |
| Expert workspace | 2 | 2 | 2 | 6 | FUNCTIONAL PASS; accessibility structural risk |
| Provider workspace | 2 | 2 | 2 | 6 | FUNCTIONAL PASS; accessibility structural risk |
| Admin | 2 | 2 | 2 | 6 | FUNCTIONAL PASS; accessibility structural risk |
| **Total** | **11** | **11** | **11** | **33** | **Conditional/no-go verdict above** |

Each deep surface reached the required six-loop cap (two responsive variants in each of three engines). The booking journey completed three full, varied engine runs.

## Browser and viewport matrix

| Engine | Desktop | Mobile/responsive | Notes |
|---|---|---|---|
| Chromium | 1365×900 deep loops; 1280×900 booking | 390×844 with mobile/touch emulation | Headless Chromium on Linux |
| Firefox | 1365×900 deep loops; booking journey | 390×844 responsive viewport | Playwright Firefox does not support `isMobile`; no touch-device claim |
| WebKit | 1365×900 deep loops; booking journey | 390×844 with mobile/touch emulation | WebKitGTK under Xvfb, not physical Safari/iOS |

A dedicated tablet-device run was not performed. Responsive evidence covers desktop and 390×844 mobile breakpoints.

## Surface results

### Public booking

All three engines:

1. Discovered a priced service.
2. Opened the service detail page.
3. Located the visible and enabled `button-add-to-cart`.
4. Clicked the rendered control and observed visible “Added to cart” feedback.
5. Continued through cart and embedded checkout.
6. Filled Stripe test payment details.
7. Submitted payment.
8. Verified the exact created booking reached `confirmed`.

Evidence:

- `booking-chromium.json` — `addToCartMethod: "ui"`, confirmed booking
- `booking-firefox.json` — `addToCartMethod: "ui"`, confirmed booking
- `booking-webkit.json` — `addToCartMethod: "ui"`, confirmed booking
- Engine-specific discovery, service-detail, cart, payment, and bookings screenshots

### Account/auth

- Invalid sign-in data now produces an in-DOM assertive alert, focuses the invalid field, and links the field to the error with ARIA.
- Reset mode and rendered signup validation were exercised.
- Desktop keyboard and mobile menu sign-in paths were exercised.
- All six loops had no horizontal overflow or uncaught application errors.
- Automated results do not claim VoiceOver, NVDA, JAWS, or physical keyboard/device coverage.

Evidence: `deep-auth-{chromium,firefox,webkit}.json` and matching screenshots.

### Messaging/reviews

- Six disposable travelers opened real expert conversations.
- Each loop sent emoji, long content, and rapid follow-up messages.
- 18 messages were sent across the six final loops.
- Duplicate checks were scoped to the ARIA message log so the intentional conversation-list preview was not misclassified as a duplicate bubble.
- The WebSocket path now falls back to HTTP if a connected socket fails at send time.
- A post-send persistence refresh no longer relies on the server echoing a sender's own message.
- Existing review rendering and empty review states were checked.

Evidence: `deep-messaging-reviews-{chromium,firefox,webkit}.json` and matching screenshots.

**Limitation:** review submission was not exercised because the disposable travelers did not have completed bookings eligible to author a review. This audit does not claim review-authoring coverage.

### Expert and provider workspaces

The following role-authenticated routes rendered meaningful content without unexpected redirects, horizontal overflow, or uncaught application errors in all six loops per role:

- Expert: `/expert/today`, `/expert/inbox`, `/expert/catalog`, `/expert/money`, `/expert/settings`
- Provider: `/provider/dashboard`, `/provider/inbox`, `/provider/services`, `/provider/money`, `/provider/settings`

Evidence: `deep-provider-expert-{chromium,firefox,webkit}.json` and role/viewport screenshots.

**Limitation:** these are strict rendered route/state checks, not complete mutation coverage for onboarding persistence, uploads, booking-management actions, or payout edge-value writes.

### Admin

- A disposable non-admin traveler received the rendered “Access Denied” boundary at `/admin/users`.
- Admin sessions rendered users, providers, revenue, payouts, and service approvals.
- Three displayed user records were compared with the development database per loop (18 total).
- One isolated traveler fixture per loop was suspended through the confirmation dialog, verified as suspended, reactivated, and verified as active.
- The development admin rate limiter now honors the same loopback-only test exemption as the auth and strict limiters; production remains limited unless the explicit CI flag is set.

Evidence: `deep-admin-{chromium,firefox,webkit}.json` and matching screenshots.

## Defects, fixes, and reverification

| Finding | Classification | Fix | Exact case and variations |
|---|---|---|---|
| Booking audit searched for marketplace-card selector on service detail | Harness drift | Use `button-add-to-cart`; remove API fallback; require visibility, enabled state, click, and success feedback | Exact Chromium UI journey plus Firefox and WebKit confirmed bookings |
| `/services` filter assertion raced initial render | Harness timing drift | Raise rendered filter-bar wait to 15 seconds | Chromium, Firefox, and WebKit booking journeys |
| Invalid email used a browser-only validation bubble with no DOM alert | Product accessibility defect | Explicit client validation, assertive alert, focus management, `aria-invalid`, and `aria-describedby` | Chromium desktop/mobile, Firefox desktop/mobile, WebKit desktop/mobile |
| Mobile auth loop clicked a hidden desktop sign-in button | Harness drift | Open the rendered mobile menu and click mobile Sign In | All three engines at 390×844 |
| Message text appeared once in the rail preview and once in the thread | Harness scope drift | Scope duplicate assertions to `role="log"` | Long, emoji, and rapid messages in six loops |
| Connected WebSocket could return false and leave the composer unchanged | Product delivery defect | Fall back to persisted HTTP send on socket failure | Exact Chromium mobile rapid-send plus Firefox and WebKit responsive variations |
| Successful socket write depended on sender echo before refreshing the thread | Product resilience defect | Refresh the persisted thread after successful socket send | Exact WebKit case plus Chromium and Firefox variations |
| Firefox rejected Playwright `isMobile` context option | Harness compatibility | Use responsive viewport without unsupported Firefox device emulation | Firefox desktop/mobile-responsive loops |
| Admin boundary denied in place instead of redirecting | Harness contract drift | Assert rendered “Access Denied” and absence of admin data | Six non-admin boundary loops |
| Admin read sweep exhausted its local 30-request cap before suspend | Test-infrastructure defect | Apply the existing loopback-only exemption to the admin limiter in development/explicit CI | Chromium exact suspend/reactivate plus Firefox and WebKit variations |

## Structural accessibility risks

The same serious/critical Axe rule sets persisted after six varied loops. Node counts changed with viewport, but the rule IDs remained:

| Surface | Critical rules | Serious rules | Representative Chromium node counts |
|---|---|---|---|
| Account/auth | None | `color-contrast` | 1 desktop, 1 mobile |
| Messaging/reviews | None | `color-contrast` | 3 desktop, 3 mobile |
| Expert | `button-name` | `color-contrast`, `link-name` | 1 unnamed button; 36/19 contrast nodes; 1 unnamed link |
| Provider | `button-name`, `label` | `color-contrast`, `link-name` | 2 unnamed buttons; 1 unlabeled field; 39/22 contrast nodes; 1 unnamed link |
| Admin | `button-name` | `color-contrast`, `link-name` | 2 unnamed buttons; 27/2 contrast nodes; 1 unnamed link |

These findings block a claim of WCAG AA readiness and drive the no-go verdict. The JSON evidence records rule IDs, impact, help text, and node counts for the final Chromium loops; Firefox and WebKit recorded matching serious/critical rule counts.

## Console, layout, and database evidence

- Deep loops: no relevant uncaught/page/application errors.
- Horizontal overflow: none in final deep loops.
- Admin DB comparison: 18/18 selected displayed records matched email and suspension state.
- Isolated admin cleanup: 6/6 fixtures returned to active.
- Payment: test mode only; no live checkout load-driving or production database writes.
- TypeScript: project-wide `tsc --noEmit` remains non-clean with 157 pre-existing errors; no reported error references a file changed by this task.
- Patch hygiene: `git diff --check` passes.

## Limitations

1. WebKitGTK/Xvfb is not physical Safari or iOS.
2. Browser automation is not VoiceOver, NVDA, JAWS, or manual assistive-technology certification.
3. Firefox mobile coverage is responsive viewport coverage, not device/touch emulation.
4. No dedicated tablet-device run was performed.
5. Review authoring was not exercised because no disposable completed-booking fixture was available.
6. Expert/provider loops verify authenticated rendered routes and stable responsive states, but not every mutation or upload edge case.
7. Admin financial consoles were read-only; no payout or financial mutation was performed.
8. Axe results are automated signals and require targeted remediation plus manual accessibility review.

## Evidence index

- Booking: `docs/audits/tier4-evidence/booking-{chromium,firefox,webkit}.json`
- Auth: `docs/audits/tier4-evidence/deep-auth-{chromium,firefox,webkit}.json`
- Messaging/reviews: `docs/audits/tier4-evidence/deep-messaging-reviews-{chromium,firefox,webkit}.json`
- Provider/expert: `docs/audits/tier4-evidence/deep-provider-expert-{chromium,firefox,webkit}.json`
- Admin: `docs/audits/tier4-evidence/deep-admin-{chromium,firefox,webkit}.json`
- Screenshots: same directory, named by surface, engine, and viewport variant

## Completion-review addendum

- The final suite fails closed before registration or admin mutation by calling the existing live-connection `assertDisposableDb` guard. A remote database requires the deliberate `JOURNEY_DB_WRITES_OK=1` opt-in.
- Auth evidence is captured separately on the invalid SignInModal, reset SignInModal, signup SignInModal, and standalone signup page. The invalid field's focus, `aria-invalid`, `aria-describedby`, and assertive error text are asserted directly.
- Messaging evidence is captured on the populated ARIA message log before navigation, with review rendering audited separately.
- Every expert/provider route, non-admin boundary, all five admin consoles, and the post-reactivation state has an individual `surfaceAudits` entry containing its screenshot, overflow result, Axe counts, and finding details.
- WebSocket close-race exceptions now return the HTTP-fallback signal. Successful socket writes use a bounded persisted-thread poll rather than a fixed delay or sender-echo assumption.