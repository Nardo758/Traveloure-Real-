---
name: Isolated preview routing
description: Workflow startup and browser capture for a separately registered mockup artifact
---
When a new mockup-sandbox artifact is created, `installStarted` does not guarantee its dependencies are ready before its managed workflow first starts. A `vite: not found` startup failure can simply mean installation has not finished; check dependency readiness before restarting.

**Why:** The artifact workflow started while the fresh scaffold had no local Vite executable. A localhost screenshot on the main app's port then showed the main app's 404 for the artifact path, even though the artifact itself rendered correctly on its own port.

**How to apply:** Verify the artifact workflow is running after dependencies become available. Capture isolated previews using the artifact workflow's open port; use the proxied development domain for canvas iframe URLs. Do not infer a broken artifact from a screenshot taken through the main app's localhost port.