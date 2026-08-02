# Journeys

Permanent, self-contained repo harnesses for the multi-role browser flows that matter
most, per `docs/EXECUTION_MAP.md` §4b ("Testing protocol — Fable-minimized"). Read §4b
first — it is the spec this directory implements.

## The suite

| Journey | File | What it proves | Steps | Typical runtime |
|---|---|---|---|---|
| J1 expert-loop | `expert-loop.mjs` | Traveler↔expert item-routing loop (Trip-Canon Lane 1): send-to-expert, expert workspace access, custom add, per-item note, draft→in_review→delivered, the expert-return edge, delivered signal, add-to-checkout, cart projection, Distribute panel state. | 10 | ~2-3 min (browser-heavy — two authenticated Playwright contexts driving real page navigations) |
| J2 plan-lifecycle | `plan-lifecycle.mjs` | The delivery handshake + mode-flip (QA_PUNCH_LIST W2-A): deliver → customer approve → the SAME expert's direct item POST/PATCH/DELETE 409s `plan_approved_suggest_instead` → suggestion → approval materializes a REAL `itinerary_items` row (#371) → a concurrent double-approve never double-materializes (§15) → request-changes unlocks direct-edit again → re-deliver → re-approve. | 13 | a few seconds (fully API-driven, no browser pages) |
| J3 workstation-build | `workstation-build.mjs` | An authored build (`POST /api/expert/ready-made`) plus one item from EVERY Add-panel source — DMO (after refine-and-submit, the W5-C overlay), Platform content (with the `sourced`/dmo_content exclusion proven), an owned Platform service (the content-logistics envelope carry, migration 166), a Custom item (the honest geocode-fallback null), a Partner-catalog item (§16 no-URL-leak write shape) — then reorder + "Suggest best order" (optimize-order), the transport-gap checker flagging then clearing, and the canvas Plan map's honest environment-gated rendering. | 11 | ~25-30 s (one browser step; the rest are API calls) |
| J4 store-lifecycle | `store-lifecycle.mjs` | Ready Made Trips build→store lifecycle: ship-to-store, PATCH price/plan, submit → admin pending queue, admin approve, all three public reads (feed/detail/storefront) return it, withdraw hides it from all three, resubmit re-enters the queue, and the delete matrix (submitted→409, withdrawn+unsold→204, withdrawn+sold→409 permanent). | 10 | a few seconds (fully API-driven) |
| J5 traveler-comms | `traveler-comms.mjs` | The traveler `/inbox` (Messages tab = real conversation threads, Updates tab = real notifications, deep-link navigation, mark-read persistence) and per-item plan comments (migration 165): owner↔expert bell notifications both directions, a REJECTED advisor refused (403, the canonical `isTripAdvisor` allow-list), an unrelated user refused (403), and the thread rendering on both the traveler's Trip Card and the expert's Workstation editor. | 10 | ~1-2 min (four browser steps across two-plus contexts) |
| J6 partner-gate | `partner-gate.mjs` | The tier-(c) customer-approval gate on partner-catalog content, on an ASSIGNMENT trip: an expert's partner add files a SUGGESTION (zero `itinerary_items` rows — genuinely locked) rather than writing the item directly; customer approval materializes it with the "Partner: `<Network>`" marker (unlocked); the §16 sweep scans every written column for a raw URL. | 3 | a few seconds (fully API-driven) |
| J7 adversarial-money-access | `adversarial-money-access.mjs` | **Adversarial** — every case is an ATTACK, expected verdict PASS ("refused correctly"): the §13 P0 destructive cross-trip IDOR cluster (comparison create/apply-to-trip against another user's trip, reorder/optimize-order, a REJECTED advisor's item write + plan comment, a stranger's plancard/transport-legs/budget reads), §14/§15 money surfaces (client-supplied `amount` ignored on the expert-review payment-intent, non-owner refund/confirm-completion/dispute, the 7-day dispute-window cutoff, payout self-service capped to the real releasable balance + duplicate-request refusal, terminal-state replay on a refunded coordination fee — plus two `{external:true}` replay probes on `template_purchases`/`ready_made_purchases` that need a live Stripe key), and §10/§16 approval+content gates (an unapproved `provider_services` row and ready-made listing absent from every public read, a non-purchaser's expert-template detail redacted to a teaser, the partner-suggestion §16 URL-leak sweep, and mass-assignment probes on the provider-service create/update + ready-made update endpoints). **Found ONE real, previously-undocumented FAIL**: `PATCH /api/provider/services/:id` applies a client-sent `approvalStatus` with no clamp — a provider/expert can self-approve their own listing in one call, bypassing the F2/D1a admin queue (the CREATE path is correctly clamped; the PATCH path was missed). See the step's own comment (`C16b`) for the exact mechanism and `server/storage.ts` line reference. | 28 | ~10-15 s (fully API-driven, no browser pages) |

