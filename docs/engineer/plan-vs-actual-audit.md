# Automation plan versus actual — evidence audit

**DEV-CLOSED WITH BLOCKERS. RELEASE HELD.**

Audit date: **15 October 2026 (UTC)**. Target inspected: main
`0fe28e1fc662287eda67e16b06a8fd66e2f8d0c1`.
This is a report, not a new certification or permission to run anything.

## One-page plain summary

**There is working code, but the evidence does not establish that the whole
planned system is complete or ready to release.** The defensible completion
count is **0 of the 45 recovered intended email/in-app automations certified
at L3 or above in this audit**. That is **0% evidenced completion**, not a claim
that every existing email is broken. Completion across *all seven requested
source lists* is **unknown**, because three source inventories are missing or
incomplete and several lists contain documents and checks, not automations.

Of those 45 intended automations:

- **8/45 = 17.77%** have identified code and registry coverage on main.
- **12/45 = 26.66%** have identified code and registry coverage when the four
  held cart families are included. All twelve remain below the requested
  complete-proof standard. This is **built but not currently certified**.
- **33/45 = 73.33%** have no matching automation implementation identified in
  the reviewed source inventory. Three of these are explicitly removed or
  deferred by the owner; they are not three outstanding release promises.
  Existing login/reset/deletion primitives are not counted as the missing
  notification automations.
- Using the requested weights and level scores, the recovered 45-automation
  scope scores **840/10,800 = 7.77% weighted progress**. This score is not a
  delivery success rate or a release percentage.
- **0/42 = 0% release-ready** within that recovered scope after excluding
  only the two dropped credit alerts and the explicitly deferred wishlist
  alert. The broader release denominator remains unknown.

There is genuine earlier delivery evidence. The held Part 9 record contains
**ten delivered provider receipts**: six cart reminders and four item-change
*copies*. The copies did not send the blocked item-change outbox rows.
The earlier itinerary report contains six delivered follow-up receipts.
However, those earlier records do not supply a fresh, complete, version-matched
database + delivered-message + rendering + link proof package for the current
target. They are historical evidence, not erased successes, and not L3 credit.

The strongest recent evidence is narrower: **56/56 reported database entries
in each of two loops on 13 October**, using the retained branch, and **59/59
provider-free guard checks in each of two loops on 14 October**, on another
unmerged branch. These are different runs and different scopes. They must not
be added together or called a fresh 143/143 current-main result.

**The real-clock scenario is MISSED, not WAITING.** It has no delivered
next-day receipt. Its recorded heartbeat stopped on 11 October; the owned
outbox was empty at the last recorded observation. Missing quiet-hour fields
were an additional blocker. Its history must not be repaired by a late send.

The three highest-leverage steps are:

1. Obtain owner review of the safe target: cart integration, the held
   heartbeat migration, and the already-built development recipient guard.
2. Resolve the payment-provenance and must-have item-change ordering decisions.
   Readable database rows do not prove every payment rail is unpaid.
3. Approve a bounded, genuinely running QA verification setup, then obtain
   current end-to-end and real-clock evidence. Production verification remains
   a separate, later authorization.

No tests, emails, jobs, database operations, production calls, restarts, settings
changes, code fixes, migration registrations, merges or releases were performed
for this audit. Only this report was written.

## 1. Evidence rules and source register

**17 October source-intake supplement:** See
`docs/engineer/automation/automation-source-recovery-draft.md` for the newly supplied flow-plan
instructions, DRAFT non-email ladder, manual-sheet provenance gap and remaining
source requests. **Owner disposition: PARTIAL WITH DOCUMENTED GAPS — PARKED.**
The owner has now supplied Appendix D1–D12 (`docs/engineer/automation/automation-decision-register.md`), authorized
a newly recreated manual sheet from the E2E plan, and directed that missing
source-dependent rows be **SOURCE PENDING**, separately listed and excluded
from percentages (neither zero nor done). Do not search for the old manual
sheet or retry source recovery. Non-email criteria are DRAFT V1 for tracking
only. The 7 October readiness source remains pending. These instructions,
updated deferrals and draft scores supersede affected historical scope/rules;
the dated figures below are not current tracker percentages. See
`docs/engineer/automation/automation-flow-tracker.md` for the known-scope report.

### Reading the levels

The requested ladder is retained without substituting “tests passed” for
“complete”: **L0** no identified automation code/node; **L1** design only;
**L2** code and registry, without qualifying current proof; **L3** fresh
development database checks **and** delivered provider/outbox IDs **and**
rendering/link checks; **L4** L3 plus races, faults, heartbeat/scheduler and
regression proof; **L5** existing post-release production proof.

Historical evidence is capped at L2, as requested. A report's date or an
unchanged documentation commit does not refresh its tests. Two clean loops on
a readable-record subset do not remove UNKNOWN payment rails. A provider
`delivered` event means acceptance by the recipient's mail server, not proven
inbox placement.

**UNKNOWN is used where classification or a denominator cannot be supported.**
For example, a test harness can be implemented without being an email automation
with its own registry node. Applying the L3 email-delivery requirement to that
artifact is not a sensible way to certify the harness. It is disclosed rather
than silently granting an exemption or inventing a passing level.

“L0” in the automation tables means no matching automation code and node
identified by the reviewed registry/caller inventory and targeted source search.
It does **not** prove that all possible dynamic callers are unreachable. The
executable not-built/unreachability proof remains open.

### Immutable evidence references

`M:` means the main revision above. `H:` means held commerce revision
`26b347386cf387466803ddb6d16cdee266aa113c`.
`P:` means Phase 1 harness revision
`70223975d7c986987bc7853998c8185b54a84ba9`.
`I:` means Step 0 revision
`c6f60717915b2c8a0e4175f53ed4cff0b328d5f3`.
`Q:` means QA guard revision
`1a868f4db3f11adaf197bc0285442c3418cee646`.
Branch evidence was read with immutable Git objects; no branch was checked out,
reconciled or merged.

| Ref | Source and locator | What it establishes / limitation |
|---|---|---|
| A | `attached_assets/Pasted--SECTION-6-AUTOMATION-COVERAGE-SCORIN-1791103935076_1791103935106.txt`, core/extended lists | 15 core plus **16** extended identities. The older “15 extended” heading is inconsistent with the enumeration. |
| A1 | `attached_assets/Pasted--PROMPT-1-of-5-Foundation-Core-Verif-1791051374753_1791051374756.txt`:18–50, 75–170, 225–258 | Verification-before-welcome, security, deletion, engagement and full-journey expectations. Not implementation proof. |
| B | `attached_assets/Pasted-You-are-a-Senior-Backend-Engineer-building-Stage-2-of-T_1791104591253.txt`:42–73 | Fourteen intended Stage 2 families; its earlier “13” wording is not the actual enumeration. |
| B1 | `attached_assets/Pasted-Continuing-Part-2-Same-two-phase-structure-PRE-FLIGHT-f_1791129381969.txt`:7–26, 42–45 | Three itinerary follow-ups; chat conditional on reachable stored context. |
| C | `attached_assets/Pasted-You-are-a-Senior-Backend-Engineer-and-QA-Lead-completin_1791470674504.txt`, “THE SCORECARD,” “SCENARIO FAMILIES,” “EVIDENCE RULES”; supplied Part 1–10 conversation | Ten-Part mission, ten gates, S1–S12 and strict loop/evidence rules. Not a recovered single consolidated prompt-book file. |
| C1 | `attached_assets/Pasted-Decisions-on-the-Step-0-report-Proceed-to-Step-1-with-t_1791394195517.txt`:1–51 | Direct senders outside this lane; wishlist deferred; snapshot/clock/guest/removal/race decisions. |
| C2 | `attached_assets/Pasted-PART-10-REVIEW-NEXT-STEPS-Do-not-merge-register-any-mig_1791696347727.txt`:1–44 | Release hold, blocker table, receipts, real-clock and separate release checklist. |
| D | `attached_assets/0_e2e-user-automation-test-plan-enhanced_1791907467831.md`:79–153, 513–596 | Step 0, D1–D5, system checks, gates, final report and human checks. |
| D1 | `attached_assets/Pasted-AUTOMATE-THE-E2E-USER-AUTOMATION-TEST-PLAN-Source-the-a_1791905297657.txt`, “MODULES,” “PHASES” | Four harness phases; approvals between phases; journeys not permitted by harness approval. |
| INV | `I:reports/e2e-step0-inventory.md`:24–112, 662 onward; `I:reports/e2e-persona-applicability.md` | 89 main registry identities; source/caller coverage gaps; 550 proposed applicability cells. Inventory is not execution. |
| GATE | `I:reports/e2e-pre-phase2-gate.md`, D1–D5, rails and golden sections | Current-source findings and target-vs-held separation; some guard/settings/hygiene statements subsequently superseded below. |
| DB | `I:reports/e2e-approved-golden-db-baseline.md`:1–34; `.local/e2e-step0-review-assets/e2e-approved-golden-db-results.json` | 13 October: five approved database groups, 56 reported entries per loop, two loops, cleanup. JSON records source H, not M. |
| QA | `.local/e2e-step0-review-assets/development-qa-guard-implementation.md`, “Fresh evidence,” “Remaining blockers”; source Q, four listed files | 14 October: two provider-free 59-case loops, 117-diagnostic baseline. Guard built but not on main/running target. |
| H9 | `H:reports/automation-part9-verification.md`:8–30, 61–64, 88–141, 164 onward | Ten delivered QA receipts; controlled eligibility clock; actual item-change rows held; rendering/browser certification still open. |
| H10 | `H:reports/automation-part10-final-report.md`:23–69, 86–153, 173–195; `H:reports/automation-final-status.md` | Historical gates, per-rule boundaries, delivery references, residual windows and later repair dispositions. |
| CLOCK | `I:reports/real-clock-ledger.md`:7–43; local copy `.local/e2e-step0-review-assets/real-clock-ledger.md` | Stored start/due times; 13 October read; MISSED decision; last heartbeat/outbox counts; no retry/backfill. |
| BLOCK | `I:reports/blockers.md`:7–41; local copy `.local/e2e-step0-review-assets/blockers.md` | Thirty named blocker rows, including one fixed hygiene row. Contains stale guard wording, corrected in this audit. |
| LIVE | `M:reports/itinerary-part2-live-certification.html`, “Actual provider receipts,” “Behavior and refinement checks,” “Method and limitations” | 4 October six delivered follow-up receipts, DB/link/browser observations. Historical, accelerated eligibility; not real-clock or current-target certification. |
| KEEP | `H:reports/commerce-direct-senders.md`; `H:reports/commerce-part7-unknown-classification.md`; `H:reports/commerce-development-triggers.sql` | Direct-sender inventory, held removal identities and archived trigger DDL. No current catalog query performed. |

