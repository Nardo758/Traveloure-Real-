# Agent Brief — E2E Journey-1 Local Verification (Steps 0–4)

**Lane:** `verify/e2e-journey-1-local`
**Branch:** one branch, one agent. Do not open a second session against this branch.
**Goal:** Achieve a green `e2e-journey-1` run from the local app against the Replit-hosted Postgres, with the auth and router surfaces verified behaviorally — not by render, not by `tsc`.

**Standing rule for this brief:** landed code on `main` is ground truth. Where any spec, doc, or this brief conflicts with the code, the code wins and you report the divergence rather than "fixing" the code to match the doc.

---

## PHASE 0 — READ-ONLY AUDIT (no writes, no installs, no migrations)

Produce a report only. Every claim carries a `file:line` citation. Every item gets **PASS / FAIL / SUSPECT**. `SUSPECT` means "the code reads as if it works but I have no behavioral evidence."

### 0.1 Database target
- Locate where `DATABASE_URL` is read (`file:line`).
- Report whether `sslmode=require` is enforced or appended anywhere for the local case.
- Report, without connecting: what would connect if `DATABASE_URL` is set from `.env` vs. from shell.
- Identify every code path that **deletes** rows on startup. Cite the purge implementation.
  - Confirm the purge is **pattern-based** (matching `%@traveloure.test`), not a hardcoded email list. Quote the predicate.
  - Report the exact blast radius: which tables, which predicate, cascade behavior.

### 0.2 Self-seed
- Locate the startup seed (`file:line`). Report the exact `ENVIRONMENT` condition that gates it.
- Report the expected post-seed row counts:
  - `users` matching `%@traveloure.test` — state the exact number the seed creates.
  - accounts per market, per specialty.
- Report whether the seed is idempotent across restarts, with evidence (upsert? delete-then-insert? `ON CONFLICT`?).

### 0.3 Stripe mode
- Locate where Stripe is initialized (`file:line`).
- Report whether anything fails loudly on a live key, or whether a live key silently proceeds. If it proceeds silently, that is a **FAIL** and must be listed as a required fix in Phase 1.
- Identify every point in journey-1 that touches Stripe.

### 0.4 Router mount surface
- Enumerate every router/route module that exists under `server/`.
- Cross-reference against the mount site(s). Produce a table: `router file → mounted? → mount path → file:line of the mount`.
- Any router that exists but is not mounted is a **FAIL**, not a SUSPECT. This bug class has shipped before.

### 0.5 Authorization surface
- Cite the current `getTripRole` implementation. Confirm the squash `7172737` fix is present in the landed code on `main` — not in a branch, not in a diff. Quote the assignment check.
- Cite the provider/services `PATCH` and `DELETE` handlers. Report exactly which ownership check runs, or state that none does. Expected result: **FAIL** — this is a known-open IDOR. Do not fix it in this lane. Document it.
- Cite the suggest-token write path. Report whether a token holder can write directly. Expected: **FAIL**, known-open. Document only.

### 0.6 Playwright config
- Cite the Playwright config. Report:
  - the variable name used for the target URL (do not assume `BASE_URL`)
  - current default timeouts (test, expect, navigation, action)
  - whether traces/video are enabled and under what condition
  - whether the config assumes a webServer it starts itself, or expects an already-running target
- Cite the `e2e-journey-1` spec file. List its steps in order, and for each step name the selector or endpoint it depends on.

### 0.7 Migration state
- Run the chain-integrity test **read-only** if it does not write. If it writes, do not run it; report that instead.
- Report the highest migration number present in `migration-files.ts` and whether the registry ordering is contiguous.

---

## 🛑 HARD STOP

Post the Phase 0 report. **Do not proceed.** Do not run the app. Do not run the suite. Do not install. Do not edit a single file.

Wait for explicit approval, which will name which Phase 0 findings are in-scope to fix in this lane and which are documented-and-deferred.

---

## PHASE 1 — ENVIRONMENT GATE (only after approval)

Nothing in this phase touches application code.

1. Confirm the connected database is disposable. Run:
   ```
   psql "$DATABASE_URL" -c "select current_database(), inet_server_addr(), inet_server_port();"
   ```
   Report the output. If this is a shared or prod-adjacent database, **stop and report** — do not proceed to seed.

2. Confirm `ENVIRONMENT` is not `PROD`.
3. Confirm the Stripe key begins `sk_test_`. If not, stop.
4. Start the app locally. Capture the startup log. Confirm the purge ran and the seed ran.
5. **Verify the seed by query, not by log line:**
   ```
   psql "$DATABASE_URL" -c "select count(*) from users where email like '%@traveloure.test';"
   ```
   Expected count: the exact number established in Phase 0 §0.2. A mismatch in either direction is a FAIL — report the delta and the actual emails present.

6. Restart the app once. Re-run the count. It must be **identical**. A growing count means the purge is not matching what the seed creates.

**Gate:** counts exact and stable across restart. Stop on failure.

---

## PHASE 2 — STATIC GATES

