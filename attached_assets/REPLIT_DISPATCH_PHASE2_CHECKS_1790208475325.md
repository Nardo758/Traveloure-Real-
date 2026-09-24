# Dispatch: Phase 2 read-only production checks and Stripe operator steps

**For:** Replit, plus the operator who holds Stripe dashboard access.
**Covers:** board #550 (background-check flags), #143 (Connect webhook secret) and #1288 (refunds that happen outside our system).

**Rules:**
- Every SQL statement below is **read-only** (`SELECT` only). Run them against production and paste the results back.
- **Do not** change any production data.
- **Do not** add or remove Stripe webhook events except where Part B says so.
- Never paste a signing secret into chat or into a file.

---

## Part A: #550, are the background-check flags actually on in production?

**Why this matters:**
- A provider may publish a listing in a category marked `requires_background_check` only after confirming a background check (`provider-publish.service.ts`).
- Migration 289 wrote those flags as `COALESCE(existing, intended)`. The column defaults to `false`, so a row that already existed kept `false` instead of getting `true`.
- If that happened in production, childcare, private chef, tour guide and driver listings can go live **without** the background-check confirmation.

**The intended values** (from migrations 034/289): `requires_background_check = true` for exactly these five keys:
- `private_transportation`
- `tour_guide`
- `private_chef`
- `childcare_family`
- `accessibility_specialist`

Every other key is intended to be `false`.

### A1. The flags as they are now (read-only)

```sql
SELECT category_key, slug, requires_background_check, insurance_band, risk_profile
FROM service_categories
WHERE category_key IS NOT NULL
ORDER BY category_key;
```

### A2. Which of the five are wrong (read-only)

```sql
SELECT category_key, requires_background_check
FROM service_categories
WHERE category_key IN ('private_transportation','tour_guide','private_chef','childcare_family','accessibility_specialist')
  AND requires_background_check IS DISTINCT FROM true;
```

### A3. Exposure: approved listings in those five categories whose owner has NOT confirmed a background check (read-only)

```sql
SELECT sc.category_key, count(*) AS approved_listings_without_bg_confirmation
FROM provider_services ps
JOIN service_categories sc ON sc.id = ps.category_id
JOIN users u ON u.id = ps.user_id
WHERE sc.category_key IN ('private_transportation','tour_guide','private_chef','childcare_family','accessibility_specialist')
  AND ps.approval_status = 'approved'
  AND COALESCE(u.background_check_confirmed, false) = false
GROUP BY 1
ORDER BY 1;
```

**How to read the results:**
- **A2 empty:** the flags are correct and there is nothing to fix.
- **A2 has rows:** I'll write a data-only repair migration that sets exactly those rows. It will get its own PR and its own ruling.
- **A3** tells us whether any listing already went live without the check.

---

## Part B: Stripe (operator, Stripe dashboard, live mode)

**Background:** `docs/briefs/STRIPE_WEBHOOK_DELIVERY_GAP.md`. Our charges and transfers are made on the **platform account**; connected accounts only receive transfers. So:

| Endpoint | URL | Signing secret env var | What its code handles |
|---|---|---|---|
| Platform (Stage 1 created it) | `/api/bookings/webhooks/stripe` | `STRIPE_WEBHOOK_SECRET` | `checkout.session.completed`, `customer.subscription.*`, `payment_intent.*`, `charge.refunded` |
| Connect | `/api/webhooks/stripe` | `STRIPE_CONNECT_WEBHOOK_SECRET` | `account.updated`, plus arms for `transfer.*`, `payment_intent.*`, `charge.dispute.*` |

### B1. #143: is the Connect endpoint working right now? (read-only look first)

1. Open **Stripe → Developers → Webhooks → the endpoint for `https://traveloure.com/api/webhooks/stripe`**.
2. Record three things:
   - whether it listens to **"Events on Connected accounts"** or **"Events on your account"**;
   - the events it subscribes to;
   - the **delivery success rate** for the last 7 days (how many succeeded vs. failed with HTTP 400).
3. In Replit production secrets, check **whether `STRIPE_CONNECT_WEBHOOK_SECRET` is set**. Report only set or not set, never the value.

   In production the code **refuses every delivery with HTTP 400** when this variable is missing (`webhooks.routes.ts`). If it is unset, expert Stripe-onboarding status updates (`account.updated`) are failing today.
4. **If it is not set:**
   - copy that endpoint's signing secret (`whsec_…`) from the Stripe dashboard into the production secret `STRIPE_CONNECT_WEBHOOK_SECRET`;
   - republish;
   - use Stripe's **"Resend"** on one recent failed `account.updated` event and confirm it now gets **HTTP 200**.

   That closes #143.

### B2. #1288: hold the refund subscription. Do NOT add `charge.refunded` yet.

I checked the code before recommending this. The platform endpoint's `charge.refunded` handler only writes a `refunds` audit row, plus one bundle-settlement case. It does **not** stop earnings from being minted for a booking refunded in the Stripe dashboard, which is what #1288 needs. It has also never run in production. Subscribing it now would run a never-exercised insert against live refunds and still leave #1288 open.

**#1288 therefore needs a code lane first:** when Stripe reports a refund we didn't issue, mark the booking so the completion mint refuses it. I'll bring that to you as its own change. Leave the subscription for when it lands.

### B3. A finding for the record: disputes and payouts can't reach their handlers

The `charge.dispute.*` and `transfer.*` arms live on the **Connect** endpoint's code. Charges and transfers happen on the **platform account**, and Stripe sends platform-account events only to endpoints listening to "Events on your account". So if the Connect endpoint listens to connected accounts (step B1 tells us), subscribing disputes there would deliver nothing. Each route also checks exactly one signing secret, so adding a second endpoint for the same URL would fail signature checks.

**Do not change any subscription for this.** It needs a small code change: route those event types to the platform endpoint, or let the Connect route accept a second secret. I'll propose it after B1's answers.

---

## Report back in this format

```
A1: <paste the table>
A2: <rows, or "empty">
A3: <rows, or "empty">
B1: Connect endpoint listens to: connected accounts / your account
    subscribed events: <list>
    last-7-day deliveries: <n> ok, <n> failed (status codes: …)
    STRIPE_CONNECT_WEBHOOK_SECRET in prod: set / not set
    If it was not set and you set it: resend of one account.updated → HTTP <code>
B2: charge.refunded left unsubscribed: yes
```
