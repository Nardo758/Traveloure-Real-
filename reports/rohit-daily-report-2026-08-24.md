# Rohit Daily Testing and Fix Report

**Reporting date:** Monday, August 24, 2026  
**Prepared on:** Tuesday, August 25, 2026  
**Project:** Traveloure

## Attribution and evidence note

No commit made during the Asia/Calcutta calendar day of August 24 was authored directly with Rohit's Git identity (`rohitbhardwaj80`). The repository records the work under Replit Agent, Claude, Nardo758, and other collaborator identities.

This report therefore documents the testing, findings, fixes, and verification recorded in Rohit's Traveloure workspace on August 24. It is suitable as a project activity report, but it should not be treated as proof that Rohit personally wrote every change listed below.

The report was reconstructed from commit history, CI changes, regression tests, deployment records, visual-audit evidence, and the project's decision ledger.

## Executive summary

The main objective on August 24 was to verify that Traveloure's real production application—not a design artifact—was powering preview and deployment, and then to protect that deployment path from regression. Testing uncovered that artifact-specific deployment configuration could route production to a backend-less static build instead of the root application. The preview was also pointed at the artifact client rather than the canonical `client/src` application.

After restoring the root application, the work moved to marketplace and Ready-Made integrity. The Ready-Made workflow was tested for incomplete and placeholder listings. Gaps were found at submission and administrative approval: an invalid listing could reach approval without the complete quality gate being rechecked. A shared completeness gate, approval-time guard, and four-route regression suite were added. The provider directory was also corrected to use the canonical `/s/:handle` storefront route.

The day additionally included visual and continuity testing of marketplace pages, expert pages, provider storefronts, service detail, pricing/map authoring, and navigation. CI was used to confirm the changes. The TypeScript error baseline improved from 157 to 156 and was ratcheted accordingly.

## What was tested

### 1. Preview source and production deployment target

The workspace configuration was inspected to determine which client application was being served in preview and which build was eligible for production deployment.

Testing covered:

- The root preview startup command.
- Whether preview loaded the canonical `client/src` application.
- Root build and start commands used by Autoscale.
- Artifact-local `.replit-artifact/artifact.toml` files.
- Whether artifact deployment metadata could override the root application.
- Whether a future artifact edit could silently reintroduce the same deployment problem.
- Git and protected-branch behavior during the deployment correction.

### 2. Production activity during the suspected artifact deployment window

A read-only production audit checked whether transactional activity was recorded while the static artifact deployment was believed to be serving production.

The audit reviewed:

- Standard booking activity.
- Affiliate booking requests.
- Ready-Made purchases.
- Stored Stripe webhook events.
- Approved Ready-Made rows that would violate the new completeness requirements.

No production data was modified during this audit.

### 3. Ready-Made submission and approval integrity

The Ready-Made workflow was tested at both lifecycle boundaries:

- Expert/provider submission of a draft.
- Administrative approval of a submitted listing.

The checks covered:

- Blank titles.
- Placeholder titles.
- Missing plan type.
- Missing Unsplash attribution.
- Missing or invalid price data.
- Destinations outside supported launch markets.
- Empty itinerary days.
- Approval attempts for records not in `submitted` status.
- Approval attempts against rows that became incomplete after submission.
- Continued support for incomplete drafts before submission.

### 4. Provider storefront routing

Links from the provider directory were checked against the public storefront route contract.

Testing verified:

- The canonical provider storefront URL.
- The legacy storefront route that must remain available for old shared links.
- Whether directory cards generated the canonical route.
- Whether storefront links were based on real handles rather than dead or guessed destinations.

### 5. Marketplace, storefront, service, and expert continuity

Visual and structural checks covered the main marketplace surfaces:

- Services directory.
- Service detail.
- Provider storefront.
- Experts directory.
- Expert detail.
- Discover/Marketplace.
- Ready-Made detail.
- Navigation under Marketplace and Experts & Services.

The checks focused on:

- Preserving existing API-backed data.
- Preserving booking, payment, contact, messaging, scheduling, review, sharing, and storefront behaviors.
- Retaining existing `data-testid` contracts.
- Ensuring visual rebuilds followed the approved marketplace card grammar.
- Verifying loading, empty, error, and 404 behavior.
- Distinguishing provider storefronts from expert profiles and the flat services catalog.
- Confirming that public-page redesigns did not introduce unsupported claims or placeholder content.

A five-screen provider-surfaces screenshot audit was recorded for:

- `/services`
- A valid storefront rendering
- A storefront 404/provider mismatch state
- `/discover`
- The retired Browse Service Providers page

### 6. Pricing and map-authoring separation

Regression testing checked that the service-radius control remained part of map geometry rather than pricing configuration.

The test verified:

