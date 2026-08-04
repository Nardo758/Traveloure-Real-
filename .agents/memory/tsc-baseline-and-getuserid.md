---
name: tsc baseline & getUserId convention
description: Type-check baseline is nonzero; routes use getUserId(req)! from server/utils/auth
---
- `npx tsc --noEmit` is NOT clean in this repo (~137 pre-existing server errors, many more client). Judge changes by diffing against a baseline (git stash → tsc → compare), not by expecting zero.
- All server/routes* files now extract the session user id via `getUserId(req)` from `server/utils/auth` (usually with `!` since the old inline expressions were `any`-typed). Never reintroduce inline `claims?.sub ?? id`.
- **Why:** inline copies caused shape bugs across 3 auth methods; the `!` keeps type parity with the old `any` without behavior change.
- **How to apply:** new route code → `getUserId`/`requireUserId`; when a migration exposes `string | null` errors, that's the old `any` hiding a latent bug — preserve runtime behavior, note it.
