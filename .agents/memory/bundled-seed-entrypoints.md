---
name: Bundled seed entrypoints
description: Preventing imported seed command-line entrypoints from terminating bundled API servers.
---

Standalone seed modules must identify direct execution from their script filename rather than comparing `import.meta.url` to `process.argv[1]` when they are bundled into the API entrypoint.

**Why:** In a single-file ESM bundle, imported modules can inherit the entrypoint URL and mistakenly invoke their CLI `process.exit` handlers during normal server startup.

**How to apply:** Keep the standalone seed command usable, but gate its CLI section on the expected seed script name so importing it from the server never terminates the process.