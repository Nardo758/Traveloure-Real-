---
name: Local Playwright Chromium runtime
description: The workspace's Playwright CLI Chromium runtime currently lacks a required Nix shared library.
---

The local Playwright CLI Chromium browser cannot start because its headless shell cannot load
`libglib-2.0.so.0`. Use the managed browser-testing agent for end-to-end UI verification unless the
workspace's Nix browser dependencies are deliberately repaired.

**Why:** A normal Playwright invocation fails before test code runs, so a failed CLI browser suite is not
evidence of an application regression.

**How to apply:** Continue to run non-browser tests directly. For browser flows, use the testing agent or
the preview screenshot tool; only modify package/Nix configuration when repairing browser support is an
explicit task.