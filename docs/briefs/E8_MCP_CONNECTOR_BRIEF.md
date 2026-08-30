# E8 — Connected AI (MCP connector) brief

**Status:** DRAFT — requires decision-maker ratification before any build (Console Realign R-J: "Own brief before build").
**Gates satisfied:** R-B (one create rail) landed Lane E2; the diary (`item_transition_log`) + routing-state contract landed
Lane S / Lane 1; the traveler console realign (E1–E7) is complete, so the surfaces an agent would touch are stable.
**Ratified constraints carried in from R-J (not re-decidable here):** one remote MCP server + OAuth; any MCP client
(Claude, OpenClaw, …); **agents build & stage, humans pay** (an agent may reach `ready_for_checkout`, never complete a
purchase in v1); agent may send items `→with_expert` through the normal lead routing; `agent` joins the diary actor
vocabulary; scoped tokens, rate limits, revocation; settings surface per mockup Tab 5 (artifact `9547d288`).

## 1. Shape

One remote MCP server hosted inside the existing Express app (official `@modelcontextprotocol/sdk`, Streamable HTTP
transport) at `POST /api/mcp`. No second service, no new deployment unit. The server is a thin adapter: every tool call
resolves to the SAME storage/service functions the web client's endpoints use — never a parallel implementation
(the §9 shadow-route lesson applied to tools).

## 2. Identity & auth

- **Standard path: OAuth 2.1 authorization-code + PKCE** (MCP's native connector flow — Claude custom connectors
  discover it automatically). Authorize page is a logged-in traveler consenting to named scopes; grant mints a
  connection + access token.
- **Fallback path (decision point D-1): settings-minted bearer token** for MCP clients without OAuth support
  (some OpenClaw configurations). Same token table, same scopes, user copies it once. RECOMMENDED: ship both; the
  fallback is ~10% extra work and avoids support burden. Decision-maker may strike it.
- **Storage (new migration, next free number):** `agent_connections` (id, `user_id` FK CASCADE, client label,
  `scopes` text[], `token_hash` — hashed, never plaintext, `created_at`, `last_used_at`, `revoked_at` nullable).
  New table, no CHECK → no publish-push trap; declared in `shared/schema.ts` (deploy-push durability rule).
- **§14 everywhere:** acting user = the token's `user_id`. No tool accepts a userId; no tool accepts an amount.

## 3. Scopes (v1 — deliberately small)

| Scope | Grants |
|---|---|
| `plans:read` | list own trips, read own TripPlan DTO (full channel — owner), read approved-only catalog/search |
| `plans:write` | create trip (one rail), add/update/remove itinerary items, route items (see §4) |

There is **no payments scope and no payment tool** — "humans pay" is enforced by absence, not by a flag an update
could flip. A checkout tool is a NEW ratification, not a scope addition.

## 4. Tools (v1)

- `list_trips`, `get_plan(tripId)` — owner-scoped reads off the existing TripPlan assembler (full channel).
- `search_catalog(query, city, …)` — the existing approved-only public reads (F2 read-gates apply unchanged).
- `create_trip(destination, dates, travelers?, eventType?)` — calls `storage.createTrip` (mints owner row +
  trackingNumber; the trip-mint guard invariant holds because it's the same function, not a new insert site).
- `add_item` / `update_item` / `remove_item` — the existing itinerary-item paths with their existing authorization.
- `route_item(tripId, itemId, to)` — **only** `in_planning→ready_for_checkout`, `ready_for_checkout→in_planning`,
  `in_planning→with_expert` (normal lead routing). `purchased` is refused server-side already (checkout-only edge,
  ROUTING_STATE_CONTRACT §2) — the tool simply doesn't offer it either.

Every mutating tool writes its diary row with **`actorType: 'agent'`, `actorId: <connection id>`** —
`TransitionActorType` gains `'agent'` (Lane E7's plan-activity feed already filters for it, forward-compatibly, so
"While you were away" surfaces agent actions on day one with zero further work).

## 5. Limits, revocation, visibility

- Per-token rate limit (e.g. 60 req/min read, 20 req/min write — final numbers are config, not literals; §8 posture).
- Revocation: settings page lists connections (label, scopes, last used); revoke sets `revoked_at` — checked on every
  request, effective immediately.
- Settings surface: "Connected AI" section per mockup Tab 5 — connection list + revoke + connect instructions
  (OAuth URL + fallback token mint if D-1 approved). Traveler shell (Profile/Settings), not a new sidebar entry.

## 6. What is explicitly OUT of v1 (each needs its own ratification)

- Any payment/checkout/confirm capability (the load-bearing "humans pay" line).
- Expert/provider-side MCP (earner consoles) — traveler scope only.
- Webhooks/push to the agent (agent polls `get_plan`; the diary is the change feed).
- Autonomous scheduling (agent-initiated cron) — the agent acts only when its human drives it.

## 7. Build order (single lane once ratified)

1. Migration + schema declaration + `agent` actor type. 2. Token issue/verify + OAuth endpoints (+ D-1 fallback).
3. MCP server + tools (thin adapters). 4. Settings UI. 5. Behavioral proof: staged-but-never-purchased end-to-end
(agent reaches `ready_for_checkout`, checkout by the human completes it, diary shows both actors); revoked token
rejected; rate limit fires; §14 greps + all three guards green.

**Decision points for the decision-maker:** D-1 (settings-minted fallback token: yes/no) · D-2 (rate-limit numbers)
· D-3 (whether `remove_item` is in v1 or agents are add/route-only).
