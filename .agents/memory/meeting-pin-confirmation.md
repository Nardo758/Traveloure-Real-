---
name: Meeting pin confirmation
description: Provider map authoring rules for pending meeting locations, form synchronization, and first-time map placement.
---

Meeting pins use a proposed-then-confirmed interaction: clicking the map creates a visibly pending candidate, while the existing confirmed pin remains authoritative until the provider explicitly confirms the new point. Confirmation updates the shared confirmed location state, which updates the Meeting pin card; it does not replace traveler-facing meeting instructions with coordinates.

**Why:** A map click can be accidental while panning or adjusting placement. Keeping coordinate selection distinct from instructions prevents accidental location changes and avoids presenting raw coordinates as traveler guidance.

**How to apply:** Any meeting-pin authoring surface must render pending and confirmed locations distinctly, require explicit confirmation before persisting or changing shared location state, and reflect confirmation in its linked Meeting pin UI. When no map exists yet, only seed an initial canvas from a verified address geocode; never invent a default city-center location.