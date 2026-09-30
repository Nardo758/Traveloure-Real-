# Handoff — pack session close-out (Sep 30, 2026)

The pack session is retired. The Track A session is now the sole merge driver and Golden Path builder. This file
records the state it inherited, as of the merge of #1189.

## State of `main` (head `2d32b5a`)

| Item | State |
|---|---|
| Track A A0–A5 | Merged. |
| Track A A6 | **HELD** (registry surface, coverage report, Tavily adapter). No code on any branch. Do not build. |
| Track A A7 | Not started. |
| Track A A8 | Design ruled in #1191 (R228, `2026-09-30-a8-travel-time-service`). Not implemented. |
| Track A A9 | Not started. |
| kyoto-slice | Required check. 30 passed, 8 fixme of 38. |
| Migrations | 333 on `main` and deployed. **334 on `main` (#1189), not yet deployed.** |
| Highest R-number | **R229.** |

## PRs merged at close-out

| PR | Title | Merge commit | R |
|---|---|---|---|
| #1190 | No invented AI-task scores; every draft generation writes its cost row | `24a4448` | R227 |
| #1191 | A8: one travel-time service ruled (design only) | `a60ee3a` | R228 |
| #1189 | Affiliate page extraction: Anthropic call, terms gate, product provenance (migration 334) | `2d32b5a` | R229 |

## WIP branches

#1192–#1196 were **closed without merging**, and their branches were kept. Each branch holds the uncommitted
worktree state of the pack session. **Delete them after the founder has reviewed them.**

| PR | Branch |
|---|---|
| #1192 | `wip/slip-funnel-events-doc` |
| #1193 | `wip/golden-path-trips-kyoto-doc` |
| #1194 | `wip/storefront-booking-actions-index` |
| #1195 | `wip/quotefee-index` |
| #1196 | `wip/platform-payment-failed` |

## Operator follow-ups (in order)

1. **Deploy `main` at `2d32b5a` or later.** It carries migration 334. Expect one unstamped `334_*`.
   - **Decline the platform's schema diff** (CLAUDE.md §20).
   - Publish. The boot runner applies 334.
   - Verify `GET /api/health` answers `migrations.current: true` and `migrations.lastApplied` = `334_affiliate_extract_provenance.sql`.
2. **Then revoke `XAI_API_KEY`.** Revoke it only after that deploy is live; before it, production still runs the grok-3 extractor.
3. **Then set `PLACE_FACTS_PLACES_ENABLED=1`.** The Places spine bills per call (LD 57 / R223).

## Ownership

**Track A session** (merges every PR, including Content & Signals'):
- `shared/experience-group.ts`, `shared/landing-*.ts`, `shared/city-events.ts`, `shared/partner-hosts.ts`, `shared/payment-on-record.ts`
- `server/services/trip-pass-line-coverage.service.ts`
- the Kyoto spec and `scripts/report-kyoto-supply.cjs`
- `docs/planning/track-a-rollout.md`
- `docs/DECISIONS.md` at merge

**Content & Signals session:**
- `server/services/trend-engine/*`
- `server/services/ai-generation.service.ts`
- the affiliate scraper
- `docs/planning/briefs/content-sources/*`

## Next for Track A

A8's travel-time service goes first, then A7 and A9. All three are built behind flags. A6 stays held, and R211 still
applies: nothing user-visible goes past the A1 gate until the census passes.
