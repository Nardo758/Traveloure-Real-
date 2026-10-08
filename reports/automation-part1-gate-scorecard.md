# Part 1 — granular open-item scorecard

**OPEN — no automation is certified.** Eleven built types only. Future commerce types are NOT STARTED and not scored as failures.

Golden loops: golden-1-decf218d-a7d1-4b2a-b90c-782aacba4cd4 and golden-2-8320f712-d5f6-40e1-8830-172b51eddd85: 146 PASS / 0 FAIL each. These protect existing behavior; they do not prove every writer or attack.

## itinerary_ready

| Rule | Scope | Loop 1 | Loop 2 | Attack / complete coverage | Clean complete loops | Failed loops | Evidence / limitation |
|---|---|---|---|---|---:|---:|---|
| G1 | Correct authoritative trigger | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G2 | Correct current recipient | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G3 | Content, personalization and link correctness | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G4 | Once-only delivery | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G5 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G6 | Consent, quiet hours, daily caps and priority | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G7 | Retry, dead letters, digest and failure heartbeat | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G8 | Both concurrency orderings | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G9 | Admin observability and reasons | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G10 | Provider delivery, actual outbox row and browser links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Actual delivered issued messages and outbox rows exist; genuine comparison navigation timed out in browser worker. Wrong-person UI and unsubscribe are unchecked. |
| S1 | Happy path | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S2 | Repeated signals/page/webhook/sweep/restart | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S3 | Action/send and worker races | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S4 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S5 | Consent/caps/timezone/language | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S6 | Recipient mutation/deletion/suspension/guest | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S7 | Missing/long/unusual data | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S8 | Provider outage/dead digest/query failure | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S9 | Restart/stopped job/DST/actual clocks | WAITING_PARTIAL | WAITING_PARTIAL | NOT COMPLETE | 0 | 0 | Eight actual-clock scenarios started; two manual native/provider passes. A genuinely stopped scheduled-job recovery is NOT STARTED. |
| S10 | Tamper/reuse/expiry/wrong actor/rate limits | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S11 | HTML/text/responsive/dark/links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S12 | Protected golden regressions | PASS | PASS | Protected suite only | 2 | 0 | Protected golden regression assertions all passed in both fresh loops. |
## itinerary_failed

| Rule | Scope | Loop 1 | Loop 2 | Attack / complete coverage | Clean complete loops | Failed loops | Evidence / limitation |
|---|---|---|---|---|---:|---:|---|
| G1 | Correct authoritative trigger | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G2 | Correct current recipient | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G3 | Content, personalization and link correctness | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G4 | Once-only delivery | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G5 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G6 | Consent, quiet hours, daily caps and priority | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G7 | Retry, dead letters, digest and failure heartbeat | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G8 | Both concurrency orderings | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G9 | Admin observability and reasons | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G10 | Provider delivery, actual outbox row and browser links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Actual delivered issued messages and outbox rows exist; genuine comparison navigation timed out in browser worker. Wrong-person UI and unsubscribe are unchecked. |
| S1 | Happy path | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S2 | Repeated signals/page/webhook/sweep/restart | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S3 | Action/send and worker races | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S4 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S5 | Consent/caps/timezone/language | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S6 | Recipient mutation/deletion/suspension/guest | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S7 | Missing/long/unusual data | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S8 | Provider outage/dead digest/query failure | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S9 | Restart/stopped job/DST/actual clocks | WAITING_PARTIAL | WAITING_PARTIAL | NOT COMPLETE | 0 | 0 | Eight actual-clock scenarios started; two manual native/provider passes. A genuinely stopped scheduled-job recovery is NOT STARTED. |
| S10 | Tamper/reuse/expiry/wrong actor/rate limits | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S11 | HTML/text/responsive/dark/links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S12 | Protected golden regressions | PASS | PASS | Protected suite only | 2 | 0 | Protected golden regression assertions all passed in both fresh loops. |
## itinerary_nudge_2h

