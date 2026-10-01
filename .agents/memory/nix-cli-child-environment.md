---
name: Nix CLI child environment
description: Hermetic test subprocesses must preserve package-wrapper environment requirements.
---

Do not assume PATH and HOME are sufficient when launching Nix-wrapped commands
inside a scrubbed child environment. The workspace's npx wrapper requires
XDG_CONFIG_HOME before it can start the application or test runner.

**Why:** An isolated backend verifier failed before executing any application
code because the package wrapper used an unset XDG_CONFIG_HOME. Changing application
API configuration could not fix that launcher failure.

**How to apply:** Preserve the non-secret wrapper/runtime environment explicitly
when scrubbing a child environment, or invoke the installed CLI through its runtime
directly. Identify whether a failure occurred before application code before
changing application settings.