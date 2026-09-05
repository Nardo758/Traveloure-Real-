/**
 * The ONE read-scope decision for the public expert surfaces.
 *
 * Ledger `2026-09-05-experts-public-projection`; CLAUDE.md §14's read clause and §19's allowlist
 * posture applied to a RESPONSE. Third instance of the same class as
 * `2026-09-05-custom-venues-owner-scope` and `2026-09-05-vendors-read-scope`, found by the sweep
 * those two started.
 *
 * WHAT WAS WRONG
 * ──────────────
 * `storage.getExpertsWithProfiles` selected the whole `users` row (`db.select().from(users)`) and
 * returned `{ ...expert, ... }`. Three names were deleted from it afterwards — `password`,
 * `instagramAccessToken`, `instagramUserId` — which is a DENYLIST over a thirty-six-column table,
 * so everything nobody thought to name went out. Its three callers are all unauthenticated:
 * `GET /api/experts`, `GET /api/experts/counts` and `GET /api/experts/:id` (the last one
 * `res.json`s the row verbatim). So `email`, `notificationEmail`, `homeCity`, `stripeCustomerId`,
 * `stripeAccountId`, `stripeAccountStatus`, `canReceivePayments`,
 * `commissionOverrideExpertSharePercent` (a §18 rate-bearing column), `suspensionReason`,
 * `isDeleted`/`isSuspended`, `preferences` and the rest were served to anyone for every
 * expert-role account.
 *
 * The nested `expertForm` was the same shape and worse: the full `local_expert_forms` row,
 * including `govId` and `travelLicence` (identity-document URLs), the payout/fee family and the
 * admin review internals.
 *
 * THE SHAPE OF THE FIX
 * ────────────────────
 * ONE projector, applied by `storage.getExpertsWithProfiles` (layer 1, so every caller is covered)
 * and AGAIN at each of the three routes (layer 2) — the doubling CLAUDE.md §18 requires for a
 * privileged field, here applied to a privileged COLUMN on the way out. It is idempotent by
 * construction, so the second application is a no-op on an already-projected row and still catches
 * anything a route re-attached in between (both list routes spread `...e` while adding storefront
 * metrics).
 *
 * §18 rule 1 — the users-column key set is DERIVED from the table with drizzle's
 * `getTableColumns`, never re-typed here. That is what makes the allowlist true: a column added to
 * `users` tomorrow is a key this projector removes, because it is a users column that
 * `EXPERT_PUBLIC_FIELDS` does not name. A hand-copied column list would have to be edited to keep
 * that property, and nobody edits a list for a column that did not exist when it was written —
 * which is exactly why §19 exists.
 *
 * Keys that are NOT users columns pass through untouched: `experienceTypes`, `selectedServices`,
 * `specializations`, `displayName`, `headline`, `city`, `country`, `languages`, `averageRating`,
 * `reviewCount` are composed by the storage method, and `servicesCount`, `serviceBookings`,
 * `expertRating`, `expertReviewCount` by the list route. Projecting those away would break every
 * expert card; the privileged material is the raw row, not the composition around it.
 *
 * Nothing here reads the request — there is no caller-dependent branch. The public shape is the
 * ONLY shape these three routes serve.
 */

import { getTableColumns } from "drizzle-orm";
import {
  users,
  EXPERT_PUBLIC_FIELDS,
  EXPERT_FORM_PUBLIC_FIELDS,
} from "@shared/schema";
import { pickPublicFields } from "./data-sanitizer";

/**
 * Every column name on `users`, read off the drizzle table definition rather than restated.
 * Used as "the set of keys this projector OWNS": a key in here that `EXPERT_PUBLIC_FIELDS` does
 * not name is dropped.
 */
const USERS_COLUMN_NAMES: ReadonlySet<string> = new Set(Object.keys(getTableColumns(users)));

const PUBLIC_USER_FIELDS: ReadonlySet<string> = new Set(EXPERT_PUBLIC_FIELDS as readonly string[]);

/**
 * The one `preferences` key a public expert surface reads: the storefront cover image
 * (`expert-detail.tsx`). `users.preferences` is unbounded jsonb whose contents nothing in this
 * codebase constrains, so the blob is never published; this re-attaches the single string the page
 * renders, in the shape the page already reads, and only when a real non-empty value exists.
 *
 * §13 — an absent cover image is OMITTED, not sent as `null` or `""`. `buildStorefront` in
 * `storefront.routes.ts` makes the same narrowing for `/s/:handle`; this does not invent a second
 * reading of the blob, it applies the same one on the other surface.
 */
function narrowPreferences(raw: unknown): { storefront: { coverImageUrl: string } } | undefined {
  const cover = (raw as any)?.storefront?.coverImageUrl;
  if (typeof cover !== "string" || cover.trim().length === 0) return undefined;
  return { storefront: { coverImageUrl: cover } };
}

/**
 * Projects the nested `expertForm` (a `local_expert_forms` row) down to
 * `EXPERT_FORM_PUBLIC_FIELDS`. `null`/absent stays `null` — an expert with no form is a real state
 * the cards already handle, and it must not become `{}` (§13: "no form" and "a form with nothing
 * in it" are different facts).
 */
function projectExpertForm(form: unknown): Record<string, unknown> | null {
  if (!form || typeof form !== "object") return null;
  return pickPublicFields(form as any, EXPERT_FORM_PUBLIC_FIELDS as any) as Record<string, unknown>;
}

/**
 * The public shape of one expert. Idempotent: `toPublicExpert(toPublicExpert(x))` deep-equals
 * `toPublicExpert(x)`, which is what lets layer 2 re-apply it at the route with no behaviour
 * change and no second implementation.
 */
export function toPublicExpert<T extends Record<string, any>>(row: T): Record<string, any> {
  const out: Record<string, any> = {};

  // Allowlist over the users columns; pass-through for everything the storage method / route
  // composed on top (see the header note on why those are not projected).
  for (const key of Object.keys(row)) {
    if (USERS_COLUMN_NAMES.has(key) && !PUBLIC_USER_FIELDS.has(key)) continue;
    out[key] = row[key];
  }

  // `expertForm` is a whole second table riding on the response; project it too.
  if ("expertForm" in row) {
    out.expertForm = projectExpertForm(row.expertForm);
  }

  // `preferences` is a users column and is therefore already gone (it is not in
  // EXPERT_PUBLIC_FIELDS). Re-attach only the one narrowed key, from the RAW row.
  const prefs = narrowPreferences(row.preferences);
  if (prefs) out.preferences = prefs;

  return out;
}

/** Array convenience. Same projector, no second decision. */
export function toPublicExperts<T extends Record<string, any>>(rows: T[]): Record<string, any>[] {
  return rows.map(toPublicExpert);
}