| Rule | Scope | Loop 1 | Loop 2 | Attack / complete coverage | Clean complete loops | Failed loops | Evidence / limitation |
|---|---|---|---|---|---:|---:|---|
| G1 | Correct authoritative trigger | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G2 | Correct current recipient | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G3 | Content, personalization and link correctness | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G4 | Once-only delivery | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G5 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G6 | Consent, quiet hours, daily caps and priority | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G7 | Retry, dead letters, digest and failure heartbeat | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G8 | Both concurrency orderings | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G9 | Admin observability and reasons | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G10 | Provider delivery, actual outbox row and browser links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Actual delivered issued messages and outbox rows exist; genuine comparison navigation timed out in browser worker. Wrong-person UI and unsubscribe are unchecked. |
| S1 | Happy path | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S2 | Repeated signals/page/webhook/sweep/restart | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S3 | Action/send and worker races | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S4 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S5 | Consent/caps/timezone/language | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S6 | Recipient mutation/deletion/suspension/guest | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S7 | Missing/long/unusual data | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S8 | Provider outage/dead digest/query failure | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S9 | Restart/stopped job/DST/actual clocks | WAITING_PARTIAL | WAITING_PARTIAL | NOT COMPLETE | 0 | 0 | Eight actual-clock scenarios started; two manual native/provider passes. A genuinely stopped scheduled-job recovery is NOT STARTED. |
| S10 | Tamper/reuse/expiry/wrong actor/rate limits | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S11 | HTML/text/responsive/dark/links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S12 | Protected golden regressions | PASS | PASS | Protected suite only | 2 | 0 | Protected golden regression assertions all passed in both fresh loops. |
## itinerary_followup_24h

| Rule | Scope | Loop 1 | Loop 2 | Attack / complete coverage | Clean complete loops | Failed loops | Evidence / limitation |
|---|---|---|---|---|---:|---:|---|
| G1 | Correct authoritative trigger | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G2 | Correct current recipient | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G3 | Content, personalization and link correctness | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G4 | Once-only delivery | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G5 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G6 | Consent, quiet hours, daily caps and priority | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G7 | Retry, dead letters, digest and failure heartbeat | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G8 | Both concurrency orderings | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G9 | Admin observability and reasons | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G10 | Provider delivery, actual outbox row and browser links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Actual delivered issued messages and outbox rows exist; genuine comparison navigation timed out in browser worker. Wrong-person UI and unsubscribe are unchecked. |
| S1 | Happy path | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S2 | Repeated signals/page/webhook/sweep/restart | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S3 | Action/send and worker races | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S4 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S5 | Consent/caps/timezone/language | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S6 | Recipient mutation/deletion/suspension/guest | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S7 | Missing/long/unusual data | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S8 | Provider outage/dead digest/query failure | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S9 | Restart/stopped job/DST/actual clocks | WAITING_PARTIAL | WAITING_PARTIAL | NOT COMPLETE | 0 | 0 | Eight actual-clock scenarios started; two manual native/provider passes. A genuinely stopped scheduled-job recovery is NOT STARTED. |
| S10 | Tamper/reuse/expiry/wrong actor/rate limits | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S11 | HTML/text/responsive/dark/links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S12 | Protected golden regressions | PASS | PASS | Protected suite only | 2 | 0 | Protected golden regression assertions all passed in both fresh loops. |
## itinerary_reengagement_5d

| Rule | Scope | Loop 1 | Loop 2 | Attack / complete coverage | Clean complete loops | Failed loops | Evidence / limitation |
|---|---|---|---|---|---:|---:|---|
| G1 | Correct authoritative trigger | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G2 | Correct current recipient | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G3 | Content, personalization and link correctness | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G4 | Once-only delivery | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G5 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G6 | Consent, quiet hours, daily caps and priority | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G7 | Retry, dead letters, digest and failure heartbeat | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G8 | Both concurrency orderings | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G9 | Admin observability and reasons | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G10 | Provider delivery, actual outbox row and browser links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Actual delivered issued messages and outbox rows exist; genuine comparison navigation timed out in browser worker. Wrong-person UI and unsubscribe are unchecked. |
| S1 | Happy path | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S2 | Repeated signals/page/webhook/sweep/restart | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S3 | Action/send and worker races | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S4 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S5 | Consent/caps/timezone/language | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S6 | Recipient mutation/deletion/suspension/guest | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S7 | Missing/long/unusual data | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S8 | Provider outage/dead digest/query failure | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S9 | Restart/stopped job/DST/actual clocks | WAITING_PARTIAL | WAITING_PARTIAL | NOT COMPLETE | 0 | 0 | Eight actual-clock scenarios started; two manual native/provider passes. A genuinely stopped scheduled-job recovery is NOT STARTED. |
| S10 | Tamper/reuse/expiry/wrong actor/rate limits | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S11 | HTML/text/responsive/dark/links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S12 | Protected golden regressions | PASS | PASS | Protected suite only | 2 | 0 | Protected golden regression assertions all passed in both fresh loops. |
## signup_welcome

