---
name: Stripe CLI sandbox webhook verification
description: Limits of CLI-generated webhook evidence in this workspace.
---

The installed Nix Stripe CLI version did not support direct triggers for `charge.dispute.closed` or `payout.paid`. An existing restricted test-mode key also could not create a platform external bank account, so `payout.created` could not produce a paid bank payout. A test-mode `account.updated` fixture with `--stripe-account` attempted to create an account *as* that account and was rejected; a platform-key CLI update to `/v1/account` using the connected-account header emitted the desired Connect event.

**Why:** A signed local fixture proves the application route, but is not evidence of an actual Stripe CLI delivery. The running development app may use a live-mode API key while the CLI creates test-mode dispute charges, so a raw forwarded dispute can fail at the charge lookup despite valid signature handling.

**How to apply:** Clearly distinguish CLI-origin HTTP delivery from locally signed fixtures. For CLI tests against this dev app, keep test-mode Stripe changes isolated and use a loopback-only bridge to expand sandbox dispute charges and re-sign for the existing development webhook endpoints; never swap the app's live signing secrets to the CLI listener secret or claim that this bridge is direct CLI forwarding. Check CLI event support and test-key permissions before promising a four-event CLI pass.