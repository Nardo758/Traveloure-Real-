---
name: Isolated preview routing
description: Workflow startup and browser capture for a separately registered mockup artifact
---
When a new mockup-sandbox artifact is created, `installStarted` does not guarantee its dependencies are ready before its managed workflow first starts. A `vite: not found` startup failure can simply mean installation has not finished; check dependency readiness before restarting.

**Why:** The artifact workflow started while the fresh scaffold had no local Vite executable. A localhost screenshot on the main app's port showed the main app's 404 for the artifact path, even though the artifact rendered on its own port. In another case, the direct preview and proxied URL worked while a user still saw an empty canvas iframe.

**How to apply:** Verify the artifact workflow is running after dependencies become available. Capture isolated previews using the artifact workflow's open port; use the proxied development domain for canvas iframe URLs. Do not infer a broken artifact from a screenshot taken through the main app's localhost port. If the canvas iframe looks blank despite a healthy direct render, keep it but provide a static capture beside it and as a viewable asset; the embed failure itself is not yet diagnosed.