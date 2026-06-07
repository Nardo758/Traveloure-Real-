# Concierge Model — Claude Code Planning Prompt

Paste the block below into Claude Code. It produces a plan, not code.

---

```
# TASK: Plan the Concierge model implementation (PLAN ONLY — write no code)

Produce an implementation plan for Traveloure's Concierge monetization layer. This is a
planning task: audit the codebase, decide reuse-vs-build, and output a phased plan I will
review before any execution. Do NOT modify code.

## Inputs (read all before planning)
- `Traveloure_Business_Plan_v1_3.md` — §2.3 (Concierge revenue model), §4.7 ($9 tier
  economics), §4.8 (fee architecture; AI Concierge fee). Authoritative for the model.
- `LAUNCH_BLOCKER_FIX_BRIEF.md` — Phase 3 (mount AI Concierge router + paywall) is a
  PREREQUISITE for the AI Concierge tier; do not re-plan it, depend on it.
- The gap audit report — use its Feature Gaps AND its **Fee Audit** section as current-state
  evidence/file refs.
- `AUDIT_COVERAGE_TRACKER.md` — shows which audit gaps are owned vs orphaned; keep your plan
  consistent with it and call out anything you'd move between owners.
- `TRAVELOURE_COMMERCE_WIREFRAMES_v4.md` (the AI-plan + human-planner dual-button pattern),
  `UNIFIED_PLANNING_FLOW_SPEC_v2.md`, `EXPERT_WORKFLOW_SPEC.md`, `EXPERT_WORKSPACE_SPEC.md`.
- The codebase (TS/React/Express/Drizzle, wouter, Shadcn/Tailwind).

## The model you are planning toward
A pay-per-use **Concierge** layer ABOVE Local/Travel Experts. One request surface; the user
states a need; the platform routes to the right delivery tier, shows price before commit,
collects via existing rails:
1. **AI Concierge** — the AI Optimization Engine, paywalled, per-task fee (≈100% margin).
2. **Expert Concierge** — a Local/Travel Expert delivers; commission split. Offered as a
   ONE-TAP ESCALATION woven into every AI deliverable (not a separate menu).
3. **Full / Done-for-You** — expert + providers + logistics; event-priced.
Plus an optional **$9/mo concierge tier** that DISCOUNTS but NEVER GATES the concierge
(included priority/retained expert + capped AI allowance, overage at pay-per-use).

Design rules the plan must honor:
- Concierge is à-la-carte for everyone; the $9 tier never blocks a non-member.
- AI feeds Expert: escalation is an upsell on AI output, always shown, but only *bookable*
  when an in-market expert is available; otherwise "request expert review" (queued).
- All fees resolve from admin config (§4.8), never constants.
- Free AI preview (guest hook) → paid AI → expert escalation is the funnel.

## Method
1. **Fee-plumbing dependency audit (do this FIRST).** The model assumes the §4.8 admin fee
   resolver and Admin Fee console exist. The audit's Fee section shows they largely do not
   (6 of 9 fees hard-coded or missing; no override granularity global→market→tier→entity; no
   effective-dating; no audit trail; no reset-to-default; AI Concierge fee router unmounted).
   Audit the actual fee resolver + console against §4.8 and the audit. For each Concierge tier,
   state exactly what fee plumbing must exist before it can bill correctly, and treat the
   missing resolver/console capabilities as a SEQUENCED DEPENDENCY in the plan — the concierge
   plan must not assume a fee system that isn't built. Specifically check: is there a single
   resolver every charge path reads from; can the AI Concierge fee, expert commission split,
   and the $9-tier allowance/overage all resolve through it; and what is the minimum fee
   plumbing required for Phase A vs Phase B.
2. **Reuse inventory.** Grep/read for everything the Concierge can reuse and cite file:line:
   AI optimize endpoint (`server/routes.ts` ~1275) and `optimization.routes.ts`, expert
   services / 5-tier structure, expert matching + chat, credit system, the wedding-cart
   dual-button UI, PlanCard, optimization-preview (free heuristic). State what's reusable
   as-is, what needs adaptation, and what's missing.
3. **New primitives.** Identify what genuinely must be built: the unified Concierge request
   surface (entry point + intent capture), the routing logic (intent → AI/Expert/Full),
   the upfront-pricing display, the escalation UX, expert availability gating, and the $9
   tier mechanics (subscription, included-allowance counter, overage billing).
4. **Sequence + cut line.** Order the work, mark hard dependencies (Launch-Blocker Phase 3
   AND the fee-plumbing dependency from step 1), and propose an explicit MVP for first market
   vs Phase-2.

## Output — a phased plan, evidence-dense
- **Fee-plumbing dependency:** what must exist before each tier can bill, current state
  (file:line), and where it sequences relative to the concierge phases.
- **Reuse map:** component/endpoint | reuse-as-is / adapt / missing | file:line | note.
- **Build list:** each new primitive — what, why it's new, files it touches, effort (S/M/L),
  dependencies.
- **Phasing:** Phase A (launch: AI Concierge pay-per-use + expert escalation, à la carte) →
  Phase B (the $9 tier: subscription + allowance + overage) → Phase C (Full/Done-for-You).
  Justify the cut: what's the minimum that makes the Concierge real for the first market?
- **Open decisions** for me to resolve before execution (e.g., intent capture = free-text vs
  structured; escalation trigger = always vs stakes-based; credits vs card for concierge spend).

## What NOT to do
- No code, no migrations — a plan only.
- Do not propose rebuilding anything the reuse inventory shows already exists.
- Do not plan the $9 tier as a gate to the concierge.
- Do not introduce fee constants; everything routes through the §4.8 config/resolver — and do
  not assume that resolver exists without the step-1 dependency check.
- Do not re-plan Launch-Blocker Phase 3 — treat it as a dependency.
- Keep it grounded in file:line evidence, not assumptions.
```
