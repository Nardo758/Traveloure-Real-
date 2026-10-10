import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { extractMountedMutations } from "./extractor.ts";

test("follows mounted imported routers and normalizes paths", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-auth-"));
  fs.writeFileSync(path.join(dir, "routes.ts"), `import child from "./child"; app.use("/api", child); app.post("/api/direct/", requireAuth, () => {});`);
  fs.writeFileSync(path.join(dir, "child.ts"), `router.post("/widgets/:id/", isExpert, () => {}); router.get("/widgets", () => {});`);
  const result = extractMountedMutations(path.join(dir, "routes.ts"), dir);
  assert.equal(result.mutations.length, 2);
  assert.deepEqual(result.mutations.map((m) => [m.method, m.path]), [["POST", "/api/direct"], ["POST", "/api/widgets/:id"]]);
  assert.equal(result.mutations[1].expectedRoles[0], "expert");
});

test("resolves named re-exports used by authentication registration helpers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-auth-reexport-"));
  fs.mkdirSync(path.join(dir, "auth"));
  fs.writeFileSync(path.join(dir, "routes.ts"), `import { setupEmailAuth } from "./auth"; setupEmailAuth(app);`);
  fs.writeFileSync(path.join(dir, "auth/index.ts"), `export { setupEmailAuth } from "./email";`);
  fs.writeFileSync(path.join(dir, "auth/email.ts"), `export function setupEmailAuth(app: unknown) { app.post("/api/auth/login/", () => {}); }`);
  const result = extractMountedMutations(path.join(dir, "routes.ts"), dir);
  assert.equal(result.mutations.length, 1);
  assert.equal(result.mutations[0].rawPath, "/api/auth/login/");
  assert.equal(result.mutations[0].effectivePath, "/api/auth/login");
});

