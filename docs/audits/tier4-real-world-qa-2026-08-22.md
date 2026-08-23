# Tier 4 Real-World QA Audit

**Audit date:** 2026-08-22  
**Target:** Local development only (`http://127.0.0.1:5000`)  
**Deterministic seed:** `2026-08-22`  
**Desktop audit viewport:** 1280 × 900  
**Payment mode:** Stripe test mode, standard successful test card  
**Evidence directory:** `docs/audits/tier4-evidence/`

## Executive result

The real test-mode booking journey completed successfully in Chromium, Firefox, and WebKit. Every engine:

1. Registered a fresh test user.
2. Loaded discovery and a real service detail.
3. Added a real service to the test user's cart.
4. Created a real local checkout and Stripe test PaymentIntent.
5. Entered the successful test card.
6. Submitted payment.
7. Redirected to `/bookings`.
8. Confirmed the **exact booking ID returned by that checkout**, not an unrelated booking.

The booking path passed in all three engines. The audit did, however, confirm accessibility defects:

- **10 critical affected control instances** without accessible button names across discovery, cart, and the public expert profile.
- **87 serious affected instances** with insufficient color contrast across the four scanned page states.
- The cart decrement and increment controls were unlabeled in the keyboard audit.
- An empty keyboard payment submission produced no non-empty alert, status, live-region message, or `aria-describedby` error relationship. The same keyboard run subsequently completed payment and confirmed its exact booking, isolating this as a validation-feedback defect.

No product defects were fixed during this audit. Follow-up tasks were created for the confirmed findings.

## 1. Cross-browser booking journey

| Engine | Result | Deterministic deep-inspection step | Layout at checkpoint | Primary evidence |
|---|---|---|---|---|
| Chromium | **PASS — exact booking confirmed** | Payment | 1280 px document width; 2250 px document height; no horizontal overflow | `tier4-evidence/booking-chromium.json` |
| Firefox | **PASS — exact booking confirmed** | Confirmation | 1280 px document width; 900 px document height; no horizontal overflow | `tier4-evidence/booking-firefox.json` |
| WebKit | **PASS — exact booking confirmed** | Service detail | 1280 px document width; 2423 px document height; no horizontal overflow | `tier4-evidence/booking-webkit.json` |

### Screenshots

Each engine has screenshots for discovery, service detail, cart, populated payment, `/bookings`, final booking state, and its deterministic inspection checkpoint:

- Chromium: `tier4-evidence/booking-chromium-*.png`
- Firefox: `tier4-evidence/booking-firefox-*.png`
- WebKit: `tier4-evidence/booking-webkit-*.png`

### Journey limitation

The service-detail add-to-cart control expected by the harness was not visible in any engine. The audit therefore used authenticated `POST /api/cart` as an explicitly recorded fallback. Discovery, service detail, cart, checkout, Stripe entry, payment submission, redirect, and exact-booking confirmation were still exercised, but this is **not a full UI pass for the add-to-cart interaction itself**.

### Browser console findings

| Engine | Findings | Assessment |
|---|---|---|
| Chromium | Google Maps legacy Marker deprecation warning; Stripe local-HTTP, older Elements API, inactive payment-method, and wallet-domain warnings; one 404 resource error | Booking did not fail. Wallet warnings are expected on local HTTP and do not verify wallet readiness. |
| Firefox | Same Google Maps/Stripe warnings plus forced-layout warnings inside Stripe/hCaptcha frames | Booking did not fail. Vendor-frame layout warnings were preserved as evidence. |
| WebKit | Stripe configuration warnings; repeated enforcing and report-only stylesheet CSP errors in Stripe-hosted content; one 404 resource error | Booking and rendering still completed. CSP errors are recorded, not treated as a clean-console pass. |

An independent read-only browser smoke check also confirmed that `/discover` and the guest `/cart` state render coherently at 1280 × 900 without horizontal overflow. It observed expected guest 401 noise and cart CSP messages.

## 2. Keyboard-only checkout

**Evidence:** `tier4-evidence/keyboard-chromium.json` and `tier4-evidence/keyboard-*.png`

### Confirmed behavior

- Proceeded through checkout using Tab and Enter.
- Reached Stripe's Payment Element through genuine Tab traversal.
- Entered card number, expiry, CVC, and postal code with keyboard input.
- Did not use `locator.focus()` or a mouse click to claim keyboard coverage.
- Reached the outer Pay button and submitted with Enter.
- Redirected to `/bookings`.
- Confirmed the exact booking ID from `POST /api/checkout`.
- All 39 captured main-page focus-order entries showed a visible focus indicator.
- Main-page form inputs on the audited cart/payment states had labels.

### Confirmed defects

1. **Cart quantity controls are unnamed.** The decrement and increment buttons had no discernible accessible names.
2. **Empty payment validation is not semantically exposed.** The keyboard audit reached Pay and submitted an empty Payment Element, then inspected the app and every Stripe frame. It found:
   - No non-empty `role="alert"` region.
   - No non-empty `role="status"` region.
   - No non-empty `aria-live` message.
   - No invalid field with a non-empty `aria-describedby` error relationship.

