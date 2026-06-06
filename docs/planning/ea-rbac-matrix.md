# Executive Assistant (EA) RBAC Permission Matrix

**Last updated:** 2026-06-06  
**Enforced by:** `server/middleware/ea-rbac.ts` (`isEA` middleware)  
**Frontend guard:** `requiredRole="executive_assistant"` on every `/ea/*` route in `client/src/App.tsx`

---

## Role Definition

| Role value | Description |
|---|---|
| `executive_assistant` | Manages travel and logistics on behalf of high-net-worth clients. Has a dedicated workspace at `/ea/*`. Cannot access platform financial data, user management, or configuration. |
| `admin` | Full platform access. Admins may also call EA endpoints for oversight/debugging. |

---

## EA-Owned API Namespace (`/api/ea/*`)

All routes below require `role = executive_assistant` (or `admin`). Any other authenticated user receives **403 Executive Assistant access required**.

| Method | Path | Description |
|---|---|---|
| GET | `/api/ea/clients` | List EA's client relationships |
| POST | `/api/ea/clients` | Add a client by email lookup |
| PATCH | `/api/ea/clients/:id` | Update payment info / notes |
| DELETE | `/api/ea/clients/:id` | Remove client relationship |
| POST | `/api/ea/clients/:id/push` | Send notification to a client |
| GET | `/api/ea/executives` | List managed executives |
| POST | `/api/ea/executives` | Add executive record |
| PATCH | `/api/ea/executives/:id` | Update executive record |
| DELETE | `/api/ea/executives/:id` | Remove executive record |
| GET | `/api/ea/events` | List coordinated events |
| POST | `/api/ea/events` | Create event |
| PATCH | `/api/ea/events/:id` | Update event |
| DELETE | `/api/ea/events/:id` | Remove event |
| GET | `/api/ea/travel` | List travel arrangements |
| POST | `/api/ea/travel` | Add travel arrangement |
| PATCH | `/api/ea/travel/:id` | Update travel arrangement |
| DELETE | `/api/ea/travel/:id` | Remove travel arrangement |
| GET | `/api/ea/gifts` | List gift records |
| POST | `/api/ea/gifts` | Add gift record |
| PATCH | `/api/ea/gifts/:id` | Update gift record |
| DELETE | `/api/ea/gifts/:id` | Remove gift record |
| GET | `/api/ea/venues` | List saved venues |
| POST | `/api/ea/venues` | Save venue |
| PATCH | `/api/ea/venues/:id` | Update venue record |
| DELETE | `/api/ea/venues/:id` | Remove venue record |
| GET | `/api/ea/communications` | List communication log entries |
| POST | `/api/ea/communications` | Add communication entry |
| DELETE | `/api/ea/communications/:id` | Remove communication entry |
| GET | `/api/ea/ai-tasks` | List AI-delegated tasks |
| POST | `/api/ea/ai-tasks` | Create AI task |
| PATCH | `/api/ea/ai-tasks/:id` | Update AI task status |
| DELETE | `/api/ea/ai-tasks/:id` | Remove AI task |

---

## General Platform APIs (accessible to EA)

EAs are normal authenticated users for general platform endpoints. They may use:

- `GET /api/user` — own profile
- `PATCH /api/user/profile` — update own profile
- `GET /api/notifications` — own notifications
- `GET /api/conversations` — own conversations
- Trip planning endpoints on behalf of clients (trips owned by client userId)

---

## Admin-Only APIs (EA blocked — 403)

The following route groups are explicitly admin-only. EA users receive **403 Admin access required** from the inline role guards in `server/routes/admin.routes.ts`.

| Route group | Blocked because |
|---|---|
| `/api/admin/revenue/*` | Financial data — EA has no need for platform P&L |
| `/api/admin/users` | User management — EA cannot promote/demote users |
| `/api/admin/users/:id/commission-override` | Fee configuration |
| `/api/admin/fee-config` | Platform fee configuration |
| `/api/admin/optimization-fees` | Pricing configuration |
| `/api/admin/payouts` | Financial — payout execution |
| `/api/admin/ai-usage/*` | Internal cost monitoring |
| `/api/admin/api-usage/*` | Internal cost monitoring |
| `/api/admin/analytics/*` | Platform-wide analytics |
| `/api/admin/reports/*` | Platform-wide reports |
| `/api/admin/expert-applications` | Application approvals |
| `/api/admin/provider-applications` | Application approvals |
| `/api/admin/categories` | Catalogue management |
| `/api/admin/content/*` | Content moderation |
| `/api/admin/affiliate/*` | Affiliate reconciliation |
| `/api/admin/seed-*` | Database seeding |

---

## EA Dashboard Navigation (frontend scope)

The EA sidebar (`client/src/components/ea-sidebar.tsx`) only exposes the following items. Admin-only pages (revenue, user management, fee config, analytics) are never rendered for EA users.

| Nav item | Path | Notes |
|---|---|---|
| Dashboard | `/ea/dashboard` | Overview of clients, recent activity |
| Calendar | `/ea/calendar` | Event calendar |
| Events | `/ea/events` | Coordinated events |
| Communications | `/ea/communications` | Client communication log |
| Clients | `/ea/clients` | Client relationship management |
| Executives | `/ea/executives` | Managed executives |
| AI Assist | `/ea/ai-assistant` | AI task delegation |
| Trips | `/ea/trips` | Trips coordinated by EA |
| Travel | `/ea/travel` | Transport arrangements |
| Venues | `/ea/venues` | Saved venues |
| Gifts | `/ea/gifts` | Gift tracking |
| Reports | `/ea/reports` | EA-scoped reports (no platform financials) |
| Profile | `/ea/profile` | EA profile |
| Settings | `/ea/settings` | EA settings |

---

## Enforcement Summary

| Layer | Mechanism | Status |
|---|---|---|
| Frontend route guard | `ProtectedRoute requiredRole="executive_assistant"` in `App.tsx` | ✅ All `/ea/*` routes protected |
| Frontend sidebar | Only `/ea/*` paths in `ea-sidebar.tsx` | ✅ No admin links exposed |
| Server EA routes | `isEA` middleware via `router.use("/api/ea", isEA)` | ✅ Applied to all `/api/ea/*` routes |
| Server admin routes | Inline `role !== "admin"` checks in `admin.routes.ts` | ✅ EA blocked from all admin routes |

---

## Out of Scope (future tasks)

- Per-EA permission customization (uniform EA role for all EAs)
- EA invitation and onboarding flow
- EA access to read-only subsets of admin data (e.g., their own clients' bookings in admin view)
