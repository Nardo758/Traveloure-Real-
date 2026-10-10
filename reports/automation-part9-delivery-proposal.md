# Part 9 delivery-proof proposal — NOT BUILT / NOT ENABLED

## Recommendation and scope

Use one explicitly invoked development verification harness, not the normal scheduler or a deployment flag. Preserve all existing production and must-have holds. Approval of this document would authorize only the listed development proof work, not Part 9 release activation.

**Alternatives:** enabling normal commerce dispatch would expose real users and weaken known holds, so is rejected. Waiting for all provenance work gives stronger end-to-end proof but delays even harmless QA template/provider verification. The smallest proposed option is an isolated harness with evidence clearly separated by proof level.

## What can actually be proven

1. **1h / 1d / 3d:** three fresh randomized QA accounts per loop, each in a disposable database schema. Prepare authentic server snapshots, step history, consent and timezone through retained test helpers; run the existing guarded producer and dispatcher. The readable-record override remains test-only and explicitly disclosed. The provider callback may forward an approved proof payload to the parent harness's allowlisted monitored development inbox. These receipts prove guarded readable-subset delivery, NOT all-rail eligibility.
2. **cart_item_changed:** the actual producer/dispatcher still has to be tested and shown held with zero handoffs. Pending a founder decision on timestamp-qualified wording and must-have timing, deliver only its queued, rendered template through a separate explicitly labelled QA **content/provider transport proof**. Do not mark the actual commerce outbox row sent, alter notified values, bypass the dispatcher hold or claim end-to-end proof. This is insufficient to release-certify the family. If that limited proof is not acceptable, keep this family's real delivery entirely paused.
3. Every real-delivery artifact needs a schema-local outbox row identifier, run ID, provider message ID and **provider delivered event/status**, not merely accepted or queued. For transport-only item proof, explicitly distinguish the held outbox row from the separately delivered QA copy. No inbox addresses, API keys, payloads or credentials in logs/report/PR. If the provider never supplies delivery evidence, report failure/blocker, not a clean delivery loop.
4. Two fresh clean loops; four QA deliveries per approved loop (maximum eight total), no unbounded retry or background scheduling. Use run/type-specific provider idempotency keys. Uncertain acceptance must stop for reconciliation, not send again under a new key.

## Isolation and switching on / off

- Default OFF: the opt-in process-local proof marker is absent. No app module, internal job, registry entry, workflow, runtime sender or deployment reads it.
- ON only after explicit approval and an operator invokes the dedicated script with `--isolated-db --deliver-qa` plus its process-local marker. Refuse NODE_ENV=production, deployment execution, absent independently approved development fingerprint, non-owned schema or any missing inbox setting.
- The existing database owner starts the child in NODE_ENV=test, with real provider credentials still stripped. The child has no network transport credentials. A bounded parent/child proof channel carries only run-validated approved QA payloads to the parent; no arbitrary recipient forwarding.
- The parent reads the two existing **development-only** secure inbox settings. It maps only owned randomized `traveloure-qa.test` fixture accounts to those exact monitored inboxes. It never uses a cart/client-provided inbox, never logs an address, never sends to the fixture's .test address, and rejects every other account/schema/recipient. This substitution exists only in the verification harness, not in production send code.
- OFF on exit/failure: finally remove the marker/control channel, close the proof transport, restore every hook and remove the disposable schema. No persistent activation and no deployment secret changes. Timeout/interruption must reap the child and prove cleanup; failed cleanup prevents certification.

## Off-state proof (before any real message)

Negative tests must show **zero provider invocations** for absent marker, absent CLI permission, production NODE_ENV/deployment marker, wrong fingerprint/schema, non-QA account, arbitrary destination, wrong run ID, exhausted delivery budget and replayed receipt/request. Do not run these negatives against production.

Static import/registry tests prove application entry points and existing scheduler cannot start the proof transport, and production send paths never read proof inbox settings. Run all negatives first using a synthetic provider. With a real transport armed, demonstrate only the four owned fixtures can submit; reject a randomized unrelated fixture and an outside-schema request before any provider call. A bounded audit records counts/IDs/statuses only. Never claim “off for everyone else” solely because the positive emails were received.

## Exact proposed touch list — only after approval

| Path | Proposed change |
|---|---|
| scripts/verification/run-commerce-qa-delivery-proof.mjs | NEW explicit parent controller: development/fingerprint gates, secure inbox allowlist, bounded IPC proof transport, idempotency, provider delivery receipt polling, cleanup and sanitized report |
| scripts/verification/run-messaging-gate.mjs | Extend existing isolated owner with a private opt-in bounded proof channel and argument/env forwarding; normal isolated mode unchanged, provider credentials never forwarded to child |
| server/routes/__tests__/commerce-real-delivery-proof.db.test.ts | NEW two-loop fresh fixture proof; guarded reminder deliveries; item dispatcher hold assertions plus separately labelled template transport proof |
| server/routes/__tests__/commerce-qa-proof-isolation.test.ts | NEW off-state negatives and static production/import/recipient-substitution guards; synthetic transport only |
| reports/automation-part9-verification.md | NEW proof report with per-family proof level, outbox/provider IDs, delivered statuses, clean-loop counts and carried-forward blockers |
| reports/automation-part9-evidence/ | NEW sanitized receipt / isolation / cleanup artifacts; no addresses, keys or email bodies |

No package, workflow, automation registry, runtime sender, checkout, booking, payment writer, schema or migration edits are proposed. No optional template wording code is included in this scope; that needs its own approved touch list if the wording is selected.

## Exact flags / settings

| Name | Proposed use / location | Default / change |
|---|---|---|
| COMMERCE_QA_DELIVERY_PROOF | NEW opt-in marker, dedicated development proof process only | Absent = OFF; never create a workspace/shared/deployment setting |
| COMMERCE_QA_PROOF_RUN_ID | NEW random process-local channel/run binding | Exists only for the approved invocation; removed on exit |
| MESSAGING_DEV_FINGERPRINT | Existing independently approved isolated development gate | Reuse; never change value or print it |
| MESSAGING_VERIFICATION_SCHEMA | Existing owner-generated disposable schema binding | Reuse; no public/shared schema permitted |
| NODE_ENV | Parent refusal / child test-mode gate | No workspace or deployment changes |
| SIGNUP_QA_TEST_INBOX | Existing secure development-only approved inbox | Reuse only in parent proof harness; do not print or copy to deployment |
| ITINERARY_OUTCOME_TEST_EMAIL | Existing secure development-only approved inbox | Reuse only in parent proof harness; do not print or copy to deployment |

No existing commerce release flag changes. Before any real delivery, confirm the inbox names remain development-only through the secure environment tooling; if absent or production-scoped, stop for correction, never guess recipients.

## Decisions required

1. Approve this exact isolated harness scope, including limited **transport-only** item-change proof, or keep that family's delivery paused.
2. Decide whether the time-qualified wording in the Part 8 report is acceptable. This does not implicitly approve runtime edits or the item-change residual.
3. Actual item-change dispatcher delivery and RELEASE-CERTIFIED status remain blocked until the separate must-have timing/payment-provenance decisions and implementation proofs are complete.

**Part 9 has not started. No proof flag was set, no inbox or provider credential was read for this proposal, and no real email was sent.**
