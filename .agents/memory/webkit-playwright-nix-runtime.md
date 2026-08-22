---
name: Playwright WebKit on Nix
description: Environment-specific WebKit launch behavior and the reliable GTK/Xvfb fallback for this Replit container.
---

Playwright's bundled headless WPE WebKit can pass the process-launch stage in this Nix container but then abort while creating its EGL display, leaving `newPage()` hanging rather than reporting a normal test failure. Use the bundled GTK WebKit engine under a private Xvfb display for deterministic audits here.

**Why:** The WPE backend failed after its native libraries were present, so a successful process launch was a false signal. The bundled GTK launcher also replaces, rather than extends, `LD_LIBRARY_PATH`; launching its underlying browser binary with an explicitly composed environment avoids losing Nix-provided browser libraries.

**How to apply:** For cross-browser audits, use the project's audit launcher rather than invoking WebKit directly. Treat this as runtime infrastructure, not a Safari product failure. Continue to label Linux WebKit evidence separately from physical macOS/iOS Safari testing.