/**
 * A-13 (ledger `2026-11-05-lane8-cleanup`): the ONE definition of the guest's browser-session storage key. Every module
 * that reads or writes the guest id imports this; `client/src/lib/__tests__/lane8-cleanup.test.ts` fails on a second
 * definition (the literal anywhere else under client/src or shared).
 */
export const GUEST_SESSION_STORAGE_KEY = "traveloure_guest_session";
