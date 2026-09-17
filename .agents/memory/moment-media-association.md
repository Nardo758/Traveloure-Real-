---
name: Moment media association
description: Trust rule for associating expert-curated photos with landing Moments.
---

Expert-curated media may replace a landing Moment's representative image only when it has an explicit, exact Moment-key association. A missing association means the media is ineligible for every Moment.

**Why:** A city can host several distinct occasions, so city-level matching can put a valid expert photo under the wrong label. Existing unassociated media cannot be backfilled honestly from location alone.

**How to apply:** Require exact occasion identity in every Moment-media resolver and authoring path. Preserve the representative photo, attribution, and honesty label whenever no explicitly matching expert photo qualifies.