---
name: Fee double-take is intended
description: Cart checkout's buyer-side fee-on-top plus seller-side commission is a ratified ruling, not a double-charge bug.
---

The rule: cart checkout charges the traveler `price + platform fee` (fee on top) AND credits the earner only `price × expertShare` (commission deducted). On a standard 25% band the platform keeps ~50% of list price / 40% of gross. Refunds return the full charged total.

**Why:** Explicitly ratified as "F1 = INTENDED BEHAVIOR" by the decision-maker (Jul 26, 2026) in `docs/backoffice/REVENUE_MODEL.md` rulings, with full knowledge of the effective take rate. The mandated traveler-facing disclosure landed (pricing page note + "Platform fee" cart line). Full determination: `docs/findings/FEE_SEMANTICS_DETERMINATION.md`.

**How to apply:** If financial QA or an audit flags a "double fee" / suspicious take rate on cart checkout, cite the ruling instead of changing checkout totals or ledger math. Any change to this model needs a fresh ruling ("needs a RULING, not a silent fix"). Note: business-plan-v1.3 §4.6/§4.8 still describe the older commission-out-of-price model — that's documentation drift, not the authority.
