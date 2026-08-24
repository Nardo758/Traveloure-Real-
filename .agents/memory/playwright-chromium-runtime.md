---
name: Playwright Chromium runtime
description: Browser test runtime libraries required by the workspace's cached Playwright Chromium binary.
---

When a Playwright Chromium launch fails with a missing shared library in this Nix workspace, inspect the browser binary with `ldd` and declare the required runtime packages through the approved system-dependency flow.

**Why:** The cached Playwright browser is not automatically supplied with its Linux shared-library dependencies, so a spec can fail before a page opens even when the application and the test are correct.

**How to apply:** Keep the Nix packages declared in `.replit` for browser-test execution. If Chromium is upgraded and a launch identifies a new missing library, use `ldd` to identify the remaining dependency rather than debugging the test itself.