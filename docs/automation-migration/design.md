# Automation registry migration contract

## Scope and approval

The operator approved proceeding on 1 October 2026 after being told that the brief's
last sentence and separate scheduled-runner provisioning remain unverified. This
migration covers discovered, implemented behavior only. It does not infer the
missing brief text, create campaigns, introduce automatic enforcement, or initiate
seller transfers.

After cancellation of the original queued task, the operator separately authorized
resuming the provider stage only. This continuation must stop before AI and
cross-domain scheduled work; it does not reopen or complete the cancelled task.
Existing bookings/moderation owners of overlapping provider behavior are retained,
not wrapped again merely to fill the provider namespace.

The registry is `server/automations/`, with one automation per file in payments,
moderation, bookings, messaging, provider, ai, and scheduled. Business-domain
scheduled work remains in its business domain. Cross-domain maintenance belongs
in scheduled.

## Execution ownership

- Stable IDs, not filenames, identify nodes at runtime.
- One event dispatcher and one scheduled execution wrapper own registry lookup,
  enabled/trigger validation, execution conditions, and explicit skip/failure
  outcomes. Duplicate IDs and dangling cancellation references are errors.
- Nodes describe real triggers, conditions, idempotency, delays, cancellations,
  actions, retries, and permanent-failure handling; descriptions must not imply
  stronger guarantees than the underlying implementation provides.
- Existing action implementations retain financial transactions, guarded SQL
  transitions, advisory locks, unique ledgers, Stripe idempotency keys, durable
  queues, error propagation, and failure-return contracts.
- Idempotency belongs inside the existing action's atomic boundary. A registry
  pre-check must not replace or weaken that guard. A process-local overlap guard
  is not distributed exactly-once execution.
- Request-scoped actions retain their transaction and authorization context.
  Public entrypoints and manual triggers remain compatible. Each migrated
  execution path routes through its node exactly once, with no parallel old/new
  runners.
- New delayed execution or cross-node cancellation requires an existing durable,
  scope-aware adapter. Unsupported policies must fail explicitly rather than use
  an in-memory timeout or a global cancellation flag. No new production DDL is
  authorized. Existing candidate exclusions and durable status transitions stay
  in their original actions.

## Scheduling and observability

Existing timer offsets, jitter, intervals, credential gates, and external
entrypoints remain unchanged. Local timers remain defense-in-depth for Autoscale;
they do not establish delivery reliability. Only successful external internal-job
passes stamp external-channel heartbeats. Warm timers, overlap skips, and failures
must not make that channel appear healthy.

The separate Replit scheduled runner is not accessible through the current-project
deployment lookup. Its provisioning, active command/schedule, and actual run logs
remain an operator verification requirement. Repository configuration and endpoint
heartbeats alone are not proof of runner identity.

## Migration gates

Migrate and run existing relevant suites in order: payments (Stripe reconciliation
and checkout-claim sweep first), moderation/security, bookings, messaging, provider,
ai, scheduled. Record commands, pass/fail/skip counts, and coverage limitations
after every domain, before changing the next domain.

Compare final TypeScript diagnostics against the measured branch baseline rather
than assuming the repository is error-free. Review the integrated change for
duplicate execution, trigger/condition gating, cancellation validation, return
contracts, and import cycles. Restart the development workflow once after the
coherent batch and confirm the app is not manifestly broken.

## Release boundary

This is review-branch work only. The canonical traveler-confirmation prerequisite
is carried explicitly because the fetched origin/main did not contain that repair.
No merge, publish, production job execution, or production data/schema edit is
part of this task. Rollout follows human review and the founder's publish procedure.