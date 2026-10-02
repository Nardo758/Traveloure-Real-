# Email release, runner provisioning and production timeout investigation

This is a status snapshot from 2026-10-02, not a claim that queued merges or publishing completed.

## Email release

The operator explicitly authorized merging the email repairs. Source review confirmed:
canonical confirmation persistence is inside the winning payment transaction, persistence
failures propagate for retry, and payment-leg event keys plus the conditional paid transition
prevent replay insertions. The vendor repair uses the real named sender, checks delivery
acceptance, escapes HTML, preserves plain text/calendar attachments, and retains ownership guards.
The received-message evidence and original regression results are in
`docs/findings/discovery-live-proof-20261002.md`.

- #1218 was made ready for review. Its immediate merge was refused by GitHub because its
  head was behind main. The branch was updated normally through GitHub's update-branch API,
  and automatic merge was enabled subject to all existing protection requirements.
- #1232 carries `fix/discovery-live-proof-20261002`, including both email fixes and evidence.
  It must merge after #1218; the registry snapshot is not included.
- No administrator bypass, force-push, direct main push, production publish or production
  database mutation was performed.
- Production publishing is user-initiated. Publish only after both merges, from a clean
  workspace on main equal to origin/main. Do not publish the current review branch.

## Separate scheduled runner

The accessible Replit Admin API OpenAPI contract has GET-only project/deployment resources;
its publishing-review POST endpoints are approval endpoints, not project creation or deployment
creation. The available deployment configuration callback targets this Repl only. It cannot
create or configure the separate runner, and switching this web Repl to Scheduled would
replace its Autoscale target rather than satisfy the request.

No runner was created and no scoped secrets were copied. The setup remains blocked on an
operator/control surface capable of creating the separate Repl and publishing its Scheduled
Deployment. The exact recipe remains `docs/ops/REPLIT_SCHEDULED_JOBS.md`.

A genuine authenticated, read-only production health request returned HTTP 200,
`healthy=true`, `staleCount=0`, and 13 roster jobs at approximately 09:29 UTC. Recent
successes include checkout/itinerary sweep, email outbox, earnings release, booking
auto-completion, reconciliation and availability materialization around 09:20–09:21 UTC.
This endpoint explicitly measures LAST CRON-DRIVEN SUCCESS. It does not identify the trigger,
prove a Replit scheduled runner exists, or supply that runner's run log.

## Production database timeouts

Window: **2026-10-02 07:00–09:30 UTC**. Counts below are distinct matching failure messages
retrieved from production logs, not a complete run denominator or failure percentage.

| Routine | Observed failures | Observed timestamps (UTC) |
|---|---:|---|
| Unauthorized checkout sweep | 6 | 07:03:51, 07:19:46, 07:22:23, 07:32:22, 08:02:24, 08:47:26 |
| Paid itinerary stale-generation sweep | 6 | 07:03:54, 07:22:23, 07:32:23, 08:02:23, 08:12:23, 08:47:25 |
| Stale-authorized checkout sweep | 1 | 07:19:51 |

The queries are, respectively: selecting old `payment_pending` rows without a PaymentIntent;
conditional update of old `generating` itinerary comparisons to failed; selecting old
`payment_pending` rows with a PaymentIntent. These restore checkout capacity/payment state
and free travelers from interrupted generation. All appear in the automation source inventory.

The driver cause is **Connection terminated due to connection timeout**. `server/db.ts`
sets `connectionTimeoutMillis=5000`, pool maximum 20, idle timeout 30 seconds. The inspected
08:02/08:12 failures occur roughly five seconds after their scheduled query starts.
Evidence points to failed connection establishment/acquisition, not an established slow SQL
statement or PostgreSQL statement-timeout. The logs do not establish whether the underlying
cause is database wake-up, DNS/TLS/network delay, server connection limits or pool pressure.
No pool-state-at-error records were returned for that inspected window. Do not claim a proven
pool-exhaustion root cause.

There were also explicit background-job cap skips around 09:17:18 for checkout,
stale-authorized checkout and itinerary sweep (four other jobs active). Those are intentionally
logged skips, not successful passes or database failures.

### Silent-to-monitoring failure

**Yes, the checkout cleanup path can fail without making its cron HTTP/heartbeat fail.**
Both checkout sweep candidate-query catches log the error and return the zero-initialized
result without an error marker. The cron `checkout-sweep` route wraps these two results
without a failure predicate; `runJob` therefore can return HTTP 200 and stamp success even
though a candidate query failed. The shared background retry wrapper also cannot retry an
error that the sweep swallowed. These failures are visible in server logs, but potentially
invisible to HTTP-success/heartbeat monitoring.

The itinerary routine catches and returns an `error` field. Its cron endpoint explicitly
checks that field, returns HTTP 500 and does not stamp success. Its warm-timer wrapper still
does not retry a caught-and-returned error. Other inventory jobs were not proved to have
this same defect by this investigation.

Read-only production queries found **zero** stale generating itineraries and zero
`payment_pending` rows older than 30 minutes in either PaymentIntent category at the time
of inspection. This bounds current backlog, not prior delays or all inventory health.

No jobs were manually POSTed, no financial jobs were triggered, and no production
data/schema/configuration was changed. The request authorized investigation/reporting,
not a speculative database/policy change. Fixing the false-green checkout reporting and
establishing the connection failure cause remain separate reliability work.

## Settled #1225 scope

Its actual head is **task-automation-registry**, not the email repair branch.
Its title is now **Automation registry review snapshot: five domains, migration incomplete**.
The description explicitly states:

- No single-domain completion claim: the snapshot contains payments, moderation/security,
  bookings, messaging and provider (85 registry nodes).
- Provider is its latest completed domain: eight nodes and 100 documented passing checks.
- AI and cross-domain scheduled migrations remain deferred.
- Canonical confirmation was a shared prerequisite, not the PR's purpose; vendor repair is
  on #1232.
- It remains draft and must not merge/publish or resume migration before the release gates.

The title/body were updated through GitHub REST after the CLI GraphQL edit required an
unavailable read:org scope. No new permission was requested and no registry code changed.