# Launch Blocker Unblock Checklist

Status of operational/external setup blockers preventing feature launches.

---

## Blocker 1: EXP-OVR E2E Staging Test

**Status:** Code shipped, ready for staging E2E test.

**What:** Per-expert commission override (users.commission_override_expert_share_percent) is implemented in code (commits 7d1c250, 5b13915, 79b335f). Resolves as Tier-3 branch in commission.ts before category fallback. When an expert has an override set, their booking settlement uses that rate instead of the category default.

**Test plan:** See `docs/planning/exp-ovr-staging-test-plan.md`

**Test scenario:**
1. Admin sets a test expert's `commission_override_expert_share_percent` to 80 (80% expert share, 20% platform)
2. Traveler books a $100 service from that expert
3. Booking settles: system calls `resolveCommissionRates(expertId: testExpertId)` and honors the 80% override
4. Verify in the database:
   - Expert payout: `expert_payouts.amount = 80.00` (80% of $100)
   - Platform fee: `bookings.platform_fee = 20.00` (20% of $100)
   - Control expert (no override): gets 75% split (default from category/constants)
5. Access audit logs show commission override was honored

**Gates unblocking:** §6.9 "20% vs 25%" recruitment outreach — can tell newly onboarded beta experts they get 80% while standard is 75%

**Timeline:** ~20–30 min (staging E2E test with DB verification)

---

## Blocker 2: LB-P1 Verified Domain Smoke Test

**Status:** ✅ **DOMAIN VERIFIED & READY FOR TESTING** (as of 2026-06-06)

**What:** Password reset + email verification flows now send transactional emails via Resend instead of Nodemailer/SMTP.

**Infrastructure setup (COMPLETE):**
1. ✅ `RESEND_API_KEY` environment variable set (Resend project API key)
2. ✅ Sending domain configured and verified in Resend dashboard (DNS CNAME propagated)
3. ✅ `EMAIL_FROM` environment variable set to `"Traveloure <no-reply@{verified-domain}>"`

**Smoke test plan:** See `docs/planning/lb-p1-resend-smoke-test.md`

**What needs to happen (QA/staging):**
1. Run smoke test suite: password reset email delivery + verification email delivery
2. Confirm both arrive within 5 seconds, links are valid, and flows complete end-to-end
3. Check Resend dashboard logs for zero bounces/failures
4. Sign off for production deployment

**Code location:** `server/services/email.service.ts` (lines 1–210)
- Checks RESEND_API_KEY and EMAIL_FROM at startup
- Falls back to silent log + no-op if missing (acceptable for staging, not for production)

**Timeline:** ~15–20 min (one-time QA verification)

---

## Blocker 3: CON-B $9 Tier Data Gate

**Status:** ✅ **Infrastructure ready.** Code-side implementation awaits data accumulation.

**What:** $9/month power-user tier needs ≥4 weeks of AI cost data to set the included-plan cap per §4.7 economics.

**Code ready (shipped this session):**
- Migration 025: `ai_cost_tracking` table with source_type, cost, tokens_in/out
- Service `ai-cost-tracker.ts`: `trackAICost()` + `getCostStats(sourceType, hoursAgo)`
- Instrumentation: `itinerary-optimizer.ts` logs cost for every `ai_optimization` request

**Data gate (operational, time-dependent):**
```sql
SELECT MIN(created_at), MAX(created_at), COUNT(*) FROM ai_cost_tracking
WHERE source_type = 'ai_optimization';
```
Wait until `COUNT(*) > 0` AND `MAX(created_at) - MIN(created_at) >= 4 weeks`

**Once data is available:**
1. Query cost percentiles per §4.7 brief:
   ```sql
   SELECT
     PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY cost) AS median,
     PERCENTILE_CONT(0.9)  WITHIN GROUP (ORDER BY cost) AS p90,
     PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY cost) AS p99,
     AVG(cost) AS mean
   FROM ai_cost_tracking
   WHERE created_at > NOW() - INTERVAL '4 weeks'
     AND source_type = 'ai_optimization';
   ```
2. Back-derive cap such that `median × cap ≤ ~$1.20` per §4.7
3. Proceed with CON-B Phase 0 planning

**Gates unblocking:** CON-B brief execution (pricing the $9 tier), Phase B feature launches

---

## Summary

| Blocker | Owner | Status | Est. Time |
|---------|-------|--------|-----------|
| EXP-OVR staging E2E test | QA/Staging | Test plan ready | 20–30 min |
| LB-P1 Resend smoke test | QA/Staging | Domain verified ✅, smoke test plan ready | 15–20 min |
| CON-B data gate | Time | Code ready ✅, 12 Anthropic call sites instrumented ✅ | 28 days (automated collection) |

---

## Next Steps (Ready to Execute)

1. **Immediate:** QA runs EXP-OVR staging E2E test per `exp-ovr-staging-test-plan.md` (20–30 min)
   - Admin/staging team sets expert override, books service, verifies DB settlement
   - Once passed: §6.9 recruitment outreach can proceed
   
2. **Immediate:** QA runs LB-P1 Resend smoke tests per `lb-p1-resend-smoke-test.md` (15–20 min)
   - Test password reset email delivery + email verification flow
   - Once passed: LB-P1 complete, ready for production deployment
   
3. **Ongoing (in parallel):** CON-B data collection
   - Migration 025 + ai-cost-tracker.ts already deployed
   - All 12 Anthropic call sites instrumented across 6 files
   - Automated cost logging in `ai_cost_tracking` table (fire-and-forget)
   - Check accumulation weekly: `SELECT COUNT(*) FROM ai_cost_tracking WHERE created_at > NOW() - INTERVAL '1 week'`
   
4. **In 4 weeks (on schedule):** Query cost stats and begin CON-B Phase 0 planning
   ```sql
   SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cost) AS median,
          PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY cost) AS p90
   FROM ai_cost_tracking
   WHERE created_at > NOW() - INTERVAL '4 weeks' AND source_type = 'ai_optimization';
   ```
   Use median to back-derive $9-tier included-plan cap per §4.7 economics
