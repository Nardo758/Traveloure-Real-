---
name: Expert search field contract
description: The cross-surface separation between free-text intent and destination scoping in expert search.
---

Destination URL parameters populate the **Where** control only. They must never be copied into the **What do you need help with?** free-text field. Destination scoping happens through the destination/location query path; free text filters within those scoped results.

**Why:** The user confirmed this is the ruled two-field contract across surfaces. Copying Mumbai into the What field caused the independent text matcher to discard a valid Mumbai planner returned by the destination-scoped API.

**How to apply:** On expert-search handoffs, keep `destination` in the Where state and leave free text empty unless the URL carries a distinct intent query. Test destination hydration, visible scoped results, and subsequent free-text filtering as separate behaviors.