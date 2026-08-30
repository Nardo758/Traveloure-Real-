import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:20087";

const service = {
  id: "marketplace-service-fixture",
  userId: "marketplace-provider-fixture",
  serviceName: "Kyoto tea ceremony planning",
  shortDescription: "A practical, local plan for a memorable tea ceremony visit.",
  description: "A practical, local plan for a memorable tea ceremony visit.",
  categoryId: "culture",
  price: "125",
  location: "Kyoto, Japan",
  averageRating: "4.9",
  reviewCount: 18,
  bookingsCount: 7,
  status: "active",
  deliveryMethod: "Video call",
  deliveryTimeframe: "Within 48 hours",
  revisionsIncluded: 2,
  includesExpertNotes: true,
  providerFirstName: "Mika",
  providerLastName: "Sato",
  providerRating: "4.9",
  providerHandle: "mika-kyoto",
  serviceImage: null,
  galleryImages: [],
  whatIncluded: [],
  requirements: [],
  meetingPoint: null,
  pickupAddress: null,
  transportProvided: null,
  cancellationPolicyType: null,
  cancellationPolicy: null,
};

const readyMade = {
  id: "marketplace-ready-made-fixture",
  title: "Four thoughtful days in Kyoto",
  planType: "city_itinerary",
  planTypeCustom: null,
  market: "Kyoto, Japan",
  durationDays: 4,
  bestSeason: "March to May",
  pricingMode: "fixed",
  priceCents: 24000,
  heroImageUrl: null,
  heroImageMeta: null,
  badge: null,
  insideCounts: { days: 4, items: 12, byType: { activity: 5, food: 3 } },
  authorName: "Mika Sato",
  authorHandle: "mika-kyoto",
  section: "trips_by_locals" as const,
};

const storefront = {
  earner: {
    id: service.userId,
    name: "Mika Sato",
    handle: "mika-kyoto",
    bio: "Kyoto local expert",
    profileImageUrl: null,
    location: "Kyoto, Japan",
    verified: true,
    rating: 4.9,
    reviewCount: 18,
    offeringsCount: 2,
    memberSince: "2024-01-01T00:00:00.000Z",
    languages: ["English", "Japanese"],
  },
  services: [service],
  templates: [],
  readyMade: [readyMade],
  away: null,
};

async function installMarketplaceFixture(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;

    if (pathname === "/api/auth/user") {
      await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
      return;
    }

    if (pathname === "/api/service-categories") {
      await route.fulfill({
        contentType: "application/json",
        json: [{
          id: "culture",
          name: "Culture & local knowledge",
          slug: "tours-experiences",
          description: "",
          categoryType: "service",
          priceRange: null,
        }],
      });
      return;
    }

    if (pathname === "/api/discover") {
      await route.fulfill({
        contentType: "application/json",
        json: { services: [service], total: 1, packagesTotal: 0, suggestion: null },
      });
      return;
    }

    if (pathname === "/api/ready-made") {
      await route.fulfill({
        contentType: "application/json",
        json: { listings: [readyMade] },
      });
      return;
    }

    if (pathname === `/api/ready-made/${readyMade.id}`) {
      await route.fulfill({
        contentType: "application/json",
        json: { listing: readyMade, preview: false },
      });
      return;
    }

    if (pathname === `/api/ready-made/${readyMade.id}/teaser-map.svg`) {
      await route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
      });
      return;
    }

    if (pathname === `/api/services/${service.id}`) {
      await route.fulfill({ contentType: "application/json", json: service });
      return;
    }

    if (pathname === `/api/services/${service.id}/reviews`) {
      await route.fulfill({ contentType: "application/json", json: [] });
      return;
    }

    if (pathname === `/api/services/${service.id}/availability`) {
      await route.fulfill({ contentType: "application/json", json: { month: url.searchParams.get("month"), days: [] } });
      return;
    }

    if (pathname === `/api/services/${service.id}/stay-availability`) {
      await route.fulfill({ contentType: "application/json", json: { checkIn: null, checkOut: null, nights: [] } });
      return;
    }

    if (pathname === `/api/providers/${service.userId}/public-verification`) {
      await route.fulfill({
        contentType: "application/json",
        json: { handle: service.providerHandle, identityVerified: false, businessVerified: false },
      });
      return;
    }

    if (pathname === `/api/storefront/${service.providerHandle}`) {
      await route.fulfill({ contentType: "application/json", json: storefront });
      return;
    }

    if (pathname === "/api/expert-templates") {
      await route.fulfill({ contentType: "application/json", json: [] });
      return;
    }

    if (pathname === "/api/city-neighborhoods") {
      await route.fulfill({ contentType: "application/json", json: { data: [], hasMore: false } });
      return;
    }

    await route.continue();
  });
}

