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

The published sender must never inspect the development QA recipient setting;
it must always address the account's own email, even if a value for that
setting is accidentally present in its environment.

**Why:** A test-only mailbox substitution must not be able to redirect real
users' welcome messages or become a second production send path.

**How to apply:** Keep substitution in the separate development harness only.
Test production behavior with the override present and check that deployment
Secrets do not contain the setting before shipping.

QA inbox settings may be saved as ordinary development configuration rather
than encrypted Secrets. Do not assume a secure entry form makes the resulting
tracked configuration safe to commit.

**Why:** Development inbox setup can leave private recipient values in a local
`.replit` change, even when no address was printed in chat.

**How to apply:** Check storage category and changed-file names without
displaying values. Never stage or publish a configuration diff containing QA
recipient addresses; keep them out of reports, logs and PR bodies.

Automatic workspace checkpoints can capture that private configuration even
when the agent never stages it manually.

**Why:** Secure-form saves are ordinary workspace configuration writes, and
checkpointing is independent of a selective manual commit.

**How to apply:** Never push checkpoint history that contains private QA
configuration. For a public PR, start from clean reviewed main and transfer
only approved code/report changes, excluding the configuration and its history.