- The radius field followed the map-authoring component after refactoring.
- The pricing drawer still did not contain the radius control.
- The existing pricing/fees invariant remained intact.

### 7. CI, TypeScript, and repository guards

Verification included:

- Build Smoke CI.
- The dedicated Ready-Made completeness test.
- TypeScript comparison against the known project baseline.
- A new artifact-deployment guard.
- Git history and branch protection behavior.
- Confirmation that the working branch and remote branch converged after the corrections.

## What was found

### Finding 1: Preview was not using the canonical production client

The preview script was serving the artifact application rather than the root `client/src` application. This made the design/reference artifact appear to be the live product and could hide differences between the mock and the real production implementation.

**Impact:** Testing the preview could provide false confidence because it was not exercising the same client tree used by the production application.

### Finding 2: Artifact deployment metadata could override the root application

Tracked `.replit-artifact/artifact.toml` files existed inside artifact directories. Those files could enable a static, backend-less artifact deployment and route production away from the committed root application.

**Impact:** Production could serve a visual artifact without the real server APIs, authentication, checkout, bookings, messaging, maps, or accounting behavior.

### Finding 3: The deployment error needed a permanent repository-level guard

Removing the existing override files would fix the immediate problem but would not prevent a later agent or artifact workflow from recreating them.

**Impact:** The same production routing failure could recur silently.

### Finding 4: Production showed no audited transactional activity during the suspected outage window

The read-only production audit found:

- No matching invalid approved Ready-Made rows.
- No affiliate booking requests.
- No Ready-Made purchases.
- No stored Stripe webhook events.
- The latest booking before the cutoff was recorded on April 4, 2026.

**Interpretation:** This was recorded as a deployment and provenance finding. It does not prove that data was lost, and it does not prove that no users visited the site. It shows only that the audited transactional sources contained no matching activity during the reviewed window.

### Finding 5: Ready-Made submission validation was incomplete

The submission path did not enforce the complete listing-quality contract consistently. Listings needed a real title and all required commercial, attribution, destination, and itinerary data before entering review.

**Impact:** An incomplete or placeholder listing could be submitted for administrative review.

### Finding 6: Administrative approval could bypass completeness

Approval did not independently recheck the full Ready-Made completeness contract immediately before publication.

**Impact:** A listing that was incomplete, had become incomplete after submission, or had reached the wrong status could potentially be approved.

### Finding 7: Ready-Made completeness must not invalidate drafts

Testing and product review established that incomplete drafts are legitimate. The quality gate belongs at submission and approval, not while a creator is still drafting and not when a listing is later shipped to the storefront.

**Impact of an incorrect fix:** Applying the gate to draft saves would break normal authoring. Applying it only at storefront publication would allow invalid records too far through the workflow.

### Finding 8: Provider directory links used the legacy storefront path

The provider directory linked to `/p/:handle`, while the canonical public provider storefront contract is `/s/:handle`.

**Impact:** New directory navigation did not follow the current route contract, although legacy `/p/:handle` links still needed to remain supported.

### Finding 9: TypeScript baseline improved

CI showed that the known TypeScript issue count had decreased from 157 to 156.

**Impact:** Leaving the old allowance in place would permit one future regression without failing the baseline check.

### Finding 10: Protected `main` history could not be rewritten after push

The workflow exposed that platform auto-commits can appear around a requested commit, while `main` is force-push protected.

**Impact:** Once pushed, history must be preserved. Commit-message corrections must be made before the first push rather than through a later force-push.

### Finding 11: Marketplace continuity needed real-state evidence

The visual audit found that similarly named surfaces represented different product concepts:

- The services catalog lists individual services.
- Provider storefronts group offerings under a provider identity.
- Expert profiles expose expert offerings and consultation behavior.
- The retired provider-browse page was not the same thing as the services catalog.

**Impact:** Rebuilding or renaming these pages without the audit could merge distinct user journeys or restore a retired route unintentionally.

### Finding 12: Radius belongs to map authoring, not pricing

After a UI refactor moved the radius control, the existing regression assertion needed to follow the field to its new component.

**Impact:** Without updating the proof, the test could fail for the wrong reason or stop protecting the real invariant.

## What was fixed

### Fix 1: Root preview restored

The preview startup script was repointed to the canonical `client/src` application. The root preview now uses:

```text
bash scripts/start-field-guide-preview.sh
```

on port 5000.

The artifact client remains design/reference material and is not the production client.

### Fix 2: Root Autoscale deployment restored

The production deployment contract was restored to:

```text
npm run build
npm start
```

Artifact-local deployment overrides were removed so the root application is the sole deployment target.

### Fix 3: Artifact deployment regression blocked in CI

