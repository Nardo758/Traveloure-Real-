# Agent working-memory repository correction

> **Archived from #1517** (the Replit engineer's report, written 17 October 2026 on the
> `replit/workspace-backup-2026-10-17` branch), names and numbers only. Ledger
> `2026-10-19-1517-salvage`.
>
> - **Not executed on main.** Main still tracks the `.agents/memory/` notes. Untracking them is a
>   separate PR, which waits on the decision-maker's comment on it.
> - **The report's "Authorization and scope" paragraph is removed.** A file does not record an
>   approval; the PR comment does.
> - **Everything below is the engineer's own record of a Replit workspace run.** Nothing here was
>   re-run.

## Scope

The accepted automation source plan, section 0.5, prohibits committing agent
working-memory folders. The originating finding is
`public_repo_memory_tracking` in `reports/blockers.md` on
`work/e2e-automation-harness-phase1`. No note contents are included in this
report. The finding does not assert that any file contains credentials.

## Read-only baseline

- Inspected main revision: `b31447cc9e72cbfe514842add0db2c4cbc71e77d`.
- Initial worktree and index were clean.
- Both the main tree and current index contained 93 `.agents/memory/` files.
- All 93 tracked files existed locally.
- `.gitignore` line 51 already contained `.agents/memory/`.
- `git check-ignore -v --no-index` matched both the tracked `MEMORY.md` path
  and a hypothetical new note to that existing rule.
- No tracked paths were found under `.agent/`, `.claude/`, `.codex/`,
  `.cursor/`, or `.scratch-lane/`.
- Shared `.agents/skills/` files and `.agents/agent_assets_metadata.toml`
  were excluded from the correction; they are not working-memory paths.
- Sorted, NUL-terminated tracked filename inventory SHA-256:
  `b3357443f7696abfdea59987151ad6dd2ebe3d720ce4932b819a03034941ef5b`.
  This is a hash of filenames, not note contents.

## Proposed correction (as run in the Replit workspace)

Executed on the dedicated `work/agent-memory-index-only` branch:

```sh
git rm -r --cached -- .agents/memory/
```

The earlier `git rm -r -n --cached -- .agents/memory/` dry run selected
exactly 93 paths. The executed command changed only the Git index, leaving
the local memory directory intact. The existing ignore rule remains.

This correction excludes the notes from future snapshots once merged.
Previously published commits still contain their historical copies.
No history rewrite, runtime/schema/payment changes, production access,
or deployment was performed.

## Preservation and index verification

An in-process check compared the complete local memory file set and
SHA-256 digests before and after index removal. No file contents or
content digests were printed or persisted.

- PASS: all 115 local memory files, including 22 already-untracked files,
  remained present and byte-identical.
- PASS: `.gitignore` remained byte-identical.
- PASS: `git ls-files -- .agents/memory/` returned no paths.
- PASS: staged deletions matched exactly the 93-path baseline inventory.
- PASS: no unstaged tracked changes were introduced by index removal.

Application workflows and browser tests were not run because no application
code or configuration changed. Verification was limited to repository scope
and local file preservation.

### Other workspace caution

The preservation check applies to this workspace. Git may remove formerly
tracked files in other clones/worktrees when they check out the resulting
commit. Their owners should securely preserve local notes outside Git before
updating, then restore them to the now-ignored directory if needed. Never
commit such backups. New clones will not receive the working notes.

## Exact tracked filename inventory

All paths below are relative to `.agents/memory/`.

```text
3ds-payment-flow.md
MEMORY.md
adr-security-fixes.md
affiliate-integration-checklist.md
amadeus-decommission.md
auth-input-validation.md
auth-user-shape.md
availability-authoring-write-path.md
background-scheduler-resilience.md
bento-card-shell-ownership.md
billboard-market-inventory.md
booking-sanitizer-stripe-leak.md
calendar-date-boundaries.md
cancellation-refund-policy.md
dev-database-host-guard.md
dispute-scoped-aggregate-payouts.md
ea-client-delegation.md
earn-demo-market-constraint.md
earnings-mint-path.md
expert-search-field-contract.md
expert-workspace-surfacing.md
fee-band-scope-split.md
fee-double-take-ruling.md
field-guide-recovery.md
github-push-auth.md
google-maps-runtime-fallback.md
id-column-types.md
isolated-preview-routing.md
journey-2-e2e-lessons.md
journey-suite-wave1.md
kyoto-bench-fixture.md
landing-hero-card-copy-preference.md
landing-moment-demo-seeding.md
lane-branch-head-reset-risk.md
lead-routing-silent-sql-failure.md
load-testing-baseline.md
logistics-route-semantics.md
map-marker-fallback-testing.md
meeting-pin-confirmation.md
merge-wave-reverts.md
migration-chain-root-cause.md
mockup-preview-discovery.md
moment-media-association.md
neighbourhood-slug-matching.md
nightly-qa-cli-isolation.md
optimization-fee-gate.md
partial-migration-retries.md
partner-demand-lane.md
partner-demand-r38-provenance.md
passport-is-live-auth.md
payout-parity-discriminators.md
phase-1b-neighborhoods.md
photography-source-preference.md
plancard-itinerary-items.md
platform-stripe-webhook-verified.md
playwright-audit-captures.md
playwright-chromium-nix-runtime.md
playwright-radix-dropdown.md
post-login-playwright-handoff.md
post-merge-boot-failures.md
prod-verification-constraints.md
proposal-map-provider-policy.md
provider-console-verification.md
provider-fee-parity.md
provider-storefront-url-contract.md
publish-only-from-main.md
realtime-message-delivery.md
role-change-audit-atomicity.md
route-mount-gap.md
secret-refresh-boundaries.md
seeded-earnings-orphans.md
server-vitest-client-root.md
service-bookings-transport.md
service-delete-cascade-guard.md
service-form-a11y-validation.md
signup-rebuild-policy.md
storefront-plan-handoff.md
stripe-cli-sandbox-webhook-verification.md
stripe-key-misconfiguration.md
stripe-stage2-subscription-hold.md
traveler-automation-policy.md
travelpayouts-partner-api.md
travelpulse-city-index-publish.md
trend-engine-phase0.md
trend-engine-phase2.md
tsc-baseline-and-getuserid.md
tsc-baseline-ratchet-gap.md
user-soft-delete.md
vite-context-identity.md
vite-dev-logger-resilience.md
webhook-dedup-window.md
webkit-playwright-nix-runtime.md
write-time-text-sanitization.md
```