async function goto(page: Page, path: string) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
}

test.describe("Marketplace cards — detail, storefront, and live-detail regressions", () => {
  test.beforeEach(async ({ page }) => {
    await installMarketplaceFixture(page);
  });

  test("/services keeps search state and exposes truthful service details with separate links", async ({ page }) => {
    await goto(page, "/services");

    const card = page.getByTestId(`card-service-${service.id}`);
    const detailLink = page.getByTestId(`link-service-${service.id}`);
    const storefrontLink = page.getByTestId(`link-provider-storefront-${service.id}`);

    await expect(card).toBeVisible();
    await expect(detailLink).toHaveAttribute("href", `/services/${service.id}`);
    await expect(storefrontLink).toHaveAttribute("href", `/p/${service.providerHandle}`);
    await expect(card.locator("a a")).toHaveCount(0);
    await expect(detailLink.locator(`a[data-testid="link-provider-storefront-${service.id}"]`)).toHaveCount(0);

    await expect(card).toContainText(service.serviceName);
    await expect(card).toContainText("Mika Sato");
    await expect(card).toContainText(service.location);
    await expect(card).toContainText(service.deliveryTimeframe);
    await expect(card).toContainText("Video call");
    await expect(card).toContainText("2 revisions");
    await expect(card).toContainText("Expert notes included");
    await expect(card).toContainText("Guest-rated service");
    await expect(card).toContainText("Active listing");

    await page.getByTestId("input-search").fill("tea ceremony");
    await expect(page).toHaveURL(/\/services\?q=tea\+ceremony/);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("input-search")).toHaveValue("tea ceremony");
    await expect(page).toHaveURL(/\/services\?q=tea\+ceremony/);

    await Promise.all([
      page.waitForURL(`**/services/${service.id}`),
      detailLink.click(),
    ]);
    await expect(page.getByTestId("text-service-name")).toHaveText(service.serviceName);

    await goto(page, "/services");
    await Promise.all([
      page.waitForURL(`**/p/${service.providerHandle}`),
      storefrontLink.click(),
    ]);
    await expect(page.getByTestId("storefront-page")).toBeVisible();
    await expect(page.getByTestId("storefront-name")).toHaveText("Mika Sato");
  });

  test("/ready-made gives its author a separate storefront link and a working trip detail page", async ({ page }) => {
    await goto(page, "/ready-made");

    const card = page.getByTestId(`rm-shelf-card-${readyMade.id}`);
    const detailLink = card.locator(`a[href="/ready-made/${readyMade.id}"]`);
    const storefrontLink = page.getByTestId(`link-rm-author-${readyMade.id}`);

    await expect(card).toBeVisible();
    await expect(detailLink).toHaveAttribute("href", `/ready-made/${readyMade.id}`);
    await expect(storefrontLink).toHaveAttribute("href", `/p/${readyMade.authorHandle}`);
    await expect(card.locator("a a")).toHaveCount(0);
    await expect(detailLink.locator(`a[data-testid="link-rm-author-${readyMade.id}"]`)).toHaveCount(0);
    await expect(card).toContainText(readyMade.title);
    await expect(card).toContainText("4 days");
    await expect(card).toContainText("Editable after purchase");
    await expect(card).toContainText("Mika Sato");

    await Promise.all([
      page.waitForURL(`**/ready-made/${readyMade.id}`),
      detailLink.click(),
    ]);
    await expect(page.getByTestId("text-rm-title")).toHaveText(readyMade.title);
    await expect(page.getByTestId("inside-counts")).toContainText("12");
    await expect(page.getByTestId("link-rm-storefront")).toHaveAttribute("href", `/p/${readyMade.authorHandle}`);

    await goto(page, "/ready-made");
    await Promise.all([
      page.waitForURL(`**/p/${readyMade.authorHandle}`),
      storefrontLink.click(),
    ]);
    await expect(page.getByTestId("storefront-page")).toBeVisible();
    await expect(page.getByTestId("storefront-name")).toHaveText("Mika Sato");
  });
});