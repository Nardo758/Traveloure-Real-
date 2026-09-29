---
name: Nightly QA CLI isolation
description: Why exit-capable data checks must run outside the web-server process
---

Run standalone integrity CLIs in a child process when called from runtime health checks; treat their exit status as a failed check, never as a server exit.

**Why:** A nightly health check once imported a data-invariant CLI. When the CLI found real violations, its top-level `process.exit(1)` terminated the preview at the scheduled QA run instead of recording a failed QA result.

**How to apply:** Before importing any script into a long-lived server process, check for top-level execution and exit calls. Keep exit-capable commands isolated, and test that a nonzero check remains visible without stopping the caller. Do not suppress the underlying violations to keep the preview running.