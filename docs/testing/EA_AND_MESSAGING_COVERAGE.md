# EA Console Thin Smoke + Message-Thread Coverage — Aug 7, 2026

Two standing test gaps closed as the tail of the six-item sequence. Hermetic sandbox: local
Postgres 16 + production bundle on `:5000`, CI-stub keys.

## EA console — thin smoke (deliberately shallow, per decision-maker scoping)

The EA console is a gated shell (fix #107 made the gating honest); the ratified coverage here is
"routes render, gates honest, role boundaries hold," not a full user-simulation pass.

- **14/14 EA routes render** authenticated (dashboard, clients, executives, calendar, events,
  communications, ai-assistant, travel, trips, venues, gifts, reports, profile, settings) — every
  page loads its `/api/ea/*` GETs at 200, no 404/blank/JS-error, no 200-HTML dead routes.
- **Role boundaries hold**: an EA session gets 403 on `/api/admin/users`, `/api/admin/fee-config`
  (POST — the historic hole, still closed), and `/api/provider/earnings`.
- **Not covered (deliberate):** per-page CTA-honesty click-through on the shell's gated features —
  route/API/boundary layer is fully green, so the residual is UI-copy depth only, not worth a sigma
  pass on a shell. Revisit when the EA feature set is actually built.

Artifacts: `scratchpad/seq/ea-smoke.json`, `screenshot-_ea_*.png`.

## Message threads — trace + two-session test (blind spot since Jul 29)

The feature is **built and works end-to-end for two real users** — but its realtime transport has a
critical auth hole and its notification wiring is missing. Rails found:

| Rail | Table | Status |
|---|---|---|
| Direct chat REST (`/api/chats`) | `user_and_expert_chats` | LIVE — the rail the product uses |
| Realtime relay (`/ws`) | same table | LIVE, **zero authentication (MT-1)** |
| Parallel `/api/messages` API | same table | LIVE but orphaned — only `unread/count` + `read-all` have UI callers (MT-3) |
| Per-item trip comments | `trip_item_comments` | LIVE, fully wired, notifications correct |
| AI-assistant chat (`conversations`) | Drizzle-only | not a user-to-user rail — out of scope |

Two-session result: traveler↔expert thread sends, renders on the other party's Inbox with an unread
badge, and replies round-trip. Authorization on the **REST** rail is correct (stranger 403 on
read+post; a pending advisor may comment but is correctly 403'd from mutating items — matches §12).

### Findings

- **MT-1 (P1/CRITICAL, security):** `/ws` (`server/websocket.ts`) trusts a client-supplied
  `senderId` with **no session check**. Proven: an unauthenticated raw WebSocket client (a) wrote a
  chat row to the DB attributed to another real user (impersonation), and (b) received, in real
  time, a message addressed to a different real user's id (interception) — all with zero login.
  This is a live impersonation + message-interception hole on the realtime transport. The REST rail
  (`/api/chats`) is correctly session-gated; only the socket bypasses it.
- **MT-2 (P2):** no `notifications` row is created for a new direct message on the real UI rail
  (`storage.createChat` never inserts one); the code that does lives in the orphaned
  `messages.service.ts`. The per-item comments rail does this correctly — the direct-chat rail
  simply doesn't.
- **MT-3 (P3):** `/api/messages` send/list/detail/search are live and correctly authorized but have
  **no product caller** — a duplicate, drift-prone surface beside `/api/chats`.
- **MT-4 (P3):** the WebSocket client hook enters a reconnect loop on load; a message submitted
  during the flap was silently lost (stayed in the input, no request, no error shown).

Artifacts: `scratchpad/seq/messages.json`, screenshots `01`–`09`.

**Recommendation:** MT-1 is a fix-now security defect — the socket must resolve the sender from the
authenticated session (the same session the REST rail already uses) and reject unauthenticated
connections, never trust a client `senderId`. MT-2 should ride the same change (emit the
notification from the shared write path). MT-3/MT-4 are cleanup.
