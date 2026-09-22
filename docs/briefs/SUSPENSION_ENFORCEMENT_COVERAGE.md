# Lane brief — suspension is enforced in two places and the WebSocket is neither (board #1434, #1435)

**Status:** ready to build, needs one decision inside it. **Class:** authorization coverage.
**No schema change, no migration, no money path.**

## How suspension works today — verified, not assumed

Two independent layers, and they are not equivalent:

| Layer | Where | What it covers |
|---|---|---|
| **Session purge** (primary) | `admin.routes.ts:8688` — `DELETE FROM sessions WHERE sess->'passport'->'user'->'claims'->>'sub' = $id` | Every HTTP surface at once: no session ⇒ no `req.user` ⇒ nothing resolves an identity |
| **`isAuthenticated` DB check** (backstop) | `replitAuth.ts:240` — reads the user per request, `req.logout()` + **403**, fail-closed on a DB error | Only routes that actually mount `isAuthenticated` |

**The purge reaches all three login paths.** Email login (`emailAuth.ts:250`), email register (`:148`)
and Facebook (`facebookAuth.ts:147`) each build `claims: { sub: user.id }`, so the Replit-shaped
selector matches them.

> **RETRACTED, recorded so nobody re-derives it.** An earlier read of this lane concluded the purge
> misses email-auth sessions, on the strength of the suspend handler's own comment — *"Email-auth
> sessions carry `user.id` (no claims); Replit Auth carries `claims.sub`"*. **That is false for the
> session's shape.** The comment describes `getUserId`'s defensive precedence
> (`user?.claims?.sub ?? user?.id`), not a second serialized shape. The three `req.login` sites
> above are the proof. The comment is misleading where it sits and should be reworded by this lane.

## What is actually broken

### #1435 — the WebSocket checks nothing, and the purge cannot reach it. **This is the sharp one.**

`server/websocket.ts:103` resolves `userId` from the session at **handshake** and calls
`handleAuthenticatedConnection` (`:115`). There is **no `isSuspended` check anywhere in the file**,
and once the socket is open it holds no session reference — so deleting the session row stops the
*next* handshake and does nothing to a socket already established.

**Consequence:** a suspended user with a live socket keeps sending messages (`:161-173`) until they
disconnect. Nothing expires it. Suspension is the one action whose whole purpose is to stop someone
immediately, and the messaging surface is exactly where it matters.

### #1434 — routes outside `isAuthenticated` have no backstop

61 routes read an identity (`req.user` / `getUserId(req)`) without mounting `isAuthenticated`.
**Most are fine and must stay that way:** public browse and telemetry that read identity
*optionally* to personalise (`/api/discover`, `/api/services`, the `/api/track/*` family). A
suspended user seeing a personalised browse page is not a hole, and blanket-guarding them would
break anonymous browsing.

The ones that authorize through their **own** predicate are the real set — e.g.
`PATCH /api/transport-legs/:legId/mode` (`trips.routes.ts:2252`), which is deliberately
unauthenticated because it supports a guest `shareToken` branch and calls `authorizeTripLogistics`
itself. It is not missing *authorization*; it is missing the *suspension* check specifically.

**Severity is genuinely lower than the title suggests, and saying so is the point:** while the purge
succeeds there is no session, so these routes resolve no identity either. The exposure is the window
where **the purge FAILS** — and it is wrapped in `try/catch` and logged `non-fatal` by design
(`:8692`). So #1434 is "the backstop does not cover these routes", not "these routes are open".

## The decision this lane needs

**Where does the suspension check live?** Three shapes, and they trade differently:

- **(a) A global `/api/*` middleware** that rejects a suspended session before routing. One place,
  covers all 61 routes and any future one. Costs a per-request DB read on routes that today do none
  — including anonymous browse, where there is no session to check (so gate it on a session
  existing, and the cost lands only on signed-in traffic).
- **(b) Widen the backstop into `getUserId`.** Wrong shape: it is synchronous and pure, and making
  it async would touch every caller and put a DB read behind a helper that reads a property.
- **(c) Leave #1434 as-is and fix only the WebSocket.** Defensible — the purge is the real
  enforcement and it works — but it leaves the backstop's coverage gap documented and unfixed.

**My recommendation: (a) for HTTP, plus the WebSocket fix regardless.** (a) makes the backstop
match the purge's reach, which is what "two layers" is supposed to mean; today the second layer
covers a subset and nothing says which.

**#1435 needs no ruling under any option** — the WebSocket must check `isSuspended` at handshake AND
drop live sockets when a user is suspended, because the purge structurally cannot reach an open one.

## Build

1. **Handshake check** in `websocket.ts` beside the existing `getUserId` resolution — refuse a
   suspended user. Reuse `isAuthenticated`'s existing lookup and 403 semantics; do not write a
   second "is this user allowed" predicate (§18 rule 1).
2. **Drop live sockets on suspend.** The suspend handler already purges sessions; it closes the
   matching socket in the same place. `clients` is keyed by `userId` (`websocket.ts:127`), so the
   lookup exists.
3. **HTTP coverage** per the ruling above.
4. **Reword the suspend handler's comment** so it stops implying a session shape that does not exist.

## Negative space

No schema change, no migration, no money path, no `fee_bands` read, no idempotency key. Suspension
semantics are unchanged — this lane changes only WHERE they are enforced. It does **not** blanket
authentication onto public browse routes, and it does not alter the purge, which works.

## Proof

A suspended user: cannot open a new socket; has a live socket closed by the suspend action; and is
refused on a route that authorizes through its own predicate with the purge stubbed to fail. An
ANONYMOUS request to a public browse route is unaffected — that negative is the one most likely to
regress, so it is asserted.
