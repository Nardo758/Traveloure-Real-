# Launch Blocker Unblock Checklist

Status of operational/external setup blockers preventing feature launches.

---

## Blocker 1: EXP-OVR E2E Staging Test

**Status:** Code shipped, awaiting staging verification.

**What:** Per-expert commission override (users.commission_override_expert_share_percent) is implemented in code (commits 7d1c250, 5b13915, 79b335f). Resolves as Tier-3 branch in commission.ts before category fallback.

**What needs to happen (staging/operational):**
1. Admin sets a test expert's `commission_override_expert_share_percent` to a non-default value (e.g., 80 instead of 75)
2. Traveler books a service from that expert
3. Booking settles and calculate expert payout using the 80% override (not the category default)
4. Verify in the database that:
   - `expert_share_percent` on the expert's row is correctly honored
   - Payout amount reflects 80% of the service price
   - No "inherited" category rate was used

**Gates unblocking:** §6.9 "20% vs 25%" recruitment outreach (can tell newly onboarded beta experts they get 80% while standard is 75%)

---

## Blocker 2: LB-P1 Verified Domain Smoke Test

**Status:** Code shipped (ca26a73), awaiting Resend infrastructure setup.

**What:** Password reset + email verification flows now send transactional emails via Resend instead of Nodemailer/SMTP.

**Infrastructure requirements:**
1. `RESEND_API_KEY` environment variable must be set (Resend project API key)
2. A sending domain must be configured and verified in the Resend dashboard
   - Example: `no-reply@traveloure.com` or similar
   - Verification is a DNS CNAME record; can take 5–30 minutes
3. EMAIL_FROM environment variable set to `"Traveloure <no-reply@verified-domain.com>"`
   - Must match the verified domain

**Smoke test (once setup is done):**
1. Request a password reset from the login page
2. Check that an email arrives at the test inbox (with reset token link)
3. Click the link and confirm reset token is valid
4. Verify same flow works for email verification on signup

**Code location:** `server/services/email.service.ts` (lines 1–210)
- Checks RESEND_API_KEY and EMAIL_FROM at startup
- Falls back to silent log + no-op if missing (acceptable for staging, not for production)

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
| EXP-OVR staging test | Ops/QA | Awaiting staging access | 30 min |
| LB-P1 Resend setup | DevOps/Ops | Awaiting domain config | 1–2 hours (includes DNS propagation) |
| CON-B data gate | Time | Code ready, need 4 weeks | 28 days (automated collection) |

---

## Next Steps

1. **Immediate:** Trigger staging E2E test for EXP-OVR (recruitment outreach waiting on sign-off)
2. **Immediate:** Configure Resend sending domain and set environment variables
3. **Immediate:** Deploy migration 025 + ai-cost-tracker to production to start collecting data
4. **In 4 weeks:** Query cost stats and begin CON-B Phase 0 planning
