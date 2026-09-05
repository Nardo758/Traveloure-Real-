# Custom Analytics Events Design

## Context

Traveloure has multiple meaningful user journeys but no shared client-side
wrapper for Replit-hosted analytics. Replit injects the Umami tracker into
published website HTML and handles pageviews automatically. Application code
should add only meaningful interaction and outcome events.

The first instrumentation pass will cover the major traveler, expert/provider,
and ready-made commerce funnels without recording every UI interaction.

## Goals

- Measure the major cross-role funnels from discovery through successful
  outcomes.
- Keep analytics optional and safe in development, preview, and tracker-load
  races.
- Prevent analytics failures from affecting product behavior.
- Avoid transmitting PII, secrets, payment details, free-form user content, or
  nested event payloads.
- Use stable, concise event names and dimensions that support funnel analysis.

## Non-goals

- Adding a third-party analytics SDK or analytics script.
- Replacing Replit's automatic pageview tracking.
- Capturing every click, modal open, keystroke, or intermediate form edit.
- Adding server-side analytics storage or database migrations.
- Sending user email addresses, names, trip IDs, booking IDs, payment IDs, or
  raw search text.

## Event taxonomy

All event names use `snake_case` and remain below 50 characters. Event
properties are flat strings, numbers, or booleans only.

### Traveler and discovery

| Event | Meaning | Safe dimensions |
| --- | --- | --- |
| `trip_created` | A traveler successfully creates a planning trip. | `surface`, `creation_method` |
| `search_submitted` | A meaningful search is submitted. | `surface`, `search_type`, `has_results` |
| `service_added_to_cart` | A service is successfully added to cart. | `surface`, `item_type`, `has_scheduled_date` |
| `checkout_started` | Checkout begins with at least one cart item. | `item_count`, `has_scheduled_item` |
| `booking_completed` | A booking reaches successful confirmation. | `booking_type`, `payment_required` |
| `payment_completed` | A payment-required flow confirms successfully. | `flow`, `payment_method_type` |

### Expert and provider

| Event | Meaning | Safe dimensions |
| --- | --- | --- |
| `expert_workspace_opened` | An expert opens a workspace for a real trip. | `surface`, `workspace_mode` |
| `plan_item_added` | An itinerary item is successfully added. | `item_type`, `source_type`, `workspace_mode` |
| `plan_delivered` | An expert successfully delivers a plan. | `workspace_mode` |
| `plan_approved` | A traveler approves a delivered plan. | `approval_path` |
| `listing_submitted` | An expert/provider submits a listing for review. | `listing_type`, `surface` |
| `listing_published` | A listing becomes publicly available. | `listing_type`, `surface` |

### Ready-made commerce

| Event | Meaning | Safe dimensions |
| --- | --- | --- |
| `ready_made_viewed` | A ready-made trip detail is meaningfully viewed. | `surface`, `market` |
| `ready_made_purchase_started` | A ready-made purchase flow begins. | `surface`, `market` |
| `ready_made_purchase_completed` | A ready-made purchase/clone succeeds. | `market`, `payment_required` |

## Architecture

Add one client utility, `client/src/lib/analytics.ts`, exposing a
`trackEvent(name, data?)` function. The utility will:

1. Return immediately during SSR or when `window` is unavailable.
2. Call the injected `window.umami.track` function only when present.
3. Catch all tracker exceptions.
4. Accept only the approved flat property types at compile time.
5. Never configure the tracker, website ID, script URL, or environment
   variables.

Existing success handlers and mutation callbacks will call the utility at the
point where the application has confirmed the outcome. Failed requests,
optimistic clicks, and abandoned forms will not emit success events.

## Data flow

1. A user completes a meaningful action.
2. The existing client mutation/request resolves successfully.
3. The relevant UI handler calls `trackEvent` with a stable event name and
   non-identifying dimensions.
4. The injected Umami tracker receives the event when analytics is enabled.
5. If analytics is disabled, unavailable, or still loading, the call becomes a
   safe no-op.

## Privacy and safety

- Do not include names, email addresses, user IDs, trip IDs, booking IDs,
  payment IDs, raw search terms, notes, descriptions, or URLs.
- Do not include secrets, authorization values, Stripe identifiers, or full
  request/response payloads.
- Prefer booleans, enums, counts, and bounded category values.
- Keep `payment_method_type` limited to non-sensitive categories already exposed
  by the UI, never card/network details.
- Keep analytics calls outside error-critical control flow.

## Verification

- Type-check the new wrapper and all call sites.
- Run the existing client/build validation.
- Exercise the wrapper with no `window.umami` present and confirm it does not
  throw.
- Search the implementation for disallowed identifiers and free-form payloads.
- Confirm the application workflow starts without browser-console errors caused
  by analytics.
- Confirm the final event list matches this document.

## Rollout

The events become collectable only after analytics is enabled in Publishing
settings and the application is published or republished. Development and
preview runs remain functional without the injected tracker.