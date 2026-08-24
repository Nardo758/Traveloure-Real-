---
name: Field Guide recovery
description: How to recover the Field Guide app after an artifact-registry workspace reset.
---

If the active workspace suddenly reverts to the root application and the Field Guide artifact disappears, do not treat the root UI as the intended source of truth. The complete Field Guide source may still be recoverable from local Git history even when the artifact registry or checkpoint UI cannot load it.

**Why:** The artifact registry can be reset independently of Git history, leaving the preview pointed at an older root app and making a completed Field Guide implementation appear lost.

**How to apply:** Preserve the current tree first, inspect Git history for the pre-reset artifact snapshot, restore the Field Guide together with its shared workspace dependencies, then make the recovered frontend the public preview before continuing product work.