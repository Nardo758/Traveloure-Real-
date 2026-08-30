---
name: tsc baseline & getUserId convention
description: Type-check baseline is nonzero; routes use getUserId(req)! from server/utils/auth
---
- `npx tsc --noEmit` is NOT clean in this repo. **Whole-repo baseline = 197 errors, measured 2026-08-05 @ `ea0bbc05`** (`npx tsc --noEmit 2>&1 | grep -c "error TS"`). It was 199 until PR #430 removed two with a dead code branch. Do not trust the older prose numbers scattered in docs (191 / 209 / 254 / "~137 server errors") — they are stale.
- **The baseline only ever moves DOWN, and it is now machine-gated.** `.github/workflows/build.yml` → the `tsc baseline ratchet (down-only)` step in the `build` job holds `TSC_BASELINE`. Going over it fails (net-new errors); going UNDER it also fails, telling you to lower `TSC_BASELINE` in the same PR so the improvement is locked in and cannot be spent as headroom by the next lane.
- All server/routes* files now extract the session user id via `getUserId(req)` from `server/utils/auth` (usually with `!` since the old inline expressions were `any`-typed). Never reintroduce inline `claims?.sub ?? id`.
- **Why:** inline copies caused shape bugs across 3 auth methods; the `!` keeps type parity with the old `any` without behavior change.
- **How to apply:** new route code → `getUserId`/`requireUserId`; when a migration exposes `string | null` errors, that's the old `any` hiding a latent bug — preserve runtime behavior, note it.