A repository guard was added to scan tracked paths and fail CI if any `.replit-artifact/` directory is committed.

The guard intentionally checks tracked Git content because production deployment is built from committed source. Ignored or generated local files cannot change the deployed commit.

### Fix 4: Ready-Made completeness logic centralized

A shared completeness gate was implemented for Ready-Made listings. It rejects:

- Missing, blank, or placeholder titles.
- Missing plan type.
- Missing Unsplash attribution.
- Missing price.
- Unsupported launch markets.
- Empty itinerary days.

Draft saving remains valid and is not blocked by this gate.

### Fix 5: Submission protected

The submission route now applies the complete listing-quality gate before moving a draft into review.

### Fix 6: Administrative approval protected

The admin approval route now:

- Requires the listing to be in `submitted` status.
- Rechecks the same completeness contract immediately before approval.
- Refuses approval if the row is incomplete.
- Keeps the status check and approval update atomic so a stale or invalid row cannot be published through a race or bypass.

### Fix 7: Ready-Made regression tests added

A four-case route regression suite was added to cover submission and approval behavior. The suite verifies both allowed and rejected transitions and prevents the submission and approval paths from drifting apart.

### Fix 8: Provider directory corrected to `/s/:handle`

Provider directory links now use the canonical public storefront route:

```text
/s/:handle
```

The legacy `/p/:handle` route remains available for previously shared links.

### Fix 9: CI explicitly runs the Ready-Made guard

The Ready-Made completeness regression suite was wired into Build Smoke CI as a named step so the protection cannot exist unnoticed or stop running silently.

### Fix 10: TypeScript baseline ratcheted

The CI baseline was reduced from 157 to 156 after CI confirmed the improvement. This preserves the gain and causes a future increase back to 157 to be treated as a regression.

### Fix 11: Marketplace continuity pages rebuilt without replacing core behavior

The service detail, storefront, experts directory, and expert-detail surfaces were rebuilt toward the approved continuity design while preserving their API-backed behavior and interaction contracts.

The implementation retained real data and avoided fabricating unsupported descriptions or claims.

### Fix 12: Pricing-radius regression proof updated

The pricing/fees regression assertion was updated to locate the radius field in the map-authoring canvas while continuing to prove that it is absent from the pricing drawer.

### Fix 13: Git process rule documented

The project recorded that:

- `main` is force-push protected.
- Required commit-message amendments must happen before the first push.
- Already-pushed history must not be rewritten.
- Unexpected platform auto-commits must be reported rather than erased with a force-push.

## Verification results

The repository records the following successful verification:

- Build Smoke CI passed.
- The named **Ready-Made completeness gate** CI step passed.
- The four submission/approval route tests passed.
- TypeScript stayed within the ratcheted baseline of 156 known issues.
- The artifact-deployment guard was added to CI.
- Provider-directory links were updated to the canonical storefront route.
- Root preview was configured for `client/src`.
- Root build and start remained the Autoscale deployment commands.
- The relevant commits were pushed without rewriting protected `main` history.
- At the confirmed checkpoint, `main` matched `origin/main` and the tracked working tree was clean.
- Visual screenshot evidence was captured for five provider/marketplace states.
- The pricing-radius regression test followed the control to the map-authoring canvas and preserved the no-radius-in-pricing invariant.

## Items identified but not changed during this testing

The following points were intentionally left for later decisions or separate work:

- Whether `/providers` should receive further visual redesign, remain as-is, or eventually be folded into another service-discovery surface.
- Which distinct icons should represent Service Providers, Local Experts, Trip Planners, and Event Planners in mobile navigation.
- Whether the Marketplace masthead should retain emoji or adopt Lucide icons from the approved artifact.
- Broader `discover.tsx` transcription work, pending a complete read-only audit and masthead ruling.
- Production data cleanup, because the vulnerability and outage-window audit was strictly read-only and found no matching Ready-Made rows requiring repair.

## Overall result

August 24 testing found and corrected two high-impact release risks:

1. The application could be previewed and deployed from the wrong client tree.
2. Incomplete Ready-Made listings could bypass the intended quality contract between submission and approval.

The fixes restored the root production application, prevented artifact deployment overrides from returning, protected Ready-Made publication at both lifecycle boundaries, corrected the canonical storefront link, and strengthened CI so the same problems are detected automatically.

## Source basis

This report was reconstructed from:

- Git history for August 24, 2026 in the Asia/Calcutta timezone.
- Root preview and deployment configuration changes.
- Ready-Made route and admin-route changes.
- Ready-Made route regression tests.
- Build Smoke CI configuration and results recorded in the project history.
- Provider-surfaces screenshot audit evidence.
- Pricing/fees regression-test history.
- The project decision ledger.
- Read-only production-audit findings recorded in the ledger.
