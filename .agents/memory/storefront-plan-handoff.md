---
name: Storefront plan handoff
description: Defines the non-mutating contract when a traveler opens an expert storefront from an existing plan.
---

When expert discovery starts with a plan identifier, preserve it through handled-expert redirects and storefront offering links. The storefront action returns to that plan; it must not silently create a booking request, booking, or expert sharing relationship.

**Why:** Opening a profile is navigation, not consent to assign or book that expert. “Share my plan with this expert” is a separate, explicit product flow.

**How to apply:** Any expert-directory, legacy expert URL, storefront, or offering-detail work that accepts the plan identifier must keep the return address intact while leaving booking and plan-sharing mutations behind explicit user actions.