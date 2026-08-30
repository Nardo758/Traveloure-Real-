---
name: Payout-parity branch discriminators
description: How to make expert-vs-provider commission-branch tests actually distinguishable when live bands are identical
---
Rule: an amount-based "provider band ≠ expert band" assertion is vacuous on the live config — expert_standard, all category slug bands (transportation/accommodation/dining/activities/flights/car_rental/insurance), and provider-line defaults all resolve to a 0.25 platform take.

**Why:** decideBandKey routes provider lines (no category passed by the checkout route) to the default band, and every serviceCategorySlugToFeeCategory slug maps to a 0.25 band, so expert-branch and provider-branch figures are numerically equal.

**How to apply:** use the EXP-OVR asymmetry as the discriminator — set users.commission_override_expert_share_percent on the provider fixture. The correct provider-source resolution ({source:'provider', providerId}) omits expertId so the override is ignored; a misroute to the expert branch ({category, expertId: ownerId}) applies it, producing a different figure. Assert the two recipes differ before asserting the stamp.