| Rule | Scope | Loop 1 | Loop 2 | Attack / complete coverage | Clean complete loops | Failed loops | Evidence / limitation |
|---|---|---|---|---|---:|---:|---|
| G1 | Correct authoritative trigger | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G2 | Correct current recipient | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G3 | Content, personalization and link correctness | FAIL | FAIL | NOT COMPLETE | 0 | 2 | Both browser loops: Browse experts opens /become-expert instead of the directory; browser-account-links.json. |
| G4 | Once-only delivery | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G5 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G6 | Consent, quiet hours, daily caps and priority | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G7 | Retry, dead letters, digest and failure heartbeat | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G8 | Both concurrency orderings | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G9 | Admin observability and reasons | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G10 | Provider delivery, actual outbox row and browser links | FAIL | FAIL | NOT COMPLETE | 0 | 2 | Both browser loops: Browse experts opens /become-expert instead of the directory; browser-account-links.json. |
| S1 | Happy path | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S2 | Repeated signals/page/webhook/sweep/restart | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S3 | Action/send and worker races | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S4 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S5 | Consent/caps/timezone/language | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S6 | Recipient mutation/deletion/suspension/guest | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S7 | Missing/long/unusual data | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S8 | Provider outage/dead digest/query failure | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S9 | Restart/stopped job/DST/actual clocks | OPEN | OPEN | NOT COMPLETE | 0 | 0 | No type-specific clock scenario started; eight global starts are not this type's proof. |
| S10 | Tamper/reuse/expiry/wrong actor/rate limits | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S11 | HTML/text/responsive/dark/links | FAIL | FAIL | NOT COMPLETE | 0 | 2 | Both browser loops: Browse experts opens /become-expert instead of the directory; browser-account-links.json. |
| S12 | Protected golden regressions | PASS | PASS | Protected suite only | 2 | 0 | Protected golden regression assertions all passed in both fresh loops. |
## verification

| Rule | Scope | Loop 1 | Loop 2 | Attack / complete coverage | Clean complete loops | Failed loops | Evidence / limitation |
|---|---|---|---|---|---:|---:|---|
| G1 | Correct authoritative trigger | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G2 | Correct current recipient | OPEN_POLICY | OPEN_POLICY | NOT COMPLETE | 0 | 0 | Owner/replay/tamper checked twice; a valid token is accepted in another signed-in account. Bearer semantics observed, not inferred malicious intent. |
| G3 | Content, personalization and link correctness | OPEN_POLICY | OPEN_POLICY | NOT COMPLETE | 0 | 0 | Owner/replay/tamper checked twice; a valid token is accepted in another signed-in account. Bearer semantics observed, not inferred malicious intent. |
| G4 | Once-only delivery | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G5 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G6 | Consent, quiet hours, daily caps and priority | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G7 | Retry, dead letters, digest and failure heartbeat | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G8 | Both concurrency orderings | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G9 | Admin observability and reasons | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G10 | Provider delivery, actual outbox row and browser links | FAIL | FAIL | NOT COMPLETE | 0 | 2 | Real issued email and browser proof exist, but native direct send has no actual outbox row. |
| S1 | Happy path | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S2 | Repeated signals/page/webhook/sweep/restart | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S3 | Action/send and worker races | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S4 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S5 | Consent/caps/timezone/language | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S6 | Recipient mutation/deletion/suspension/guest | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S7 | Missing/long/unusual data | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S8 | Provider outage/dead digest/query failure | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S9 | Restart/stopped job/DST/actual clocks | WAITING_PARTIAL | WAITING_PARTIAL | NOT COMPLETE | 0 | 0 | Eight actual-clock scenarios started; two manual native/provider passes. A genuinely stopped scheduled-job recovery is NOT STARTED. |
| S10 | Tamper/reuse/expiry/wrong actor/rate limits | OPEN_POLICY | OPEN_POLICY | NOT COMPLETE | 0 | 0 | Owner/replay/tamper checked twice; a valid token is accepted in another signed-in account. Bearer semantics observed, not inferred malicious intent. |
| S11 | HTML/text/responsive/dark/links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S12 | Protected golden regressions | PASS | PASS | Protected suite only | 2 | 0 | Protected golden regression assertions all passed in both fresh loops. |
## password_reset