Freshness anchors from Git: `M:server/services/email-outbox.service.ts` last
changed at `99adb3c09ae7696300e7dfd968a034a77250a986`
(12 October, 05:25:29 UTC). The welcome and shared email service last changed
at `3c7d675d18d3b16bb168d986d7d470d7b003fe7d`
(7 October, 23:14:54 UTC). The itinerary follow-up service last changed at
`2211257967c788d15951acfdf29c65497c4c79a0`
(5 October, 01:03:17 UTC). Thus the 4 October report is not a fresh proof of
the later shared/current path. The 13 October DB run explicitly used H, not
current main. The 14 October Q checks use mocked transport/database methods.

### Exact denominators, and missing sources

| List | Recovered denominator | Missing information / counting boundary |
|---|---:|---|
| A | **31 automations** | Complete named list: 15 core, 16 extended. No duplicate counting of names appearing in the E2E plan. |
| B | **14 automations** | Complete named list. Preserve dropped/deferred rows in historical plan denominator; exclude only authorized deferrals from release scope. |
| C | **10 named Parts** | Deliverable bundles recovered below. A complete atomic-deliverable denominator from a consolidated prompt book is **unknown**; do not call ten Parts ten completed deliverables. |
| D | **4 phases** | Also 25 journeys, 22 personas, 20 checks, 24 negatives, 12 break attempts, 8 guards, 12 system checks, 6 coverage gates and 5 current decisions. These are different units. |
| E | **Unknown** | Requested 13-section manual test sheet not located. Follow-up identified the seven-category human receipt-check generator on `work/e2e-automation-harness-phase1`, `scripts/verification/e2e-user-automation/human-checks.ts`; it is not a recovered standalone thirteen-section sheet. See `reports/plan-vs-actual-follow-up.md`. |
| F | **Unknown** | The referenced 7 October status document with twelve readiness items was not located. Do not substitute a later Part 10 report or D's twelve system checks. |
| G | **Unknown for the requested full list** | Thirty blocker identities recovered, plus five current E2E decisions. The original D1–D12 list is not recovered. The latest D1–D5 cannot safely be assumed to be its first five entries. |
| Overall | **Unknown** | Missing E/F/original decisions, unresolved outside-registry union, and unlike deliverable types prevent an honest all-source percentage. |

The available automation denominator is **31 + 14 = 45 distinct intended
families**. Source C, D and later reports map back to these canonical rows;
they do not add extra copies of welcome, cart or itinerary automations.
The **89 registry nodes** cover wider operational domains and are not a
replacement denominator for the 45 intended families. No arithmetic adds
call sites, nodes, journeys, Parts and emails together.

## 2. Canonical master register

Weights: **3** money/security, **2** core journey, **1** marketing/growth.
These assignments are audit judgments, shown explicitly. Dates/revisions for
each evidence reference are in section 1. `D/Jn` is intended E2E coverage, not
an executed journey. Source membership does not claim a reviewed step binding.

### 2.1 A — intended account automations, one row each

All rows below come from A; A1 supplies the detailed expectations. Missing
nodes were cross-checked against INV and main's messaging registry/producer
definitions, not inferred solely from one missing filename. Existing account
operations are not equivalent to the requested automated notices.

| ID / automation | Other source memberships | Level | Weight | Implementation / evidence / restriction |
|---|---|---|---:|---|
| A01 verify_email | A1; D/J1,J11 | L2 | 3 | M `server/automations/messaging/producer-index.ts`, auth verification definition; `server/replit_integrations/auth/emailAuth.ts`:442–532. DIRECT-SEND transport; no fresh full proof package. |
| A02 welcome_email | A1; C1/P1; D/J1 | L2 | 2 | M `signup-welcome-outbox.service.ts`:15–55, 66 onward; `emailAuth.ts`:128; registry `messaging.auth-welcome-email`. DB has fresh subset tests; verify-first fails. BLOCKED signup_verify_order_deviation. |
| A03 verify_reminder_1h | A1; D/J11 | L0 | 3 | INV/GATE: no identified reminder node/emitter. Not-built guard unproven. |
| A04 verify_reminder_1d | A1; D/J11 | L0 | 3 | Same inventory boundary as A03. No real 1d proof. |
| A05 verify_reminder_3d | A1; D/J11 | L0 | 3 | Same inventory boundary as A03. |
| A06 already_have_account | A1; D/J1,J21 | L0 | 3 | No existing-account notice node identified; current registration response reveals existence (`emailAuth.ts`:95–105), not the specified neutral-screen-plus-email behavior. |
| A07 google_login_added | A; D/J1 social variants | L0 | 3 | OAuth login capability is not evidence of this notice. No matching registry family identified. |
| A08 password_reset_request | A1; D/J2 | L2 | 3 | M auth password-reset producer/node; `emailAuth.ts`:305–438. DIRECT-SEND; second-link invalidation gap below. |
| A09 password_changed | A1; D/J2 | L0 | 3 | Password update exists, but no matching changed-password notice/node identified. |
| A10 new_device_login | A1; D/J12 | L0 | 3 | No matching new-device notice/node in reviewed inventory. |
| A11 account_locked | A1; D/J12 | L0 | 3 | No specified five-failure notice chain/node identified. Existing rate limits are not this proof. |
| A12 deletion_confirm | A1; D/J14 | L0 | 3 | No requested seven-day lifecycle confirmation automation/node identified. Existing deletion functionality not credited as this sequence. |
| A13 deletion_complete | A1; D/J14 | L0 | 3 | No requested delayed completion notice/node identified. |
| A14 profile_nudge | A1; D/J15 | L0 | 1 | No matching nudge/node identified. |
| A15 planner_nudge | A1; D/J15 | L0 | 1 | No matching nudge/node identified. |
| A16 verify_email_bounced | A; D/J11 | L0 | 3 | No matching hard-bounce account-flag/admin-alert chain identified. |
| A17 disposable_email_check | A; D/J25 | L0 | 3 | No matching automation identified; reachability/threshold decision not replaced by a stub. |
| A18 reset_link_expired | A; D/J2 | L0 | 3 | Generic invalid/expired response exists (`emailAuth.ts`:429), not the distinct specified in-app outcome/node. No email should be invented for an in-app-only rule. |
| A19 reset_link_already_used | A; D/J2 | L0 | 3 | Same generic response, not a distinct used-link outcome/node. In-app-only proof applicability remains to be agreed. |
| A20 login_pre_lockout_warning | A1; D/J12 | L0 | 3 | No specified attempt-three warning/node identified. |
| A21 account_unlocked | A1; D/J12 | L0 | 3 | No natural-30-minute unlock notice/node identified. |
| A22 suspended_login_attempt | A1; D/J12 | L0 | 3 | Login denial exists (`emailAuth.ts`:241–251); not a matching classified automation/node or proof of the required privacy wording. In-app-only. |
| A23 email_already_deleted_reuse | A; D/J25 | L0 | 3 | No matching deleted-email reuse outcome/node identified. |
| A24 facebook_login_added | A; D/J1 social variants | L0 | 3 | No matching provider-added notice/node identified. |
| A25 no_email_from_provider | A; D/J25 | L0 | 3 | No matching specified provider-without-email automation/node identified. |
| A26 email_changed_old | A; D/J13 | L0 | 3 | No matching old-address security notice chain/node identified. |
| A27 email_changed_new | A; D/J13 | L0 | 3 | No matching new-address verification-before-activation chain/node identified. |
| A28 unusual_signin_velocity | A1; D/J12,J25 | L0 | 3 | Requires reachable session/location evidence; no matching implementation/node identified. No fabricated inference. |
| A29 dormant_from_verification | A1; D/J15 | L0 | 1 | No matching notice/node identified. Threshold/behavior is not certified by the older proposal. |
| A30 deletion_grace_period_reminder | A1; D/J14 | L0 | 3 | No specified reminder two days before seven-day deletion cutoff identified. |
| A31 deletion_cancelled_reactivation | A1; D/J14 | L0 | 3 | No requested reactivation/cancellation chain/node identified. |

