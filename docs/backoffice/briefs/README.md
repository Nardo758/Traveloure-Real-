# Backoffice Program — Execution Briefs

These briefs execute the `docs/backoffice/IMPLEMENTATION_MAP.md` work items in **fresh, cheap-model
sessions** (Haiku/Sonnet). The safety is the fences, not the executor.

**Before executing ANY brief:**
1. Read `CLAUDE.md` (repo root) first — it overrides everything, including these briefs. Conflict → STOP and report.
2. Read the root `docs/briefs/README.md` — the canonical execution protocol (the four standard gates, the
   local DB/server setup, the money rules, the stop-condition conventions). It applies verbatim here.
3. Work on the session's designated branch (currently `claude/sync-local-repo-2j7ghv`). Never push elsewhere.
4. Do ONLY what the brief scopes. Out-of-scope discoveries → log in the final report, never fix inline.

**The four standard gates before every commit** (report the numbers):
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` == baseline measured before your first edit (delta 0).
- `npm run build`
- `node scripts/check-money-endpoints.cjs`
- `node scripts/check-unmounted-routers.cjs`
- \+ the brief's own behavioral gate (must fail on the old code).

**Markers:** **⛔ DECISION** = do not execute until the named decision is made. **HUMAN READ** = after gates
pass, push and STOP for the decision-maker's diff read before merge (money rule).

## Wave 0 index (independent of roadmap approval; each is a filed defect in FOLLOWUPS.md)

| Brief | Item | Tier | Marker | Filed as |
|-------|------|------|--------|----------|
| W0.1 | EA routing leak — EAs boot into the expert console | Sonnet | — | M1 |
| W0.2 | Knowledge-nugget API is role-ungated | Sonnet | — | M2 |
| W0.3 | event_planner 403 dead-end on Store Listings | Haiku | — | M3 |
| W0.4 | Tip endpoint credits earnings with no charge | Sonnet | **HUMAN READ** | L1 |
| W0.5 | Broken generated share links | Haiku | — | K1 |
| W0.6 | Content Studio Instagram publish one-line fix | Haiku | **⛔ DECISION: Tier-2** | L3 |
| W0.7 | Review-response moderation blind spot | Sonnet | — | M4 |
| W0.8 | Fabricated dashboard/analytics data sweep | Haiku | — | K5/L7 |

Suggested order: W0.5 → W0.3 → W0.8 (independent Haiku, build momentum) · W0.1 → W0.2 → W0.7 (Sonnet) ·
W0.4 (money, human-read) · W0.6 last, only if Tier-2 is decided "activate".
