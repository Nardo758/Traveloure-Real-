---
name: Lead routing silent SQL failure
description: scoreExperts() in lead-routing.service.ts wraps its query in try/catch and returns [] on any SQL error, which looks identical to "no eligible experts" — always verify column names against shared/schema.ts before trusting a routing/no-match result.
---

`server/services/lead-routing.service.ts`'s `scoreExperts()` catches all SQL errors and returns an empty array, and `routeLead()` treats an empty array as "no approved experts found" — logging that reason and stamping the request `unassigned`. A malformed column reference (e.g. querying a column that doesn't exist on `local_expert_forms`) produces the exact same observable behavior as a legitimate no-match, with no thrown exception visible to the caller.

**Why:** Found this via e2e testing a routing feature — the routing kept reporting "no_approved_experts" even for an eligible expert. Root cause was a query referencing a column name that had been renamed/never existed in `shared/schema.ts` (the real column was `destinations`, not the one queried). Only console.error logged it; the caller never saw the failure.

**How to apply:** When debugging "no expert/candidate matched" results in scoring/routing services, don't assume the matching logic is at fault first — check the server console log for a caught SQL error near the scoring query, and diff every raw `sql\`...\`` column reference against the actual Drizzle table definition before trusting a null-match result.
