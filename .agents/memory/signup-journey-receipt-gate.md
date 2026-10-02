---
name: Signup journey real-inbox verification
description: Required recipient scope and receipt gate for live signup journey tests.
---
Live journey testing must use the real email address of the traveler created for
that particular test. Never substitute an admin inbox, a customer's account,
or synthetic traveloure.test addresses.

**Why:** The user explicitly restated this requirement on 2026-10-02. Actual
receipt verification is required before extended live scenarios proceed; an
outbox status or Resend acceptance alone does not demonstrate inbox receipt.

**How to apply:** Isolated unit fixtures are fine, but cannot close the live gate.
Obtain the authorized test address and a receipt-verification method before
creating a live traveler or sending test messages. If neither is available,
ask rather than infer an address from the database. Never store the address,
inbox credentials, message tokens or other personal data in project memory.

## Development isolation

Keep test journey links on the development preview; do not change the global
email base URL merely to run signup tests.

**Why:** The user approved development-only journey links on 2026-10-02 while
requiring production and unrelated emails to remain unchanged. Shared mail
configuration can otherwise send a development token to the published app.

**How to apply:** Before sending, check that the authorized real address is
unused when a new traveler is required, and verify the test link's environment.
Do not overwrite or delete an existing account just to reuse its inbox.