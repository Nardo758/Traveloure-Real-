# Part 7 — held-item classification, awaiting approval

No deletion, function uninstall, schema alteration or production operation was
performed for this classification. The previously approved 15 development
triggers remain absent. All eight backing functions remain present.

## Held inventory

| Path or name | Every current importer/caller found | Proposal | Reason / limit |
|---|---|---|---|
| `public.commerce_catalog_observer()` | No app/script references; no remaining trigger or other public routine-text caller | REMOVE, after explicit development-DDL approval | Legacy catalog observer with its four callers already uninstalled; not a sweep/send-time guard |
| `public.commerce_booking_started()` | No app/script references; no remaining trigger or other public routine-text caller | REMOVE, after explicit development-DDL approval | Legacy booking observer; all four trigger callers removed; authoritative payment writers remain untouched |
| `public.commerce_cart_activity()` | No app/script references; no remaining trigger or other public routine-text caller | REMOVE, after explicit development-DDL approval | Legacy commerce-table mutation observer; not the retained neutral JSONB activity builder |
| `public.commerce_cancel_deleted_cart()` | No app/script references; no remaining trigger or other public routine-text caller | REMOVE, after explicit development-DDL approval | Legacy deleted-cart trigger helper, not dispatcher cancellation |
| `public.commerce_queue_cart_changes()` | No app/script references; no remaining trigger or other public routine-text caller | REMOVE, after explicit development-DDL approval | Legacy trigger enqueue producer; the guarded query sweep is separate |
| `public.commerce_remove_saved_item()` | No app/script references; no remaining trigger or other public routine-text caller | REMOVE, after explicit development-DDL approval | Removed saved-item observer's backing function |
| `public.commerce_trip_removed()` | No app/script references; no remaining trigger or other public routine-text caller | REMOVE, after explicit development-DDL approval | Removed trip-deletion observer's backing function |
| `public.commerce_account_removed()` | No app/script references; no remaining trigger or other public routine-text caller | REMOVE, after explicit development-DDL approval | Removed account-update/delete observers' backing function; not live account checks |
| `reports/commerce-step0-query-sweep.md` | File absent; no importer can be inspected | UNKNOWN | Documentation identity known, contents unavailable in this checkout; not an approved deletion |
| Original 37 commerce wrapper call sites | Original identities unavailable; no matching legacy implementation found in current source | UNKNOWN — hold all 37 | Cannot name or enumerate importers of unidentified historical wrappers; no substitution with valid main registry wrappers |
| Original TypeScript commerce mutation hooks | No identifiable implementation or current calls found | UNKNOWN — hold | Absence from search does not prove removal or establish their original identities |
| Original TypeScript lifecycle hook helpers | No identifiable files or current imports found | UNKNOWN — hold | The neutral activity/snapshot helper is not a replacement identity |
| Unregistered commerce trigger migration drafts | No matching draft in current migration/script SQL searches; no current registration found | UNKNOWN — hold | Do not guess a filename or delete registered migrations; old draft identity remains unproven |

Sources: current `server`, `client`, `shared`, `scripts`, migration directories;
the earlier removal inventory (which retains its 64 import references); and
fresh development `pg_trigger`/`pg_proc` catalog reads. The eight SQL functions
each exist once and each has zero remaining trigger callers. Public routine
bodies were searched for their exact names. Text search cannot rule out
unavailable external scripts or names assembled dynamically; no such caller was
found in the inspected application source.

The missing `reports/commerce-step1-plan.md` is also unavailable as an inventory
source. Existing `reports/commerce-step1-*` documentation, if present, is KEEP;
no report is deleted. No history was pursued to guess legacy removal identities.
The separate historical lookup restored only the golden verification harness.

## Protected dependencies — KEEP, not removal candidates

| Retained dependency | Current consumers / reason |
|---|---|
| `server/services/cart-email-state.service.ts` | Storage, cart projection, route authoring, reminder eligibility, item-change assessment and send verification; server-owned metadata, not an email mutation hook |
| `server/services/cart-reminder.service.ts` | Part 6 verifier, sweep, item-change assessment, itinerary follow-up and outbox; shared read-only payment and reminder policy, including UNKNOWN blockers |
| `server/services/commerce-send-verification.service.ts` | Outbox guarded producers and dispatcher; live account/cart/payment/fact checks |
| `server/services/cart-item-change.service.ts` | Sweep, guarded item-change producer, send verifier; retained read-only classification |
| `server/services/marketing-delivery-policy.service.ts` | Itinerary and cart send/queue paths; recipient locks, timezone, quiet hours and caps |
| `server/services/itinerary-followup.service.ts` and its five database triggers | Shared itinerary cancellation and send-time policy; golden database proof passes after commerce-trigger removal |
| Automation registry, `email-outbox.service.ts`, dispatcher and commerce dedupe index | Existing ownership, claims, retry and uniqueness; not copied or replaced |
| Main migrations 346 and 347 | Main-owned; no migration or registration change |

The approved cutover did not remove any of these dependencies. No REFACTOR
candidate is identified among the eight now-unused SQL functions. If an actual
shared caller is subsequently found, its function becomes KEEP or REFACTOR
before any deletion.

**Awaiting founder approval.** The eight REMOVE proposals are not executed.
The unresolved historical identities remain unaccepted carried-forward blockers;
this table does not certify their removal.
