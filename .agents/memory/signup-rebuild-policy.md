---
name: Signup rebuild policy
description: Founder scope and evidence requirements for signup email work and QA delivery.
---

The founder retired the divergent automation snapshot unmerged, retaining its
branch only for reference. Do not reconcile it. Useful signup work must be a
small independent change based on current main, using its existing outbox,
registry, dispatcher and CI coverage.

**Why:** The snapshot diverged from authoritative main email safeguards and
newer regression coverage; wholesale adoption could remove those guarantees.

**How to apply:** No copied outbox/registry/CI implementations. Preserve current
itinerary and other delivery behavior. The founder adds the ledger ruling at
merge; the agent does not merge or publish.

The founder approved keeping a `.test` QA account and routing its test email to
a monitored, routable inbox solely in the development verification harness.
Disclose that substitution; never claim the literal `.test` mailbox received it.
Do not introduce a production recipient override or expose the monitored address.

**Why:** The QA domain has no public mail route. Provider acceptance or
intercepted transport IDs are not real delivered-email proof.

**How to apply:** Closure needs the real outbox row and provider message IDs,
provider-delivered status, browser post-submit evidence, the established
TypeScript baseline and clean guards. Do not fill an evidence section with
unresolved items or substitute synthetic IDs.
