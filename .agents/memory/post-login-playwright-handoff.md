---
name: Post-login Playwright handoff
description: Preventing direct navigation races immediately after test authentication.
---

When a Playwright login helper resolves on a URL change, a following direct navigation can intermittently abort because the authenticated document is still loading. Real-data suites should wait for `domcontentloaded` after login before navigating to the page under test.

**Why:** Authentication can update the URL before its document lifecycle reaches the ready state; replacing that in-flight navigation produces a blank-page `ERR_ABORTED` rather than a product failure.

**How to apply:** Add the document-readiness wait in the suite setup for tests that authenticate and immediately use `page.goto`; do not conceal actual destination navigation failures with a broad error catch.