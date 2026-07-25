# Brief 04 — Guest-invite A2/A3: TripContext origin + invite-aware Event strip

**Tier:** Sonnet. **Migration:** none (TripContext server persistence exists — migration 130;
the PUT allow-list changes but the jsonb column doesn't). **Est. size:** ~120 LOC.

## Context (read these first)

- A0/A1 already landed: the dark `guest-invites.ts` router is mounted, `GuestInvitePage` is
  routed, `GuestInviteManager` surfaced. Find that commit with
  `git log --oneline --all -- '*guest-invite*'` and read the diff before writing anything.
- TripContext is the typed planning-context module `client/src/lib/trip-context.ts`
  (sessionStorage + debounced server mirror via `PUT /api/trip-context`, zod allow-list in
  `server/routes/trip-context.routes.ts`).
- The P3 global trip bar (task #152) is the strip this rides on — locate the component it added
  (grep for the trip-bar component in `client/src/components/`).

## Scope

### A2 — TripContext `origin` field

1. Add an optional `origin` field to the TripContext type in `client/src/lib/trip-context.ts`:
   a small closed vocabulary, e.g. `"organic" | "guest_invite"` (extend only if the A0/A1 code
   shows another real entry point). Merge semantics: origin is set once at entry and never
   overwritten by later merges (first-touch wins) — implement in the module's merge logic, not
   at call sites.
2. Server: add `origin` to the PUT allow-list zod schema in `trip-context.routes.ts` (enum of
   the same vocabulary, optional). Never raw body (§14 posture of that file stays).
3. Set it: when `GuestInvitePage` hydrates a visitor's context from an invite (find where A1
   writes TripContext / stores invite state), stamp `origin: "guest_invite"` plus whatever
   invite identifiers the existing code already carries (do not add new ones).

### A3 — Invite-aware Event-class strip

In the P3 trip bar: when the active TripContext has `origin === "guest_invite"` AND an
Event-class experience type (the Event branch the codebase already distinguishes — wedding/
corporate etc., grep `isEventOptimizer` for the canonical branch test), render the invite-aware
variant: show the event framing (e.g. "You're planning for <event>" with the invite's event name
if the context carries it) instead of the generic trip framing. Graceful fallback: missing
fields → generic strip (never fabricated placeholders — §13).

## Traps

- Do not widen the PUT schema beyond `origin` — the allow-list is the security boundary.
- First-touch origin: an invited guest who later browses organically KEEPS `guest_invite`.
- The strip must not crash for signed-out users (TripContext works for guests; the server
  mirror 401s silently — that behavior is by design, keep it).

## Gate

- tsc delta 0, build, both guard scripts.
- Behavioral: extend `scripts/verify-workstation-flows.ts` OR add a small
  `scripts/verify-guest-invite-context.ts`: PUT `/api/trip-context` with `origin:"guest_invite"`
  → persisted and returned by GET; PUT with an out-of-vocabulary origin → 400; PUT without
  origin does not clear a stored origin (merge semantics).
