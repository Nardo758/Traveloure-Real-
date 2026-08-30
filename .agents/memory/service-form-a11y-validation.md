---
name: ServiceForm a11y validation pattern
description: Why the final Submit/Publish buttons are no longer disabled on missing required fields
---

The service create/edit form's final Submit/Publish buttons are intentionally NOT disabled when required fields (name, category, offering/tier) are missing — only hard gates (verification/attestation/pending mutation) disable them.

**Why:** Disabled buttons are undiscoverable to screen readers and can never trigger validation feedback. Clicking now runs `handleFinalSubmit`, which sets `attemptedFinal`, jumps to the step holding the first missing field, shows a toast, and renders inline `role="alert"` messages (with `aria-invalid`/`aria-describedby`) per required field. The server mutation remains the enforcement backstop.

**How to apply:** Don't "restore" the missing-field disabled conditions on those buttons — it would silently kill the inline error announcements. New required fields must be added to `missingForFinal` (and get an inline alert) rather than to the buttons' `disabled` prop. Repeated card lists in provider inbox/earnings carry `role="list"`/`role="listitem"`; keep that pattern (wrap Links in a listitem div, never put listitem on the anchor).
