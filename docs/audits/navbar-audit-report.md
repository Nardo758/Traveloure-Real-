# Navbar Link Audit Report

**Date:** 2026-07-18  
**Scope:** All navbar links in `client/src/components/layout.tsx` audited against `client/src/App.tsx` routes and page components.

---

## Summary

| Category | Count |
|---|---|
| Total links audited | 31 |
| PASS (route exists, correct behaviour) | 29 |
| FAIL — redirect hop (fixed) | 1 |
| FAIL — auth bounce (fixed) | 1 |
| True 404s | 0 |

---

## Full Link Inventory

### Discover

| Label | Href | Auth required | Result |
|---|---|---|---|
| By Location | `/discover` | No | PASS |
| By Date | `/discover?tab=events` | No | PASS |

### Experts & Services

| Label | Href | Auth required | Result |
|---|---|---|---|
| Local Experts | `/experts?role=local_expert` | No | PASS |
| Travel Advisors | `/experts?role=travel_expert` | No | PASS |
| Service Providers | `/discover?tab=services` | No | PASS |

### Experiences (15 slugs, all map to `/experiences/:slug`)

| Label | Href | Result |
|---|---|---|
| Travel Planning | `/experiences/travel` | PASS |
| Romantic Getaways | `/experiences/romance` | PASS |
| Date Night | `/experiences/date-night` | PASS |
| Retreats | `/experiences/retreats` | PASS |
| Birthday Party | `/experiences/birthday` | PASS |
| Wedding | `/experiences/wedding` | PASS |
| Proposal | `/experiences/proposal` | PASS |
| Engagement Party | `/experiences/engagement-party` | PASS |
| Baby Shower | `/experiences/baby-shower` | PASS |
| Anniversary | `/experiences/wedding-anniversaries` | PASS |
| Corporate Events | `/experiences/corporate-events` | PASS |
| Corporate Retreats | `/experiences/corporate` | PASS |
| Boys Trip | `/experiences/boys-trip` | PASS |
| Girls Trip | `/experiences/girls-trip` | PASS |
| Reunions | `/experiences/reunions` | PASS |

### Planning Tools

| Label | Old Href | Fixed Href | Auth required | Result |
|---|---|---|---|---|
| AI Plan Planner | `/ai-assistant` | `/ai-assistant` | **Yes** | **FIXED** — see §Defects |
| Visa Help | `/visa-help` | `/visa-help` | No | PASS |
| Live Intel | `/spontaneous` | `/discover` | No | **FIXED** — see §Defects |
| Today's Deals | `/deals` | `/deals` | No | PASS |

### Ways to Earn / Contact

| Label | Href | Result |
|---|---|---|
| Ways to earn | `/earn` | PASS |
| Contact | `/contact` | PASS |

### Auth Nav (shown only to logged-in users)

| Label | Href | Route guard | Result |
|---|---|---|---|
| My Plans | `/dashboard` | `ProtectedRoute` (any auth) | PASS |
| Discover | `/discover` | None | PASS |
| Concierge | `/concierge` | None | PASS |
| Expert Chat | `/chat` | `ProtectedRoute` (any auth) | PASS — only rendered when logged in |

### Cart

| Label | Href | Result |
|---|---|---|
| Cart | `/cart` | PASS |

### Join as Partner (guest state only)

| Label | Href | Result |
|---|---|---|
| Trip Planner | `/become-expert?type=travel_expert` | PASS |
| Local Expert | `/become-expert?type=local_expert` | PASS |
| Event Planner | `/become-expert?type=event_planner` | PASS |
| Service Provider | `/become-provider` | PASS |
| Executive Assistant | `/become-expert?type=executive_assistant` | PASS |

---

## Defects Found & Fixed

### Defect 1 — "Live Intel" extra redirect hop
- **Before:** `href="/spontaneous"` → App.tsx route `<Redirect to="/discover" />` → one extra round-trip
- **Fix:** Changed href directly to `/discover` in `navItems` (layout.tsx)
- **Status:** ✅ Fixed

### Defect 2 — "AI Plan Planner" silently bounced unauthenticated users
- **Before:** Clicking "AI Plan Planner" while logged out sent the user to `/ai-assistant`, which `ProtectedRoute` handled with `window.location.replace("/")` — no explanation, no recovery path
- **Fix (navbar click path):** Added `requiresAuth: true` to the navItem. `DesktopDropdown` and mobile menu now render a `<button>` instead of a `<Link>` for `requiresAuth` items when no session exists. The button calls `openSignInModal({ returnTo: "/ai-assistant" })`.
- **Fix (direct URL path):** `ProtectedRoute` now writes `sessionStorage.setItem("traveloure_return_to", dest)` before redirecting to `/`, so that any protected route hit directly (typed URL, shared link, browser back) is also recoverable.
- **Fix (post-login redirect):** `SignInModal.handleSubmit` reads `returnTo` prop first, then `sessionStorage.getItem("traveloure_return_to")` as fallback, then `getRoleHomePath(role)`. The sessionStorage key is cleared after reading.
- **Status:** ✅ Fixed

---

## QA Scenarios

| # | Scenario | Result |
|---|---|---|
| 1 | All navbar links resolve (no 404) | PASS — all 31 links reach a valid route |
| 2 | Logged-out user clicks auth-required link in navbar | PASS — sign-in modal opens with `returnTo`; after login lands on intended page |
| 3 | Logged-out user navigates directly to `/ai-assistant` | PASS — `returnTo` saved to sessionStorage; after login lands on `/ai-assistant` |
| 4 | Role-gated routes deny wrong-role users | PASS — "Access Denied" rendered for traveller on `/expert/dashboard`, `/provider/dashboard`, `/admin/dashboard` |
| 5 | Mobile menu closes on link tap | PASS — `setIsMobileMenuOpen(false)` on every link and auth-intercept button |
| 6 | Mobile menu closes on auth-required button tap | PASS — same `setIsMobileMenuOpen(false)` before `openSignInModal()` |
| 7 | Rapid/double-click on same link | PASS — wouter `<Link>` is idempotent; no navigation loops |
| 8 | Browser back/forward after navigation | PASS — SPA routing; history entries are correct |
| 9 | Query-string nav links activate correct tabs | PASS — `/discover?tab=events`, `/experts?role=local_expert` etc. consumed by page components |
| 10 | Post-login returnTo redirect (both paths) | PASS — navbar-click path uses `returnTo` prop; direct-URL path uses sessionStorage fallback |

---

## Files Changed

| File | Change |
|---|---|
| `client/src/components/layout.tsx` | Fixed Live Intel href; added `requiresAuth`; auth-intercept buttons in desktop + mobile |
| `client/src/App.tsx` | `ProtectedRoute` saves destination to `sessionStorage` before unauthenticated redirect |
| `client/src/contexts/SignInModalContext.tsx` | Added `returnTo?: string` to `SignInModalOptions`; passes it to `<SignInModal>` |
| `client/src/components/SignInModal.tsx` | Accepts `returnTo` prop; reads `sessionStorage` fallback after login |

---

## Known Limitations

- **Replit OAuth path** (`/api/login` → `/api/auth/callback`): The `returnTo` value is not forwarded to the OAuth callback because the redirect target is the Replit OIDC provider. Restoring destination after Replit OAuth login requires query-param forwarding on the server's callback route. Tracked as follow-up **#701**.
- **Terms-gate redirect** (`/accept-terms`): `ProtectedRoute` also does `window.location.href = "/accept-terms"` for users who haven't accepted T&C. This path does not yet capture `returnTo`. Out of scope for this task.
