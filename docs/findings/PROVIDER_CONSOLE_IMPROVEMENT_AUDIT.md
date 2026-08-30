# Provider Console — User-Simulation Test + Improvement Audit

**As of:** Aug 10, 2026, branch `claude/sync-local-repo-2j7ghv`, local build (`npm run build` → `dist/index.cjs`) against a fresh local Postgres (migrations + seed run at server startup).

**Method:** Registered `provaudit1@traveloure.test`, promoted to `role='service_provider'` (the only stored provider role — `shared/roles.ts`; the bare string `"provider"` is never a stored role, confirmed against `client/src/lib/role-utils.ts` + task #172's fix). Logged in via `POST /api/auth/login`, then walked every route reachable from `client/src/components/provider/provider-sidebar.tsx`'s `menuGroups` (the provider console's nine-module IA — Today · Calendar · Inbox · Workstation · Catalog · Customers · Performance · Money · Settings) plus the un-navved but routed `/provider/resources`, `/provider/services/new`, `?tab=` deep links. Screenshots at `/tmp/claude-0/-home-user-Traveloure-Real-/2a80a447-afc7-58aa-868c-7d1728e43c3e/scratchpad/prov-*.png`, each visually reviewed. Playwright script: `scratch_provider_audit.spec.ts` (repo root, not committed — scratch tooling only).

**Pages walked: 13** (9 nav modules + 2 `?tab=` deep links + `/provider/services/new` + `/provider/resources`). **0 broken, 0 dead** (per CLAUDE.md §9, checked for the 200-HTML-catch-all signature — every route rendered page-specific content matching its nav label, not a generic shell). No console errors beyond a sandboxed-environment cert warning (`ERR_CERT_AUTHORITY_INVALID`, environmental, unrelated to the app).

---

## 1. Per-page results

| Page | Route | Status | Aesthetics | Workflow | Notes |
|---|---|---|---|---|---|
| Today | `/provider/dashboard` | Works | Clean | Honest gating (0-of-5 open-business checklist, "Add slot" disabled until a service exists) | Good baseline — matches expert Workstation's action-first hub pattern |
| Calendar | `/provider/calendar` | Works | Clean | Empty month grid, legend present | No issues found |
| Inbox | `/provider/inbox` | Works | Clean | Honest empty state ("No bookings waiting") | No issues found |
| Workstation | `/provider/workstation` | Works | Clean | Property card **is** interactive (real create dialog, `openPropertyCreate`) — the provider-sidebar.tsx comment block (lines 36-40) describing it as "a later phase … an honest non-interactive card, not a dead button" is **stale relative to code** | Doc/code drift, not a page defect — flagged for whoever owns that comment |
| Catalog | `/provider/services` | Works | Clean, dense 30-category grid | "Claim your handle in Settings →" correctly **links** rather than duplicating the handle-claim UI | Good pattern |
| Catalog → New Service | `/provider/services/new` | Works | Long single-column form, no crush/clip found | Multi-section form (category catalog, custom fields, photos, booking terms) — see §3 workflow item | Shared `ServiceForm` (role-aware) — correctly the "one builder" per CLAUDE.md |
| Customers | `/provider/customers` | Works | Clean | Honest empty state, correctly scoped copy ("derived from your real bookings") | No issues found |
| Performance (Overview) | `/provider/performance` | Works | Minor: `Progress` track (`bg-secondary`) renders as a solid mid-gray bar at value=0, which at a glance reads as "there's data" rather than "empty" — see `client/src/pages/provider/performance.tsx:172` | — | Cosmetic only; the underlying math (`month.revenue / (totalRevenue \|\| 1)`) is correct |
| Performance (Analytics) | `/provider/performance?tab=analytics` | Works | Clean | Honest empty states throughout (cross-sell, share links) | No issues found |
| Money | `/provider/money` | Works | **Revenue Share Breakdown bar shows "Platform 70% / You 30%" on a $0/$0 account** — see §2 Finding A | — | Page title says "Earnings" (`client/src/pages/provider/earnings.tsx:180,196`) while sidebar nav and page header say "Money" — stale rename |
| Settings | `/provider/settings` | Works | Clean, long single-scroll page | **"Change Password" and "Enable Two-Factor Auth" buttons have no `onClick`** (`client/src/pages/provider/settings.tsx:429-434`) — silently do nothing | See §2 Finding B / §4 |
| Settings → Profile tab | `/provider/settings?tab=profile` | Works | **Avatar shows hardcoded "GE"** regardless of the logged-in user's actual name | **All 7 Edit/Manage buttons on the page are dead** (no `onClick` anywhere in the file) | See §2 Finding C — the single worst finding |
| Resources | `/provider/resources` | Works | Clean | Entirely static/fake content — "Read Now" guide links, "Contract Template PDF - 245 KB" downloads, video thumbnails — none backed by real files or content system | Matches the sidebar's own comment (`provider-sidebar.tsx:100-104`): intentionally un-navved, "static sample-guide copy with no backing content system" — a known limitation, not a new find, but the FAQ text ("*your exact rate … always shown on your Earnings page*") now points at a page that itself shows a fabricated fallback rate (Finding A) |

**Category counts:**
- Broken/dead: **0**
- Aesthetic issues: **3** (Performance zero-state bar contrast; Money page title/nav-label drift; Workstation stale doc comment)
- Workflow friction: **3 findings, 9 dead controls** (Profile's 7 buttons; Settings' 2 security buttons; Resources' fake content)
- Duplicate functions: **1** (Stripe Connect re-implemented in `settings.tsx` instead of reusing `StripeConnectCard`)
- Logic issues: **2** (hardcoded 30% commission fallback; hardcoded "GE" avatar)
- Copy-from-expert opportunities: **2** (honest-disabled security buttons; real profile-edit mutations)

---

## 2. Findings with file:line evidence

### Finding A — Hardcoded 30% commission literal, displayed as a confident "Platform 70% / You 30%" split on a zero-data account
`client/src/pages/provider/earnings.tsx:165` and `:173`:
```
164  const revenueBreakdown = useMemo(() => {
165    if (!bookings) return { gross: 0, ..., effectiveRate: 0.30 };
...
173    const effectiveRate = gross > 0 ? share / gross : 0.30;
```
Rendered at `:373-379` as a filled progress bar plus `Platform {Math.round((1 - effectiveRate) * 100)}%` / `You {Math.round(effectiveRate * 100)}%` — i.e. **"Platform 70% / You 30%"** shown to a provider with `$0` gross and `$0` share (confirmed on screen: `prov-money.png`). This is a client-side rate literal (`0.30`) never derived from `fee_bands`, in the spirit CLAUDE.md §8 exists to prevent ("no fee/commission/margin literals anywhere outside fee_bands/config — grep-gated"). It doesn't hit a money decision (§14 scope), but it **fabricates a specific, confident-looking split for a provider who has no bookings yet** — worse than an honest "no data yet" state, and inconsistent with the Resources page's own FAQ claim that "your exact rate … are always shown … on your Earnings page."

### Finding B — Two dead security buttons in Settings, no honest-disabled treatment
`client/src/pages/provider/settings.tsx:428-435`:
```
428  <div className="flex gap-2">
429    <Button variant="outline" data-testid="button-change-password">
430      <Shield className="w-4 h-4 mr-2" /> Change Password
431    </Button>
432    <Button variant="outline" data-testid="button-two-factor">
433      Enable Two-Factor Auth
434    </Button>
435  </div>
```
Neither button has an `onClick`. They render fully enabled (not `disabled`, no tooltip, no explanation) — a provider clicking either gets silent nothing. Compare to the **expert** console's identical feature, which is honestly gated (see §3 copy-from-expert).

### Finding C — Provider Profile page: hardcoded avatar + all 7 edit controls are dead (the single worst finding)
`client/src/pages/provider/profile.tsx:65-67`:
```
65  <Avatar className="w-24 h-24">
66    <AvatarFallback className="bg-primary/10 text-primary text-2xl">GE</AvatarFallback>
67  </Avatar>
```
`"GE"` is a literal string — **every** provider sees the same two letters regardless of name (our test account "Prov Audit" shows "GE"; the sidebar two lines away correctly computes "PA" via `client/src/components/provider/provider-sidebar.tsx:113-126`, proving the correct logic already exists elsewhere in the codebase and simply wasn't reused here).

Worse: every actionable control on the page is non-functional. `grep -n onClick client/src/pages/provider/profile.tsx` returns **zero matches** for any of:
- `button-edit-profile` (:116)
- `button-change-logo` (:72)
- `button-edit-about` (:129)
- `button-manage-photos` (:142)
- `button-edit-capacity` (:168)
- `button-edit-contact` (:203)
- `button-edit-amenities` (:231)

This is the Profile tab of Settings (`/provider/settings?tab=profile`) — the page a new provider is most likely to land on first, and its own header ("`Edit Profile`") actively invites an action that does nothing. The file's own §13-honest comment two lines above the fake avatar (`:38-40`, "no fabricated trust stats… show honest empties rather than invented numbers") makes this doubly ironic: the rating/review counts *are* honest, but the avatar sitting right next to them is fabricated.

### Finding D — Stripe Connect onboarding duplicated (settings.tsx vs. the shared component)
Two independent implementations of the identical feature:
- `client/src/components/stripe-connect-card.tsx:26-40` — the shared `<StripeConnectCard />`, used by `client/src/pages/provider/earnings.tsx:20` (Money page).
- `client/src/pages/provider/settings.tsx:61-101` (`VerificationPayoutsSection`) — hand-rolls its own `useQuery(["/api/stripe/connect/status"])`, `onboardMutation` (`POST /api/stripe/connect/onboard`), and `dashboardMutation` (`GET /api/stripe/connect/dashboard`) — the exact same three endpoints, badge logic, and copy, reimplemented from scratch.

Same job, done twice, in different files, with no shared source of truth — a change to one (copy, error handling, a new status state) won't propagate to the other.

---

## 3. Top 10 improvements, ranked by impact/effort

| # | Improvement | Impact | Effort | Evidence |
|---|---|---|---|---|
| 1 | Wire the 7 dead buttons on Profile (or gate them honestly like Expert Settings does) | High — page is the default profile-edit surface and currently does nothing | Low–Med | `provider/profile.tsx:66,72,116,129,142,168,203,231` |
| 2 | Fix the hardcoded "GE" avatar to compute real initials (copy `provider-sidebar.tsx`'s logic) | High — visible on every provider's own profile, undermines trust | Trivial | `provider/profile.tsx:66` vs `provider/provider-sidebar.tsx:113-126` |
| 3 | Replace the `0.30` fallback with an honest "no bookings yet" state instead of a fabricated 70/30 split | Med-High — misleading money-adjacent UI, §8 spirit violation | Low | `provider/earnings.tsx:165,173` |
| 4 | Give "Change Password"/"Enable Two-Factor Auth" the honest-disabled treatment (disabled + `UnavailableNote` + tooltip) | Med — currently silent no-ops that look live | Trivial | `provider/settings.tsx:429-434` vs `expert/settings.tsx:556-630` |
| 5 | Collapse `settings.tsx`'s hand-rolled Stripe Connect block into `<StripeConnectCard />` | Med — removes a maintenance fork, guarantees the two surfaces never drift | Low–Med | `provider/settings.tsx:61-101` vs `components/stripe-connect-card.tsx` |
| 6 | Rename Earnings page's internal title to "Money" (or drop the redundant title, since the sidebar already labels it) | Low | Trivial | `provider/earnings.tsx:180,196` |
| 7 | Update the stale Workstation "Property" comment in `provider-sidebar.tsx:36-40` (property rung is live, not gated) | Low — doc/code drift only | Trivial | `provider-sidebar.tsx:36-40` vs `workstation.tsx:660-667` |
| 8 | Give the zero-value `Progress` bars on Performance a lighter/empty visual treatment so a fresh account doesn't look like it has data | Low | Trivial | `provider/performance.tsx:172` |
| 9 | Either back Resources' guides/downloads with real content or drop the specific fake file sizes/durations (e.g. "245 KB", "5:30") that imply real assets | Low-Med — currently invites a click that goes nowhere | Med (needs real content, not just code) | `provider/resources.tsx` |
| 10 | Multi-section New Service form (`/provider/services/new`) is one very long scroll (photos, booking terms, requirements, content-affinity tags all stacked) — consider the same tabbed/stepped pattern the expert ServiceForm may already use, to reduce scroll fatigue on first listing | Low-Med (workflow friction, not broken) | Med | `pages/provider/service-form.tsx` (shared `ServiceForm`) |

---

## 4. Copy-from-expert list

1. **Honest-disabled security controls.** Expert Settings (`client/src/pages/expert/settings.tsx:556-630`) disables "Change Password" and "2FA Enable" with `disabled`, a `title` tooltip explaining *why* ("no self-service change-password endpoint … use Forgot password"), and an `<UnavailableNote>` component. Provider Settings' identical two buttons (`provider/settings.tsx:429-434`) are fully enabled and silently do nothing — directly copyable pattern, same feature gap, same fix already built once.
2. **Real profile-edit mutations.** Expert Profile (`client/src/pages/expert/profile.tsx`) wires `saveRoleMutation`, `saveNeighborhoodsMutation`, `saveNotesMutation` — real `useMutation` + `apiRequest("PATCH", …)` calls with `onClick` handlers (lines 397, 573, 597-609, 648, 668, 703, 739-740). Provider Profile has the identical shape of UI (edit buttons on cards) with zero backing logic. The expert page is the template to follow, not a net-new design.
3. (Referenced, not re-litigated) Provider console has *already* copied several expert patterns well — the nine-module IA collapse, Workstation's action-first hub, the shared `ServiceForm`, `StorefrontShareTools`, and the Catalog page's honest "Claim your handle in Settings →" link-not-duplicate pattern. These are correctly in place and shouldn't be redone.

---

## 5. Duplicate-functions list

| Function | Implementation A | Implementation B | Recommendation |
|---|---|---|---|
| Stripe Connect onboarding (status query, onboard/dashboard mutations, status badge) | `components/stripe-connect-card.tsx:26-40` (used by `provider/earnings.tsx:20`) | `provider/settings.tsx:61-101` (`VerificationPayoutsSection`, hand-rolled) | Use `<StripeConnectCard />` in Settings too; delete the duplicate query/mutations |
| Initials-from-name computation | `components/provider/provider-sidebar.tsx:113-126` (correct, businessName → firstName+lastName → "P" fallback) | `pages/provider/profile.tsx:66` (hardcoded `"GE"`, not a real implementation at all) | Not a true "two implementations" case — B is a placeholder that was never wired to A's logic. Fix by calling the same computation, not by writing a third one |

---

## 6. Notes on scope / non-findings

- No route returned the §9 200-HTML dead-route signature; every page rendered content specific to its nav label.
- No `flexShrink:0`-class crush bug (the class of bug recently fixed in `expert/workspace.tsx`'s `chanCardStyle`) was found anywhere under `client/src/pages/provider/` or `client/src/components/provider/` (`grep -rn flexShrink` returned no matches).
- Workstation's Bundle/Property gating logic (2-approved-services unlock) matches its own on-screen copy and is correctly derived (not hardcoded) — no issue.
- This audit is read-only: no code was modified.
