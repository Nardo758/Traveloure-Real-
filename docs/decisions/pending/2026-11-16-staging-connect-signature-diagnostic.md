# R? — Temporary staging Connect signature diagnostic

| Ruling | Date | Decision | Basis |
|---|---|---|---|
| R? | 2026-11-16 | Permit staging-only Connect webhook diagnostics reporting the selected secret-variable name, a boolean match against a one-way reference to the staging Connect signing secret, and raw-Buffer type/byte count. Never log credentials, digests, signatures, payloads or account/user identifiers. Keep production behavior and signature enforcement unchanged; no event resend or publish is authorized by this change. Remove instrumentation after investigation. | User explicitly approved the staging-only diagnostic after a reported post-publish signature failure could not be reconciled with runtime telemetry. |