/*
 * THE NUMBERS BELOW WERE WRONG FROM BIRTH, AND THAT — NOT DRIFT — IS WHY THEY
 * WENT TEN MONTHS WITHOUT BEING NOTICED.
 *
 * This file was added by PR #973 asserting 587 raw / 578 unique. The manifest
 * generated THAT SAME DAY already said 597 / 588, so the suite never passed
 * once. It also runs in NO workflow, and `check-test-files-wired.cjs` does not
 * scan `scripts/`, so nothing ever went red: a test that cannot pass and cannot
 * be seen is indistinguishable from one that does not exist.
 *
 * Since that day the mounted graph has grown by exactly ONE route —
 * `POST /api/memberships/checkout` (`payments.routes.ts`, ledger
 * `2026-09-21-membership-checkout`) — taking it to 598 / 589. So updating these
 * numbers blesses one reviewed, ratified addition and corrects a ten-count
 * birth defect. It is not a drift detector being silenced.
 *
 * 2026-09-23 (ledger `2026-09-23-phase1-security`, board task #502): +3 reviewed routes, the
 * invited person's side of an EA link — `POST /api/me/ea-invitations/:id/accept`,
 * `POST /api/me/ea-invitations/:id/decline` and `DELETE /api/me/ea-links/:id` (`ea.routes.ts`).
 * An EA used to attach any account by email with no consent; linking now requires the person to
 * accept from their own session. 598 / 589 → 601 / 592; user-data 200 → 203; session-self
 * 303 → 306 (each acts only on a row addressed to the session's own email or account).
 *
 * 2026-09-24 (ledger `2026-09-24-out-of-band-refund-blocks-mint`, board task #1288): +1 reviewed
 * route, `POST /api/admin/bookings/:bookingId/out-of-band-refund/clear` (`admin.routes.ts`) — an
 * admin clears a refund-outside-the-platform mark with a required note (decision-maker, Sep 24).
 * Behind the §2 blanket admin guard and probed by the live admin suite. 601 / 592 → 602 / 593;
 * admin 148 → 149; admin-role 148 → 149.
 *
 * 2026-09-24 (PR #1066, lost-chargeback guard; decision-maker Sep 24): +1 reviewed route,
 * `POST /api/admin/bookings/:bookingId/lost-chargeback/reconcile` (`admin.routes.ts`) — the
 * ledger-only way to close a lost chargeback, which sends no money. Behind the §2 blanket admin
 * guard and probed by the live admin suite. 602 / 593 → 603 / 594; admin 149 → 150; admin-role
 * 149 → 150.
 *
 * 2026-09-24 (Phase 3 launch-gap batch, ledger `2026-09-24-phase3-launch-gaps-1`): +2 reviewed
 * routes. `POST /api/provider/services/:id/gallery-photo` (board #159; owner-gated in the handler,
 * the cover-photo rail's twin) is user-data; `POST /api/analytics/recruitment-click` (board #323;
 * a fire-and-forget beacon with a strict allowlist and no identity from the body) is other.
 * 603 / 594 → 605 / 596; user-data 203 → 204; other 210 → 211; session-self 306 → 308.
 *
 * 2026-09-24 (phone push, Locked Decision 53, ledger `2026-09-24-web-push`): +3 reviewed routes,
 * `POST` + `DELETE /api/push/subscriptions` and `POST /api/push/test` (`push.routes.ts`). Each acts
 * only on the SESSION account's own device rows (`.strict()` bodies, no identity in the body), so
 * session-self/other is the right class. 605 / 596 → 608 / 599; other 211 → 214; session-self
 * 308 → 311.
 *
 * 2026-09-24 (executive-assistant plans, Locked Decision 52 (C), ledger
 * `2026-09-24-ea-plans-for-executive`): +1 reviewed route, `POST /api/ea/clients/:id/trips`
 * (`ea.routes.ts`), behind the same `/api/ea` role guard as every other EA route, so it classes
 * with them (admin / admin-role). The owner comes from the EA's own accepted relationship row,
 * never the body. 608 / 599 → 609 / 600; admin 150 → 151; admin-role 150 → 151.
 *
 * 2026-09-24 (live help, Locked Decision 54, ledger `2026-09-24-live-chat-qa-sessions`): +2 reviewed
 * routes (`live-help.routes.ts`). `PUT /api/me/available-now` writes only the SESSION earner's own
 * switch (`.strict()` `{ on }`, no identity or time in the body) — user-data / session-self.
 * `POST /api/qa-sessions/:bookingId/start` stamps a Q&A Session on a booking the session user is
 * the traveler or seller of; a stranger and a non-Q&A booking are one 404 in the service
 * (`server/__tests__/live-help.db.test.ts` Q1), and it classes with its booking-lifecycle peers
 * (`accept-deliverable`, `request-revision`, component cancel — all session-self) — other /
 * session-self. 609 / 600 → 611 / 602; user-data 204 → 205; other 214 → 215; session-self
 * 311 → 313.
 *
 * Board #329 (ledger `2026-09-24-saved-places-plan-and-share`, migration 324) adds two routes in the
 * already-mounted `saved-items.routes.ts`: `POST /api/saved-items/shares` shares ONE city of the
 * SESSION user's own saved places (`.strict()` `{ city }`, no identity in the body) and
 * `DELETE /api/saved-items/shares/:shareId` stops the session user's own link (the UPDATE carries
 * `user_id = session` in its WHERE; not yours is one 404 —
 * `server/__tests__/saved-place-shares.db.test.ts` S5). Both user-data / session-self.
 * 611 / 602 → 613 / 604; user-data 205 → 207; session-self 313 → 315.
 *
 * RC-10 (ledger `2026-09-25-rc10-profile-photo`) mounts `profile-photo.routes.ts` with two
 * session-scoped writes: `POST /api/me/profile-photo` uploads the SESSION user's own photo (raw
 * bytes, no identity in the body or path — the actor is the session) and
 * `DELETE /api/me/profile-photo` NULLs the session user's own column (anonymous is 401 on both —
 * `server/__tests__/profile-photo.db.test.ts` R1). The public `GET /api/avatars/:file` proxy is a
 * read and is not a mutation. Both user-data / session-self. 613 / 604 → 615 / 606; user-data
 * 207 → 209; session-self 315 → 317.
 *
 * Ledger `2026-09-25-seller-booking-mode-prompt` mounts `booking-mode-prompt.routes.ts` with one
 * session-scoped write: `POST /api/me/listings/booking-mode/decide` sets Instant/Request on the
 * SESSION seller's own undecided listings (`.strict()` `{ mode }`, no identity in the body;
 * anonymous is 401 — `server/__tests__/booking-mode-status.db.test.ts`). The status read and the
 * admin summary are GETs, not mutations. user-data / session-self. 615 / 606 → 616 / 607;
 * user-data 209 → 210; session-self 317 → 318.
 *
 * Ledger `2026-09-26-transfer-link-tracked` adds `POST /api/transport-options/click`: the TRACKED
 * hop for a destination transfer's partner link (§16). The list no longer ships the URL; this
 * session-gated rail (`isAuthenticated`, `.strict()` `{ optionId, destination, startDate?,
 * travelers? }`, never a URL) rebuilds the option server-side, records the click and returns the
 * URL. other / session-self. 616 / 607 → 617 / 608; other 215 → 216; session-self 318 → 319.
 * 617 / 608 → 618 / 609; admin 151 → 152 (+1 admin-role boundary): POST
 * /api/admin/bookings/:bookingId/exception-refund (ledger `2026-09-27-admin-exception-refund`), under
 * the blanket /api/admin guard.
 * 618 / 609 → 624 / 615 (ledger `2026-09-27-blog-lifecycle`, Lane C): the blog lifecycle rails.
 * Five under the blanket /api/admin guard — POST /api/admin/blog/posts, PATCH
 * /api/admin/blog/posts/:id, POST …/:id/submit, …/:id/publish, …/:id/withdraw — admin 152 → 157,
 * admin-role 152 → 157; and POST /api/expert/blog/posts/:id/sign (the expert signs their own
 * piece), user-data 210 → 211, session-self 318 → 319.
 * 624 / 615 → 625 / 616 (ledger `2026-09-27-blog-draft`, Lane C.2): POST /api/admin/blog/drafts
 * (research + AI draft into a draft post), under the blanket /api/admin guard — admin 157 → 158,
 * admin-role 157 → 158.
 * 625 / 616 → 627 / 618 (ledger `2026-09-27-blog-reactions-ask`, Lane C.3a): reader reactions on a
 * published post, POST /api/blog/posts/:slug/reactions and DELETE
 * /api/blog/posts/:slug/reactions/:kind, both `isAuthenticated` and acting on the SESSION user only —
 * other 216 → 218, session-self 319 → 321.
 * 627 / 618 unchanged (ledger `2026-09-28-cart-add-trip-ownership`, R210): POST /api/cart/items now
 * refuses a foreign plan through the one ownership read before any write, so the extractor classes
 * it resource-owner / verified — session-self 321 → 320, resource-owner 95 → 96. No rail added.
 * 627 / 618 → 628 / 619 (ledger `2026-09-29-a2-travel-time-matrix`, Track A step A2): POST
 * /internal/jobs/travel-matrix-refresh, machine-to-machine behind INTERNAL_JOB_SECRET (not a user
 * session) — other 218 → 219, public-or-system 38 → 39.
 * 628 / 619 → 634 / 625 (ledger `2026-09-29-a3-option-sets`, Track A step A3): six plan option-set
 * rails — POST/option-sets, POST …/options, DELETE …/options/:optionId, POST …/choose, POST …/close
 * and POST /api/trips/:tripId/anchor/promote. The text heuristic classes them session-self because
 * the plan check (owner / delegate / §12 write advisor; choose owner-or-delegate only, R129) lives
 * in `plan-option-sets.service.ts`, not the handler; that gate is proven by the DB suite (O3, O9) —
 * user-data 211 → 217, session-self 320 → 326.
 * 634 / 625 → 636 / 627 (ledger `2026-09-29-a3b-option-sets-slip`, Track A step A3b): POST
 * …/option-sets/:setId/reopen and POST …/option-sets/suggest, gated the same way in the same
 * service (reopen owner/delegate only, R129; proven by the DB suite O11/O13) — user-data 217 → 219,
 * session-self 326 → 328.
 * 636 / 627 → 637 / 628 (ledger `2026-09-29-a4-plan-fit-compare`, Track A step A4): POST
 * /api/trips/:tripId/slip-events, the ONE client event rail (E4 `slip_plan_fit_shown`, 202). The plan
 * read check lives in `recordPlanFitShown` (one 404 for a stranger or a foreign option; proven by the
 * DB suite O17), so the heuristic classes it session-self — user-data 219 → 220, session-self 328 → 329.
 * 637 / 628 → 633 / 624 (ledger `2026-09-30-retire-xai`): four POST routes with no client caller
 * were DELETED with the xAI retirement — /api/grok/content/generate, /api/grok/intelligence,
 * /api/grok/itinerary/generate and /api/grok/chat — all session-self in the "other" category, so
 * other 219 → 215, session-self 329 → 325. (The two deleted GETs are not mutations.)
 * 633 / 624 → 634 / 625 (ledger `2026-09-30-affiliate-extract-compliant`): POST
 * /api/admin/affiliate/partners/:id/page-extract, the ONE writer of the per-partner page-extract
 * terms gate — under §2's blanket /api/admin guard, so admin 158 → 159, admin-role 158 → 159.
 * 634 / 625 → 635 / 626 (ledger `2026-09-30-a7-version-per-option`, Track A step A7): POST
 * /api/itinerary-comparisons/:id/adopt-stops — the comparison owner only plus the trip's §12 WRITE
 * gate, exactly as adopt-stop, so other 215 → 216 and resource-owner 96 → 97.
 * 635 / 626 → 636 / 627 (ledger `2026-09-30-travelpulse-weekly`): POST
 * /api/admin/blog/travelpulse-weekly, the admin trigger for this ISO week's platform draft (reads no
 * body) — under §2's blanket /api/admin guard, so admin 159 → 160, admin-role 159 → 160.
 * 636 / 627 → 637 / 628 (ledger `2026-09-30-travelpulse-weekly-schedule`): POST
 * /internal/jobs/travelpulse-weekly, machine-to-machine behind INTERNAL_JOB_SECRET (not a user
 * session) — other 216 → 217, public-or-system 39 → 40.
 * 637 / 628 → 638 / 629 (ledger `2026-09-30-blog-event-guide`): POST /api/admin/blog/event-guides,
 * the admin trigger for one event's weekend guide ({ eventId }, .strict()) — under §2's blanket
 * /api/admin guard, so admin 160 → 161, admin-role 160 → 161.
 * 638 / 629 → 639 / 630 (ledger `2026-09-30-blog-series-follow`): POST /api/admin/blog/series-follows,
 * the admin trigger for one series' follow ({ seriesKey }, .strict()) — under §2's blanket
 * /api/admin guard, so admin 161 → 162, admin-role 161 → 162.
 * 639 / 630 → 640 / 631 (ledger `2026-09-30-blog-race-weekend`): POST /api/admin/blog/race-weekends,
 * the admin trigger for one race weekend ({ eventId, fromMarket? }, .strict()) — under §2's blanket
 * /api/admin guard, so admin 162 → 163, admin-role 162 → 163.
 * 646 / 637 → 647 / 638 (PR #1240, POST /api/bookings/:id/resume-payment): a declined card
 * re-drives the same booking. The text heuristic does not see the booking-ownership check, so it
 * classes the rail session-self — user-data 222 → 223, session-self 327 → 328.
 * 649 / 640 → 650 / 641 (ledger `2026-10-03-surface-step2-tools-tray`): POST
 * /api/trips/:tripId/flight-lookup, "Getting there"'s flight schedule lookup — a .strict() body,
 * gated by authorizeTripLogistics({ requireWriteAccess: true }) because it spends a billed call; it
 * writes no anchor (the existing anchor route does).
 * 650 / 641 → 651 / 642 (ledger `2026-10-03-item-locks`, R-ah): PUT
 * /api/trips/:tripId/itinerary-items/:itemId/lock, the owner's "Keep this" / "Unlock" — a .strict()
 * { locked } body behind verifyTripOwnership (one 404). The text heuristic does not see the
 * ownership check, so it classes the rail session-self — user-data 225 → 226, session-self 330 → 331.
 * 651 / 642 → 653 / 644 (ledger `2026-10-04-surface-step5-map-versions`): POST
 * /api/trips/:tripId/versions/apply-days and POST /api/trips/:tripId/days/:day/retime — .strict()
 * bodies behind authorizeTripLogistics({ requireWriteAccess: true }) (one 404). The text heuristic
 * does not see that check, so both class session-self — user-data 226 → 228, session-self 331 → 333.
 * 653 / 644 → 655 / 646 (ledger `2026-10-04-feedback-phase-a`): POST and DELETE
 * /api/plans/:id/feedback, the post-draft tap and its undo — .strict() picks behind the plan's read
 * gate (authorizeTripLogistics; one 404), the user from the session. The text heuristic classes both
 * "other" / session-self — other 217 → 219, session-self 333 → 335.
 * 655 / 646 → 656 / 647 (ledger `2026-10-04-expert-inbox-questions`, work plan L1-13): POST
 * /api/expert/inbox/questions/:id/answer — a .strict() pick under the expert role backstop
 * (`/api/expert/inbox` in EXPERT_SELF_SERVICE_PREFIXES); the answering expert is the session user and
 * the question's visibility is decided in the service (one 404). The text heuristic classes it
 * "user-data" / session-self — user-data 228 → 229, session-self 335 → 336.
 * 656 / 647 → 657 / 648 (PR #1283, daily facts recheck registration): POST /internal/jobs/facts-recheck,
 * the scheduler's trigger behind requireInternalSecret — "other" / public-or-system like its sibling
 * /internal/jobs/* triggers: other 219 → 220, public-or-system 40 → 41.
 * 657 / 648 → 658 / 649 (ledger `2026-10-04-leg-google-coords-refresh`, R313): POST
 * /internal/jobs/leg-google-coords, the daily leg Google-coordinate refresh behind requireInternalSecret —
 * "other" / public-or-system like its sibling triggers: other 220 → 221, public-or-system 40 → 41 (after
 * #1284 moved one route public-or-system → session-self).
 *
 * 661 / 652 → 675 / 666 (R323, step 7b — the handoff): fourteen registrations. POST /api/trips/:tripId/handoff
 * and …/handoff/quote; POST /api/handoffs/:id/{authorized,approve,changes,withdraw,on-trip-support,
 * on-trip-support/confirm,accept,decline,deliver}; POST /api/trips/:tripId/expert-suggestions/:id/{accept,
 * decline} and …/accept-all; POST /api/admin/handoffs/:id/assign (behind the blanket /api/admin guard);
 * POST /internal/jobs/handoff-timers (internal secret). Every handler takes the actor from the session and
 * answers one 404 for "not yours". admin 168 → 169, user-data 230 → 233, other 223 → 233;
 * session-self 339 → 350, resource-owner 98 → 99, public-or-system 41 → 42.
 * 675 / 666 → 676 / 667 (ledger `2026-10-07-step9b-optimizer-and-rechecks`, step 9b D6): POST
 * /internal/jobs/legs-dayof-recheck, the hourly day-of leg re-check behind requireInternalSecret —
 * "other" / public-or-system like its sibling triggers: other 233 → 234, public-or-system 42 → 43.
 * 676 / 667 → 677 / 668 (ledger `2026-10-07-step9c-leg-options`, step 9c D1): POST
 * /api/trips/:tripId/transport-legs/:legId/options, a routed leg's options on tap — user-data,
 * session-self by the text heuristic (like flight-lookup); the handler runs authorizeTripLogistics with
 * requireWriteAccess before any call or write: user-data 233 → 234, session-self 350 → 351.
 *
 * POST /api/optimization-payments/cancel — traveler cancels own open Optimize intent; session-self
 * (ledger `2026-10-08-optimize-pay-flow`, sanctioned by the decision-maker Oct 8, 2026):
 * 677/668 → 678/669, other 234 → 235, session-self 351 → 352.
 * 678 / 669 → 679 / 670 (ledger `2026-10-08-qa-trip-pass-issue`): POST /api/admin/trip-pass/issue —
 * admin issues zero-charge Trip Pass to QA-domain accounts; admin boundary. admin 169 → 170,
 * admin-role 169 → 170.
 * 679 / 670 → 680 / 671 (ledger `2026-10-09-s1-one-stay`, R386): POST /api/trips/:tripId/stay-pick/seen —
 * the stay card clears its one-time `changed` flag; owner or managing assistant, one 404 otherwise.
 * 680 / 671 → 682 / 673 (ledger `2026-10-09-fd2-content-tier-tags`): POST /api/admin/gems/:id/verify — an
 * admin verifies an untagged gem (ruling 3); admin boundary. POST /internal/jobs/content-expiry-census —
 * the internal-secret trigger (ruling 8); public-or-system. admin 170 → 171, other 235 → 236.
 * 682 / 673 → 683 / 674 (ledger `2026-10-10-s1-d1-liteapi`): POST /internal/jobs/liteapi-sync — the nightly
 * LiteAPI sync's internal-secret trigger; public-or-system. other 236 → 237, public-or-system 44 → 45.
 * 683 / 674 → 684 / 675 (ledger `2026-10-10-ss1b-official-refresh`): POST /internal/jobs/official-refresh — the
 * market-level official refresh's internal-secret trigger; public-or-system. other 237 → 238, public-or-system 45 → 46.
 *
 * THE COUNTS ARE THE POINT: they exist so a route appearing or vanishing from
 * the mounted graph fails here. Now that the file is wired into CI, changing a
 * number is a decision that needs its reason stated, exactly as this one does.
 */