| Rule | Scope | Loop 1 | Loop 2 | Attack / complete coverage | Clean complete loops | Failed loops | Evidence / limitation |
|---|---|---|---|---|---:|---:|---|
| G1 | Correct authoritative trigger | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G2 | Correct current recipient | OPEN_POLICY | OPEN_POLICY | NOT COMPLETE | 0 | 0 | Owner/replay/tamper checked twice; a valid token is accepted in another signed-in account. Bearer semantics observed, not inferred malicious intent. |
| G3 | Content, personalization and link correctness | OPEN_POLICY | OPEN_POLICY | NOT COMPLETE | 0 | 0 | Owner/replay/tamper checked twice; a valid token is accepted in another signed-in account. Bearer semantics observed, not inferred malicious intent. |
| G4 | Once-only delivery | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G5 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G6 | Consent, quiet hours, daily caps and priority | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G7 | Retry, dead letters, digest and failure heartbeat | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G8 | Both concurrency orderings | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G9 | Admin observability and reasons | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G10 | Provider delivery, actual outbox row and browser links | FAIL | FAIL | NOT COMPLETE | 0 | 2 | Real issued email and browser proof exist, but native direct send has no actual outbox row. |
| S1 | Happy path | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S2 | Repeated signals/page/webhook/sweep/restart | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S3 | Action/send and worker races | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S4 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S5 | Consent/caps/timezone/language | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S6 | Recipient mutation/deletion/suspension/guest | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S7 | Missing/long/unusual data | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S8 | Provider outage/dead digest/query failure | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S9 | Restart/stopped job/DST/actual clocks | WAITING_PARTIAL | WAITING_PARTIAL | NOT COMPLETE | 0 | 0 | Eight actual-clock scenarios started; two manual native/provider passes. A genuinely stopped scheduled-job recovery is NOT STARTED. |
| S10 | Tamper/reuse/expiry/wrong actor/rate limits | OPEN_POLICY | OPEN_POLICY | NOT COMPLETE | 0 | 0 | Owner/replay/tamper checked twice; a valid token is accepted in another signed-in account. Bearer semantics observed, not inferred malicious intent. |
| S11 | HTML/text/responsive/dark/links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S12 | Protected golden regressions | PASS | PASS | Protected suite only | 2 | 0 | Protected golden regression assertions all passed in both fresh loops. |
## canonical_booking_confirmation

| Rule | Scope | Loop 1 | Loop 2 | Attack / complete coverage | Clean complete loops | Failed loops | Evidence / limitation |
|---|---|---|---|---|---:|---:|---|
| G1 | Correct authoritative trigger | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G2 | Correct current recipient | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G3 | Content, personalization and link correctness | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G4 | Once-only delivery | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G5 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G6 | Consent, quiet hours, daily caps and priority | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G7 | Retry, dead letters, digest and failure heartbeat | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G8 | Both concurrency orderings | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G9 | Admin observability and reasons | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G10 | Provider delivery, actual outbox row and browser links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S1 | Happy path | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S2 | Repeated signals/page/webhook/sweep/restart | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S3 | Action/send and worker races | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S4 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S5 | Consent/caps/timezone/language | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S6 | Recipient mutation/deletion/suspension/guest | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S7 | Missing/long/unusual data | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S8 | Provider outage/dead digest/query failure | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S9 | Restart/stopped job/DST/actual clocks | OPEN | OPEN | NOT COMPLETE | 0 | 0 | No type-specific clock scenario started; eight global starts are not this type's proof. |
| S10 | Tamper/reuse/expiry/wrong actor/rate limits | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S11 | HTML/text/responsive/dark/links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S12 | Protected golden regressions | PASS | PASS | Protected suite only | 2 | 0 | Protected golden regression assertions all passed in both fresh loops. |
## legacy_booking_confirmation

