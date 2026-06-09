# PlanCard — Mobile Delivery Model

**Type:** architecture / product decision brief. **Pairs with** `plancard-surface-manifest.md` (cross-link from it). **Status:** decision pending — this defines *how the PlanCard reaches the phone*, which is currently undefined.

> **Provenance.** `[grounded]` = confirmed in repo/specs; `[to-verify]` = needs a repo check before relying on it; everything about web/PWA/SMS behavior is general platform fact. Re-verify `[to-verify]` items before building.

---

## 0. The gap

The PlanCard is, by design, "the itinerary control center **on the phone**." Its on-trip value — the `plancard_ontrip` upsell ("near you tomorrow"), expert suggestions awaiting accept/reject, action items — all assume the user gets **reached on their phone at the right moment**. That assumption isn't met today.

The on-trip loop has four steps. Three exist; one doesn't:

| Step | What happens | State |
|---|---|---|
| 1. **Push reaches them** | "Near you tomorrow: a wine tour" · "Sofia suggested a route change — accept?" | ❌ **missing** |
| 2. Opens the PlanCard | Lands on live-day view: today's stops, the map, what's pending | ✅ mobile web `[grounded]` |
| 3. Acts in-app | Accept suggestion · Explore upsell · Book a leg (Stripe) · Ask the Concierge | ✅ (book = gated on strand) |
| 4. Hands to native maps | Turn-by-turn in Google/Apple via deep-link | ✅ live `[grounded]` |

**Important distinction.** Plan *content* already "pushes to the PlanCard" on optimize (the G7 post-optimize push) — but that's **data delivery**, and it's **pull**: the user only sees it if they open `/trip/:id`. The notification events also exist (`GET /api/notifications`, action-items on the summary) `[grounded]` — but they too are **pull**. What's missing is a **delivery channel** that surfaces those events on the phone proactively. The events are built; the reach is not.

---

## 1. The delivery tiers (in order of effort)

### Tier 0 — Mobile web (today)
Responsive React app; user navigates to `/trip/:id` in a browser.
- **Unlocks:** nothing proactive. User must remember to open it.
- **Verdict:** insufficient for an on-trip companion. This is the current state and it's why the on-trip features are effectively inert.

### Tier 1 — PWA (the pragmatic floor) ← recommended starting point
Make the React app installable: web app manifest, service worker, home-screen icon, **web push**.
- **Unlocks:** home-screen presence; proactive **web push**; offline caching of the plan (useful when connectivity is patchy mid-trip); no app store, no native rebuild — it's an additive layer on the existing React app.
- **Cost:** low–moderate. Manifest + service worker + a push-subscription flow + server-side push send.
- **iOS caveat `[fact]`:** Safari supports web push only for PWAs the user has **added to the Home Screen** (iOS 16.4+). Most users won't install, so web push **cannot be relied on to reach everyone on iOS** — it reaches your installed power users, not the casual majority. That's the gap SMS closes.

### Tier 2 — PWA + SMS (+ email for non-urgent) ← recommended for time-sensitive
For genuinely time-sensitive or location-aware nudges ("near you *right now*", "your transfer leaves in 30 min", "Sofia changed your route — confirm?"), **SMS is the channel that actually lands during a trip when the app is closed** and regardless of install state. Email carries the non-urgent (trip-ready, weekly digest, receipts).
- **Unlocks:** reliable reach on any phone, app open or not, installed or not.
- **Cost:** moderate. SMS provider integration + opt-in/consent flow + per-message cost.
- **Constraint:** SMS requires **explicit opt-in/consent** (US TCPA and similar) — this is a design requirement, not optional. See §4.

### Tier 3 — Native app (the ceiling)
- **Unlocks:** reliable background push, real geofencing for "near you", tighter native-maps integration, app-store presence.
- **Cost:** high — a separate build and maintenance track.
- **Verdict:** the eventual ceiling, but **don't commit to it before validating the loop** on PWA+SMS. Build it when retention/usage justify the investment, not to unblock the on-trip features.

---

## 2. Recommendation

**Tier 1 as the floor, Tier 2 for anything time-sensitive, Tier 3 deferred.**

