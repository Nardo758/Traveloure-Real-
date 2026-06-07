# EXP-OVR Staging E2E Test Plan

## Objective
Verify per-expert commission override (users.commission_override_expert_share_percent) is correctly honored during booking settlement. Unblocks §6.9 "20% vs 25%" recruitment outreach.

## Test Scenario

**Setup:**
1. Create test expert with `commission_override_expert_share_percent = 80` (80% expert share, 20% platform)
2. Create test service (price: $100) associated with the expert
3. Traveler books the service for $100

**Verification:**
1. **Override is read during settlement** — resolver calls `resolveCommissionRates(expertId: testExpertId)` and returns 80% expert share
2. **Payout calculates correctly** — expert_earnings = $100 × 0.80 = $80, platform_fee = $20
3. **Database reflects split** — `expert_payouts` row shows $80, platform revenue logs show $20
4. **Default expert (no override) still gets 75%** — create control expert with no override, verify 75% split

## Test Steps

### Step 1: Set Expert Override (Admin)
```sql
UPDATE users 
SET commission_override_expert_share_percent = 80 
WHERE id = '<test-expert-id>' AND role = 'expert';
```

### Step 2: Create Service
POST `/api/provider/services` (as test expert)
```json
{
  "name": "Test Expert Service",
  "description": "For commission override testing",
  "categoryId": "<service-category-uuid>",
  "price": 100,
  "duration": 60
}
```
Capture `serviceId`.

### Step 3: Book Service (as Traveler)
POST `/api/bookings` or `/api/payments/create-intent`
```json
{
  "serviceId": "<serviceId>",
  "tripId": "<trip-id>",
  "travelers": 1
}
```
Capture `bookingId`.

### Step 4: Settle Booking
Trigger payment settlement (via webhook or admin action if available):
- Verify Stripe PaymentIntent succeeds
- Check that settlement logic calls `resolveCommissionRates(...)`

### Step 5: Verify Settlement in DB
```sql
-- Check expert payout
SELECT expert_share_percent, amount FROM expert_payouts 
WHERE booking_id = '<bookingId>';
-- Expected: expert_share_percent = 80, amount = 80.00

-- Check platform fee
SELECT platform_fee FROM bookings 
WHERE id = '<bookingId>';
-- Expected: platform_fee = 20.00

-- Check commission resolver was called correctly
SELECT * FROM access_audit_logs 
WHERE action = 'commission_override_honored' 
  AND meta->>'expertId' = '<test-expert-id>';
-- Expected: one row per booking settlement
```

### Step 6: Control — Default Expert (No Override)
Repeat Steps 2–5 with a different expert who has NO `commission_override_expert_share_percent`:
```sql
UPDATE users 
SET commission_override_expert_share_percent = NULL 
WHERE id = '<control-expert-id>' AND role = 'expert';
```
Expected: expert_share_percent = 75, amount = 75.00 (default rate from category/constants)

## Pass Criteria

✅ Override expert: 80% split verified in DB  
✅ Control expert: 75% split verified in DB  
✅ No errors in settlement path logs  
✅ Resolver calls logged with correct expertise ID + override value  

---

## Failure Scenarios & Debugging

| Issue | Debug |
|-------|-------|
| Override not applied (expert gets 75% instead of 80%) | Check commission.ts Tier-3 branch; verify `commission_override_expert_share_percent` column queried |
| Payout amount wrong | Check booking.service.ts settlement: expert_earnings = price × expertShareRate |
| Resolver not called | Add console.log before `resolveCommissionRates()` call in settlement |
| DB column NULL after update | Confirm migration 020 ran; check `DESCRIBE users` for column presence |

---

## Acceptance Sign-Off

Once tests pass:
- [ ] Admin signs off on test results
- [ ] Logging added to audit trail (access_audit_logs entry per settlement)
- [ ] §6.9 recruitment outreach approved to proceed

---

## Timeline Estimate

**Staging environment:** 15–20 min (if DB seeded, PaymentIntent webhook working)  
**Debugging (if needed):** +30–45 min