Re-running any of these is a Haiku job ("run `scripts/journeys/<name>.mjs`, report the
verdict table") — never re-brief a journey that already exists as a script.

## `scripts/invariants.mjs` — standalone SQL-assertion runner

A separate, smaller sibling to the journey suite: no app boot needed, just a reachable
Postgres. Runs a fixed list of money-integrity + data-hygiene invariants derived from
`docs/MONEY_MAP.md` and CLAUDE.md (§8/§14/§15, the escrow spine, D1a, Trip-Canon Lane 1/6),
each a single SQL query returning the OFFENDING rows (never a bare pass/fail count). Exit
code 1 iff any invariant without a documented `expectedFindings` label is violated.

```
node scripts/invariants.mjs --db-url "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg"
node scripts/invariants.mjs --db-url "..." --json   # machine-readable report only
```

Invariants checked (severity-grouped in the output): paid-out earnings always carry a
`payout_id`; a completed payout never exceeds the sum of the earnings it claims to have paid
out; every `platform_revenue` row carries a `source_type`, and every `reversed` row has a
compensating negative row (double-entry); a paid-equivalent `service_bookings` row always
carries a `stripe_payment_intent_id`; `cart_items.itinerary_item_id` is never orphaned
(migration 160's CASCADE); `itinerary_items.routing_status='purchased'` always carries a
`booking_id`; an `approval_status='approved'` `provider_services` row always has an owner;
a `coordination_states` row paid with a nonzero fee always carries a PI id; a `matched`
`affiliate_earnings` row always carries a `partner_reference_id`; a `cloned` ready-made
purchase always carries a `clone_trip_id`; a `completed` template purchase always has a
linked `expert_earnings` row. One invariant (**`trips-have-owner-collaborator-row`**) is
expected to legitimately find rows on a long-lived DB — it documents the L10 owner-under-grant
hazard (CLAUDE.md §13) rather than presupposing it's fixed; a nonzero result there is reported,
not treated as a harness failure.

## Running the whole suite: `run-all.mjs`

```
node scripts/journeys/run-all.mjs \
  --base-url http://localhost:5601 \
  --db-url "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg"
```

Runs every journey **sequentially** (never in parallel — see docs/EXECUTION_MAP.md L25
"Verification-integrity landmine") against the same booted app/DB, streams each
journey's own full log as it runs, then prints one combined verdict table (steps /
PASS / KNOWN_DEFECT / EXTERNAL / FAIL / exit code / wall time per journey, plus
totals). Exit code is 0 iff every journey exited 0 — a single journey's failure
doesn't stop the rest from running, so the whole suite's verdicts always get printed.

- `--only <name[,name...]>` restricts the run to a subset, e.g.
  `--only plan-lifecycle,store-lifecycle` (names are the `journey` field each script
  reports, i.e. the table's left column above without the `J<n>` prefix).
- `--out <dir>` is forwarded as each journey's own `--out`, with a per-journey
  subdirectory appended automatically (`<dir>/<journey-name>/`) so screenshots from
  different journeys never collide.
- `--headed` / `--skip-external` are forwarded to every child journey unchanged.

**IMPORTANT — set `RATE_LIMIT_LOOPBACK_SKIP=1` when booting the app before running
`run-all.mjs`** (or several journeys back to back by hand). Six journeys' worth of
`/api/*` calls from the same loopback IP inside one minute WILL trip
`generalRateLimiter` (100 req/60s per IP, `server/infrastructure/rate-limiter.ts`) and
429 subsequent journeys' `/api/auth/login` calls — proven live while building this
suite (`traveler-comms` and `partner-gate` both crashed at login on an unskipped run).
`RATE_LIMIT_LOOPBACK_SKIP=1` is the rate limiter's own documented CI escape hatch
(loopback-only, never set it in production) — see each journey's cold-boot recipe.

## Why journeys are scripts, not prompts

Writing a journey (working out the right selectors, endpoints, fixtures, and
assertions) is a one-time cost — expensive enough that it should happen once, well,
and land in the repo. **Re-running** an existing journey should be cheap: "run
`scripts/journeys/expert-loop.mjs`, report the verdict table" is a job for a cheap
model, not a re-derivation of the whole flow. That split (Sonnet writes it once, Haiku
re-runs it forever after) is the whole economic point of §4b — never re-brief a
journey that already exists as a script.

## Running one cold

Every journey's header comment carries a **cold-boot recipe**: how to stand up a local
Postgres under `/var/tmp` on a dedicated port/socket, boot the app with dummy external
keys (`STRIPE_SECRET_KEY=[REDACTED_STRIPE_TEST_KEY]`, etc. — journeys are structural by default, see
"Two tracks" below), and invoke the script itself. Read the top of the journey file you
want to run — do not guess the recipe from a different journey or an old memory; each
file is self-contained on purpose (§4b rule 1: "a self-contained driver"). Every
journey in this suite shares the exact same recipe (same sandbox Postgres, same app
port, same dummy keys) — `expert-loop.mjs`'s header is the canonical copy; the other
five journeys' headers say "IDENTICAL to expert-loop.mjs's" rather than repeat it.

## `lib/journey-lib.mjs` — the shared mechanics

Every journey in this suite imports its plumbing from `lib/journey-lib.mjs` rather than
re-deriving it: CLI/env config resolution (`resolveConfig`), the reachability
`preflight` check + boot-recipe printer, a Postgres connection helper (`connectDb`,
`dbOne`, `dbAll`, `resolveUserIdByEmail`), idempotent fixture-upsert helpers for the
shapes every journey reuses (`upsertTrip`, `upsertCollaboratorOwner`, `upsertAdvisor`,
`upsertItem`, `deleteItemsNotIn`), the Playwright launcher (`launchBrowser`,
`executablePath` from `/opt/pw-browsers`, `--no-sandbox`), the `login` pattern
(`page.request.post /api/auth/login`), DOM wait helpers (`waitVisible`, `notVisible`),
and the step-runner (`createStepRunner` → `runStep` + `printReport`, the verdict-table
collector + JSON/table/summary report + screenshot-on-FAIL + exit code). **Extend this
module, don't fork it** — if a new journey needs a fixture shape none of the existing
helpers cover, add a narrowly-scoped helper here (or, if it's genuinely one journey's
own domain object — e.g. J3's `provider_services` fixture row, J4's
`ready_made_purchases` seed — write it directly in that journey file; not everything
belongs in the shared lib).

The scripts themselves **check reachability and fail fast with the recipe printed** —
they never try to boot Postgres or the app for you. That keeps a run deterministic: it
either proves something real happened against a real server, or it tells you exactly
what to stand up first.

```
node scripts/journeys/expert-loop.mjs \
  --base-url http://localhost:5601 \
  --db-url "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg"
```

Flags (all optional — defaults live in each script's CONFIG block, and mirror the
sandbox the script was authored against):

- `--base-url` — the running app's URL (env: `JOURNEY_BASE_URL`)
- `--db-url` — the Postgres connection string (env: `DATABASE_URL`)
- `--out` — screenshot output directory (env: `JOURNEY_OUT_DIR`; default
  `./journey-out`, gitignored — screenshots are written **only for failing steps**,
  per the report contract below)
- `--headed` — launch the browser visibly (debugging only)
- `--skip-external` — skip any step marked `external: true` (see below); reports
  verdict `EXTERNAL` for those steps instead of running them

## Idempotent fixtures

Every journey seeds its own fixtures with a fixed, journey-prefixed id scheme (e.g.
`jrny-` for `expert-loop.mjs`) so it can never collide with another journey's fixtures,
hand-seeded dev data, or leftover history in a long-lived sandbox DB. Seeding is a
**reset-and-seed**, not a bare insert-if-absent: a routing/state-machine journey's
fixtures get mutated by the journey itself (routing states advance, notes get written,
cart rows get projected), so a second run must return every fixture row to its known
baseline before driving the flow again — otherwise "run it twice" silently tests two
different starting conditions. Read the `resetAndSeedFixtures()` function (or
equivalent) at the top of any journey before adding one of your own; copy its shape,
don't invent a new one.

Pick a new prefix per journey and never reuse another journey's ids, even for "the
same trip" — cross-journey coupling makes both journeys' resets fight each other.
Prefixes taken so far: `jrny-` (expert-loop), `jrny2-` (plan-lifecycle), `jrny3-`
(workstation-build), `jrny4-` (store-lifecycle), `jrny5-` (traveler-comms), `jrny6-`
(partner-gate).

A journey whose fixture has no caller-supplied id (e.g. `POST /api/expert/ready-made`
mints its own trip id server-side — J3 and J4's authored builds) can't upsert-by-id;
its reset step instead **deletes by a stable marker** (author id + a fixed title, e.g.
`"Journey: Workstation Build"`) before calling the real creation endpoint fresh every
run — still idempotent (a second run finds nothing to delete on a clean re-run of the
SAME marker, or cleans up the prior run's row before minting a new one), just not an
upsert. See `workstation-build.mjs`'s or `store-lifecycle.mjs`'s
`resetAndSeedFixtures()` for the exact shape.

## The report contract

Every journey prints, in order:

1. A JSON verdict object:
   ```json
   { "journey": "<name>", "steps": [{ "n": 1, "action": "...", "ui": "...", "db": "...", "verdict": "PASS" }], "failures": [...] }
   ```
2. A human-readable table (`#  Verdict  Action`, with the `ui`/`db`/`note`/
   `screenshot` proof lines indented under each row).
3. A one-line summary count (`N steps: X PASS, Y KNOWN_DEFECT, Z EXTERNAL, F FAIL`).

This is the **entire** payload that should ever reach Fable (§4b rule 2): a per-step
verdict table, ≤40 lines, screenshots referenced by filename and attached only for
FAILs. Nobody should be pasting a raw Playwright trace or console log into a triage —
if the table isn't enough to decide PASS/FAIL/KNOWN_DEFECT, the step's `ui`/`db` proof
strings need to say more, not the transcript.

**Verdicts, and what each one means for triage:**

- `PASS` — both the UI and DB assertions held.
- `FAIL` — something broke that wasn't expected to. Screenshot written. Triage per
  §4b rule 3: UI-only failures → a cheap model fixes directly; anything touching
  §14/§15 surfaces (payments, routing writes, projections, approvals) → Fable reads
  the failing step + the fix hunks, nothing more.
- `KNOWN_DEFECT` — the step reproduced a **documented, already-known** bug on
  purpose, and confirmed it still reproduces exactly the expected way (see
  `expert-loop.mjs` Step 3 for the canonical shape: the step itself decides PASS vs
  KNOWN_DEFECT vs FAIL by inspecting the actual response, so it self-upgrades to PASS
  the moment the underlying fix lands — no script edit required). This keeps a
  journey **green on a clean checkout** instead of permanently red on a bug everyone
  already tracks elsewhere. A `KNOWN_DEFECT` verdict does not fail the overall run
  (exit code); a `FAIL` does.
- `EXTERNAL` — the step was skipped because it needs a real external service and
  `--skip-external` was passed. See below.

**DB-proof is mandatory for every mutation step** (§4b rule 5) — a screenshot alone
never counts as PASS. Every step that changes state pairs a UI assertion (a selector
became visible, a page rendered certain text, an API call returned a certain body)
with a direct SQL query against the same row the UI claims changed. If a step can't
produce both, it isn't the shape of thing this harness should assert — either narrow
it to a real observable, or split it into two steps.

## The EXTERNAL-step marking convention

Two tracks exist (§4b rule 4): **the sandbox** (this directory's normal target) runs
everything structural — roles, routing, projections, approvals — against dummy
external keys (`STRIPE_SECRET_KEY=[REDACTED_STRIPE_TEST_KEY]`, `AMADEUS_API_KEY=x`, etc.), full site,
zero real outbound calls. **The Replit dev tester** owns anything that genuinely needs
a real external service: a live Stripe test-mode confirm via the connector, a real
Maps render, a real AI completion.

A step that needs a real key is written normally but passed `{ external: true }` in
its `runStep(...)` options:

```js
await runStep(
  "Confirm the Stripe PaymentIntent (real test-mode charge)",
  async () => { /* ... */ },
  { page, external: true },
);
```

`runStep` understands the flag: with `--skip-external` (the sandbox's normal mode for
a journey that has such a step), it reports verdict `EXTERNAL` and never executes the
step body — never faked, never silently skipped without saying so in the table (§13:
a journey must never pretend an untested step passed). Without `--skip-external` (the
Replit dev tester's mode, running against real keys), the step runs for real like any
other. `expert-loop.mjs` has zero `EXTERNAL` steps today — everything in that loop is
structural — but the machinery lives in the shared `runStep` helper so the next
journey that needs one doesn't reinvent it.

## Adding a new journey

1. Copy the shape of an existing journey (header comment: cold-boot recipe — say
   "IDENTICAL to expert-loop.mjs's" if it really is, don't repeat it verbatim — known
   defects if any, external-step note; CONFIG via `resolveConfig()`; fixture ids +
   `resetAndSeedFixtures()`; import `runStep`/`waitVisible`/`dbOne`/etc. from
   `lib/journey-lib.mjs` rather than reimplementing them; numbered steps; call
   `printReport(journeyName)` at the end for the JSON + table + summary report).
2. Pick a fixture id prefix nobody else uses (see the list above).
3. Every mutation step: UI assertion + DB assertion, both returned as human-readable
   strings in the step's `{ ui, db }` result — these strings ARE the report, so write
   them for a reader who has never seen the code.
4. If a step reproduces a documented bug on purpose, give it the KNOWN_DEFECT shape
   from `expert-loop.mjs` Step 3 (self-detecting, not a hardcoded "expect failure") so
   it stops being KNOWN_DEFECT automatically the moment the bug is fixed.
5. If a step needs a real external service, mark it `{ external: true }`.
6. Add the journey to `run-all.mjs`'s `JOURNEYS` array (`{ name, file }`) and to the
   table + prefix list in this README.
7. Prove the whole thing green (or green-with-only-known-defects) against a live
   booted server before committing — a journey that has never actually passed is not
   a journey, it's an untested guess about selectors. Re-run it a second time in place
   (no DB reset in between) to prove the reset-and-seed is actually idempotent, not
   just "worked once on a clean DB."
