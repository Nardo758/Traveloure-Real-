# Tier 4 Automated Audit

**Audit date:** 2026-08-23  
**Target:** local development (`http://127.0.0.1:5000`)  
**Deterministic seed:** `2026-08-23`  
**Desktop viewport:** 1280 × 900  
**Payment mode:** Stripe test mode  
**Evidence directory:** `docs/audits/tier4-evidence/`

## Executive result

| Area | Result |
|---|---|
| Chromium booking flow | **PASS WITH LIMITATION** — exact checkout booking confirmed |
| Firefox booking flow | **PASS WITH LIMITATION** — exact checkout booking confirmed |
| WebKit booking flow | **UNABLE / ENVIRONMENT BLOCKED** — engine did not launch |
| Keyboard-only checkout | **PASS WITH LIMITATIONS** — exact booking confirmed |
| Axe accessibility audit | **FAIL / FINDINGS PRESENT** — 10 critical and 86 serious affected instances |
| SPF / DKIM / DMARC | **PASS** — provider verified and records present in live DNS |
| Real email send | **DELIVERED BY PROVIDER** — mailbox placement requires a human |
| Physical mobile checklist | **NOT RUN — HUMAN VERIFICATION REQUIRED** |

The booking flow completed against the real local checkout and Stripe test-mode
integration in Chromium and Firefox. Both runs created a PaymentIntent, submitted
the standard successful test card, followed the application's redirect to
`/bookings`, and confirmed the exact booking ID returned by that checkout.

The booking harness did not find the expected service-detail add-to-cart control
in either successful engine, so it used the explicitly recorded authenticated
`POST /api/cart` fallback. The result is not a full UI pass for the add-to-cart
interaction.

No product defects were fixed during this audit.

## 1. Cross-browser booking flow

| Engine | Result | Exact booking status | Checkpoint layout | Evidence |
|---|---|---|---|---|
| Chromium | **PASS WITH LIMITATION** | `confirmed` | Discovery: 1280 px document width; no horizontal overflow | `tier4-evidence/booking-chromium.json` |
| Firefox | **PASS WITH LIMITATION** | `confirmed` | Confirmation: 1280 px document width; no horizontal overflow | `tier4-evidence/booking-firefox.json` |
| WebKit | **UNABLE** | Not reached | Browser process did not launch | `test-results/tier4/...-webkit/trace.zip` |

### Chromium

- Test runner result: 1/1 passed in 41.3 seconds.
- Real service: Private Louvre Tour.
- Stripe test card entry succeeded.
- Payment submission redirected to `/bookings`.
- Exact booking from the checkout response reached `confirmed`.
- Deep-inspection checkpoint had no horizontal overflow.
- Limitation: add-to-cart used the API fallback because the expected UI control
  was not visible.

Primary screenshots:

- `tier4-evidence/booking-chromium-discover.png`
- `tier4-evidence/booking-chromium-service-detail.png`
- `tier4-evidence/booking-chromium-cart.png`
- `tier4-evidence/booking-chromium-payment.png`
- `tier4-evidence/booking-chromium-bookings-final.png`

### Firefox

- Test runner result: 1/1 passed in 43.9 seconds.
- Real service: Montmartre Wine & Dine Tour.
- Stripe test card entry succeeded.
- Payment submission redirected to `/bookings`.
- Exact booking from the checkout response reached `confirmed`.
- Confirmation checkpoint had no horizontal overflow.
- Limitation: add-to-cart used the API fallback because the expected UI control
  was not visible.

Primary screenshots:

- `tier4-evidence/booking-firefox-discover.png`
- `tier4-evidence/booking-firefox-service-detail.png`
- `tier4-evidence/booking-firefox-cart.png`
- `tier4-evidence/booking-firefox-payment.png`
- `tier4-evidence/booking-firefox-bookings-final.png`

### WebKit

WebKit was attempted repeatedly after installing the available Nix browser
libraries. The pinned Playwright WebKit process still refused to launch because
the runtime could not resolve its expected GLES2 and GStreamer libav libraries.
The browser never reached the application.

This is reported as **UNABLE**, not an application failure and not a pass.
No claim is made for Safari, iOS Safari, or the Playwright WebKit engine today.

