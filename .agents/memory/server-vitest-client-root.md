---
name: Server Vitest under client-root Vite
description: How to run server tests that import Vitest when the project Vite config roots discovery in the client directory.
---

Server tests that import `vitest` must run with an explicit repository-root Vitest configuration that restores the `@shared` and `@` aliases. The default project Vite configuration points Vitest discovery at the client directory, while Node's test runner cannot initialize Vitest suites.

**Why:** A QA run first invoked Vitest suites through Node, then discovered zero server tests under the client-root configuration, and then missed the project alias in an isolated config. A non-fail-fast shell also printed a misleading success line after failed suites.

**How to apply:** Use a temporary Node-environment Vitest config with the repository root, `@shared` and `@` aliases, and `passWithNoTests: false`. Run the shell with fail-fast enabled and treat zero collected tests as failure.

Vitest 4 workers initialize separate globals. A Node `--import` preload that
changes `fetch` in the coordinator does not reliably change the worker's
`fetch`; the retained HTTP tests then bypass a test-only transport bridge.

**Why:** A correctly isolated HTTP server was running, but legacy HTTPS-target
tests still made unbridged requests until setup ran in the actual test worker.

**How to apply:** Install worker-global test instrumentation through Vitest
`setupFiles`, merging it into the existing configuration with the supported
programmatic API when the CLI does not expose that option. Preserve the
original assertions and restrict bridges to the owned fixture server.