The L0 rows concern the *named automation contracts*. They are not assertions
that password resets, OAuth, suspension enforcement or deletion endpoints do
not exist. INV's unbound source steps include J11, J13, J14 and J15;
executable negative proof is still needed before saying these families can
never emit through a dynamic path.

### 2.2 B — Stage 2, one row each

| ID / automation | Other source memberships | Level | Weight | Implementation / evidence / restriction |
|---|---|---|---:|---|
| B01 itinerary_ready | C/P1 regression; D/J3 | L2 | 2 | M `messaging.plan-delivered-email` reused for outcomes; generation outcome service; DB group 1. Not a second automation just because the registry name differs. |
| B02 itinerary_failed | C/P1 regression; D/J3 | L2 | 2 | M `messaging.itinerary-failed-email`; generation outcome service; DB group 1, including timeout/late outcome cases. No current full delivery/render/link package. |
| B03 one_credit_left | B original scope | L0 | 3 | **DEFERRED BY DECISION — actually dropped** by the user on 4 October until a separately authorized real credit/allowance policy exists. Not an outstanding prerequisite of the present generation-outcome lane. |
| B04 out_of_credits | B original scope | L0 | 3 | Same explicit user scope removal as B03. Do not reopen credit policy in this lane. |
| B05 itinerary_nudge_2h | B1; C/P1 regression; D/J3,J22 | L2 | 1 | M `server/automations/messaging/itinerary-nudge-2h.ts`; LIVE historical delivery/browser proof; DB group 2 fresh readable subset. |
| B06 itinerary_followup_24h | B1; C/P1 regression; D/J3,J22 | L2 | 1 | M `itinerary-followup-24h.ts`; same evidence boundary. Real elapsed next-day proof not supplied by accelerated eligibility. |
| B07 itinerary_reengagement_5d | B1; C/P1 regression; D/J3,J22 | L2 | 1 | M `itinerary-reengagement-5d.ts`; same evidence boundary, bookability tests. |
| B08 saved_search_alert | D/J25; D5 | L0 | 1 | GATE D5/INV: no matching implementation/node identified. No explicit owner deferral recovered, so remains in the recovered release denominator. |
| B09 wishlist_price_drop | C1 decision 2; D/J25 | L0 | 1 | **DEFERRED BY DECISION — user**, C1. Drop-only and deferred; not interchangeable with B13. |
| B10 cart_reminder_1h | C/P2–10; D/J4,J8,J22 | L2 | 1 | H `server/automations/messaging/commerce-email-sweep.ts`:3–21 and commerce services/verifier; H9 reminder receipts. Held branch only; BLOCKED commerce_runtime_not_on_target, payment_rail_unknown, normal_cart_reminder_sending_blocked; MISSED clock scenario. |
| B11 cart_reminder_1d | C/P2–10; D/J4,J8,J22 | L2 | 1 | Same registered sweep and guards as B10. H9 accelerated proof is not next-day proof. |
| B12 cart_reminder_3d | C/P2–10; D/J4,J8,J22 | L2 | 1 | Same registered sweep and guards as B10; fourth reminder prohibited in held code. |
| B13 cart_item_changed | C/P2,P5–10; D/J5 | L2 | 3 | H sweep declares snapshot/change/notified-value path. Actual dispatcher handoff remains held. BLOCKED must_have_payment_ordering_unknown and payment_rail_unknown. Four QA copies are not four actual item-change sends. |
| B14 ai_chat_abandoned | B1; D/J25 | L0 | 1 | LIVE records unreachable authoritative conversation context and exclusion from that implementation. Conditional specification, not recovered standalone founder deferral of the broader release scope; **not excluded** from the 42-row release denominator. |

Four held cart families share **one registered sweep**, not four extra
schedulers or four invented registry nodes. Parent registration explicitly
names reminder steps and item changes; that is the registry evidence for their
L2 status. “Twelve coded” includes these **four unmerged families**.

### 2.3 C — Part deliverables, not extra automation copies

Every Part below is present in the supplied conversation and H's per-rule
reports. They are supporting bundles with **UNKNOWN ladder applicability**:
their code/documents can be inspected, but a Part is not a registered email.
No Part is awarded L3 merely because a report says DEV-CLOSED.
Weights are explicit judgments for any future agreed deliverable score;
they are **not included in the 45-automation weighted total**.

| Canonical row | Planned deliverables recovered | Actual evidence / open deliverables | Level; weight |
|---|---|---|---|
| C01 Part 1 | Protected baseline, reuse/writer inventory, retained test/report harness, randomized isolated fixtures, fresh golden/typecheck, QA delivery evidence and open decisions | `work/automation-part1-baseline-freeze:reports/automation-part1-{baseline,gate-scorecard,open-items}.md`; later H golden history and DB subset. Full current-main baseline/delivery package open. | UNKNOWN; 3 |
| C02 Part 2 | Server-only JSONB activity clock; add-time price/currency/availability/time snapshot; real-activity-only updates; single-statement atomicity; malformed input/fault/concurrency/latency proof; resume/boundaries | H `reports/automation-part2-verification.md`; cart state tests/code. Post-payment cleanup explicitly excluded. Main cart-projection conflict and fresh integrated proof open. | UNKNOWN; 2 |
| C03 Part 3 | One 15-minute SELECT/enqueue sweep; registry/internal route/script/workflow/roster; dedupe; truthful success/empty/failure heartbeat; two-loop proof | H sweep node and `reports/automation-part3-verification.md`. Persistent heartbeat change held/unregistered; no live due-time runner proof. | UNKNOWN; 2 |
| C04 Part 4 | Three reminder steps; every eligibility condition/rail; 60-minute boundary; 09:00–before-20:00 window; daily cap/cart priority; authenticated claim; no fourth step; two loops | H `reports/automation-part4-verification.md`, Part 8 matrix/H9 reminders. Readable subset only. UNKNOWN rails, normal-send hold and true clock proof open. | UNKNOWN; 1 |
| C05 Part 5 | Price up/down and availability-loss notice; notified-value dedupe; unsubscribe exemption; no_snapshot skip; A→B→A limit; two loops | H `reports/automation-part5-verification.md`; actual send still held. QA copies do not close eligibility/ordering/inventory proof. | UNKNOWN; 3 |
| C06 Part 6 | Live account/recipient/consent/cart/item/sequence/all-readable-rail checks; pre-queue check; quiet hours at send; fail closed; atomic claim; terminal cancellation; measured late-check race | H `reports/automation-part6-verification.md`, remediation results; accepted marketing-only residual. Unknown rails and real-provider uncertainty remain. | UNKNOWN; 3 |
| C07 Part 7 | Approved removal inventory; archive full 15-trigger DDL and remove dev triggers; keep shared guards/outbox; full itinerary/signup DB proof; recover golden runner; corrected test carried; direct-sender report | H cutover/DDL/KEEP and unknown-classification reports; earlier catalog proof zero; DB proves five groups later. Unidentified 37 wrappers/helpers/drafts carried; eight functions cleanup held; no new catalog proof here. | UNKNOWN; 3 |
| C08 Part 8 | Full randomized scenario matrix, every condition/reason, both race orderings, replay/concurrent writers, three faults, two clean loops or six-loop structural risk | H `reports/automation-part8-verification.md`:15–131, 187–197. 100 readable-scope rows closed; seven historical risk rows, not 107 certified rules. Later mocked handler proof does not close provider provenance. | UNKNOWN; 3 |
| C09 Part 9 | Approved isolated QA delivery, receipt/outbox IDs, corrected time-qualified copy, rendering/links, genuine next-day ledger, carried blockers | H9: ten receipts; genuine clock MISSED; actual item change held; full client/browser and once-only provider proof open. | UNKNOWN; 2 |
| C10 Part 10 | Fresh baseline/no new-module errors, clean guards, all retained tests, mutation-auth if routes changed; one PR with evidence/DDL/removal/direct-sender archive; merge ledger only at actual merge; separately authorized release verification | H10: historical 117 diagnostics, guards corrected 78/78, reported golden 143; draft PR #1396. Current-main integration, held numbering, release/production proof and merge ledger open. No merge claimed. | UNKNOWN; 3 |

The item lists above expose the obligations; they are not an invented
atomic-deliverable denominator. A report, implementation bundle, and test
suite are not three separate completions of the same obligation.

### 2.4 D — E2E phases

