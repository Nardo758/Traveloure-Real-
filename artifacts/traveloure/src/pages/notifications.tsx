/**
 * Retired (Console Realign R-G, Lane E4) — the traveler notifications page is absorbed into
 * the Inbox's Updates tab (client/src/pages/inbox.tsx): per-row mark-read, per-row DELETE
 * (`DELETE /api/notifications/:id`), mark-all-read, and deep-link derivation all moved there
 * verbatim, riding the shared client/src/lib/notification-icons module. Booking accept/decline
 * (the one thing this page also rendered) was already duplicated from the expert/provider Inbox
 * Queue tabs, which remain the real home for that earner action.
 *
 * The /notifications route stays registered (App.tsx) so existing links/bookmarks keep working;
 * this component now only redirects, mirroring the retired-route pattern used elsewhere
 * (e.g. expert-detail.tsx's `<Redirect to={...} />`, the C5/C9 Inbox-absorption redirects).
 */
import { Redirect } from "wouter";

export default function Notifications() {
  return <Redirect to="/inbox?tab=updates" />;
}
