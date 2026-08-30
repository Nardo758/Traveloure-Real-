# Walkthrough Matrix

The persona × goal rows the autonomous walkthrough agent rotates through
(ruling `2026-08-30-autonomous-walkthroughs`; skill: `.claude/skills/walkthrough/SKILL.md`).

Each row is a **goal, not a script.** The agent acts the way the persona would to reach
the goal — it decides where to click. Deterministic click-paths belong to the Playwright
suites (`playwright/tests/personas/*.spec.ts`, driven by `.github/workflows/persona-nightly.yml`);
the walk's entire value is the freedom to wander where a confused person would. The
`Surfaces to traverse` column is the **minimum** the goal touches, never a fixed order.

## Rotation

`/walkthrough next` walks the row **after the last committed report** in
`docs/testing/walkthroughs/` — read the newest filename, take the next persona in the
order below, wrap around at the end. `/walkthrough <persona>` walks that named row.
Reports are written to `docs/testing/walkthroughs/<YYYY-MM-DD>-<persona>.md`.

## Environment (never production)

- Dev/seeded env only. The persona accounts are created by `scripts/seed-personas.ts --apply`.
- All seeded accounts use the development-only password `TestPass123!`.
- Stripe must be **test mode**; a booking walk **stops at the confirm step** and never
  completes a real charge (THE LINE, per the skill).
- Base URL is the running dev/CI server (e.g. `http://localhost:5000`), never a prod host.

## Matrix

Order below is the rotation order. Budget is the per-run kill-switch: on exceeding
`max turns` the agent commits a partial report with a `STALLED` marker and exits
(skill → Guardrails).

| # | Persona | Seed account | Start URL | Goal (persona's own aim) | Surfaces to traverse (minimum) | Budget |
|---|---|---|---|---|---|---|
| 1 | **Guest** | *(signed out)* | `/` | "I'm just looking — show me what Kyoto has, and let me try to do something before you ask me to sign in." | Landing → `/discover` / `/city/kyoto` → a local-expert card → a service detail → a ready-made trip → **attempt a protected action** (add to cart / book) → hit the sign-in wall → dismiss and keep browsing | 40 turns |
| 2 | **Free traveler** | `persona-kyoto-free-traveler@traveloure.test` | `/discover` | "Plan a few days in Kyoto and actually book one thing." | Log in → `/create-trip` or discover → browse experts & services → add one service to `/cart` → `/checkout` **to the confirm step (stop there)** → read the fee copy and summary → `/my-trips` | 45 turns |
| 3 | **Trip Pass traveler** | `persona-kyoto-trip-pass@traveloure.test` | `/my-trips` | "I bought a Trip Pass — does my covered trip actually waive the fee, and does the app stop me buying a second one?" | `/my-trips` → the **covered** trip's plan (`/plans/:tripId`) → look for the `trip-pass-card-active` signal + `$0`/waived fee → an **uncovered** trip → the purchase CTA → **stop before charging** | 45 turns |
| 4 | **Plus member** | `persona-kyoto-plus@traveloure.test` | `/plus/occasions` | "Set an occasion so my home city draft shows up — and confirm the app tells me when it'll arrive." | `/plus/occasions` → add one occasion through the UI → verify it appears with its date and the 14-day-draft framing → `/pricing` (confirm the Plus surface reads honestly, `PLUS_SALES_ENABLED` gate) | 40 turns |
| 5 | **Gion local expert** | `persona-gion-expert@traveloure.test` | `/expert/dashboard` | "Claim my Gion storefront and publish an offering." | `/expert/dashboard` → onboarding / `/expert/apply` → `/expert/profile` → `/expert/services` add an offering via the wizard → submit through the real approval gate → open the **public** storefront (`/experts/:id` or `/p/:handle`) and confirm it only shows after approval | 45 turns |
| 6 | **Kyoto provider** | `persona-kyoto-provider@traveloure.test` | `/provider/dashboard` | "List a service and reach the Money station without getting lost." | `/provider/dashboard` → `/provider/services` add a service (wizard) → `/provider/availability` set a slot → submit through approval → `/provider/money` (Pro affordances read the active `pro_monthly` membership) | 45 turns |
| 7 | **Admin** | `ci-admin@traveloure.test` | `/admin` | "Clear the queues — approve what's waiting and confirm the money dashboards read honestly." | `/admin` → `/admin/service-approvals` / `/admin/experts` review queue → approve one item → `/admin/reconciliation` (both exception siblings) → `/admin/fee-bands` (no rate literals leak to the UI) | 40 turns |

## Notes on judgment per persona

- **Guest** — the sign-in wall must appear on the protected action, not before; browse
  chrome, cards, and prices must be coherent signed-out (PERSONA_JOURNEYS "Guest" row).
- **Free traveler** — checkout copy, fee wording, currency, confirmation state (§14 the
  amount is server-derived; the UI must not invent one). Booking **stops at confirm**.
- **Trip Pass** — the covered trip shows `feeCents:0` / waived with **no** PaymentIntent;
  a second purchase on a covered trip is refused (ledger `2026-08-29-trip-pass-provenance`).
  Copy must not claim a reusable membership (§13 honesty).
- **Plus** — `plan_memberships` active/manual; `users.home_city` Kyoto; occasion date
  handling; `PLUS_SALES_ENABLED` coming-soon honesty (§26). Never fabricate a draft trip.
- **Local expert** — Kyoto/Gion scoping; the public surface appears **only** after the
  approval gate; delivered per-item "Expert Notes" render on the traveler side (§21).
- **Provider** — service duration/price honesty (§13 — no `0 min`/`$0` on unset fields;
  cf. the `durationMinutes || 60` class), availability persistence, Pro reads the real
  membership, storefront only-when-approved.
- **Admin** — default-deny guard holds (§2); reconciliation shows both exception siblings
  (§15c / §17); no fee/commission literal is rendered anywhere (§8).

## Adding a row

A new persona/goal is a matrix edit, not a code change — add a row, name a seed account
that `scripts/seed-personas.ts` actually creates (or extend the seed first), and give it a
budget. Keep the rotation order stable so `/walkthrough next` stays deterministic.