| Row | Planned | Actual | Level; weight; evidence |
|---|---|---|---|
| D-P1 | Guards, fixtures, spec binding, matrix/evidence/redaction, loops/gates, reports/human-check sheet, provider-free self-tests | **Harness code present, unmerged.** P `scripts/verification/e2e-user-automation/README.md`, `cli.ts`, `runner.ts`, `journey-spec.json`, nine self-test files. Source lists preserved. 11,000 planning cells are BLOCKED, not 11,000 executed checks. Exact full self-test pass count not re-established here. | UNKNOWN for strict email ladder; weight 3. Implementation exists; not L3 email proof. |
| D-P2 | Actual no-delivery journey adapters, queue/eligibility/cancel checks, negatives and break attempts | Designed. P README explicitly refuses future journey execution; source-level bindings/applicability unresolved. Step 0 reports and guard work are prerequisites, not executed Phase 2 journeys. | L1; weight 2. BLOCKED journey_step_binding_unreviewed / persona_applicability_unapproved / dev_recipient_guard_not_on_main. |
| D-P3 | Real QA journey deliveries and receipts | Designed, not executed by this harness. Earlier H9 deliveries are separate commerce proofs, not Phase 3 results. | L1; weight 2. BLOCKED provider_account_mode_unverified and target safety. |
| D-P4 | Running resumable real-clock watcher, ledger and full looped run | Pure due-time/resume helpers exist in Phase 1, not a running watcher. Original clock scenario MISSED. | L1; weight 2. BLOCKED no_dev_runner_for_real_clock_items. |

### 2.5 E and F — missing source rows are not fabricated

| Source | Intended items | Level / weight / source memberships |
|---|---|---|
| E manual sheet | Thirteen section identities **unknown** | UNKNOWN; weights unknown; cannot de-duplicate or assign section completion. D section 13's human checks remain listed below, not substituted for E. |
| F 7 October readiness document | Twelve item identities **unknown** | UNKNOWN; weights unknown. No production access or inferred production proof. |

### 2.6 G — recovered blocker rows

These are **closure requirements**, not additional automations. Each retains
UNKNOWN ladder applicability and is not granted L3 by a design or prior
successful test. The state column is a factual disposition, separate from
the automation ladder. Weights are judgments, not denominator additions.
All rows map to BLOCK; superseding evidence is named.

| Blocker ID | Part / journey membership | Current evidence-backed state and closure needed | Weight |
|---|---|---|---:|
| must_have_payment_ordering_unknown | C05–10; J5 | HELD: trusted eligibility/payment instant unproven; actual item-change handoff blocked. Founder provenance approval/proof. | 3 |
| payment_rail_unknown | C04–10; J4–6,J9,J22 | HELD: readable local rails are not complete lifecycle/provenance. | 3 |
| stripe_activity_before_local_persistence_or_unstamped_lifecycle | C04–10; J4–6 | OPEN: provider can act before a local write or without reliable activity stamps. | 3 |
| off_platform_partner_payment_without_local_update | C04–10; J4–6 | OPEN: no authoritative local evidence for partner-only payment. | 3 |
| fee_ledger_source_without_proven_traveler_ownership | C04–10; J4–6 | OPEN: orphan/non-service typed sources not safely attributable. | 3 |
| commerce_runtime_not_on_target | C02–10; J4,J5,J8,J9,J22 | HELD: H is not on main; no approved conflict resolution. | 3 |
| normal_cart_reminder_sending_blocked | C03–10; J4,J22 | HELD by explicit founder instruction; subset tests do not authorize normal sends. | 1 |
| automation_inventory_union_unresolved | D Step 0 | OPEN: registry/outside-registry union not certified. | 2 |
| automation_coverage_unresolved | D Gate A | OPEN: six unbound registry nodes and fifteen context-only mappings in INV. | 2 |
| journey_step_binding_unreviewed | D Gate A | OPEN: 173 proposed source-step mappings, 25 unbound steps; no approved executable binding. | 2 |
| notification_types_unresolved | J23 | OPEN: 63 helper/source sites include dynamic event types. | 2 |
| persona_applicability_unapproved | D Gate B | HELD: 550 proposed cells, 107 required / 372 optional / 71 N/A; proposals are not approved exclusions. | 2 |
| signup_verify_order_deviation | A02; J1,J11 | OPEN and code-confirmed: welcome guard omits verified status. | 3 |
| cancel_email_change_coverage_unproven | A26–27; J9,J13 | OPEN: welcome/itinerary reject recipient changes; full direct/pending-family coverage not proven. | 3 |
| dev_recipient_guard_not_on_main | E2 safety; D-P2–4 | **Built on Q, still absent from main/running target.** Earlier “unapplied proposal” wording is stale. Owner review + owned-runtime proof required. | 3 |
| qa_inbox_settings_absent | E2/E3/E7 safety | **Storage restored by secure form on 13 October; not currently an input-wait blocker.** Existing process/owned-runtime injection unknown. No secret values read in this audit. | 3 |
| digest_scheduler_prod_only | J18/E8 | BLOCKED: production-only scheduler cannot be proven under this development-only hold. | 2 |
| golden_full_baseline_blocked | C01,C07,C10 | Five DB groups approved and run 13 October, 56 per loop. Full current-main combined gate remains open; Task #1849 implemented separately, not proof of execution on this main. | 2 |
| golden_runner_not_on_main | C01,C07,C10 | Prior report's target lacks runner. Restoration task implemented, review/integration status not equated with merged main. | 2 |
| provider_account_mode_unverified | E7; D-P3 | BLOCKED: current account/mode and delivered authentication-header proof not established by key presence. | 3 |
| clock_due_execution_unproven | C03,C04,C09; D-P4 | **MISSED**, not waiting: stale heartbeat and zero owned outbox at recorded read. | 1 |
| unknown_timezone_or_preferences | C04,C06,C09 | Stored Asia/Kolkata, enabled=true; quietStart/quietEnd NULL. Parser rejects incomplete object. Profile changes explicitly held. | 1 |
| real_next_day_receipt_missing | C04,C09,C10 | MISSED / OPEN: no genuine due-time delivered receipt; future scenario needs new approval. | 1 |
| final_read_send_residual_window | C06,C08–10 | Marketing-only risk accepted, measured; not eliminated or a production bound. Must-have exception not granted. | 3 |
| real_provider_once_only_unproven | C06,C09,C10; J10 | Durable intent repaired on H, mocked two-loop evidence; real-provider once-only/recovery proof still held. | 3 |
| not_built_automation_reachability_guard | J25 | OPEN: missing names/emitters do not prove executable unreachability. | 2 |
| held_migration_and_main_reconciliation | C02,C03,C10 | HELD: numbering proposal is stale; no renumber/registration/conflict resolution here. | 3 |
| public_repo_memory_tracking | Repository safety | **FIXED on main** by separate cleanup; current main also carries a guard. Not an open automation blocker and not counted as an email completion. | 3 |
| no_dev_runner_for_real_clock_items | C03,C09; E8/D-P4 | OPEN: no evidence of an executing owned runner at genuine due times. | 2 |
| production_scheduler_proof_requires_release_authorization | C10; E8 | HELD: separate production proof/permission, not solved by a development heartbeat. | 2 |

Five recoverable **current** decision findings follow. They must not be
silently substituted for the missing original D1–D12 sheet. D6–D12 identities,
owners and dates in that original sheet are **UNKNOWN**.

| Current decision | Evidence and actual policy finding | State / weight |
|---|---|---|
| E2E-D1 signup order | D:123 onward; GATE D1; M welcome guard:15–26. Intended verify-first, not guaranteed by code. | L1 design/ruling, deviation OPEN; 3 |
| E2E-D2 retry ladder | GATE D2; M outbox BACKOFF_MINUTES. Built 5/15/45/120/360 minutes, six attempts, not the brief's 1/5/30. Test-as-built instruction does not establish full spec compliance. | L1 policy disposition; 2 |
| E2E-D3 kill-switch scope | GATE D3; generic email service vs direct SDK senders. Observe/report bypasses; no switch change authorized. | L1 policy disposition; 3 |
| E2E-D4 changed email | GATE D4; cancel pending obligations, never retarget silently. Partial welcome/itinerary implementation, broad proof missing. | L1 policy disposition; 3 |
| E2E-D5 absent automations | GATE D5; unresolved thresholds/reachability remain NOT BUILT/BLOCKED. No stubs. | L1 policy disposition; 2 |

L1 here records an existing decision/design, **not completion**. It also does
not grant a new approval. Blocker requirements have no defensible standalone
“email delivered” denominator.

## 3. Percentages, formulas and evidence coverage

### 3.1 Count and coded completion

Percentages are **truncated**, never rounded up. These are evidence coverage
fractions, not measured production reliability.

`Count completion = evidenced L3+ rows / recovered rows`.

`Coded completion = evidenced L2+ automations / recovered automations`.
For non-automation bundles, strict code-plus-registry applicability is
unresolved; code artifacts are reported separately, not awarded invented L2.

