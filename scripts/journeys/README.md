# Journeys

Permanent, self-contained repo harnesses for the multi-role browser flows that matter
most, per `docs/EXECUTION_MAP.md` §4b ("Testing protocol — Fable-minimized"). Read §4b
first — it is the spec this directory implements.

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
keys (`STRIPE_SECRET_KEY=sk_test_x`, etc. — journeys are structural by default, see
"Two tracks" below), and invoke the script itself. Read the top of the journey file you
want to run — do not guess the recipe from a different journey or an old memory; each
file is self-contained on purpose (§4b rule 1: "a self-contained driver").

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

Pick a new prefix per journey (`jrny-` is taken by `expert-loop.mjs`) and never reuse
another journey's ids, even for "the same trip" — cross-journey coupling makes both
journeys' resets fight each other.

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
external keys (`STRIPE_SECRET_KEY=sk_test_x`, `AMADEUS_API_KEY=x`, etc.), full site,
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

1. Copy the shape of an existing journey (header comment: cold-boot recipe, known
   defects if any, external-step note; CONFIG block; fixture ids + reset-and-seed;
   `runStep`/`waitVisible`/`dbOne` helpers; numbered steps; JSON + table report).
2. Pick a fixture id prefix nobody else uses.
3. Every mutation step: UI assertion + DB assertion, both returned as human-readable
   strings in the step's `{ ui, db }` result — these strings ARE the report, so write
   them for a reader who has never seen the code.
4. If a step reproduces a documented bug on purpose, give it the KNOWN_DEFECT shape
   from `expert-loop.mjs` Step 3 (self-detecting, not a hardcoded "expect failure") so
   it stops being KNOWN_DEFECT automatically the moment the bug is fixed.
5. If a step needs a real external service, mark it `{ external: true }`.
6. Prove the whole thing green (or green-with-only-known-defects) against a live
   booted server before committing — a journey that has never actually passed is not
   a journey, it's an untested guess about selectors.
