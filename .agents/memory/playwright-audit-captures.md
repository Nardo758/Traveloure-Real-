---
name: Playwright audit captures
description: How to preserve custom screenshot evidence alongside the generated Playwright HTML report
---

When a browser audit writes custom screenshots under `playwright-report/`, run the focused suite
with Playwright's line reporter (for example, `--reporter=line`) if the files need to remain in the
workspace after the run. The configured HTML reporter may clear the report directory while
generating `index.html`, removing custom captures even though the test itself passes.

**Why:** A passing test run with the default reporter left the expected screenshot directory empty,
while the same run with the line reporter preserved every capture. Treat this as a report-output
behavior, not as evidence that the screenshot code did not execute.

**How to apply:** Put the exact preservation command in audit documentation and verify the capture
files after the run; do not weaken screenshot assertions to accommodate reporter cleanup.