### Browser-console observations

- Stripe warned that local HTTP cannot validate Apple Pay or Google Pay.
- Stripe reported that the local domain was not wallet-registered.
- Stripe reported use of the older Elements integration.
- Several optional payment methods are inactive in test mode.
- Firefox recorded forced-layout warnings inside Stripe/hCaptcha vendor frames.

These warnings did not prevent card checkout, but wallet readiness remains
unverified.

## 2. Keyboard navigation on the booking flow

**Automated live-browser result:** 1/1 passed in 51.2 seconds.  
**Evidence:** `tier4-evidence/keyboard-chromium.json`

Confirmed:

- Tab/Shift+Tab and Enter reached the cart and payment controls.
- Recorded application controls showed a visible focus indication.
- The Stripe card number, expiry, CVC, and postal code were entered through
  keyboard tab traversal.
- The outer payment button was reached and submitted by keyboard.
- The application redirected to `/bookings`.
- The exact booking reached `confirmed`.
- The cart had no horizontal overflow at the 1280 × 900 test viewport.

Limitations and findings:

1. The cart was seeded through an authenticated API call. Keyboard-only coverage
   starts on the populated cart and does not cover discovery or add-to-cart.
2. The cart quantity decrease and increase buttons had no accessible names.
3. The empty-payment check found Stripe `aria-live` containers, but the captured
   values were blank/zero-width placeholders rather than a clearly useful error
   message. The harness counted a live region as present; this is **not** a
   human screen-reader pass.
4. Screen-reader behavior and physical keyboard behavior on Safari, Windows,
   iOS, and Android remain manual checks.

Screenshots:

- `tier4-evidence/keyboard-cart.png`
- `tier4-evidence/keyboard-post-proceed.png`
- `tier4-evidence/keyboard-post-complete.png`
- `tier4-evidence/keyboard-stripe-filled.png`
- `tier4-evidence/keyboard-post-submit.png`
- `tier4-evidence/keyboard-bookings.png`

## 3. Axe-core accessibility scan

The three Playwright tests completed, but completion means the audit executed;
it does not mean the scanned pages were accessible.

| Surface | Critical affected nodes | Serious affected nodes | Rules | Evidence |
|---|---:|---:|---|---|
| Discovery/search | 5 | 67 | `button-name`, `color-contrast` | `tier4-evidence/a11y-discover-search-chromium.json` |
| Cart/checkout | 3 | 8 | `button-name`, `color-contrast` | `tier4-evidence/a11y-cart-checkout-chromium.json` |
| Cart payment state | 0 | 6 | `color-contrast` | `tier4-evidence/a11y-cart-checkout-payment-chromium.json` |
| Public expert profile | 2 | 5 | `button-name`, `color-contrast` | `tier4-evidence/a11y-expert-profile-chromium-chromium.json` |
| **Total instances** | **10** | **86** |  |  |

Critical findings:

- Discovery filter/select and pagination controls lack accessible names.
- Cart quantity decrease/increase controls and one select control lack
  accessible names.
- Two icon-only expert-profile controls lack accessible names.

Serious findings:

- Primary-color text and white text on the coral primary background miss WCAG
  AA contrast in multiple states.
- Muted explanatory text, badges, active step labels, optimizer pricing, and
  checkout upsell captions include contrast failures.

Automated-scan limitations:

- Stripe's third-party iframe content was not included in the page-level scans.
- Axe does not replace VoiceOver, NVDA, or TalkBack testing.
- Only the named Chromium desktop states were scanned.

## 4. Email authentication and delivery

**Evidence:** `tier4-evidence/email-auth-2026-08-23.json`

| Check | Result |
|---|---|
| Resend sender domain | **Verified** |
| Sending capability | **Enabled** |
| SPF mail-from TXT and MX | **Verified and found in live DNS** |
| Apex SPF | **Present** |
| DKIM `resend` selector | **Verified and found in live DNS** |
| DMARC | **Present, `p=reject`** |
| Real application send | **Accepted** |
| Provider event | **Delivered** on first status poll |
| Inbox/Promotions/Spam placement | **HUMAN VERIFICATION REQUIRED** |

The message was sent through the application's real email service to the
configured administrator mailbox. The recipient is intentionally omitted from
the evidence.