| List | L3+ count completion | L2+ coded completion | Qualification |
|---|---|---|---|
| A | **0/31 = 0%** | **3/31 = 9.67%** | Three registered account families; no qualifying current full proof package. |
| B | **0/14 = 0%** | **9/14 = 64.28%** | Five on main, four held. Main alone: 5/14 = 35.71%. |
| C | **0/10 Part bundles** at L3; atomic-deliverable percentage **unknown** | **Unknown** | Code/reports exist for ten Parts, but that is neither ten registered automations nor ten proven deliverables. |
| D | **0/4 phases = 0%** with requested full-proof completion | **Unknown under strict ladder** | One of four harness phases has implementation artifacts (**25% artifact presence**), not 25% verified journeys. |
| E | **Unknown** | **Unknown** | Manual sheet missing. |
| F | **Unknown** | **Unknown** | 7 October readiness source missing. |
| G | **Unknown** | **Unknown** | Original decision list incomplete; closure requirements not email automations. |
| Recovered automation subset A+B | **0/45 = 0%** | **12/45 = 26.66%** | Main-only 8/45 = 17.77%; other four unmerged. |
| All A–G, de-duplicated | **Unknown** | **Unknown** | Do not manufacture an overall denominator from expected counts. |

For the available 45 rows, **12 are L2, 33 are L0** under the reviewed
automation-contract inventory. This is 12 built-but-unproven, 33 without an
identified matching implementation, including the three decision exclusions.
No row is certified L3/L4/L5 here. Partial endpoint functionality and historical
evidence are separately disclosed instead of being counted as full automations.

### 3.2 Weighted completion

`Weighted % = Σ(weight × level-score) / (100 × Σ weights) × 100`.

Scores: L0=0, L1=10, L2=40, L3=75, L4=90, L5=100.

| Scope | Weight sum | Weighted numerator / maximum | Result |
|---|---:|---:|---:|
| A | 86 | (3+2+3) × 40 / 8,600 = **320/8,600** | **3.72%** |
| B | 22 | (2+2+1+1+1+1+1+1+3) × 40 / 2,200 = **520/2,200** | **23.63%** |
| A+B recovered automations | 108 | **840/10,800** | **7.77%** |
| C–G individually / all-source overall | Unknown/applicability unresolved | Unknown | **Unknown**, not blended into the automation number. |

This includes original-plan credit/wishlist rows at zero in historical progress,
while excluding them from the separate release denominator. That preserves the
difference between “removed from scope” and “implemented.”

### 3.3 Release readiness

`Release readiness = evidenced L4+ / release-scope rows`.

Recovered A+B exclusions only:
**B03 one_credit_left**, **B04 out_of_credits** (user dropped, 4 October),
**B09 wishlist_price_drop** (user deferred, C1).
The abandoned-chat reachability finding is not treated as a separate blanket
founder waiver of the whole remaining plan.

Thus **0 / (45−3) = 0/42 = 0%** for recovered intended automations.
Overall A–G release readiness is **unknown**. Direct-sender conversions were
explicitly excluded from the commerce lane, not declared safe or complete.
An accepted marketing residual is a limitation, not a completed fix.

### 3.4 Ten-gate scorecard for every L2+ automation

G1 trigger; G2 recipient; G3 content; G4 once-only; G5 cancellation;
G6 consent/limits; G7 failure; G8 concurrency; G9 observability;
G10 real delivery/render/links.

The strict count below requires a **whole gate**, mapped to that automation
and current target/version. A fresh partial or branch-only test is not a
whole-gate certificate. `H` = historical/older target; `P` = recent partial
component evidence; `O` = open gap. None means “passed fresh in this audit.”

| Automation | G1 | G2 | G3 | G4 | G5 | G6 | G7 | G8 | G9 | G10 | Whole fresh gates / 10 |
|---|---|---|---|---|---|---|---|---|---|---|---:|
| verify_email | H | H | H | O | O | O | O | O | O | O | 0/10 |
| welcome_email | O | P | H | P | P | P | P | P | O | O | 0/10 |
| password_reset_request | O | H | H | O | O | O | O | O | O | O | 0/10 |
| itinerary_ready | P | P | H | P | P | P | P | P | O | O | 0/10 |
| itinerary_failed | P | P | H | P | P | P | P | P | O | O | 0/10 |
| itinerary_nudge_2h | P | P | H | P | P | P | P | P | O | H | 0/10 |
| itinerary_followup_24h | P | P | H | P | P | P | P | P | O | H | 0/10 |
| itinerary_reengagement_5d | P | P | H | P | P | P | P | P | O | H | 0/10 |
| cart_reminder_1h | H | H | H | H | O | H | P | H | O | H | 0/10 |
| cart_reminder_1d | H | H | H | H | O | H | P | H | O | H | 0/10 |
| cart_reminder_3d | H | H | H | H | O | H | P | H | O | H | 0/10 |
| cart_item_changed | O | H | H | H | O | H | P | O | O | O | 0/10 |

**Certified whole-gate coverage: 0/(12×10) = 0/120 = 0%.**
This is a deliberately strict certification count, **not a claim of zero
passing checks**. No existing source provides a current-revision, per-family
G1–G10 certificate; the table identifies why individual passing checks cannot
be promoted to that claim. A more permissive “partial checks” percentage would
need an approved mapping/denominator and would be a different metric.

Recent, useful partial proof that is not thrown away:

- **DB, 13 October, H:** generation writers 8, itinerary follow-ups 20,
  signup welcome 22 reported entries, booking confirmation/idempotency 3,
  durable booking alert 3 = **56 per loop**, two loops. Signup's reported
  entries include suite entries; these are not 56 independent leaf scenarios.
  Ten disposable schemas removed. No real provider deliveries.
- **QA, 14 October, Q:** **59 per loop**, twice: 21 new guard cases and 38
  retained provider-free checks. Signup real-DB suite intentionally disabled;
  zero registered skipped test cases does **not** mean it was exercised.
  Mock database methods do not establish PostgreSQL concurrency.
- **H10 historical:** 143 reported golden entries, guards corrected to 78/78,
  baseline 117 diagnostics, readable cart/send/replay tests. Not a fresh
  integrated result on M; no new audit runs.

### 3.5 Delivered receipts versus complete automation proof

H9's existing receipt table is independently reviewable by immutable source
location. Outbox IDs below are local to different now-removed loop schemas:
`row 1` in one loop is not the same row as `row 1` in another.

| Family | Loop / outbox row | Provider message IDs | What was actually proven |
|---|---|---|---|
| cart_reminder_1h | L1/1; L2/1 | `01a1276a-6e6b-76b2-97b2-b0e2075a2c3b`; `01a1276a-c1a5-7884-8708-de6ab122b985` | Historical readable-subset guarded delivery, controlled eligibility time. |
| cart_reminder_1d | L1/3; L2/3 | `01a1276a-7229-74be-84d9-274cd2894df6`; `01a1276a-c62e-7eca-9ae8-0e78cf04cbd7` | Same; not a genuine elapsed one-day scenario. |
| cart_reminder_3d | L1/6; L2/6 | `01a1276a-75c5-7bb1-8f72-81d4849a2a20`; `01a1276a-c9bb-7e5c-ab3b-a7cd0836a7bc` | Same; not a genuine three-day wait. |
| cart_item_changed original copies | L1/7; L2/7 | `01a1276a-79dd-784d-829c-3ddb65d0df06`; `01a1276a-cd18-7ae2-bcef-e5f76f6ffdd3` | Copy transport only; original wording did not prove stock. |
| cart_item_changed corrected copies | L1/1; L2/1 | `01a1278b-871e-7b42-b294-54dd88d0db2d`; `01a1278b-c906-7184-a932-d52ad5736d6b` | Corrected time-qualified QA copy transport, not actual held row dispatch. |

H9:104–107, 136–141 records provider GET matching IDs and
`last_event=delivered`. This audit did not query the provider again.
H9:139–141 explicitly records actual item-change rows pending,
`must_have_payment_ordering_unknown`, `sent_at=null`, zero dispatcher
provider calls. H10:152 records open email-client/authenticated-browser proof.

LIVE contains two historical receipts per itinerary follow-up, including
`01a107eb-18f8-70dd-a656-f18d06f517ff` for the first 2h loop.
Its browser/link observations are valuable but predate subsequent relevant
source changes and are not a fresh full package for M.
Other A/B families have **no qualifying full delivered proof package recovered
here**; this is not a claim that a provider has never sent them.

### 3.6 Real-clock counts

Count **scenarios**, not provider-copy messages: **1 recovered canonical
scenario = 0 DELIVERED, 0 WAITING, 1 MISSED**. No original scenario is resumed.
No full ledger across every intended timed automation has been recovered,
so these are not all-product clock counts.

| Scenario / due step | Trusted real UTC time | Recorded outcome |
|---|---|---|
| Start `d88d08e8-baca-4cd8-acfb-6442692f2b5f` | 11 October 05:53:16.241 | Stored activity timestamp; not backdated for this scenario. |
| 1h | 11 October 06:53:16.241 | Authorized historical late non-sending invocation at 13:02:33.726: 1 candidate, 0 enqueued, 1 skip `unknown_timezone_or_preferences`. Not on-time scheduler proof. |
| 1d | 12 October 05:53:16.241 | MISSED. At 13 October read: owned outbox 0, receipts 0; last successful heartbeat 11 October 13:02:35.315. |
| 3d | 14 October 05:53:16.241 | Due has now passed; scenario already terminal MISSED and not resumed. No new due-time observation was obtained for this step. |

