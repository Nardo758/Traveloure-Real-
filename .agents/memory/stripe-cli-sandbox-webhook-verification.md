---
name: Stripe CLI sandbox webhook verification
description: Distinguish early-fraud warnings from full disputes and verify direct CLI forwarding.
---

The installed Nix Stripe CLI version does not support direct triggers for `charge.dispute.closed` or `payout.paid`. A restricted test-mode key cannot create a platform external bank account for a paid-payout test. A test-mode `account.updated` fixture with `--stripe-account` attempted to create an account *as* that account and was rejected; a platform-key CLI update to `/v1/account` using the connected-account header emitted the desired Connect event.

For a real full sandbox dispute, create a test payment with Stripe's `pm_card_createDispute` payment method. CLI `charge.dispute.created` fixtures produced `warning_needs_response` early-fraud warnings here; submitting `winning_evidence` closed one as `warning_closed`, not `won`. A full `needs_response` dispute accepted `winning_evidence` or `losing_evidence` in `uncategorized_text` and produced the respective terminal outcome. Both values need separate disputes because submission is terminal.

**Why:** A signed local fixture proves the application route but not a Stripe-origin outcome; an early-fraud warning's `warning_closed` status can make a supposedly successful won test look like a payout-hold bug.

**How to apply:** Keep the application on a test API key and use the CLI listener's `whsec_` secret for its dedicated development webhook names, not the live secret names. Confirm both routes accept signatures from that listener before triggering sandbox events. Create two full disputes with `pm_card_createDispute`, link their sandbox payment intents to development-only bookings, submit each evidence value separately, and require the Stripe terminal status, CLI-forwarded HTTP response, and database state to agree. `payout.paid` can remain signed-fixture evidence, but label it as such.