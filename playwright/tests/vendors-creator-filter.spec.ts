/**
 * Regression coverage for the admin-only vendor creator filter.
 *
 * The page owns the selector and React Query owns the request URL, so this
 * test drives the real admin UI and captures the request rather than only
 * checking the JSX source. The API responses are fixture-backed to keep the
 * test focused on the selector/query-key contract.
 */

import { test, expect } from "@playwright/test";

const CREATOR_A = "creator-a";
const CREATOR_B = "creator-b";

const VENDORS = [
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

  await page.route("**/api/vendors**", (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const createdById = url.searchParams.get("createdById");
    const body = createdById
      ? VENDORS.filter((vendor) => vendor.createdById === createdById)
      : VENDORS;

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

test.describe("vendor directory creator filtering", () => {
  test("admin selecting a creator sends createdById and isolates the results", async ({ page }) => {
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

    await page.getByTestId("select-filter-creator").click();
    await page.getByRole("option", { name: /Aiko Tanaka/ }).click();

    await expect
      .poll(() => requests.some((url) => url.searchParams.get("createdById") === CREATOR_A))
      .toBe(true);
    await expect(page.getByText("Aiko Events")).toBeVisible();
    await expect(page.getByText("Ben Events")).not.toBeVisible();
  });

  test("non-admin browsing stays unfiltered and does not expose the creator control", async ({ page }) => {
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
    expect(requests).toHaveLength(1);
    expect(requests[0].searchParams.has("createdById")).toBe(false);
  });
});