The automated keyboard test is intentionally reported as **blocked by one accessibility defect**, even though the same run subsequently filled the card and confirmed the booking. This prevents the successful payment from masking the validation-feedback failure.

### Keyboard scope limitation

The cart item was seeded through an authenticated API call. The keyboard-only claim begins on the populated cart and covers checkout navigation, Payment Element entry, submission, and confirmation; it does not claim keyboard-only service discovery or add-to-cart.

## 3. Automated accessibility scans

Automated scans used `@axe-core/playwright` in Chromium. Violations were collected as audit evidence rather than causing immediate test failure.

| Surface | Critical | Serious | Rules | Evidence |
|---|---:|---:|---|---|
| Discovery/search | 5 affected nodes | 67 affected nodes | `button-name`, `color-contrast` | `tier4-evidence/a11y-discover-search-chromium.json` |
| Cart/checkout | 3 affected nodes | 8 affected nodes | `button-name`, `color-contrast` | `tier4-evidence/a11y-cart-checkout-chromium.json` |
| Cart payment state | 0 | 6 affected nodes | `color-contrast` | `tier4-evidence/a11y-cart-checkout-payment-chromium.json` |
| Public expert profile | 2 affected nodes | 6 affected nodes | `button-name`, `color-contrast` | `tier4-evidence/a11y-expert-profile-chromium-chromium.json` |

The counts above are affected instances per scanned state, not a de-duplicated count of unique source components.

### Critical findings

- Three discovery filter/select controls lacked accessible names.
- Discovery previous/next pagination controls lacked accessible names.
- Three cart controls lacked accessible names, including the confirmed quantity decrement/increment controls.
- Two icon-only controls on the public expert profile lacked accessible names.

### Serious findings

Color contrast failures affected primary and secondary actions, active tabs, muted explanatory text, badges, pricing/fee text, and expert-profile actions. Exact selectors, measured ratios, representative HTML, and Axe failure summaries are preserved in the JSON evidence.

### Automated-scan limitations

- Automated Axe scans do not replace screen-reader testing.
- Dynamic third-party Stripe iframe content was not included in the page-level Axe scans.
- Only the named desktop page states and viewport were scanned.

## 4. Email authentication and sender configuration

**Evidence:** `tier4-evidence/email-auth.json`  
**Audit method:** Read-only Resend API inspection plus live DNS lookups  
**Real email sent:** **No**

| Check | Result |
|---|---|
| Configured sender domain matched a Resend domain | **PASS** |
| Resend domain status | **Verified** |
| Resend sending capability | **Enabled** |
| Apex SPF record | **Present** |
| DMARC record | **Present — `p=reject`** |
| Resend DKIM selector | **Verified by provider and present in live TXT lookup** |
| Provider mail-from MX at `send.traveloure.com` | **Verified and present** |
| Provider mail-from SPF TXT at `send.traveloure.com` | **Verified and present** |

No authorized inspectable inbox was configured, so the script did not send a message. This audit therefore makes no claim about delivery, inbox placement, spam-folder placement, reputation, rendering in mail clients, click tracking, reply handling, or retry behavior.

## 5. Manual-only checklist

These checks remain explicitly unverified. They require physical hardware, OS services, a real HTTPS domain, an authorized inbox, or human assistive-technology operation.

### Physical mobile devices

- [ ] iPhone Safari: complete the full booking and return from payment.
- [ ] Android Chrome: complete the full booking and return from payment.
- [ ] Confirm sticky controls and totals are not covered by browser chrome or safe areas.
- [ ] Confirm all touch targets remain usable with one-handed zoom and text scaling.
- [ ] Test portrait-to-landscape rotation at cart, payment, and confirmation.
- [ ] Test slow/interrupted network during checkout without duplicate payment or booking.

### Virtual keyboards

- [ ] iOS virtual keyboard does not cover the active checkout or payment field.
- [ ] Android virtual keyboard does not cover the active checkout or payment field.
- [ ] Next/Previous/Done actions advance predictably.
- [ ] Postal-code and numeric fields request appropriate keyboard modes.
- [ ] Dismissing and reopening the virtual keyboard does not lose entered data or focus.

### Wallets and HTTPS-only payment behavior

- [ ] Apple Pay appears and completes on a registered HTTPS domain and supported Apple device.
- [ ] Google Pay appears and completes on a registered HTTPS domain and supported Android device/browser.
- [ ] Wallet cancellation returns to a recoverable checkout state.
- [ ] Wallet success confirms the exact booking once and does not duplicate it.

Local HTTP cannot validate wallets. The Stripe warning about an unregistered local domain is not evidence of the published domain's status.

### Zoom, reflow, and orientation

