# Signup welcome: small main-based rebuild

Approved scope: the existing email signup route transaction creates the account
and a `signup_welcome` row in the existing `email_outbox`. No query-enqueue job,
additional registry, schema change, copied CI configuration, or old-branch code.
Existing SSO welcome callers use the same enqueue helper rather than direct mail.

The existing outbox dispatcher handles immediate, scheduled and admin-retry
delivery. Its welcome-only branch locks the outbox and account rows through
eligibility, provider submission and result persistence. Check account existence,
soft deletion/suspension, unchanged email, recorded terms/privacy consent and
absence of another sent welcome. Use one provider idempotency key per account.
Provider acceptance is not proof of inbox delivery.

All other delivery branches, registry entries and existing CI tests remain intact.
Signup tests are added alongside main's server suites. No ledger ruling is added
before the founder merges.

Before opening the PR: measured TypeScript count at or below 117, clean guard
batch, signup browser post-submit evidence, and a real provider-delivered welcome
with its outbox and provider message IDs. A `.test` QA account can be used only
with the expressly approved development verification harness recipient reroute
to a monitored inbox. That reroute must be disclosed and must never enter
production application code or configuration. Do not disclose the real address.
