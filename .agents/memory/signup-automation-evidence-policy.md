---
name: Signup automation scope and evidence policy
description: Approved partial-verification wording and corrected active/deferred counts for the multi-part signup/login dispatch.
---

Delivery-dependent signup/login automations must be reported as **“verified in
dev, inbox receipt pending”**, never closed, when only development rows and
intercepted transport have been verified. Do not call the multi-part system
100% complete on unit/mock evidence.

**Why:** The user explicitly authorized development work without an approved
mailbox, but retained the real-inbox completion requirement.

**How to apply:** Distinguish DB/action/HTTP/UI evidence from inbox receipt in
every refinement report. A browser infrastructure failure is also a pending
check, not a pass.

Google login is separately **DEFERRED**, not active. Part 2 includes both
`email_changed_old_address` and `email_changed_new_address`.

**Why:** The user corrected the supplied prompt's count mismatch and required
recalculation before scoring.

**How to apply:** The approved counts are Part 1 = 6 active, Part 2 = 10 active
plus Google deferred, Part 3 = 4 active, Part 4 = 3 or 4 active depending on
reachable signin velocity. Totals are 23/24 active, 24/25 tracked including
Google. Later-part implementation requires an explicit dispatch.