1. `tsc --noEmit`. Compare against `typecheck-baseline.txt`. New errors are a FAIL. Do not regenerate the baseline.
2. Migration chain-integrity test.
3. Grep gates:
   - No numeric fee/commission/margin literals introduced. `fee_bands` is the only source.
   - No transport-mode taxonomy outside `transport-modes.ts`.
   - No PlanCard renderer outside `components/plancard/`.

**Say it out loud in the report:** passing this phase is not evidence that anything works. `tsc --noEmit` clean is explicitly not a pass condition.

---

## PHASE 3 — API-LEVEL SMOKE (before any browser)

The two bug classes that have cost the most here — silently unmounted routers and authorization gaps — do not appear in a render. Hit the endpoints.

### 3.1 Router liveness
For every router in the Phase 0 §0.4 table, issue one request to a real endpoint on it (a list or fetch, not a health stub). Record status code per router.
- Any `404` on a route the table says is mounted → the router is not actually reachable. FAIL.
- Report as a table: `route → expected status → actual status → PASS/FAIL`.

### 3.2 Authorization negative tests
Using two seeded expert accounts from different markets:

| Test | Actor | Action | Expected |
|---|---|---|---|
| A | Expert A | `PATCH` a trip Expert A **is** assigned to | 2xx |
| B | Expert A | `PATCH` a trip assigned to Expert B | **403** |
| C | Expert A | `PATCH` a trip with no expert assigned | **403** |
| D | Expert A | `PATCH`/`DELETE` a service owned by a different provider | 403 expected; **known-open, record actual** |

Test B is the regression test for `7172737`. If B returns 2xx, stop everything and report — the fix did not land, or was reverted by a merge.

Test D is expected to fail. Record the actual response verbatim. **Do not fix it in this lane.**

**Gate:** A, B, C pass. D documented.

---

## PHASE 4 — RUN `e2e-journey-1`

The spec has never run green. It will fail. The objective is to reach green, iterating on the *spec and the app* only where the app is genuinely wrong.

1. Raise Playwright timeouts before the first run. Local app → remote Postgres over WAN adds latency to every query; the default timeouts were tuned for CI-adjacent latency. Set test timeout to 60s, navigation/action to 30s. This is a config change to the local run, not a permanent commit, unless the CI run in a later lane proves it is needed there too.

2. First run: `--headed`, one worker, no retries. Watch it die. Report the exact step, selector, and network call that failed.

3. Iterate. For each failure, before changing anything, state which of these it is:
   - **(a) spec is wrong** — selector drift, stale assumption about copy or route
   - **(b) app is wrong** — the behavior under test is broken
   - **(c) environment is wrong** — seed data, keys, timeouts

   Fix (a) and (c) freely. For **(b), stop and report before touching app code.** A behavioral bug found by journey-1 may be in scope for a different lane and must not be patched opportunistically here.

4. Once passing, re-run three times: `--trace on`, default workers, zero retries. Three consecutive clean runs. A single flake is not green — report it with the trace.

5. Final: re-run Phase 1 §5 count and Phase 2. The suite must leave the database in the same shape it found it.

---

## WHAT NOT TO DO

- Do **not** run against any database you have not confirmed is disposable in Phase 1 §1.
- Do **not** fix the provider/services IDOR (§0.5). Different lane. Document only.
- Do **not** fix the suggest-token write gap. Document only.
- Do **not** regenerate `typecheck-baseline.txt`.
- Do **not** add `retries` to the Playwright config to make a flake pass.
- Do **not** add `test.skip`, `.only`, `if:false`, or conditional guards to any journey-1 step to reach green.
- Do **not** edit application code to satisfy a spec assumption. The spec bends to the code, not the reverse.
- Do **not** merge `main` into this branch mid-lane. Ghost migration entries (047, 050, 058) came from blind main-merges. If you need `main`, rebase deliberately and re-run the chain-integrity test immediately after.
- Do **not** touch migrations. This lane adds none.
- Do **not** introduce fee, commission, or margin literals.
- Do **not** touch `docs/planning/` files other than to append the Phase 0 report at the path directed after approval.
- Do **not** investigate or fix the Discover-by-Date canvas iframe failure. That is Lane B in this document. It shares no phases, no branch, and no gate with journey-1.
- Do **not** report "compile-green" or "renders correctly" as evidence of anything.

---

## DELIVERABLES

1. Phase 0 audit report — every item PASS/FAIL/SUSPECT with `file:line`.
2. Phase 3 router table and authorization matrix with actual status codes.
3. Phase 4 failure log: every failure classified (a)/(b)/(c), with what changed.
4. Three consecutive clean journey-1 runs, traces attached.
5. A short list of behavioral bugs found and *not* fixed, each with a proposed lane.

---
---

# Agent Brief — Lane B: Discover-by-Date Canvas Iframe Failure

**Lane:** `investigate/discover-by-date-iframe`
**Branch:** separate branch. Separate agent session. This lane does not touch `verify/e2e-journey-1-local` and does not gate it.
**Status:** Phase 0 only. There is no approved fix scope, because the failure has not been reproduced.

## Why this brief exists

