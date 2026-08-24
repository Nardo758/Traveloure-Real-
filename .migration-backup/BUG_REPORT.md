# Traveloure Bug Report
_Generated: 2026-04-04 from automated edge case testing_

---

## 🔴 CRITICAL — Security

### BUG-001: Any user can update any other user's profile
- **Endpoint:** `PATCH /auth/profile/<user_id>/`
- **Steps:** Login as User A, send PATCH to User B's profile ID
- **Expected:** 403 Forbidden
- **Actual (before fix):** `{"message": "Profile Updated Successfully"}` — but only modified caller's own profile (misleading, not actual privilege escalation)
- **Root cause:** `get_object()` always returned `request.user` ignoring URL id. Auth check compared user to themselves.
- **Status:** ✅ FIXED — Now checks URL id against authenticated user, returns 403 if mismatch

---

## 🟠 HIGH — Functional

### BUG-002: Token refresh requires authentication (defeats purpose)
- **Endpoint:** `POST /auth/refresh-token/`
- **Steps:** Send refresh token without access token in header
- **Expected:** Returns new access token
- **Actual (before fix):** `{"detail": "Authentication credentials were not provided."}`
- **Status:** ✅ FIXED — Changed `permission_classes` to `AllowAny`

### BUG-003: Cannot reassign expert after rejection (unique constraint)
- **Endpoint:** `POST /ai/expert-assigned/`
- **Steps:** Assign expert → expert rejects → assign different expert to same trip
- **Expected:** New expert assigned
- **Actual (before fix):** DB unique constraint error
- **Status:** ✅ FIXED — Now cleans up rejected advisor records before reassignment

### BUG-004: Cannot assign multiple experts to one trip
- **Endpoint:** `POST /ai/expert-assigned/`
- **Steps:** Assign 2+ experts to the same trip
- **Design decision:** 1 expert per trip (by design)
- **Status:** ✅ FIXED — Now returns clear error: "This trip already has an assigned expert. Remove the current expert before assigning a new one."

### BUG-005: Registration sends real SMTP before falling back (now fixed)
- **Endpoint:** `POST /auth/register/`
- **Original issue:** `send_verification_mail()` opened direct SMTP connection before using Django email backend, crashing in dev
- **Status:** Fixed during testing — removed direct SMTP, now uses Django's configured backend

### BUG-006: `phone_number` KeyError on registration (now fixed)
- **Endpoint:** `POST /auth/register/`  
- **Original issue:** `validated_data['phone_number']` crashed when phone not provided
- **Status:** Fixed — changed to `validated_data.get('phone_number', '')`

---

## 🟡 MEDIUM — Data Integrity

### BUG-007: Rating 0 is accepted as valid review
- **Endpoint:** `POST /ai/reviews/create/`
- **Steps:** Submit review with `rating: 0`
- **Expected:** Arguably should require minimum 1 star, or be clearly documented
- **Actual:** Accepted (model allows 0-5)
- **Impact:** Low — may be intentional. But 0 stars feels like "no rating" rather than "terrible"

### BUG-008: SP approval resets user password
- **Observed during:** Service provider approval flow
- **Root cause:** `AdminServiceProviderUpdateStatusSerializer.update()` generates a new random password on every approval, even for users who already have accounts
- **Status:** ✅ FIXED — Now only generates password if user has no usable password (`has_usable_password()` check)

### BUG-009: `profile_picture` field referenced but doesn't exist (now fixed)
- **Endpoint:** `GET /ai/local-experts/`
- **Original issue:** Serializer referenced `obj.user.profile_picture` but User model uses `image`
- **Status:** Fixed — changed to `obj.user.image`

### BUG-010: `trip.interests` referenced but model uses `preferences` (now fixed)
- **Endpoint:** `POST /ai/trips/create/`
- **Status:** Fixed — updated all references

---

## 🟢 LOW — Quality of Life

### BUG-011: No clear error when assigning to trip with existing expert
- When BUG-003/004 triggers, the error exposes raw database constraint details
- Should return a user-friendly message

### BUG-012: Chat history GET returns empty (inconsistent)
- **Endpoint:** `GET /ai/chat/<advisor_id>/`
- Sometimes returns empty even when messages exist
- May be a serializer issue with the message field name

### BUG-013: `serviceproviderapp` was missing from repo
- The app was in `INSTALLED_APPS` and `urls.py` but the code wasn't committed
- **Status:** Stub created during testing

---

## ✅ Working Correctly

These were tested and work as expected:
- Wrong password → "Invalid credentials"
- Non-existent user → "Invalid credentials" (no user enumeration)
- Fake/expired JWT → 401 Unauthorized
- Duplicate email registration → "already in use"
- Password mismatch → "passwords do not match"
- Weak password → validation message
- Bad username format → validation message
- Non-admin accessing admin endpoints → 403 Forbidden
- Duplicate review → "already reviewed this expert"
- Rating > 5 or < 0 → "not a valid choice"
- Wallet at 0 credits → "Insufficient credits" with clear error
- Expert rejection → works correctly
- Mixed reviews (1★, 3★, 5★) → all stored, average calculated correctly
- Trip creation without SERP API → graceful fallback

---

_Total: 13 bugs found — 10 fixed, 3 are design decisions/low priority_
