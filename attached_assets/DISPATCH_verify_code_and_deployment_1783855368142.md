# DISPATCH — Verify code + deployment reflect the merged fixes (READ-ONLY)

**Why:** five PRs merged to `main` (#141 fee-config guard, #142 CTA, #143/#145 CLAUDE.md, #144 coordination-fee). But **merged ≠ deployed.** The two 🔴 money bugs (world-writable fee-config, $0-budget coordination fee) are only *actually* closed once the **deployed** app runs the new code. This pass confirms three separate layers — workspace code, DB migration state, and the live deployed app — and says plainly whether the fixes are live in prod or still pending a redeploy.
**Type:** Read-only. Change nothing. The one behavioral write-attempt (fee-config POST) uses a payload that's rejected before any write. Don't mutate prod fee config.

---

## Layer 1 — Workspace code is current + fixes present (grep)

On `main` at HEAD `8f19fabf`:
1. **Fee-config guard (#141):** the blanket `/api/admin/*` `requireAdmin` guard is present and registered before the admin routes; `POST /api/admin/fee-config` is covered. `file:line`.
2. **Coordination fee (#144):** the fee handler reads budget from `state.budget` (not `state.totalEstimatedCost`); the unconditional optimize-credit subtraction is gone. `file:line`.
3. **CLAUDE.md (#143/#145):** §2 shows admin default-deny, §7 shows the coordination-fee resolution, §13 marks the trust-claims cluster as known defects.
Report present/absent per item.

## Layer 2 — Migration 109 state (workspace DB AND flag deployed DB)

1. **Workspace DB:** confirm 109 applied — chain-integrity test green, CHECK constraint (canonical 7) present on `provider_services` + `service_templates`, rows normalized. `file:line` / query output.
2. **Deployed DB:** you likely **can't** query the deployed Neon DB from here (DATABASE_URL points at the local `helium` instance). State that explicitly, and flag that **109-on-deployed depends on the redeploy running `runMigrations`** — it's a Leon/deploy verification, not confirmable from the workspace. This gates Phase 2 writing `delivery_method` against the deployed environment.

## Layer 3 — The deployed app (the real close-out)

Hit the **deployed URL** (not localhost, not the workspace). The deployed app is https, so session cookies work.

1. **Is the deploy running the new code at all?** Check the deployed app's version/health or a known-changed behavior. Report: **deploy reflects `main` / deploy is stale (old code).** If stale → the two money fixes are NOT live in prod yet; a redeploy is required.
2. **Fee-config hole (only meaningful if deploy is current):** with a **non-admin** authed session against the deployed URL, `POST /api/admin/fee-config` with a **no-op / revert payload** (rejected before any write). Expect **403**. Also GET fee-config + lead-routing-logs → 403. Confirm an **admin** session still gets 200 (not over-blocked). Report status codes.
3. **Coordination fee (only meaningful if deploy is current):** exercise the coordination-fee path for a $25,000 wedding against the deployed app (or run journey-7:91 against the deployed URL). Expect **`feeCents: 200000`, `rule: "percent"`**. Report the actual number returned.

---

## Deliverable

A three-layer table: `layer | check | result | file:line or status code`. Then a one-line bottom line answering exactly:
- **Are the two money bugs live-fixed in production, or still pending a redeploy?**
- **Is 109 confirmed on the deployed DB, or does it need the redeploy verified by Leon?**

If the deploy is stale, say so plainly and state the action: **redeploy `main`, then re-run Layer 3.** Note whether you can trigger the redeploy or whether Leon must click Deploy in the Replit UI.

---

## What NOT to do

- Don't mutate prod fee config — the POST test uses a no-op/revert payload and should 403 before any write anyway.
- Don't treat "merged on main" or "works in the workspace" as "live in prod" — Layer 3 against the deployed URL is the only thing that proves the money bugs are actually closed for users.
- Don't apply migrations or redeploy silently — report the state; if a redeploy is needed, say so and name who triggers it.
- Read-only otherwise.

---

## Context (not part of this task)

Once Layer 3 confirms the deploy is current: the two 🔴 money bugs are truly closed, and the same redeploy that fixes them is what applies 109 to the deployed DB — which is the gate for Phase 2 writing delivery values against deployed. So a single redeploy + this verification clears all three (fee-config live, coordination fee live, 109 applied). Until then, treat prod as still carrying both bugs.
