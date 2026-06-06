# LB-P1 Resend Email Delivery — Smoke Test & Verification

## Status: OPERATIONAL SETUP COMPLETE ✅

**Domain verified:** Yes (as of 2026-06-06)  
**Environment variables set:** RESEND_API_KEY + EMAIL_FROM configured  
**Code shipped:** commit `ca26a73` (password reset flow) + `e87f61f` (email verification)

---

## What Works Now

Two transactional email flows migrated from Nodemailer/SMTP to Resend:

### 1. Password Reset (LB-P1 core)
- User requests reset from `/auth/login`
- System generates token via `generatePasswordResetToken()` (migration 021)
- Email sent via `sendPasswordResetEmail()` (email.service.ts:117)
- Link: `https://{APP_BASE_URL}/password-reset?token={token}`

### 2. Email Verification (LB-P1 extension)
- User signs up
- System generates verification token (migration 022)
- Email sent via `sendEmailVerificationEmail()` (email.service.ts:200)
- Link: `https://{APP_BASE_URL}/verify-email?token={token}`
- Verified users can proceed; unverified users get re-send prompts

---

## Smoke Test Checklist

Run these tests in **production or staging** (whichever has the verified domain):

### Test 1: Password Reset Email Delivery
1. Navigate to `/auth/login`
2. Click "Forgot password?"
3. Enter test email address (e.g., `qa@your-company.com`)
4. Check inbox for email from `noreply@{verified-domain}`
5. **Expected:** Email arrives within 5 seconds
6. **Subject:** "Password Reset Request"
7. **Body:** Contains reset link with token
8. Click link → verify `/password-reset` page loads
9. Enter new password → confirm password change succeeded

### Test 2: Email Verification on Signup
1. Navigate to signup page
2. Enter test email + password
3. Submit signup form
4. Check inbox for verification email from `noreply@{verified-domain}`
5. **Expected:** Email arrives within 5 seconds
6. **Subject:** "Verify Your Email"
7. **Body:** Contains verification link with token
8. Click link → verify `/verify-email` page loads + shows success
9. Confirm email marked as verified in DB: `SELECT emailVerified FROM users WHERE email = ...`

### Test 3: Resend Dashboard Verification
1. Log in to Resend dashboard
2. Navigate to **Emails** → **Logs**
3. Filter by your test email address
4. **Expected:** 2 emails listed (password reset + verification)
5. Click each → inspect delivery status, timestamps, headers
6. Confirm no bounces or failures

### Test 4: Fallback Behavior (RESEND_API_KEY unset)
1. Temporarily unset `RESEND_API_KEY` in deployment
2. Trigger password reset request
3. **Expected:** No error; console logs `[email] RESEND_API_KEY not set — password reset email NOT sent to {email}`
4. Email is NOT sent (graceful degradation)
5. Restore `RESEND_API_KEY` → test again → email now sent

---

## Pass / Fail Criteria

| Test | Pass | Fail |
|------|------|------|
| Password reset email arrives | Within 5s | Not received or bounces |
| Email content contains valid reset link | Link is clickable + token present | Link malformed or missing token |
| Password reset completes after clicking link | New password works on next login | Old password still works or reset link invalid |
| Email verification email arrives | Within 5s | Not received or bounces |
| Email verification completes | `emailVerified` is NOT NULL | Still NULL after clicking link |
| Fallback (no API key) is graceful | Console warns, no error thrown | App crashes or user sees error |

---

## If Tests Fail

### Email doesn't arrive
- [ ] Check Resend dashboard → inspect bounce/failure reason
- [ ] Verify domain CNAME record is still in DNS (AWS Route53, GoDaddy, etc.)
- [ ] Confirm `EMAIL_FROM` matches verified domain exactly
- [ ] Check spam folder (less likely with Resend, but possible)
- [ ] Resend support: check IP reputation + rate limits

### Email arrives but reset/verify link doesn't work
- [ ] Check `password_reset_tokens` and `email_verification_tokens` tables exist (migrations 021 + 022)
- [ ] Verify token was inserted: `SELECT COUNT(*) FROM password_reset_tokens WHERE created_at > NOW() - INTERVAL '1 minute'`
- [ ] Confirm `APP_BASE_URL` env var is correct (should match the verified domain)
- [ ] Check browser console for client-side errors when clicking link

### Resend returns 401/403 errors
- [ ] Regenerate RESEND_API_KEY in Resend dashboard
- [ ] Confirm key has "Send Email" permission
- [ ] Restart the app to pick up new key

---

## Acceptance Sign-Off

Once all smoke tests pass:
- [ ] QA/Staging team approves email delivery
- [ ] Resend logs show >95% success rate for password resets
- [ ] Resend logs show >95% success rate for email verifications
- [ ] Link click-through rate >80% (optional, for UX confidence)

---

## Go-Live Readiness

✅ **Ready for production** once:
1. This smoke test suite passes in staging
2. Resend domain fully verified (CNAME propagated + no failures)
3. At least one test of each flow (password reset + verification) completed successfully
4. Team confirms email delivery is business-critical and SLA is acceptable (~5s delivery, 99%+ uptime)

**Timeline:** ~15–20 min (one-time verification)