Stored zone: **Asia/Kolkata**; local 1d due **11:23:16.241 IST**, within the
required send window. `enabled=true`, `quietStart=NULL`, `quietEnd=NULL`.
The parser needs the missing fields. Do not describe a hypothetical new
evaluation as an observed skip. Zero owned rows is not the full four-part
provider/inbox absence proof.

### 3.7 S1–S12 coverage

The master brief defines: S1 happy path; S2 duplicate signals; S3 concurrency;
S4 cancellation; S5 consent/limits; S6 recipient; S7 missing data; S8 failures;
S9 time/restart/real clock; S10 security; S11 rendering; S12 regression.
These are **not** D's twelve “break attempts” or twelve system checks.

There are **zero L3+ automations in this audit**, so the requested
per-L3+ scenario table has **zero eligible rows**, and the aggregate is
**0/0, N/A — not 100%**. No complete current per-automation S1–S12 certificate
is recoverable. Historical H8 demonstrates many S1–S8 cases, H9 transport/copy
proof, and LIVE link/browser checks. S9 real-clock, S11 full client matrix and
current integrated S12 remain open. No historical scenario count is fabricated.

## 4. Where the work is behind the plan

### Ten biggest gaps by user impact

Order is an audit judgment, not a new implementation authorization.

| # | Missing / why a traveler or operator cares | Blocker type / owner | Smallest next step, not executed |
|---|---|---|---|
| 1 | Complete payment provenance: a paid traveler must not receive an unpaid-cart reminder; birth records cannot prove later external activity | Decision + code / founder and provenance owner | Review the separate ownership/timing proposals; approve exact scope or retain fail-closed suppression. |
| 2 | Actual item-change eligibility/send ordering: current copies do not prove a safe stock/price notice after a payment or sell-out | Decision + code / founder | Set the trusted eligibility instant and inventory guarantee; approve a bounded proof plan. |
| 3 | Development safety target: an unguarded running drain can reach non-QA recipients even though a guarded branch exists | Review + environment / main owner and QA owner | Review Q and specify an owned guarded target; do not restart or drain main in the meantime. |
| 4 | Real due-time runner: without one, next-day emails cannot be proven to run at all | Environment + approval / QA owner | Approve a genuinely live owned runner/watcher and a **new** scenario after safety prerequisites. |
| 5 | Welcome-before-verification and signup enumeration: wrong sequencing and a response exposing an existing account | Code + policy / main owner and founder | Approve a small auth/outbox correction plan and dedicated proof; no auth edit in this audit. |
| 6 | Second reset request does not invalidate older reset tokens: more than one usable reset link can coexist | Code + security review / main owner | Approve an isolated token-lifecycle design and two-request/concurrent proof. |
| 7 | Missing account lifecycle notices: verification reminders, password-change/new-device, deletion/reactivation and email-change guarantees are not implemented as specified | Scope + code / founder | Prioritize A's security families and resolve in-app/email proof applicability before building. |
| 8 | Direct senders outside durable outbox: crashes/retries can lose messages or duplicate them, and generic safety switches may not apply | Explicit scope decision / founder | Review the existing ten-family inventory; vendor bulk first in a separately authorized lane. |
| 9 | Integration and operational visibility: held cart code, stale heartbeat numbering and uncertain-attempt reporting are not an integrated reviewed release | Review + code / main owner/founder | Approve reconciliation/number/visibility scope separately, then collect version-matched evidence. |
| 10 | Missing complete audit/test scope: source sheets, step bindings, persona approvals and client/header proof are incomplete | Person + evidence / founder, QA recipients, legal owner | Supply E/F/original decision sheet, approve applicability, then agree exact proof matrix. |

### Planned order versus actual order

- A1 says verify-before-welcome must be fixed before core signup certification,
  and extended automations follow a proven core. Main still allows the welcome
  eligibility gap; most A families have no matching node.
- Stage 2 was supposed to start after individual outcome/follow-up sanity
  proofs and then cross-lane collision proofs. Later cart Parts progressed on
  an **explicitly accepted readable-record DEV-CLOSED subset**, while payment
  rails, current-main integration and normal sending stayed blocked. This was
  a permitted development sequencing decision, not evidence of release closure.
- Real delivery copies and later final reports preceded a genuinely live
  real-clock runner. The resulting next-day scenario was missed.
- Part 10 review still had a reproduced provider-accepted/DB-failure duplicate
  risk; later development repair does not retroactively make that earlier gate
  a successful safety test.
- Part 7 removed/archive-proved fifteen development triggers, but unidentified
  wrapper/helper/draft identities and eight deferred functions were carried
  forward by owner decision. “All legacy mutation code removed” is unsupported.
- Phase 1 harness exists before approved executable bindings, full persona
  applicability and runtime recipient protection on its target. It correctly
  refuses real journeys. The later Step 0 work does not mean Phase 2 ran.
- Current-main full regression restoration is separate work. Its task marked
  IMPLEMENTED is not a passing combined run on this audit revision.

### Human dependencies and wait ages

Elapsed dates below are **lower bounds since an available dated record**,
not guesses at original request times or time a person spent working.
Age is whole elapsed days as of 15 October 2026 UTC unless a time is shown.

| Dependency | Earliest dated record used | Age / present status | Person who must act |
|---|---|---|---|
| Provenance/eligibility and current-main reconciliation | H final state by 11 October | At least 4 days documented; not all approvals exist; owner review still required | Founder / main owner / provenance owner |
| Original true clock proof | Start 11 October 05:53:16.241 | 1d due missed; at least 3 days past the 1d due by audit date. **Not an inbox wait.** | New scenario/runner approval by QA owner |
| Quiet-hour preferences | CLOCK read 13 October 17:05:47.185; explicit “hold” in supplied conversation | At least 1 full day documented; changes intentionally held, not forgotten | QA account owner |
| QA inbox settings | Secure re-entry confirmed 13 October; Q report 14 October | **No outstanding request to re-enter assumed.** Saved; owned-runtime injection unknown | QA/runtime owner only if approved runtime check requires it |
| Exact QA guard integration | Q implementation 14 October 14:58:43 UTC | At least 1 full day documented; implemented, unmerged, not installed | Main owner |
| Applicability/bindings and D1–D5 findings | I reports 13 October | At least 1 full day documented; no complete approval recovered | Founder |
| Provider mode/authentication and human client checks | H10 by 11 October; I repeats 13 October | At least 4 days documented; previous receipts are not current header/client certification | Provider account owner and monitored-inbox reviewer |
| Legal/deletion wording | A1 specification; no dated legal approval recovered | **Wait age unknown**; do not invent legal approval or a request date | Product/legal owner |
| Other workspace list for private-note preservation | Task #1852 active/waiting at planning | **Wait age unknown from inspected records**; not a blocker on the already-fixed main hygiene item | Workspace owner |
| Missing E/F/original D1–D12 source pack | Explicit current audit request 15 October | Identified in this audit; no earlier wait duration claimed | Document owner |
| Production scheduler/release permission | Explicit held release in H10 and later decisions | Intentionally held, not a delayed deployment request | Founder / human release operator |

### Environment blockers, corrected for current evidence

| Item | Evidence now | What it holds up |
|---|---|---|
| No proven dev runner at actual due times | CLOCK's stale 11 October heartbeat, zero owned rows at 13 October read | Genuine 1h/1d/3d and later clock/scheduler proof |
| QA settings “absent” | **Stale as a storage claim**: secure-form responses confirm both saved in development; current process injection not checked | Live ownership/allowlist proof, not requesting addresses again |
| Recipient guard “not built” | **Stale**: Q has four-file implementation and two 59-case loops; not on main | Any approved future live QA execution on current target |
| Guard covers every direct sender | **Not true**: shared-client boundary covered, direct SDK callers outside it remain excluded | Any broad drain/direct-sender safety claim |
| Every denied send preserves retry count | **Not proven**: early denials and late generic denials hold without an attempt; late specialized welcome/itinerary SDK denials can still follow existing failed-attempt accounting | Uniform hold/retry-accounting claim; transport remains blocked |
| QA traveler unknown zone | Zone is stored, but **quiet-hour fields missing**; parser rejects the incomplete object | Clock eligibility |
| Main contains held commerce sweep | Not shown by target tree/roster; H contains its registered job | Normal cart sweep/integration |
| Current account/mode/SPF/DKIM/DMARC | Not verified by this audit; provider-key presence is insufficient | Real-provider/header proof |
| Production scheduler | No authorized current proof here; production-only paths remain separate | L4 operational readiness and L5 post-release proof |
| Public working-note tracking | Fixed on main; don't repeat as an open blocker | No present main automation hold from that fixed finding |

No secret values, inbox addresses or environment dumps were read. “Saved by
secure form” is an existing record, not a new inspection of deployment secrets.
This audit cannot assert current production configuration.

## 5. Defects, sender inventory and safety risks

### Known findings and their actual status

