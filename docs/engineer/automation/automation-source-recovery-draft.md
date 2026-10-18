# Automation source recovery and non-email completion criteria

**PARTIAL WITH DOCUMENTED GAPS — PARKED. RELEASE HELD.**

## Owner disposition — 17 October 2026

The owner has explicitly closed source recovery as **PARTIAL WITH DOCUMENTED
GAPS**. Do not retry it or keep waiting for files. The non-email ladder below
is **DRAFT V1 FOR TRACKING ONLY**, not approved for release decisions.

The authoritative prompt-book Appendix D list is now supplied in the owner's
message and recorded verbatim, with evidence qualifications, in
`docs/engineer/automation/automation-decision-register.md`. It replaces the earlier missing-original-decision gap;
E2E-D1–E2E-D5 remain a different namespace.

| Row / population | Current disposition | Percentage treatment |
|---|---|---|
| Original 13-section manual sheet | SOURCE PENDING; do not search again | Exclude source-dependent rows; neither zero nor done. |
| New manual sheet | Recreated from the E2E plan in `docs/engineer/automation/manual-test-sheet.md`; not a recovered original and not executed | Track the authored document separately; no manual-test pass credit. |
| 7 October readiness items | SOURCE PENDING; promised for later upload | Exclude unknown rows; do not invent twelve item names or use system checks instead. |
| Original D1–D12 identities | Recovered from owner's current Appendix D transcription | Decision rows are a policy register, not twelve completed flows. |
| Atomic Part/source memberships not established by available sources | SOURCE PENDING | Exclude affected atomic rows; retain known parent bundles separately. |

When a missing source arrives, reconcile and recompute only its dependent rows
and the aggregate totals affected by those rows. Do not invalidate unrelated
evidence merely to restart source recovery. The known-scope tracker is in
`docs/engineer/automation/automation-flow-tracker.md`; its totals are not an all-source census.
The older sections below are retained as a dated intake record and are
superseded wherever this disposition differs.

Date: 17 October 2026.

This is a report-only supplement to `docs/engineer/plan-vs-actual-audit.md`,
sections 1–3. It does not refresh the audit's implementation findings, certify
any flow, authorize execution, or establish overall automation progress.

## 1. New source and remaining gaps

Owner instruction:
`attached_assets/Pasted-FLOW-TRACKER-AND-COMPLETION-PLAN-Apply-the-Master-Brief_1792230406431.txt`.

| Locator in upload | What it supplies | What it does not establish |
|---|---|---|
| Lines 24–30 | Original D1–D12 IDs are authoritative; retain the distinct E2E-D1–E2E-D5 namespace. E2E-D1's required policy is verify first, then welcome. | The original twelve decision identities, wording, dates or memberships. A resolved policy is not implementation certification. |
| Lines 71–82 | Permission to draft non-email L0–L5 criteria, all marked DRAFT; readiness and original decisions will be uploaded later; request for manual-sheet provenance. | Approval of the draft criteria or supply of any of the three missing inventories. |
| Lines 118–149 | Candidate flows and corrections to investigate for a broader tracker. | A verified registry union, the missing manual sheet, or the twelve original readiness items. These candidates are not a replacement source list. |
| Lines 132–134 | Current owner scope instruction excludes credit alerts, wishlist price-drop and abandoned-chat; saved-search alerts are deferred. | Evidence that any deferred flow is built or certified. |
| Lines 168–183 | Draft ladder scores 0/10/30/65/85/100; deferred-inclusive and deferred-exclusive figures; strict and historical views. | Approval of scores, new evidence, or permission to blend them with the older audit's 0/10/40/75/90/100 calculation. |

### Source intake state

| Source | Required original | Recovery state | Consequence |
|---|---|---|---|
| E | Thirteen-section manual test sheet, with exact contents and section identities | Not supplied or located | Cannot enumerate, de-duplicate or score its obligations. |
| F | 7 October twelve-item production-readiness document | Still promised in the upload, not supplied | Cannot infer its twelve identities from later reports or system checks. |
| G | Original D1–D12 decision list | Still promised in the upload, not supplied | Cannot equate its entries with E2E-D1–E2E-D5 or new numbered decisions. |
| C | Atomic obligations underlying the ten recovered Part bundles | Parent bundles known; complete atomic inventory unresolved | Ten Parts remain ten parent bundles, not an invented atomic denominator. |
| Overall | Approved union and completion applicability across A–G | Blocked by the above and owner approval | All-source denominators and percentages remain UNKNOWN. |