- Ship the **PWA** so the app is installable and you have a push path for your engaged users.
- Add **SMS** for the nudges whose value collapses if they're missed — the on-trip ones. Web push reaches the installed minority; SMS reaches everyone, which is what an on-trip companion needs.
- **Email** carries non-urgent lifecycle messages.
- **Native** waits for usage data to justify it.

The whole thing **layers on the notification events you already have** — this is a delivery layer, not a notifications rebuild. Reconcile, not rebuild.

---

## 3. Channel-by-nudge mapping

| Nudge | Urgency | Channel |
|---|---|---|
| Plan optimized / ready | low | in-app + email |
| `plancard_ontrip` upsell ("near you tomorrow") | medium, time-boxed | web push (installed) + SMS |
| Expert suggested a change — accept/reject | high | SMS + web push |
| Transport/transfer reminder ("leaves in 30 min") | high, time-critical | SMS |
| Action items / general | low | in-app badge (pull) |
| Receipts, weekly digest | low | email |

The on-trip, time-critical rows are the ones that **require SMS** — they're exactly the moments the app is closed.

---

## 4. Consent & permission constraints `[design requirement]`

- **Web push** needs an explicit permission prompt — don't fire it on first load; ask at a moment of demonstrated intent (e.g., after the user opts into trip alerts), or the deny-rate spikes and you lose the channel.
- **SMS** requires **explicit opt-in/consent** before sending (US TCPA and equivalents). This needs a real consent flow and record-keeping; it is not a toggle you can default on. Treat it as a launch requirement for the SMS tier, not a follow-up. *(Not legal advice — confirm specifics with counsel; the Operating Agreement / privacy policy already in project knowledge should be extended to cover SMS consent.)*

---

## 5. Verify-first (before building anything)

Audit-first, per standing discipline. Confirm `file:line`:
1. Is there **any** PWA infra today — web app manifest, service worker, install prompt? `[to-verify — suspect none]`
2. Any **web-push** subscription handling or VAPID keys server-side? `[to-verify — suspect none]`
3. Any **SMS/email** send infrastructure (provider client, templates)? `[to-verify]`
4. Exact shape of the **notification events** the delivery layer would consume (`GET /api/notifications` and the action-items source) — so delivery layers on top, not beside. `[grounded that it exists; verify shape]`
- **Gate:** a written inventory of what delivery infra exists vs. is net-new, before committing to a tier.

**§5 gate — SATISFIED (2026-06-09).** Inventory audited against `origin/main`:
- **PWA:** none — no `manifest.webmanifest`/`manifest.json`, no service worker.
- **Web push:** none — no VAPID / `pushManager` / `navigator.serviceWorker`.
- **SMS:** none — no Twilio / send infra.
- **Email:** exists — `server/services/email.service.ts` (Resend); lifecycle only (auth/verification), **not** on-trip nudges.
- **Notification events:** present (`GET /api/notifications` + summary action-items) — pull-only (manifest Stage-A rows A3/A13).

⇒ Everything in Tiers 1–2 (PWA, web-push, SMS) is **net-new**; only the email channel exists. The Tier decision (§7.1) can proceed on this basis. No code started — net-new tracks await the §7 decisions.

---

## 6. What NOT to do
- Don't ship the `plancard_ontrip` upsell (PR #50) as "done" and assume users see it — without a push channel, "near you tomorrow" reaches no one who isn't already looking at the app. The slot and its delivery are one feature, not two.
- Don't fire the web-push permission prompt on first load.
- Don't send SMS without an explicit opt-in/consent flow in place.
- Don't build a second notifications system — layer delivery on the existing events.
- Don't jump to native to unblock on-trip features; PWA+SMS unblocks them at a fraction of the cost.

## 7. Open decisions for Leon
1. **Tier commitment:** PWA-only first, or PWA+SMS together (the on-trip features need SMS to function)?
2. **SMS provider** + consent-flow ownership (and lane).
3. **Permission-prompt timing** for web push (which intent moment triggers the ask).
4. Whether the PWA/delivery work is its own lane or rides the PlanCard lane (it touches app-shell + server, so likely its own).