| Finding | Evidence | Status / severity judgment |
|---|---|---|
| Welcome can precede verification | M `signup-welcome-outbox.service.ts`:15–26 checks account/email/consent/sent, not verification; enqueue in signup transaction. No enforced dependency on verify completion. | **OPEN, high** sequencing/security-expectation gap. Not a new live reproduction. |
| Second reset link does not revoke first | M `emailAuth.ts`:334–345 inserts a reset token without revoking existing unused tokens; reset consumes selected token at 399–405. Contrast verification resend at 477–484, which does burn prior tokens. | **OPEN, high** security lifecycle gap based on static code. No new reset requests made; concurrent behavior not newly tested. |
| Registration reveals existing account | M `emailAuth.ts`:95–105 returns “An account with this email already exists.” | **OPEN, high** against A1's neutral-signup rule. |
| Provider accepts, DB then fails | H `automation-release-blockers.md`:80–87 reproduces duplicate submissions/lost acceptance; later `automation-part10-remediation-results.md` durable-intent repair, 11 cases × two loops | **FIXED on held development branch for tested automatic-retry risk; real provider proof OPEN, high.** Not a main/production fix claim. |
| Uncertain attempts not visible | H final state earlier said dead-only visibility gap; later accepted dev safety report adds owned uncertain reporting | **Partially addressed on held branch, target/operator visibility UNVERIFIED, high.** Processing uncertainty cannot be described as “never delivered.” |
| Heartbeat false-green / first failure cannot be recorded | Held query-fault tests fail truthfully; persistent `last_success_at` NOT NULL incompatibility needs held migration; owned-only exception approved | **Subset fix, infrastructure release gap OPEN, high.** Do not invent success to satisfy a NOT NULL column. |
| Final-check→send payment/inventory window | H8:167–175; payment 25.628 / 31.907 ms in two synthetic loops | **Accepted limitation for marketing only, high.** Not eliminated, not a production upper bound, not permission for must-have change emails. |
| Active listing incorrectly treated as stock | H9:22–30, 121–141 | **Fixed in QA copy harness only** with recorded-capacity/unknown wording. Actual application/send guarantee still held. |
| Test/gate failures | H10 guard initially 77/78; corrected 78/78; Part 9 vendor fixture typecheck 119→117 | **Historical verification corrections**, not current globally clean compiler or all-source certification. |
| Real-clock liveness | CLOCK:16–37 | **MISSED**, medium/high operational impact; no retry/backfill allowed. |

### Direct senders — every originally identified family

Direct senders were explicitly outside the commerce conversion lane.
`H:reports/commerce-direct-senders.md` is the detailed file/line/risk inventory;
INV independently maps direct SDK and generic senders on the inspected main
runtime. Lines drift between revisions; the immutable inventory remains the
source of its exact original locations. No sender was changed.

| Suggested order / family | File owner(s) from retained inventory / current source family | Reliability and duplicate risk |
|---|---|---|
| **1 Vendor bulk email** | `server/services/vendor-management.service.ts`:234,283; `server/routes/trips.routes.ts`:1200 | Batch/provider acceptance can diverge from durable row state; retry can duplicate or report false sent. First separately authorized conversion candidate. |
| 2 Booking/claim cancellation, decline, refund, expiry/failure notices | `server/services/email.service.ts`:817,930,1049,1125,1547; `server/routes.ts`:7790,7883; `server/services/checkout-claim.service.ts`:1507–1509,1689,1738,2156 | Multiple lifecycle writers/signals; direct notices may bypass shared outbox retry/dedupe. Some canonical/legacy confirmation paths are already durable; do not reconvert those. |
| 3 Auth reset and verification | `server/services/email.service.ts`:650–713,731–787; `server/replit_integrations/auth/emailAuth.ts`:349 and verification callers | Direct SDK failures lack the generic durable outbox obligation; replay/token timing needs proof. Welcome is separately outbox-backed now. |
| 4 Identity verification decisions | `server/services/email.service.ts`:1624–1677; `server/routes/admin.routes.ts`:3122 | Decision persistence versus transport uncertainty; repeated decisions can resend. |
| 5 Expert application decisions | `server/services/email.service.ts`:1702–1755,1780–1835; `server/routes/admin.routes.ts`:3000,3029 | Direct send can be lost after commit or duplicated by repeated actions. |
| 6 Provider application decisions | `server/services/email.service.ts`:1874–1932,1958–2014; `server/routes/admin.routes.ts`:3331,3365,3412 | Same transport/lifecycle risk; distinguish in-app follow-ons. |
| 7 Plan-delivered notices | `server/services/email.service.ts`:2056–2111; `server/routes/booking-actions.ts`:1444 | Registered producer/direct helper and AI outcome outbox path are not identical rails. Registration alone is not durable delivery. |
| 8 Plan approved / changes requested | `server/services/email.service.ts`:2128–2183,2200–2261; `server/routes/booking-actions.ts`:1613,1619 | Multiple decisions/retries can duplicate; no universal durable retry guarantee. |
| 9 Plan suggestions | `server/services/email.service.ts`:2281–2336; `server/routes/booking-actions.ts`:1153 | Repeated suggestion actions/uncertain acceptance; not fully outbox-converted. |
| 10 Admin digests | `server/services/email.service.ts`:1251–1398; `server/services/admin-digest-scheduler.service.ts`:189; `server/jobs/dailyAdminDigest.ts`:190 | Generic and SDK alternatives; production-only scheduling and uncertain-attempt wording/visibility require proof. |
| Unused confirmation helper | removed | The deprecated direct confirmation sender had no caller and was deleted. Confirmation mail is the outbox type `booking_confirmation`. |

Additional separately inventoried source categories outside those ten:
nightly QA notifications, admin manual test sender, CLI test sender,
AI upstream notifications, ready-made notices and occasion/activity messages.
Some are already outbox-backed; they must not all be called direct senders.
The original Step 0 cross-check explicitly keeps **activity-email**, canonical
booking confirmation and the legacy bookings-table confirmation rail distinct.
“All email comes from email_outbox” remains unsupported.

### Risks that remain

- **Duplicate/lost delivery:** provider acceptance can precede a durable local
  acknowledgement. Resend's documented idempotency retention, cited in H's
  remediation proposal, is **24 hours**, not indefinite. Durable intent plus
  uncertain-attempt hold must be proven with the actual provider before
  claiming once-only. A mocked deduplicating transport cannot prove it.
- **Wrong recipient:** changed email, suspended/deleted accounts, ownership
  transfer, and paths outside the shared guarded client need their own mapped
  send-time proof. Domain matching alone is not the exact QA allowlist.
- **Money:** external activity, ambiguous owner joins, unstamped lifecycle and
  provider-before-persistence cannot be “unpaid” by absence of a local row.
  Fail-closed suppression protects against a wrong email but may suppress a
  legitimate one; it is not complete coverage.
- **Direct transport:** registry membership and a kill switch on generic
  `sendEmail` do not cover all direct SDK actions or make them durable.
- **Observability:** “processing,” “uncertain” and “dead” mean different things.
  Ambiguous acceptance must be visible and must not invite a blind resend.
- **Operational drift:** held code, main code, fixture namespaces and production
  are different targets. A healthy app or task state is not a running scheduler
  or a proof that the approved revision was deployed.

## 6. Shortest honest critical path

**Proposal only. Nothing in this section is authorization.**
S/M/L are relative effort judgments, not promised dates. Missing original
scope makes a total duration estimate indefensible.

### A. To development-complete

| Order | Smallest necessary action | Size | Dependency / owner | Real elapsed time |
|---|---|---|---|---|
| 1 | Recover E/F/original decision source; approve family aliases, step bindings, persona applicability and email-vs-in-app proof treatment | S–M | Document owner/founder; Replit prepares maps | None inherent; approval wait unknown |
| 2 | Review safe target: Q guard, current-main cart projection, held helper identities, golden restoration; approve exact diffs | M | Main owner + founder; Replit only after approval | None inherent |
| 3 | Decide trusted payment/ownership/inventory eligibility and held heartbeat schema/next-free number | M–L | Founder + provenance/main owners; separate approved scope | External/partner evidence wait unknown |
| 4 | Implement only newly authorized gaps, retain fail-closed UNKNOWN handling; build missing agreed security/core families | L | 1–3; Replit with separate auth/payment/schema approvals if needed | Timed lifecycle proof later; no payment edits authorized by audit |
| 5 | Run approved version-matched provider-free/DB/race/fault/golden/typecheck gates with fresh randomized fixtures; do not raise baseline | M | Safe integrated reviewed target; QA authorization | Two consecutive clean loops; failed loops reset; six unclosed → structural risk |
| 6 | Approve bounded real provider/recipient/once-only proof, then rendering, authenticated links, unsubscribe, headers and human client checks | M | Target guard/injection, permissions, monitored inboxes, provider owner | Negative absence windows **≥30 minutes**, two sweeps + post-due drain; actual delivery observation |
| 7 | Start a **new** genuine clock scenario with an executing owned runner and read-only watcher; preserve old MISSED history | M | Safe target, complete preferences, payment eligibility, explicit delivery/runner approval | Cart **1h, 1d, 3d**; itinerary **2h, 24h, 5d**, as in agreed scope |
| 8 | Reconcile per-rule/per-family evidence, ten gates and S1–S12; no incomplete rule silently skipped | S | Prior steps + missing source recovered | No extra arbitrary wait; repeat actual failed proof, not all successful checks |