test("current mounted graph parity includes auth helpers and shared api paths", () => {
  const root = process.cwd();
  const result = extractMountedMutations(path.join(root, "server/routes.ts"), root);
  assert.equal(result.mutations.length, 684);
  assert.equal(new Set(result.mutations.map((m) => `${m.method} ${m.effectivePath}`)).size, 675);
  assert.ok(result.mutations.some((m) => m.path === "/api/auth/login" && m.source.endsWith("emailAuth.ts")));
  assert.ok(result.mutations.some((m) => m.path === "/api/trips/:id" && m.method === "PATCH"));
});

test("generated user-facing inventory contains one row per unique endpoint and stable risk totals", () => {
  const root = process.cwd();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "generated/security/mutation-auth-manifest.json"), "utf8"));
  const markdown = fs.readFileSync(path.join(root, "generated/security/mutation-auth-inventory.md"), "utf8");
  const endpointRows = markdown.split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| ---")).slice(1);
  assert.equal(endpointRows.length, 675);
  assert.equal(manifest.rawRegistrationCount, 684);
  assert.equal(manifest.uniqueMethodNormalizedPathCount, 675);
  // + POST /api/trips/:tripId/where-to-stay (ledger `2026-10-02-smoke4-draft-fixes`, R274): user-data,
  // session-self; the owner/delegate check runs in the service before any write.
  // + POST /api/admin/content-sources/:id/public-ok (ledger `2026-10-03-official-facts-public-ok`, R278):
  // admin, behind the blanket /api/admin guard.
  // + POST /api/trips/:tripId/flight-lookup (ledger `2026-10-03-surface-step2-tools-tray`): user-data,
  // session-self by the text heuristic; the handler runs authorizeTripLogistics with requireWriteAccess.
  // + POST /api/expert/inbox/questions/:id/answer (ledger `2026-10-04-expert-inbox-questions`):
  // user-data, session-self; under the expert role backstop.
  // + POST /internal/jobs/facts-recheck (PR #1283): other, public-or-system — the internal-secret trigger.
  // + POST /internal/jobs/leg-google-coords (R313): other, public-or-system — the internal-secret trigger.
  // + POST /internal/jobs/legs-dayof-recheck (step 9b D6): other, public-or-system — the internal-secret trigger.
  // + POST /api/trips/:tripId/transport-legs/:legId/options (step 9c D1): user-data, session-self.
  // + POST /api/trips/:tripId/stay-pick/seen (ledger `2026-10-09-s1-one-stay`, R386): user-data, session-self;
  // markStayPickSeen checks the plan's "choose" role before the write.
  // + POST /api/admin/gems/:id/verify (FD-2 ruling 3): admin, behind the blanket /api/admin guard.
  // + POST /internal/jobs/content-expiry-census (FD-2 ruling 8): other, public-or-system — the internal-secret trigger.
  // + POST /internal/jobs/liteapi-sync (S1-d-1): other, public-or-system — the internal-secret trigger.
  // + POST /internal/jobs/official-refresh (SS-1b): other, public-or-system — the internal-secret trigger.
  assert.deepEqual(manifest.categoryTotals, { payments: 31, admin: 171, "user-data": 235, other: 238 });
  // POST /api/trips/:tripId/advisors moved session-self -> resource-owner (ledger
  // 2026-09-23-advisors-rail-takes-a-handle): it verifies trip ownership before any write, which
  // the text heuristic had missed; it is now probed by a real User A -> User B fixture.
  // POST /api/itinerary-comparisons/:id/adopt-stop moved session-self -> resource-owner (ledger
  // 2026-09-26-adopt-stop-write-access, R130): it now calls authorizeTripLogistics with
  // requireWriteAccess, so the plan's owner or a write-status advisor is verified before any write.
  // POST /api/optimization-preview: briefly public-or-system when step 6 (R296) removed its only session
  // read (the retired free re-run); R297 gives it the plan-route session gate (decision-maker ruling,
  // Oct 4, 2026), so it is session-self again — 401 anonymous, the plan read gate when it names a plan.
  // POST /api/geocode moved public-or-system -> session-self (R312, ledger `2026-10-04-maps-session-and-browser-key`):
  // every call spends a Geocoding request, so it requires a session (decision-maker ruling, Oct 4, 2026).
  // #1274 (traveler itinerary emails, R314): + PATCH /api/me/itinerary-email-preferences (user-data,
  // session-self) and + POST /email-preferences (other, session-self) — both isAuthenticated, the user
  // from the session; + POST /email-preferences/unsubscribe/:token (other, resource-owner) — the token
  // resolves the traveler from their own email_outbox row, one 404 otherwise. 658/649 → 661/652.
  // + POST /api/trips/:tripId/stay-pick/seen (R386): session-self 352 → 353.
  assert.deepEqual(manifest.boundaryTotals, {
    "admin-role": 171, "session-self": 353, "resource-owner": 99,
    signature: 6, "public-or-system": 46, unknown: 0,
  });
  const byEndpoint = new Map(manifest.mutations.map((mutation: any) => [
    `${mutation.method} ${mutation.effectivePath}`, mutation,
  ]));
  assert.equal(byEndpoint.get("POST /api/bookings/process-cart").risk, "payments");
  assert.equal(byEndpoint.get("POST /api/bookings/process-cart").expectedBoundary, "session-self");
  assert.equal(byEndpoint.get("POST /api/coordination-states/:id/pay").expectedBoundary, "resource-owner");
  assert.equal(byEndpoint.get("POST /api/webhooks/stripe").expectedBoundary, "signature");
  assert.equal(byEndpoint.get("POST /api/admin/payouts").risk, "admin");
  assert.equal(byEndpoint.get("POST /api/admin/payouts").expectedBoundary, "admin-role");
  const createTrip = byEndpoint.get("POST /api/trips");
  assert.equal(createTrip.risk, "user-data");
  assert.equal(createTrip.expectedAuth, "public");
  assert.equal(createTrip.expectedBoundary, "public-or-system");
  assert.equal(createTrip.ownershipApplies, false);
});