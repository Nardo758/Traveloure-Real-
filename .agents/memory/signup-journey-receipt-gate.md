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