Other original-plan waits, if those families remain required: verification
reminders through **3 days**, engagement nudges at approved **2/3 days**,
deletion completion **7 days** with reminder two days before cutoff,
dormancy at the **owner-approved threshold**. The older draft proposes
14 days, but this audit does not treat a proposal as a final policy.
Optional real DST-transition watches require separate owner request; they
are not invented current prerequisites.

**Parallel work:** source recovery/applicability, provenance design review,
direct-sender scope review and legal/copy review can run in parallel as
proposals. After target safety and policy are settled, independently owned
QA scenarios can share real elapsed wait periods; do not share accounts in a
way that invalidates the daily marketing cap. No acceleration by backdating
can replace the final genuine waits.

### B. From development-complete to release-ready / production-proven

| Order | Action | Size | Dependency / owner | Wait |
|---|---|---|---|---|
| R1 | Review one integrated PR with current evidence, DDL/removal archive, exact kept/removed/held list, direct-sender risks and residual acceptance | M | Development gate and main owner/founder review | Approval wait unknown |
| R2 | Re-check migration ownership/number and obtain explicit registration/release decisions; record ledger only at actual merge | S–M | Founder + human merger; no pre-approval registration | No inherent timed wait |
| R3 | Prove approved scheduler/heartbeat/recovery execution in the authorized target and settle all release-scope UNKNOWNs or explicit scope decisions | M | Founder authorizes target/proof; QA executes | Actual schedule slots and bounded outage/recovery observation |
| R4 | Obtain explicit release authorization; human operator publishes approved clean main, declining schema-diff/database-copy offers | S | Founder/human operator; no agent self-publish | Boot/scheduler observations, not a promised duration |
| R5 | Separately authorized read-only deployed commit/config/migration/first-delivery and production scheduler checks | M | Explicit production-proof authorization; release operator/QA | Real scheduled execution and delivery; no inferred health-only pass |

L4 is not the same as L5. Production evidence is required only after authorized
release, and is outside this audit. Direct NAVITIME contracts, affiliate
inventory, fee-policy changes and other unrelated product/deploy dispatches
are not added to the automation critical path.

## 7. Honesty checks and report limits

**Measured or directly read:** source enumerations 31/14; main/held revisions;
three main account nodes, five main itinerary families, four held cart
families; existing JSON/log/report counts; recorded receipt IDs; stored-time
ledger observations; current source guard conditions and token insertion;
the QA guard diff and lack of that diff on main. These are read-only
observations, not new operational runs.

**Judgments:** weights, gap priority, severity, S/M/L sizes, mapping intended
contracts to existing aliases, and conservative gate-certification assignment.
The 0% certified count describes recoverable evidence under the requested
standard. It must not be reported as a measured 100% system failure rate.

**Unknown or unverifiable in this scope:**

- The missing manual sheet, 7 October readiness list and original D1–D12
  identities; exact all-source denominator and all-source weighted percentage.
- Full distinct union of registry, dynamic senders, scripts and notification
  types; 89 registry entries are not that union.
- Current production configuration, recipient/inbox state, provider events,
  actual running process secret injection and scheduler execution.
- Current development catalog/outbox state after the last recorded checks.
  The earlier “zero triggers/zero owned outbox” is dated evidence, not a new query.
- Full email-client/header/browser matrix, actual all-rail lifecycle timing,
  real provider once-only semantics and late-payment behavior.
- Current full self-test/golden/build result. **No tests were run** here.
  TypeScript baseline evidence is 117 diagnostics with nonzero exit, not a
  globally clean compiler/build.
- A fresh union of every retained scenario ledger. One canonical original
  clock scenario is recoverable; its terminal MISSED status is known.

**Earlier claims requiring correction or qualification:**

1. “Part 4 genuinely complete” is not supported: UNKNOWN rails, actual
   item-change ordering, genuine next-day proof and production checks remain.
2. “143/143” was a historical number of **reported entries**, not 143 unique
   DB tests or a fresh result on current main. The fresh approved DB subset is
   56 per loop; do not add it to 80/87 earlier entries to manufacture parity.
3. “Two clean loops” on readable records is DEV-CLOSED subset evidence, not
   all-rail closure or automatic L3/L4.
4. “All item-change emails delivered” is false: the delivered messages were
   copies, while actual dispatcher rows stayed held.
5. “Real-clock WAITING” is superseded by the owner's MISSED decision. Do not
   leave a passed due time waiting indefinitely or invent a past send.
6. “QA guard still only a proposal” is stale: Q is implemented. “Guard installed
   on main” is also false.
7. “QA settings missing” is stale as an input/storage claim. “Settings definitely
   injected into the running process” is unproven.
8. “Original golden runner permanently unavailable” is stale: retained runner
   exists and restoration Task #1849 is implemented. Current-main integration
   and fresh combined proof are still separate.
9. “All 37 wrappers/helpers removed” is unsupported; accepted unidentified
   identities and deferred eight-function cleanup remain documented.
10. “No duplicate risk” cannot be inferred from passing characterization tests
    that deliberately reproduced duplicate submissions. The later durable-intent
    repair has a limited, explicit development proof boundary.
11. “Public working-note tracking remains open on main” is stale; cleanup and
    guard are now present. Other workspace preservation is a separate dependency.
12. A task's PROPOSED/IMPLEMENTED state does not prove or disprove an operational
    result. The five approved database groups were actually run despite an older
    proposal state; restoration implementation is not a fresh integrated run.

The report does not assert a newly numbered migration. H's provisional “370”
proposal and earlier draft “360” are historical collision records, not the
current next free number. Main's registry must be re-read at a separately
approved integration turn. No migration was renamed, registered or applied.

## 8. Final plain answer and Part table

**For the 45 intended automations whose identities are recoverable, 0% is
currently evidenced as complete under your strict L3 standard; 26.66%
(12/45) has code and registry coverage, including four held/unmerged cart
families, and 73.33% (33/45) has no identified matching automation
implementation, including three explicitly removed/deferred items. The
percentage for the whole A–G plan is unknown because source lists and
non-email proof applicability are incomplete. The biggest improvements would
come from an approved safe integrated target, resolved payment/eligibility
guarantees, and current end-to-end plus genuinely scheduled real-clock proof.
None of those approvals or proofs is supplied by writing this audit.**

“Delivered” below means a **fully evidenced Part bundle**, not a sent email or
the existence of a report. Atomic deliverable totals remain unknown; the ten
known Part bundles provide only the parent-level denominator.

| Part | Planned | Fully evidenced delivered | Percent | Biggest open blocker |
|---|---|---:|---|---|
| 1 | Baseline/protection/reuse/inventories, isolated proofs, fresh golden/typecheck | 0/1 recovered bundle | 0%; atomic total unknown | Fresh current-main complete baseline and full evidence |
| 2 | Atomic server clock/snapshot, activity rules, safe failure/concurrency/latency | 0/1 | 0%; atomic total unknown | Main cart-projection reconciliation |
| 3 | Registered 15-minute sweep, dedupe, truthful heartbeat and wiring | 0/1 | 0%; atomic total unknown | Held heartbeat schema + no due-time runner proof |
| 4 | All cart reminder conditions, rails, limits, claim/sequence, final third step | 0/1 | 0%; atomic total unknown | UNKNOWN rails; normal sending held; real clock missed |
| 5 | Actual item-change notices, immutable snapshot/notified-value dedupe | 0/1 | 0%; atomic total unknown | Must-have eligibility/inventory ordering |
| 6 | Full live send verification, claims, fail-closed faults, measured races | 0/1 | 0%; atomic total unknown | All-rail provenance and real-provider uncertainty |
| 7 | Approved removals, 15-trigger DDL archive, retained checks, DB regression, sender inventory | 0/1 | 0%; atomic total unknown | Accepted unresolved removal identities and deferred cleanup |
| 8 | Full scenario/race/fault matrix, two-loop closure, structural-risk reporting | 0/1 | 0%; atomic total unknown | Six carried release blockers; accepted residual not a fix |
| 9 | Actual QA delivery/render/links and genuine next-day proof | 0/1 | 0%; atomic total unknown | MISSED scenario, held item-change send, client/provider proof |
| 10 | Fresh integrated gates, one review PR/archive, merge ledger, later authorized release proof | 0/1 | 0%; atomic total unknown | Integration/release hold; production proof unauthorized |

**Report:** `reports/plan-vs-actual-audit.md`

**DEV-CLOSED WITH BLOCKERS. RELEASE HELD.**

Documentation follow-up, 15 October 2026: `reports/plan-vs-actual-follow-up.md`
clarifies the manual-sheet gap and reproduces the missing ending.
`reports/automation-decision-sheet.md` lists owner decisions/inputs.
`reports/auth-three-defects-proposal.md` proposes only the three confirmed auth
repairs. No percentages or evidence levels were changed; missing documents and
implementation approvals remain outstanding.
