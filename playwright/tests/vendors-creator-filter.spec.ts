/**
 * Regression coverage for the admin-only vendor creator filter.
 *
 * The page owns the selector and React Query owns the request URL, so this
 * test drives the real admin UI and captures the request rather than only
 * checking the JSX source. The API responses are fixture-backed to keep the
 * test focused on the selector/query-key contract.
 *
 * UPDATED by ledger `2026-09-05-vendors-read-scope`. This spec previously treated the creator
 * filter as an admin-only CLIENT control while the API was open to anyone and returned the
 * creating account's email on every row. It now pins the SERVER's split, because that is where the
 * rule lives: an admin's listing comes from `GET /api/admin/vendors` (under §2's blanket
 * `adminApiGuard`) and carries `createdBy`; everyone else's comes from `GET /api/vendors`, which
 * carries no creator key at all — so the attribution line is absent rather than rendered as
 * "Unknown origin", which would be a claim about a creator the platform simply is not disclosing.
 */

import { test, expect } from "@playwright/test";

const CREATOR_A = "creator-a";
const CREATOR_B = "creator-b";

/** The admin projection: the vendor's own columns PLUS creator provenance. */
const VENDORS_WITH_CREATOR = [
  {
    id: "vendor-a",
    name: "Aiko Events",
    category: "coordination",
    description: "Kyoto planning",
    city: "Kyoto",
    country: "Japan",
    createdById: CREATOR_A,
    createdBy: {
      id: CREATOR_A,
      firstName: "Aiko",
      lastName: "Tanaka",
      email: "aiko@example.com",
    },
  },
  {
    id: "vendor-b",
    name: "Ben Events",
    category: "coordination",
    description: "Osaka planning",
    city: "Osaka",
    country: "Japan",
    createdById: CREATOR_B,
    createdBy: {
      id: CREATOR_B,
      firstName: "Ben",
      lastName: "Sato",
      email: "ben@example.com",
    },
  },
];

/**
 * The browse projection, exactly as the server builds it: no `createdBy`, no `createdById`. This
 * fixture IS the contract — if the server ever starts joining `users` into this response again,
 * the "no creator disclosed" assertions below are what should have caught it.
 */
const VENDORS_DIRECTORY = VENDORS_WITH_CREATOR.map(({ createdBy, createdById, ...vendor }) => vendor);

type AuthUser = {
  id: string;
  role: "admin" | "user";
  email: string;
  firstName: string;
  lastName: string;
  termsAcceptedAt: string;
  privacyAcceptedAt: string;
};

const ACCEPTED_AT = "2026-01-01T00:00:00.000Z";

async function mockVendorDirectory(
  page: import("@playwright/test").Page,
  user: AuthUser,
  requests: URL[],
) {
  await page.route("**/api/auth/user", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(user),
    }),
  );

  // The admin listing, with creator provenance and the creator filter.
  await page.route("**/api/admin/vendors**", (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const createdById = url.searchParams.get("createdById");
    const body = createdById
      ? VENDORS_WITH_CREATOR.filter((vendor) => vendor.createdById === createdById)
      : VENDORS_WITH_CREATOR;

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  // The browse listing. It takes no creator id, so it has no creator branch to mock.
  await page.route("**/api/vendors**", (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(VENDORS_DIRECTORY),
    });
  });
}

test.describe("vendor directory creator filtering", () => {
  test("admin selecting a creator sends createdById to the admin endpoint and isolates the results", async ({
    page,
  }) => {
    const requests: URL[] = [];
    await mockVendorDirectory(
      page,
      {
        id: "admin-1",
        role: "admin",
        email: "admin@example.com",
        firstName: "Admin",
        lastName: "User",
        termsAcceptedAt: ACCEPTED_AT,
        privacyAcceptedAt: ACCEPTED_AT,
      },
      requests,
    );

    await page.goto("/vendors", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("select-filter-creator")).toBeVisible();
    await expect(page.getByText("Aiko Events")).toBeVisible();
    await expect(page.getByText("Ben Events")).toBeVisible();
    // Creator provenance renders for an admin, because the admin endpoint discloses it.
    await expect(page.getByTestId("vendor-creator-vendor-a")).toBeVisible();

    await page.getByTestId("select-filter-creator").click();
    await page.getByRole("option", { name: /Aiko Tanaka/ }).click();

    await expect
      .poll(() =>
        requests.some(
          (url) =>
            url.pathname === "/api/admin/vendors" &&
            url.searchParams.get("createdById") === CREATOR_A,
        ),
      )
      .toBe(true);
    await expect(page.getByText("Aiko Events")).toBeVisible();
    await expect(page.getByText("Ben Events")).not.toBeVisible();
  });

  test("non-admin browsing hits the browse endpoint and is told nothing about who created a row", async ({
    page,
  }) => {
    const requests: URL[] = [];
    await mockVendorDirectory(
      page,
      {
        id: "traveler-1",
        role: "user",
        email: "traveler@example.com",
        firstName: "Traveler",
        lastName: "User",
        termsAcceptedAt: ACCEPTED_AT,
        privacyAcceptedAt: ACCEPTED_AT,
      },
      requests,
    );

    await page.goto("/vendors", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("select-filter-creator")).not.toBeVisible();
    await expect(page.getByText("Aiko Events")).toBeVisible();
    await expect(page.getByText("Ben Events")).toBeVisible();

    // The response carries no creator, so the attribution line is OMITTED — not rendered as
    // "Unknown origin", which means "this vendor predates the provenance column" and would be
    // untrue here (ledger `2026-09-05-vendors-read-scope`, §13).
    await expect(page.getByTestId("vendor-creator-vendor-a")).toHaveCount(0);
    await expect(page.getByText("Unknown origin")).toHaveCount(0);
    await expect(page.getByText("aiko@example.com")).toHaveCount(0);

    expect(requests).toHaveLength(1);
    expect(requests[0].pathname).toBe("/api/vendors");
    expect(requests[0].searchParams.has("createdById")).toBe(false);
  });
});
