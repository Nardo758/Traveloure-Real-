# The expert door at 390 px (ledger `2026-09-29-expert-door`)

Taken from a local build against a local database. The experts are **fixture rows** written by
`scripts/seed-fixture-kyoto-expert.ts` (test databases only, `ALLOW_TEST_ACCOUNTS=1`); no reply time
shows because none has been measured for them — the card says nothing rather than invent one.

| File | What it shows |
|---|---|
| `card.390.png` | "Get a local expert" lands on the slip: "How much help do you want?", three levels with the real band ("$60 · 2 local experts" — the two fixtures) and "I just have a question". |
| `picker.390.png` | "Check my plan": the two byline-gated fixture experts in Kyoto, their verified neighbourhood, the offering and its price, **Request**. |
| `empty.390.png` | "Plan it with me" with nobody offering it: "No local expert offers this in Kyoto yet" and the free-draft action that records `expert_interest`. |
| `dismissed-header.390.png` | Dismissed: the small "Add a local expert" control in the header, until an expert is attached. |