- [ ] Desktop browser zoom at 200%.
- [ ] Reflow at 320 CSS px equivalent / 400% zoom where applicable.
- [ ] Browser text-only zoom and OS text scaling.
- [ ] Portrait and landscape layouts on small and large phones.
- [ ] No two-dimensional scrolling for ordinary checkout content.

### Screen readers

- [ ] VoiceOver on macOS Safari.
- [ ] VoiceOver on iOS Safari.
- [ ] NVDA on Windows Firefox and Chromium.
- [ ] TalkBack on Android Chrome.
- [ ] Landmark, heading, rotor, and form-control navigation.
- [ ] Cart quantity controls announce action, item, and updated quantity.
- [ ] Empty and invalid payment submission announces a useful error and moves focus predictably.
- [ ] Success toast and booking confirmation are announced.

### Email delivery and inbox behavior

- [ ] Send to an authorized Gmail inbox and record tab/folder placement.
- [ ] Send to an authorized Outlook/Microsoft inbox and record folder placement.
- [ ] Send to an authorized Apple/iCloud inbox and record folder placement.
- [ ] Verify From, reply-to, links, images, mobile rendering, and dark mode.
- [ ] Verify bounce, complaint, suppression, and retry behavior in an authorized provider environment.

## 6. Reproduction

The audit launcher refuses any `BASE_URL` or `TIER4_BASE_URL` whose host is not `localhost` or `127.0.0.1`. It supplies the Nix runtime libraries needed by Playwright and runs WebKitGTK under a private Xvfb display because the bundled headless WPE backend cannot create an EGL display in this container.

```bash
# All three exact-booking journeys
TIER4_SEED=2026-08-22 \
  bash scripts/tier4-audit.sh \
  npx playwright test \
  --config playwright/tier4/playwright.config.ts \
  booking.spec.ts

# Chromium accessibility scans
TIER4_SEED=2026-08-22 \
  bash scripts/tier4-audit.sh \
  npx playwright test \
  --config playwright/tier4/playwright.config.ts \
  --project=chromium \
  a11y.spec.ts

# Keyboard-only checkout; currently expected to fail on the documented
# empty-payment validation semantics after still confirming the booking
TIER4_SEED=2026-08-22 \
  bash scripts/tier4-audit.sh \
  npx playwright test \
  --config playwright/tier4/playwright.config.ts \
  --project=chromium \
  keyboard.spec.ts

# Read-only sender-domain and DNS audit
npx tsx scripts/tier4-email-dns-audit.ts
```

The WebKit result is evidence for Playwright's WebKit engine on Linux, not a claim that macOS Safari or iOS Safari was physically tested.

## 7. Verification record

- Cross-browser booking suite: **3/3 passed** in one serial run.
- Chromium Axe suite: **3/3 scan tests completed**; violations preserved as evidence.
- Chromium keyboard suite: booking confirmed, then test **failed intentionally on the confirmed validation-announcement defect**.
- Email/DNS audit: completed read-only; no message sent.
- Launcher syntax and Nix expression: parsed successfully.
- Non-local guard: rejected external targets through both `BASE_URL` and `TIER4_BASE_URL`.
- Evidence JSON credential-pattern and mailbox-address scan: clean.
- Independent read-only UI smoke check: discovery and guest cart rendered without horizontal overflow.

## 8. Follow-up tasks

- **#1607 — Make every audited control announce its purpose to screen-reader users**
- **#1608 — Make booking and expert-profile content meet WCAG AA contrast**
- **#1609 — Announce empty payment errors to keyboard and screen-reader users**

## 9. Tripslip pull review and focused verification

The Tripslip review-copy pull was reviewed at merged commit `c911cec2` (PR #534). The
pull correctly:

- returns slip-backed comparisons to `/plans/:tripId` after applying a selected variant;
- explains that optimization has not started when a comparison is still
  `pending_payment`;
- explains that the original plan is untouched after a failed optimization; and
- gives review-mode zero-proposal comparisons an explanation and a retry action.

The pull's navigation-copy defect was fixed in merged task #1610: the
`autoApplyError === "no_variants"` banner now uses the slip-aware “Back to your plan”
exit for trip-backed comparisons while preserving the cart exit for cart-only flows.

Focused verification:

- **J6 trip-backed optimizer contract: PASS** — Chromium, 1/1, 27.3 seconds.
- **Tripslip no-variants regression: PASS** — Chromium, 1/1, 9.5 seconds; the action
  displayed “Back to your plan” and navigated to `/plans/:tripId`.
- **Legacy auto-apply banner test: OUTDATED EXPECTATION** — the app navigated to the
  current slip route `/plans/:tripId`, while the test still requires the former
  `/trip/:id?optimized=1` route. This is test drift from the current Tripslip contract,
  not a failed navigation.
- **Optimization payment-gate and the full auto-apply test pair: not fully rerun in the
  Tier 4 shell** — the earlier direct invocation was blocked by the missing
  `libglib-2.0.so.0`; the isolated Tripslip regression was subsequently run successfully
  inside the Tier 4 browser shell.