| Rule | Scope | Loop 1 | Loop 2 | Attack / complete coverage | Clean complete loops | Failed loops | Evidence / limitation |
|---|---|---|---|---|---:|---:|---|
| G1 | Correct authoritative trigger | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G2 | Correct current recipient | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G3 | Content, personalization and link correctness | FAIL | FAIL | NOT COMPLETE | 0 | 2 | Concurrent native legacy handlers produced two traveler outbox rows/simulated sends and mismatched final confirmation code in each loop. |
| G4 | Once-only delivery | FAIL | FAIL | NOT COMPLETE | 0 | 2 | Concurrent native legacy handlers produced two traveler outbox rows/simulated sends and mismatched final confirmation code in each loop. |
| G5 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G6 | Consent, quiet hours, daily caps and priority | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G7 | Retry, dead letters, digest and failure heartbeat | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G8 | Both concurrency orderings | FAIL | FAIL | NOT COMPLETE | 0 | 2 | Concurrent native legacy handlers produced two traveler outbox rows/simulated sends and mismatched final confirmation code in each loop. |
| G9 | Admin observability and reasons | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G10 | Provider delivery, actual outbox row and browser links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S1 | Happy path | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S2 | Repeated signals/page/webhook/sweep/restart | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S3 | Action/send and worker races | FAIL | FAIL | NOT COMPLETE | 0 | 2 | Concurrent native legacy handlers produced two traveler outbox rows/simulated sends and mismatched final confirmation code in each loop. |
| S4 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S5 | Consent/caps/timezone/language | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S6 | Recipient mutation/deletion/suspension/guest | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S7 | Missing/long/unusual data | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S8 | Provider outage/dead digest/query failure | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S9 | Restart/stopped job/DST/actual clocks | WAITING_PARTIAL | WAITING_PARTIAL | NOT COMPLETE | 0 | 0 | Eight actual-clock scenarios started; two manual native/provider passes. A genuinely stopped scheduled-job recovery is NOT STARTED. |
| S10 | Tamper/reuse/expiry/wrong actor/rate limits | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S11 | HTML/text/responsive/dark/links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S12 | Protected golden regressions | PASS | PASS | Protected suite only | 2 | 0 | Protected golden regression assertions all passed in both fresh loops. |
## activity

| Rule | Scope | Loop 1 | Loop 2 | Attack / complete coverage | Clean complete loops | Failed loops | Evidence / limitation |
|---|---|---|---|---|---:|---:|---|
| G1 | Correct authoritative trigger | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G2 | Correct current recipient | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G3 | Content, personalization and link correctness | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G4 | Once-only delivery | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G5 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G6 | Consent, quiet hours, daily caps and priority | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G7 | Retry, dead letters, digest and failure heartbeat | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G8 | Both concurrency orderings | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G9 | Admin observability and reasons | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| G10 | Provider delivery, actual outbox row and browser links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S1 | Happy path | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S2 | Repeated signals/page/webhook/sweep/restart | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S3 | Action/send and worker races | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S4 | Cancellation and supersession | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S5 | Consent/caps/timezone/language | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S6 | Recipient mutation/deletion/suspension/guest | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S7 | Missing/long/unusual data | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S8 | Provider outage/dead digest/query failure | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S9 | Restart/stopped job/DST/actual clocks | OPEN | OPEN | NOT COMPLETE | 0 | 0 | No type-specific clock scenario started; eight global starts are not this type's proof. |
| S10 | Tamper/reuse/expiry/wrong actor/rate limits | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S11 | HTML/text/responsive/dark/links | PARTIAL | PARTIAL | NOT COMPLETE | 0 | 0 | Protected regression/subproof exists; complete current writer and attack coverage is not established. |
| S12 | Protected golden regressions | PASS | PASS | Protected suite only | 2 | 0 | Protected golden regression assertions all passed in both fresh loops. |

## Counting rules

No failed rule reached six failed loops; reproduced failures have two. Missing coverage is OPEN/PARTIAL, not a fabricated failed execution. Genuine future WAITING is not itself a closure blocker; missing starts and other unproved rules are. No runtime defects were fixed under this test-only authorization.
