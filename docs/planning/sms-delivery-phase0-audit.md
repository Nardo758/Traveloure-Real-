# SMS / PWA Delivery — Phase 0 Audit & Kickoff

**Lane:** Consent + SMS/PWA delivery. **Own branch** (`claude/delivery-consent-sms-pwa`) — touches app-shell + server; must NOT run on `plancard-piece3` or any transport branch.
**Pairs with:** [`plancard-mobile-delivery-model.md`](./plancard-mobile-delivery-model.md) (the tier model + channel-by-nudge map + §4 consent capture points).
**Status:** Phase 0 complete → **HARD STOP** for the three-way checklist below. No code written; this is audit + long-lead kickoff only.

**Decisions in (from kickoff):** tier = **PWA + SMS + email**; capture points = signup (optional) + trip creation (primary) + trip-card prompt (soft re-offer); web-push permission prompt fires at the **plan-ready** intent moment (not first load); provider = **Twilio assumed (confirm)**.

---

## 1. Verify-first audit (brief §5) — against `origin/main` `6c8847b`

| Infra | State | Evidence |
|---|---|---|
| **PWA** (manifest / service worker / install prompt) | ❌ **none** | no `manifest.webmanifest`/`manifest.json`, no service worker, no `serviceWorker`/`rel="manifest"`/`beforeinstallprompt` in `client/index.html` or `client/src/main.tsx` |
| **Web push** (VAPID / subscription) | ❌ **none** | no `web-push`/`vapid`/`pushManager`/`PushSubscription`/`Notification.requestPermission` anywhere in `client/**` or `server/**` |
| **SMS** (provider / send) | ❌ **none (net-new)** | no `twilio`/provider dependency in `package.json`; the only `sms` hit is `shared/guest-invites-schema.ts:150` — a `method` enum (`email, sms, whatsapp`) **tracking** how an invite was sent, **not** send infra |
| **Email** | ✅ **exists** (Resend) | `server/services/email.service.ts` — `Resend` client (`:17`), send fns `sendBookingAlertEmail:51`, `sendPasswordResetEmail:133`, `sendEmailVerificationEmail:203`. Transactional/lifecycle only — **reusable pattern for the email floor**, not on-trip nudges. |
| **Notification events** (layer target) | ✅ exists — ⚠️ **duplicated** | `GET /api/notifications` defined **twice**: `server/routes.ts:5512` (→ `storage.getNotifications(userId, unreadOnly)`) **and** `server/routes/content.routes.ts:2239`. The known route-fragmentation. Shape: `storage.getNotifications` returns the rows the summary's action-items (`PlanCard.tsx:380`, manifest A13) already read. |

**Conclusion:** Tiers 1–2 (PWA, web-push, SMS) are **entirely net-new**. Only email send exists. Delivery layers on the **existing** notification events — but **resolve the duplicate `/api/notifications` route before Phase 4** binds a send layer to it, or the layer may bind the shadowed handler.

---

## 2. 10DLC registration — the long pole *(general guidance, NOT legal advice — confirm with provider + counsel)*

US A2P 10DLC (via The Campaign Registry, normally through the provider) gates SMS sending and has **external approval lead time** — it starts first.

**Brand registration (business identity):**
- Legal business name, entity type (LLC/Corp), **EIN / Tax ID**, country of registration
- Registered business address, website URL, industry/vertical (travel)
- Authorized contact (name, title, email, phone)
- Public/private (Traveloure private → no stock symbol)

**Campaign registration (use case):**
- **Use-case type — this declares MARKETING/offers, not just transactional** (the trip-card prompt + `plancard_ontrip` upsell are promotional). Marketing/mixed use-cases get stricter vetting → confirm scope with counsel before filing.
- Campaign description (what the texts are/why)
- **Sample messages (2–5) — MUST include both an alert example AND an offer/marketing example** (e.g., "Sofia changed your route — confirm: <link>" and "Near you tomorrow: a coastal wine tour — <link>")
- **Opt-in description / message flow** — how consent is collected (the three capture points + the exact disclosure), opt-in keywords, the CTA
- **STOP / HELP** keyword responses (exact text)
- Embedded links present? **Yes** (links to `/trip/:id`)
- Estimated volume / throughput

**Numbers:** a 10DLC long-code (or verified toll-free) / Messaging Service on the chosen provider.

---

## 3. THREE-WAY CHECKLIST (Phase 0 deliverable)

### (a) Engineering-ready to build (no external dependency — await your go)
- [ ] **Phase 1 — consent-record store**: table + migration (phone, user/trip ref, timestamp, **exact disclosure text shown**, scope=alerts+offers, channel, opt-in source enum {signup, trip_creation, trip_card}, status, opt-out timestamp) + STOP/HELP handling. *Pure DB/server; buildable immediately on go.*
- [ ] **Phase 3 — PWA**: web app manifest, service worker, web-push subscription + **VAPID keypair (self-generated — no external approval)**. *Parallelizable; not gated on 10DLC.*
- [ ] **Phase 2 — opt-in UI (3 capture points) behind a flag**: full disclosure + consent checkbox; **must not collect live consent until Phase 1 store exists AND 10DLC is approved.**
- [ ] **Pre-Phase-4 cleanup**: resolve the duplicate `/api/notifications` route so the send layer binds the canonical handler.
- [ ] **Phase 4 — send layer** on existing events, routed per the brief's channel-by-nudge table (SMS time-critical / web-push installed / email floor). *SMS arm gated on 10DLC; web-push + email arms not.*

### (b) YOURS to provide (Leon) — unblocks the long pole
- [ ] **10DLC brand info**: legal name, EIN, address, website, contact, vertical.
- [ ] **10DLC campaign info**: use-case (incl. marketing/offers scope), sample messages (alert + offer), estimated volume.
- [ ] **Provider confirmation**: **Twilio assumed — confirm or name alternative** (gates account setup, number provisioning, per-message cost).
- [ ] **Initiate 10DLC registration now** (external lead time = the long pole).

### (c) COUNSEL's — binding, do not self-author
- [ ] **Binding consent disclosure language** (exact opt-in text: alerts **and** offers, message frequency, msg/data rates, STOP/HELP). *Engineering uses a flagged placeholder until counsel finalizes; the consent store records the exact text shown, so it must be final before live opt-in.*
- [ ] **Privacy policy** update covering SMS data + consent.
- [ ] **Operating Agreement / Terms** update for SMS.
- [ ] **TCPA** review of the consent flow + record-keeping (and whether marketing-scope SMS needs prior-express-**written** consent).

---

## 4. HARD STOP

Phase 0 ends here. **Phase 1 (consent store) does not start** until: your go + (b) provider confirmed + 10DLC initiated + (c) counsel has at least the binding consent language in draft (the store records exact disclosure text, so it can't be finalized against a placeholder). PWA (Phase 3) can start in parallel on go since it has no external gate.

Each subsequent phase gates on **tsc clean + the phase's check, then stops for review.** No live opt-in control ships before Phase 1 + 10DLC approval.
