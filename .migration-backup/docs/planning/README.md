# Planning Docs

Living planning artifacts produced 2026-06-05. Read in this order if you're picking up cold.

## Source of truth
- **[business-plan-v1.3.md](business-plan-v1.3.md)** — Traveloure Business Plan v1.3 (Jan 2025). §4.8 is authoritative for all fees. §2.3 is authoritative for the Concierge model.

## Audit
- **[gap-audit.md](gap-audit.md)** — Business Plan ↔ Codebase gap audit. Four sections: Feature Gaps, Fee Audit, Design Gaps, Easy Add-Ons. Every claim is grounded in file:line.
- **[audit-coverage-tracker.md](audit-coverage-tracker.md)** — Owner + status for every gap. Read this to see what's claimed vs orphaned.

## Execution-ready briefs
- **[launch-blocker-fix-brief.md](launch-blocker-fix-brief.md)** — The four pre-launch must-fixes (P0 security, billing integrity, AI Concierge router mount, affiliate rate + verification badge, mechanical cleanups). Owner prefix: `LB-Pn`.
- **[concierge-phase-a-brief.md](concierge-phase-a-brief.md)** — Phase A of the Concierge workstream. Mounts the unified Concierge entry surface, AI Concierge pay-per-use, Expert escalation. Depends on LB-P3 being merged. Owner prefix: `CON-A.Pn`.

## Planning
- **[concierge-plan.md](concierge-plan.md)** — The full Concierge implementation plan (revised). Fee-plumbing dependency audit + reuse map + new primitives + Phase A/B/C cut. Phase A is execution-ready (see brief above); Phase B and C are plan-only.
- **[concierge-planning-prompt.md](concierge-planning-prompt.md)** — The prompt used to produce the Concierge plan. Reference, not source-of-truth.

## What's where
- **Pre-launch** work → `launch-blocker-fix-brief.md`.
- **First-market Concierge MVP** → `concierge-phase-a-brief.md`.
- **What's Phase 2 / deferred / unowned** → `audit-coverage-tracker.md` (look for `P2`, `—`, `Deferred`).
- **Why the fee system is partial** and what's safe to ship without → `gap-audit.md` §2 + `concierge-plan.md` §1.

## Live gates (don't violate)
1. **No new hard-coded fee/rate/price literal.** All rates resolve from `optimization_fees`, `booking_fee_configs`, `affiliate_partners`, or the §4.8 defaults table as fallback.
2. **No new routes in `server/routes.ts`.** New endpoints go in `server/routes/*.routes.ts`.
3. **Per-expert commission override must land before beta outreach with the §6.9 "20% vs 25%" language goes out.** Hard gate on recruitment, currently unbuilt. See `audit-coverage-tracker.md` (CON / owned, BLOCKS BETA OUTREACH).
