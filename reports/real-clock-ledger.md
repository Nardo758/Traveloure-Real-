# Real-clock proof ledger

Reset expiry crossed its actual 60-minute deadline and the native API rejected the issued token with HTTP 400. Its state is WAITING_BROWSER, not a claimed browser pass.

**Part 1 OPEN. Eight genuine scenarios started; two manual native/provider checks passed and six are WAITING.** Future WAITING does not itself block closure under the approved ruling.

No start or expiry timestamp was backdated. FAST content fixtures remain separate. Native reset expiry is **60 minutes**, not 15. Passes below prove manual native invocation plus durable rows/provider delivery/repeat suppression, not browser, inbox placement or production cadence.

| Scenario | Scenario ID | Actual start UTC | Exact next due UTC | Last check UTC | State | Actual row/record ID | Provider ID |
|---|---|---|---|---|---|---|---|
| booking_confirmation_retry | 2102c442-98aa-430c-8d67-9fe12a4f81a4 | 2026-10-08T17:53:34.680Z | 2026-10-08T17:58:34.686Z | 2026-10-08T18:52:08.380Z | REAL_CLOCK_PASS | 1650791515 | 01a11cc5-c2e5-7c22-a635-858fcfe6411e |
| verification_expiry | a5953e7e-3848-49cc-8f64-3d2b90908ad5 | 2026-10-08T17:53:32.863Z | 2026-10-09T17:53:32.861Z | 2026-10-08T18:52:08.381Z | WAITING | 69f62603-14d3-4ced-803c-57dbce3de758 | — |
| reset_expiry | c78f5b69-5810-4de5-8336-1886a9a7ff2d | 2026-10-08T17:53:34.696Z | 2026-10-08T18:53:34.696Z | 2026-10-08T18:55:27.406Z | WAITING_BROWSER | dd2801c5-05f3-4e47-a0f9-2de4c957c4c3 | — |
| generation_timeout_sweep | 0c8e0294-3caa-4a96-b60f-31804c8b7d14 | 2026-10-08T17:53:35.529Z | 2026-10-08T17:58:35.529Z | 2026-10-08T18:52:08.381Z | REAL_CLOCK_PASS | 1650791584 | 01a11cc5-d8e3-77ed-8629-7f0e4713df60 |
| itinerary_nudge_2h | c436c4f6-3b24-4d8b-90a3-38a62153c7da | 2026-10-08T18:03:09.669Z | 2026-10-08T20:03:09.669Z | 2026-10-08T18:52:08.381Z | WAITING | 1650791517 | — |
| itinerary_followup_24h | 4daa0914-fdcd-4847-9f77-3569d0156868 | 2026-10-08T18:03:09.669Z | 2026-10-09T18:03:09.669Z | 2026-10-08T18:52:08.381Z | WAITING | 1650791518 | — |
| itinerary_reengagement_5d | 79e4b8cc-f321-4fba-905e-6d13abd6719e | 2026-10-08T18:03:09.669Z | 2026-10-13T18:03:09.669Z | 2026-10-08T18:52:08.381Z | WAITING | 1650791519 | — |
| dead_retry_ladder | 249b8101-0b08-485e-b8a3-5966ff40ffb2 | 2026-10-08T18:37:04.772Z | 2026-10-08T19:07:08.421Z | 2026-10-08T18:52:08.381Z | WAITING | 1650791585 | — |

A genuine 30-minute stopped **scheduled** job recovery is NOT STARTED: the approved setup invokes existing jobs manually and has no scheduled instance to stop. Native dead-letter retry ladder has actually started; its eventual dead/digest proof remains pending. No custom scheduler was added.

Retained fixture cleanup deadline: 2026-10-15T17:44:58.411Z. Restart the isolated fixture server before browser checks; manually invoke existing due checks. Cleanup is explicit, development-fingerprint protected, and refuses before that deadline. No production data or registered migration is involved.

Evidence: automation-part1-evidence/real-clock-check.json and open-provider-receipts.json.
