# Contact sheet — Supply → Demand pass 2 (run `nu4fb2`, build `3304c1dc0`)

Three full-run contact sheets plus one detail crop, then two representative frames per journey.
All images are JPEG q80 re-encodes of the originals in `$P2/shots/` and
`/tmp/claude-0/sp/walk/*.png`; full-resolution PNGs are not committed (size budget).

## Overview sheets

![Supply run](img/SUPPLY_SHEET.jpg)
**SUPPLY_SHEET** — S1/S2/S3 frame-by-frame overview (provider publish, expert publish, moderation).

![Demand run](img/DEMAND_SHEET.jpg)
**DEMAND_SHEET** — D1–D7 frame-by-frame overview (build-it-yourself through checkout).

![Run 6 (final consolidated)](img/RUN6_SHEET.jpg)
**RUN6_SHEET** — consolidated sheet from the run that stabilized the harness ahead of `nu4fb2`.

![Join link detail](img/JOIN_LINK.jpg)
**JOIN_LINK** — manual re-check proving `/my-bookings`' join-link anchor renders with the correct
`href`/`target`, cited by the `P2-D6b-JOIN` pass (`GAP_REGISTER_PASS2.md`).

---

## S1 — Provider publish

![Provider A submitted](img/S1-providerA-06-listing-post-submit.jpg)
Provider A's listing immediately after submit: `approval_status='submitted'` while the wizard is still open. Evidences `P2-S1-3` (born-submitted race).

![Provider A admin-approved](img/S1-providerA-10-admin-approve-service.jpg)
Provider A's listing after `/admin/service-approvals` approval — the state that later feeds the visibility checks in `P2-S1-8`.

## S2 — Expert publish

![Expert offering admin approve](img/S2-expertE-06-admin-approve-offering.jpg)
Admin approves Expert E's custom offering; the row goes `approval_status=approved`, `status=draft` — evidences `P2-S2-1` (approved-but-not-live).

![Ready-made admin queue](img/S2-readymade-06-admin-template-approvals.jpg)
`/admin/template-approvals`: "3 Days in Kyoto" is absent because the row's `status` stayed `draft` (never submitted) — evidences `P2-S2-3` (NOT PROVEN — vacuous by construction, see register §F).

## S3 — Moderation

![Provider pending view](img/S3-02-provider-pending-view.jpg)
The throwaway listing's provider-facing pending state — evidences `P2-S3-1` (no-neighbourhood ⇒ `location='Unknown'`, no warning) and `P2-S3-2` (empty status pill).

![Provider post-reject view](img/S3-04-provider-post-reject-view.jpg)
Provider sees the admin's rejection reason on the listing home — confirms `P2-S3-3` (pass).

## D1 — Build it myself

![Slip view](img/D1-09-slip-view.jpg)
Slip after adding Tea Ceremony and the Arashiyama tour — both items render, but neither carries a map pin. Evidences `P2-D1-COORDS`.

![My Plans](img/D1-10-my-trips.jpg)
`/my-trips` cold load lists the just-minted Kyoto plan immediately — confirms `P2-D1-5` (pass).

## D2 — Ready-made

![Ready-made detail](img/D2-02-ready-made-detail.jpg)
Ready-made detail page for the approved "3 Days in Kyoto" trip — `button-buy-rm` is not visible. Evidences `P2-D2-1`.

![After buy click](img/D2-03-after-buy-click.jpg)
State after attempting the purchase click (no visible CTA to click through this run).

## D3 — With an expert

![Chat send failure](img/D3-03-after-send.jpg)
Toast "Message failed" on an earlier (`rbvvcu`) run — the finding this frame evidenced (`P2-D3-1`) is WITHDRAWN; the final `nu4fb2` run's equivalent send succeeded (`P2-D3-6`, net log `net/D3-nu4fb2.jsonl`). Kept here as the before-state.

![After suggestion submit](img/D3-09-after-suggestion-submit.jpg)
Expert workspace after submitting a suggestion — no `trip_suggestions` row resulted. Evidences `P2-D3-4` (NOT PROVEN — harness never drove the assignment-accept step first).

## D4 — AI draft

![After generate wait](img/D4-04-after-generate-wait.jpg)
Free AI draft on an empty plan completes — confirms `P2-D4-1` (no `fee_ledger` row written, matching the `2026-09-25-planning-tolls` ruling).

![After Ask-AI submit](img/D4-06-after-ask-ai-submit.jpg)
Ask-AI drawer submit on the now-populated plan (paid task path; charge itself is `HELD:stripe`).

## D5 — Guest to auth

![After guest add click](img/D5-02-after-guest-add-click.jpg)
A guest's Add-to-plan press opens the sign-in modal with no queued guest-cart write — confirms `P2-D5-1` (`KNOWN:RC-8`).

![Post-signup service detail](img/D5-05-post-signup-service-detail.jpg)
Same service detail page moments after the guest completes signup — the item never carried over. Evidences `P2-D5-2` (`KNOWN:RC-8`).

## D6 / D6b — Checkout / join link

![Join link filled](img/D6b-02-join-link-filled.jpg)
Provider B enters a join link during listing edit — persists byte-for-byte (`P2-D6b-1`/`-15`, both runs).

![T-auth my-bookings confirmed](img/D6b-05-tauth-my-bookings-confirmed.jpg)
T-auth's `/my-bookings` for the seeded confirmed booking — the automated attribute read here reported `href=null` (a render-timing race); see JOIN_LINK.jpg for the manual re-check that shows the anchor rendering correctly. `P2-D6b-JOIN` recorded PASS.

D6 itself (real checkout, 3DS) is `HELD:stripe` — no frame; `P2-D6-1` records that no `custom_quote` fixture existed to exercise the quote leg either.

## D7 — Supply change propagation

![Provider A paused](img/D7-03-providerA-paused.jpg)
Provider A's listing after the pause toggle — `status='paused'` confirmed (`P2-D7-2`, pass).

![Slip after changes](img/D7-05-slip-after-changes.jpg)
Slip after Provider B's live price change and Provider A's pause: no old/new price text renders (`P2-D7-3`), and Provider A's now-paused item still shows with no unavailable notice (`P2-D7-4`).
