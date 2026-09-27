# Action→Effect: supply-side (expert/provider) extension — pass 2 notes

**Scope:** `docs/audits/action-effect.json` extended with `expert` and `provider` trigger rows. The
original 825 rows (traveler surfaces, `audit/action-effect-baseline`) are untouched. Base file had no
`persona` field (it audited traveler surfaces only); this pass adds `"persona": "expert" | "provider"`
to every new row — additive, schema has no `additionalProperties: false`, validated below.

## Method

1. Enumerated interactive triggers by regex over `data-testid="..."` occurrences in `client/src/pages/provider/**`,
   `client/src/pages/expert/**`, and the nine named shared components (ServiceForm, provider-availability-manager,
   SellerQuotesPanel, SellerCompletionPanel, handle-claim-card, stripe-connect-card, PayoutBanner,
   ready-made-listing-panel, my-offerings-table), keeping only occurrences with `onClick=`/`onSubmit=`/
   `onCheckedChange=`/`onValueChange=`/`<Link`/`href=` in a ±300-char window (excludes bare `<Input>`/`<Textarea>`
   field testids, which are not actions per the task scope).
2. For Tier 1 candidates (create/publish/price/approve/availability/accept-decline-complete-booking/
   proposal-suggestion/ready-made submit/payout/Connect onboard/handle claim), traced by hand: component
   testid → onClick handler → `useMutation`/`apiRequest` call → server route registration → `storage.*`/`db.*`
   write → traveler-visible surface, via targeted grep (no full-file reads except short windows).
3. For Tier 2, a script mapped each remaining testid's onClick to the nearest `useMutation` variable in the
   same file (resolved to its `apiRequest`/`fetch` method+URL when found), else to `setLocation`/`<Link href>`
   navigation, else to local `setState` (dialog/tab/filter), else left unresolved.
4. Shared components mounted by both consoles (confirmed via `grep -rl` of the component name under both
   `pages/provider` and `pages/expert`) got one row per persona; `provider-availability-manager` is
   provider-only, `my-offerings-table`/`ready-made-listing-panel`/`PayoutBanner`'s expert mount are expert-only
   (PayoutBanner is also mounted on `provider/dashboard.tsx`, so it got both).

## Counts added

- **Total new rows: 632** (Tier 1: 30, Tier 2: 602).
- **provider: 296** (Tier 1: 15, Tier 2: 281)
- **expert: 336** (Tier 1: 15, Tier 2: 321)
- File total after merge: **1457** rows (825 traveler + 632 supply), all ids unique.

Tier 1 full chains cover: ServiceForm publish/submit/save-draft (both roles), availability add/delete slot
(provider), SellerQuotesPanel issue/withdraw quote (both), SellerCompletionPanel declare-complete (both),
HandleClaimCard claim handle (both), StripeConnectCard + PayoutBanner Connect onboarding (both), expert payout
request, ready-made submit/withdraw (expert), listing pause/activate toggle (both), provider/expert inbox
accept/decline booking, expert claim pooled booking-agent request, expert accept assignment, expert send
suggestion (`POST /api/trips/:id/suggestions`).

## Candidate DEAD_TRIGGER rows (static, unverified — needs one-by-one confirmation)

Heuristic: Tier-2 rows whose label contains an action verb (save/submit/delete/approve/accept/decline/
remove/request/confirm/publish/create/send/issue/withdraw/claim/connect/cancel/reject/complete/dispute/
archive/duplicate/activate/pause/resume/update/edit/invite/assign/upload/download/pay/book/purchase/apply)
**and** whose onClick had no `useMutation`/`fetch` match and no `setState` pattern in the same-file window.
This is a coarse static heuristic and over-flags dialog-open buttons whose real mutation fires from a
*second*, nested control (e.g. `button-cancel-delete-service` opens a confirm dialog; the real DELETE is a
different testid). **76 candidates** — not embedded as `DEAD_TRIGGER` gaps in the JSON (too unreliable to
assert without a browser check per the base audit's own R-4 rule: "grep is not proof"). Representative
entries worth a real look: `provider-bundle-builder:button-submit-bundle`,
`provider-listing-home:button-submit-for-review`, `provider-workstation:button-publish-range`,
`provider-workstation:button-bundle-submit`, `expert-ai-assistant:button-send-${task.id}`,
`expert-content-studio:button-connect-instagram`, `expert-inbox:button-decline-booking-${booking.id}` (this
one is a false positive — it opens the decline dialog; the real mutation is `button-confirm-decline`, which
IS resolved and is in the Tier-1 set). Full 76-id list: `/tmp` scratch artifact `dead_candidates_refined.json`
(not committed — regenerate via the method above if needed).

## Validation

- `node -e "JSON.parse(...)"` — parses clean.
- All 1457 `id` values unique (checked with a script; no `docs/audits/action-effect.schema.json` conformance
  checker exists in `scripts/`, so validated required fields (`id/tier/surface/route/component/label/trigger/
  conditions/chain/ui/verdict`) and the `trigger.kind` enum by hand — one violation found (`toggle`, not in
  the schema's enum) and fixed to `click`.
- No product code was changed. Only `docs/audits/action-effect.json` and this file were touched.