### Manual-sheet provenance

On the inspected working branch, `main`, `docs/engineer/automation/manual-test-sheet.md` is
neither present nor tracked. A read-only Git history lookup across locally
available refs returned no commit for that path. Thus:

- Branch containing a recovered original: **UNKNOWN**.
- Requested path: `docs/engineer/automation/manual-test-sheet.md` — **not found**.
- Last commit: **UNKNOWN**; no locally available history result.
- Address/secret-free confirmation: **not attestable for an absent file**.

No manual sheet was created, copied or reconstructed. The current branch name
does not prove a file exists on that branch. No remote history was fetched.
An owner-supplied path, file or immutable revision is needed to resolve this.
This supplement contains no inbox addresses, credentials or raw delivery records.

## 2. Proposed non-email ladder

**Every criterion in this section is DRAFT pending owner approval.** No
existing row is promoted by this proposal. Approval of criteria alone would
not authorize tests, jobs, database access, production access or a release.

The labels follow the uploaded tracker. A deliverable receives only the
highest level whose applicable requirements are all evidenced. Missing
evidence is UNKNOWN, not evidence of success or failure. Email and mixed
email/non-email flows retain their email proof obligations.

### Common requirements

| Level | Proposed minimum evidence |
|---|---|
| L0 NOT BUILT | Required artifact or behavior has no identified implementation. Record search scope and confidence; missing evidence alone is not an exhaustive absence proof. |
| L1 DESIGNED | Traceable specification, acceptance criteria, ownership and applicable evidence requirements; no qualifying implementation yet. |
| L2 CODED | Implemented artifact exists at an exact revision and location. For documents this means authored content, not executable code. Applicable registration/wiring exists. Implementation alone is not verification. |
| L3 DEV-VERIFIED | Current, version-matched development evidence satisfies the contract. For executable behaviors: two clean loops, relevant positive/negative and failure evidence, absence proof for forbidden effects, and genuine elapsed time where required. Documents instead need reproducible source/acceptance review, not artificial execution loops. |
| L4 RELEASE-READY | L3 plus integration and dependency evidence, cleared blocking defects, required human checks and owner acceptance. Merged or demonstrably merge-ready with required checks green; merge-ready is not deployed. A job intended for scheduling also needs scheduler/roster/workflow consistency. |
| L5 PRODUCTION-PROVEN | Separately authorized, version-matched evidence from the actual production path, including configuration and scheduler evidence where applicable. Development proofs and documentation publication alone are insufficient. |

### Type-specific evidence

Each row supplements, rather than replaces, the common requirements.

| Type | L2 implementation | L3 development proof | L4 release proof | L5 production proof |
|---|---|---|---|---|
| Jobs | Registered job, real invocation path and truthful heartbeat mechanism | Actual dev passes and failures; heartbeat stamped successful only after completed passes; failure recorded as failure; dedupe, overlap and recovery evidence | Integrated job, cron roster, workflow and roster consistency checks; operational owner and alert procedure; no unresolved scheduler blockers | Actual scheduler fires for an owner-approved **N** consecutive cycles; run IDs, due/actual times, outcomes and heartbeat evidence. N remains pending, not invented. |
| In-app | Implemented producer/storage path and intended UI consumer | Authorized intended recipient sees the correct state/action; wrong recipient and ineligible cases show absence; retries do not duplicate; persistence and realtime behavior match the contract | Required roles, accessibility and human checks complete; integration and dependencies cleared | Authorized observation of the actual production event and intended recipient UI with redacted evidence |
| Push | Wired event, subscription eligibility and dispatch path | QA device receives intended push; permission denial, revoked/expired subscription, retries and duplicate suppression verified; payload and destination checked. Provider acceptance alone is not device receipt | Human device checks and applicable platform coverage; consent, configuration and operational handling accepted | Authorized production device-receipt evidence tied to actual event/configuration; no inferred receipt from enqueue alone |
| Admin | Implemented admin-only operation, UI/API and appropriate audit trail | Authorized role completes the operation with persisted result; unauthorized roles denied; relevant empty/failure/retry paths and audit outcomes demonstrated | Human admin acceptance, integrated permissions and audit behavior, no unresolved blockers | Authorized actual production operation and audit result; no production mutation is authorized by this draft |
| Documents/manual sheets | Authored, uniquely identified artifact at a revision, with scope and source citations | Every required item traced to a source; links and factual claims checked; gaps explicit; independent owner/reviewer acceptance recorded. A manual test sheet's existence is separate from execution of its cases | Approved version integrated into the release evidence; no missing required sections; owners and acceptance criteria settled | Evidence of use in an authorized production/release process. If production behavior is inapplicable, record **L5 N/A pending owner approval**, not an automatic promotion |
| Harness | Implemented retained runner, bindings, fixtures, evidence/redaction and gates | Authorized provider-free self-checks demonstrate harness behavior, including intentional failure, blocked/N/A handling, resumption and cleanup. Two clean loops; no false-green result | Integrated checks and reproducible invocation; source bindings and applicability approved; blocking defects cleared | Actual authorized production verification demonstrates the harness's intended production role; otherwise **L5 N/A pending owner approval** |

