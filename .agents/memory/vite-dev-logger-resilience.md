---
name: Vite development logger resilience
description: Keep client/Vite diagnostics from terminating the application workflow during development.
---

The development Vite logger must report errors without calling `process.exit`. Client module/HMR diagnostics can be transient or recoverable; treating every logger error as fatal makes the preview load briefly and then disconnect even while the HTTP server is otherwise healthy.

**Why:** The development preview must remain available for diagnosis and recovery. Browser-side errors should surface in logs or an error boundary, not bring down the backend and its open port.

**How to apply:** In development-only Vite integration, preserve logger output but do not terminate the Node process from generic Vite logger callbacks. Reserve process termination for unrecoverable startup failures with explicit error handling.