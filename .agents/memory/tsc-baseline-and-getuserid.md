---
name: tsc baseline & getUserId convention
description: Type-check baseline is nonzero; routes use getUserId(req)! from server/utils/auth
---
- Whole-repo TypeScript is not clean. Measure the current branch rather than trusting historical error counts in prose.
- Compare diagnostic fingerprints, not only counts. Expanded or truncated object types and Stripe event unions can change display order without a new error; normalize display-only differences and check the affected source.
- **Why:** unchanged payout/object and Stripe diagnostics rendered differently after a messaging refactor, producing false additions in an exact-text comparison. Count equality alone can also hide replacement errors.
- **How to apply:** retain primary error codes/fields, inspect apparent changes, and never suppress a genuinely new diagnostic or raise the baseline to hide it.
- **The baseline only ever moves DOWN, and it is now machine-gated.** `.github/workflows/build.yml` → the `tsc baseline ratchet (down-only)` step in the `build` job holds `TSC_BASELINE`. Going over it fails (net-new errors); going UNDER it also fails, telling you to lower `TSC_BASELINE` in the same PR so the improvement is locked in and cannot be spent as headroom by the next lane.
- All server/routes* files now extract the session user id via `getUserId(req)` from `server/utils/auth` (usually with `!` since the old inline expressions were `any`-typed). Never reintroduce inline `claims?.sub ?? id`.
- **Why:** inline copies caused shape bugs across 3 auth methods; the `!` keeps type parity with the old `any` without behavior change.
- **How to apply:** new route code → `getUserId`/`requireUserId`; when a migration exposes `string | null` errors, that's the old `any` hiding a latent bug — preserve runtime behavior, note it.