A harness verification does not certify its target journeys. A test-sheet
review does not mark its test cases passed. A job that sends email needs both
job proof and email-delivery/render/link proof. Splitting those evidence
obligations does not create two copies of one flow in a flow denominator.

## 3. Counting and evidence treatment pending source recovery

1. Retain exact original source IDs, wording, revision/date and locators.
   Never manufacture E01–E13, F01–F12 or original decision names from headings
   in a different document.
2. Map each recovered obligation to one canonical identity, retaining all
   source memberships. Exact-name similarity alone is not equivalence;
   ambiguous matches need owner resolution.
3. Keep flows, shared platform capabilities, decisions, Part bundles, manual
   cases and readiness gates as typed units. Report each population separately.
   A combined obligation denominator needs an approved atomic unit and rules
   preventing parent/child double counting.
4. Preserve historical planned membership and current release exclusions
   separately, with the owner's ruling as evidence. Show deferred-inclusive
   and deferred-exclusive results once the populations are known.
5. Strict scores require re-confirmed evidence. Historical evidence must be
   labeled with its date/revision and must not be relabeled current.
   Generous scores cannot convert a development receipt into production proof.
6. Keep the original audit's numbers as dated findings under its old rules.
   The new deferrals and draft scores mean its 42-row release denominator
   and 7.77% weighted subset score must not be presented as newly calculated
   tracker results.

For a defined population U, applicable non-deferred population R, and approved
scores s:

- Draft plan completion: `sum(s(level_i)) / (100 × |R|) × 100`.
  Show the exact fraction and also calculate using U, with deferred rows
  included. Do not silently add separate importance weights.
- Draft release readiness: `count(L4 or L5 in R) / |R| × 100`.
- User-visible today: qualifying production-evidenced user-visible flows
  divided by the explicitly defined applicable user-visible population.
  Internal/platform artifacts must not inflate this denominator.
- Direct-send plan rows stay capped at L2 under the uploaded plan, even when
  separately supported by delivery evidence.
- Publish exact numerator/denominator fractions. Any decimal display is
  truncated, not rounded up. Empty or unresolved populations are N/A or
  UNKNOWN, never 0% by default.

**No all-source numerator, denominator or percentage is calculated here.**
The 45-family A+B inventory remains a historical recovered subset, not proof
of the complete union. No new tests or delivery evidence were obtained.

## 4. Earlier input request — superseded by parked disposition

1. Supply the original E, F and G documents or exact paths/revisions.
2. Approve or amend the DRAFT type-specific ladder, including job cycle count
   N and the treatment of L5 for non-production documents/harnesses.
3. Resolve the atomic counting unit for mixed sources and Part bundles after
   their source memberships can be reviewed.
4. Approve or amend the uploaded draft scores and denominators before any new
   overall metric is represented as authoritative.

The broader implementation program is not completed by this supplement.
The owner subsequently authorized the report-only tracker and recreated manual
sheet; neither authorizes implementation or execution. No code, tests, email, jobs, database
operations, production access, restarts, secrets, flags, migrations or merges
were performed. The source-recovery task is now **PARTIAL WITH DOCUMENTED
GAPS — PARKED, NOT WAITING OR RETRYING. DEV-CLOSED WITH BLOCKERS. RELEASE HELD.**
