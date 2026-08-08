---
name: Clerk auth migration
description: Durable constraints and identity-mapping decisions from the Replit Auth → Clerk migration.
---

## Identity bridge
- `sessionClaims.userId` = local DB lookup ID for all users (Replit Auth sub for migrated users, Clerk native ID for new users). Pre-configured by Replit-managed Clerk — no custom JWT template needed.
- `auth.userId` = Clerk native ID. **Never** pass to local DB queries; only for Clerk API calls (`clerkClient.users.*`).
- If `sessionClaims.userId` is absent (should not happen with Replit-managed Clerk), the code falls back to `auth.userId` which causes JIT creation — a sign something is wrong with the Clerk session config.

**Why:** Migrated users have old Replit Auth sub set as Clerk `externalId`; Replit-managed Clerk emits it as `sessionClaims.userId`. New users get `auth.userId` as their `sessionClaims.userId` and a JIT row.

## Files excluded from tsconfig
- `server/replit_integrations/auth/` is excluded from `tsconfig.json` because it imports packages removed during migration (openid-client, express-session, memoizee, connect-pg-simple). The directory is kept for reference only — none of its exports are used at runtime.

**Why:** Removing the directory would break test files that still import from it at the path level. Excluding from tsconfig silences compile errors without deleting the historical source.

## WebSocket chat write path
- The WS `chat` case uses `storage.createChat()` (same as `POST /api/chats` and `trips.routes.ts`). This fires the MT-2 recipient notification exactly once per message.
- MT-1: sender identity always comes from the Clerk session (never from the client payload `senderId`).

## JIT provisioning
- `requireAuth` creates the local user row on first authenticated request.
- Populates `email`, `firstName`, `lastName` from `sessionClaims` at insert time (frozen copy; Clerk is source of truth for subsequent reads).
- `req.user` is set to `{ id, claims: { sub, role }, role }` for backward compat.

## Dead import removed
- `server/storage.ts` had a dead `import { authStorage } from "./replit_integrations/auth/storage"` — removed. The `authStorage.ts` module itself is safe (no Passport imports), but the import was unused.