A prior agent session investigated this and returned **"try refreshing and tell me what error appears."** That is not a diagnosis — it hands reproduction back to the human. It also proposed **"the sandbox server needed to warm up after the workflow restarts"** as the explanation. That hypothesis is unfalsifiable and does not account for a *persistent* blank iframe. It is rejected.

Three specific defects in that session, which this brief exists to prevent recurring:

1. **The failing surface was never exercised.** The agent screenshotted the mockup page by direct navigation and concluded it loads. The reported symptom is the **iframe embed on the canvas** failing. An embed fails for reasons a direct visit never encounters: `X-Frame-Options`, CSP `frame-ancestors`, Vite `server.allowedHosts` rejection, cross-origin/port mismatch, or `SameSite` cookies dropped inside the frame. "It renders when I visit it" is render-only verification and is not evidence the embed works.

2. **An unreconciled contradiction.** The session asserted *"the mockup component files don't exist — those canvas iframes are pointing to components that were never created,"* then three steps later asserted *"files exist."* It never identified which claim was wrong or why. Every conclusion downstream of that reversal — including *"registry is fine"* — is unverified.

3. **The load-bearing finding was buried as an aside:** *"No dedicated route exists in the main app."* Discover is one of the three canonical entry points into the Trip flow. Whether Discover-by-Date is intended to exist as a main-app route is a product question that outranks whether a mockup renders.

## PHASE 0 — READ-ONLY. REPORT ONLY.

No refreshing. No restarts. No workflow restarts. No fixes. No file edits. Every answer carries `file:line` or verbatim tool output.

### B.0.1 Reproduce the actual failure
Open the canvas. Open devtools. Report:
- The **verbatim** console error text. Not a summary. Not "an error about the component."
- The **Network tab entry for the iframe request**: full request URL, HTTP status, and the complete response headers.
- If the iframe is blank with **no** console error and a **200** response, state that explicitly. That is a different bug than an error, and the distinction determines everything downstream.

### B.0.2 Header surface
`curl -I` the exact iframe `src` URL — the one copied from the Network tab in B.0.1, not one reconstructed from memory. Report verbatim:
- `X-Frame-Options`
- `Content-Security-Policy` (specifically `frame-ancestors`)
- `Access-Control-Allow-Origin`
- Any `Set-Cookie` and its `SameSite` attribute

### B.0.3 Dev server config
Cite with `file:line` the Vite config values for:
- `server.allowedHosts`
- `server.hmr` (host, port, protocol)
- `server.cors`
- `server.origin`

Report the canvas host/port and the sandbox host/port. State whether they are same-origin. If not, state which of the above would reject the embed.

### B.0.4 Route existence — the product question
State, with `file:line`, whether Discover-by-Date exists as a route in the **main app** router. Binary answer: yes or no.
- If **no**: cite whether any spec in `docs/planning/` calls for one. Quote it. Do not create the route.
- If **yes**: cite the mount site and report whether it is actually reachable (a request, not a render).

Discover is a canonical Trip entry point. If this surface is mockup-only by design, that must be stated explicitly rather than left as an implication.

### B.0.5 Reconcile the contradiction
The prior session claimed the mockup component files did not exist, then that they did.
- Which claim was correct?
- What command or path produced the incorrect claim?
- Paste the grep/ls output that settles it.

Until this is answered, treat the prior session's *"registry is fine"* as **SUSPECT**, and independently verify the auto-discovery registry generation with output, not assertion.

## 🛑 HARD STOP

Post the Phase 0 report. Do not proceed to a fix. Fix scope will be assigned only after the failure is reproduced with a verbatim error or an explicit "blank, 200, no error" finding.

## WHAT NOT TO DO

- Do **not** propose "warm-up," "stale cache," "needs a restart," or "try refreshing" as a diagnosis. If a restart makes it pass, the bug is a race or a startup-order dependency and must be characterized, not dismissed.
- Do **not** restart workflows during Phase 0. Restarting destroys the failing state before it is captured.
- Do **not** substitute direct navigation for the iframe embed. The embed is the failing surface.
- Do **not** report a screenshot of a working page as evidence the reported bug is absent.
- Do **not** create a main-app route for Discover-by-Date. That is a product decision, not a fix.
- Do **not** assert a file's existence or absence without pasting the command output.
- Do **not** touch the main-app router, the migration registry, or anything under `components/plancard/`.
- Do **not** merge, rebase, or branch off `verify/e2e-journey-1-local`.
- Do **not** widen scope to "while I was in here, I also fixed…"

## DELIVERABLES

1. Verbatim console error + Network entry (URL, status, full response headers), or an explicit statement that the frame is blank with a 200 and no error.
2. `curl -I` output for the iframe `src`.
3. Vite config citations with `file:line`, plus a same-origin determination.
4. Binary answer on main-app route existence, with citation.
5. The contradiction from B.0.5 resolved, with command output.
6. A one-line statement of the **actual** failure mode. Not a hypothesis. If Phase 0 does not produce one, say so — an honest "not reproduced" is a valid deliverable and a "probably just needed a refresh" is not.
