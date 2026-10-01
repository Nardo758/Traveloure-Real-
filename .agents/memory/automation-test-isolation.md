---
name: Automation test isolation
description: Preventing accidental external-provider calls while verifying automation migrations.
---

Use an explicit environment allowlist for both fixture servers and their test
processes. Test mode and synthetic payment credentials are not a general
network-safety switch.

**Why:** Early automation regression runs inherited a mail-provider credential
and reported successful sends to synthetic addresses. A later credential-cleared
run avoided those calls. Setting test mode alone did not isolate that provider.

**How to apply:** Supply the approved development database and synthetic test
configuration only. Retain a real sandbox credential solely when that particular
integration is explicitly in scope, force its test mode, and exclude live-key
fallbacks, production database configuration, and unrelated provider credentials.
Require an explicit isolated-server URL and reject the normal preview/default
target: clearing a test client's environment does not clear the environment of
an already-running server that accidentally receives its requests.
Preserve required nonsecret package-wrapper settings as described in
[Nix CLI child environment](nix-cli-child-environment.md). Never record credential
values in commands, logs, reports, or memory.

Negative delivery checks must first prove that the originating mutation succeeded,
not merely that no email was sent.

**Why:** An approval-negative rejection-email test passed after an outdated
transaction mock allowed a database error to return HTTP 500 before the send path.
The email-absence assertion alone concealed the failure.

**How to apply:** Assert the expected successful response/result before checking
no sends, and keep mocked transaction handles aligned with the real service
boundary. A credential-free dummy database exposes accidental queries safely,
but does not make an absence-only assertion trustworthy.