The provider's `delivered` event proves that the message was accepted by the
recipient mail system. It does not prove whether the message landed in Inbox,
Promotions, Spam, or another folder. No mailbox-reading integration was
available, so no placement claim is made.

## 5. Manual mobile and assistive-technology checklist

Every item below is **unverified**. These require physical hardware, OS services,
a real HTTPS wallet environment, an authorized mailbox, or a human operating
assistive technology.

### Physical mobile devices

- [ ] iPhone Safari: complete the full booking and return from payment.
- [ ] Android Chrome: complete the full booking and return from payment.
- [ ] Confirm sticky controls and totals are not covered by browser chrome or
      device safe areas.
- [ ] Confirm all touch targets remain usable with one-handed zoom and OS text
      scaling.
- [ ] Rotate portrait to landscape at cart, payment, and confirmation.
- [ ] Interrupt or slow the network during checkout and confirm no duplicate
      payment or booking is created.

### Virtual keyboards

- [ ] Confirm the iOS virtual keyboard never covers the active checkout field.
- [ ] Confirm the Android virtual keyboard never covers the active checkout
      field.
- [ ] Confirm Next, Previous, and Done advance predictably.
- [ ] Confirm postal-code and numeric fields request appropriate keyboard modes.
- [ ] Dismiss and reopen the keyboard without losing data or focus.

### Wallets and HTTPS-only payment behavior

- [ ] Complete Apple Pay on a registered HTTPS domain and supported Apple
      device.
- [ ] Complete Google Pay on a registered HTTPS domain and supported Android
      device/browser.
- [ ] Cancel each wallet and confirm checkout remains recoverable.
- [ ] Confirm wallet success creates and confirms the exact booking once.

### Zoom, reflow, orientation, and screen readers

- [ ] Test desktop zoom at 200%.
- [ ] Test reflow at 320 CSS px equivalent / 400% zoom.
- [ ] Test browser text-only zoom and OS text scaling.
- [ ] Test small and large phones in portrait and landscape.
- [ ] Confirm ordinary checkout content does not require two-dimensional
      scrolling.
- [ ] Test VoiceOver on macOS Safari and iOS Safari.
- [ ] Test NVDA on Windows Firefox and Chromium.
- [ ] Test TalkBack on Android Chrome.
- [ ] Verify landmark, heading, rotor, and form-control navigation.
- [ ] Verify cart quantity controls announce the action, item, and updated
      quantity after accessible names are fixed.
- [ ] Verify invalid payment submission announces a useful error and moves focus
      predictably.
- [ ] Verify the success notification and booking confirmation are announced.

### Email mailbox behavior

- [ ] Record today's test message placement in the authorized Gmail mailbox:
      Inbox, Promotions, Spam, or Other.
- [ ] Send to an authorized Outlook/Microsoft mailbox and record placement.
- [ ] Send to an authorized Apple/iCloud mailbox and record placement.
- [ ] Verify From, reply-to, links, images, mobile rendering, and dark mode.
- [ ] Verify bounce, complaint, suppression, and retry behavior.

## 6. Reproduction record

```bash
# Chromium and Firefox exact-booking runs
TIER4_SEED=2026-08-23 npx playwright test \
  --config playwright/tier4/playwright.config.ts \
  booking.spec.ts --project=<chromium|firefox>

# Axe scans
TIER4_SEED=2026-08-23 npx playwright test \
  --config playwright/tier4/playwright.config.ts \
  a11y.spec.ts --project=chromium

# Keyboard-only checkout from a populated cart
TIER4_SEED=2026-08-23 npx playwright test \
  --config playwright/tier4/playwright.config.ts \
  keyboard.spec.ts --project=chromium
```

## 7. Final disposition

The card booking path is functioning in Chromium and Firefox test runs, and a
keyboard user can complete checkout from a populated cart in Chromium. The
overall Tier 4 audit is **not a clean pass** because:

1. The UI add-to-cart step was bypassed by the harness.
2. WebKit could not be executed in today's environment.
3. Axe found critical accessible-name and serious contrast defects.
4. Physical mobile, screen-reader, wallet, and mailbox-placement checks still
   require human verification.