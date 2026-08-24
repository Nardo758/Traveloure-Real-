import { Page } from '@playwright/test';

/**
 * Fill expert profile form
 */
export async function fillExpertProfile(
  page: Page,
  data: {
    bio: string;
    hourlyRate: number;
    specialties: string[];
    languages: string[];
  }
) {
  // Fill bio
  await page.fill('[data-testid="profile-bio"]', data.bio);

  // Fill hourly rate
  await page.fill('[data-testid="hourly-rate"]', data.hourlyRate.toString());

  // Select specialties (checkboxes or multiselect)
  for (const specialty of data.specialties) {
    const checkbox = page.locator(`input[value="${specialty}"]`);
    if (await checkbox.isVisible().catch(() => false)) {
      await checkbox.check();
    }
  }

  // Select languages
  for (const language of data.languages) {
    const option = page.locator(`[data-testid="language-${language.toLowerCase()}"]`);
    if (await option.isVisible().catch(() => false)) {
      await option.click();
    }
  }

  // Save profile
  await page.click('button:has-text("Save")');
  await page.waitForNavigation().catch(() => null);
}

/**
 * Create a service listing
 */
export async function createService(
  page: Page,
  data: {
    name: string;
    description: string;
    price: number;
    currency?: string;
    duration: number;
  }
) {
  // Navigate to create service page if not already there
  const createButton = page.locator('button:has-text("Create Service")').first();
  if (await createButton.isVisible().catch(() => false)) {
    await createButton.click();
    await page.waitForNavigation();
  }

  // Fill service form
  await page.fill('[data-testid="service-name"]', data.name);
  await page.fill('[data-testid="service-description"]', data.description);
  await page.fill('[data-testid="service-price"]', data.price.toString());
  await page.fill('[data-testid="service-duration"]', data.duration.toString());

  // Select currency if provided
  if (data.currency) {
    const currencySelect = page.locator('[data-testid="service-currency"]');
    await currencySelect.selectOption(data.currency);
  }

  // Save service
  await page.click('button:has-text("Save Service")');
  await page.waitForNavigation().catch(() => null);
}

/**
 * Create a provider/business profile
 */
export async function fillProviderProfile(
  page: Page,
  data: {
    businessName: string;
    description: string;
    serviceTypes: string[];
  }
) {
  // Fill business name
  await page.fill('[data-testid="business-name"]', data.businessName);

  // Fill description
  await page.fill('[data-testid="business-description"]', data.description);

  // Select service types
  for (const serviceType of data.serviceTypes) {
    const checkbox = page.locator(`input[value="${serviceType}"]`);
    if (await checkbox.isVisible().catch(() => false)) {
      await checkbox.check();
    }
  }

  // Save profile
  await page.click('button:has-text("Save")');
  await page.waitForNavigation().catch(() => null);
}

/**
 * Create a trip
 */
export async function createTrip(
  page: Page,
  data: {
    destination: string;
    startDate: string;
    endDate: string;
    guests: number;
    budget: number;
    experienceType?: string;
  }
) {
  // Navigate to create trip
  const createButton = page.locator('button:has-text("Create Trip")').first();
  if (await createButton.isVisible().catch(() => false)) {
    await createButton.click();
    await page.waitForNavigation();
  }

  // Fill destination
  await page.fill('[data-testid="trip-destination"]', data.destination);

  // Fill dates
  await page.fill('[data-testid="trip-start-date"]', data.startDate);
  await page.fill('[data-testid="trip-end-date"]', data.endDate);

  // Fill guests
  await page.fill('[data-testid="trip-guests"]', data.guests.toString());

  // Fill budget
  await page.fill('[data-testid="trip-budget"]', data.budget.toString());

  // Select experience type if provided
  if (data.experienceType) {
    const typeSelect = page.locator('[data-testid="trip-type"]');
    await typeSelect.selectOption(data.experienceType);
  }

  // Save trip
  await page.click('button:has-text("Create Trip")');
  await page.waitForNavigation().catch(() => null);
}

/**
 * Add activity to trip
 */
export async function addActivityToTrip(
  page: Page,
  activity: {
    name: string;
    description?: string;
    date?: string;
  }
) {
  const addButton = page.locator('button:has-text("Add Activity")').first();
  if (await addButton.isVisible().catch(() => false)) {
    await addButton.click();
  }

  await page.fill('[data-testid="activity-name"]', activity.name);

  if (activity.description) {
    await page.fill('[data-testid="activity-description"]', activity.description);
  }

  if (activity.date) {
    await page.fill('[data-testid="activity-date"]', activity.date);
  }

  // Save activity
  await page.click('button:has-text("Save Activity")');
  await page.waitForNavigation().catch(() => null);
}

/**
 * Add item to cart
 */
export async function addToCart(page: Page, serviceId?: string) {
  const addButton = page.locator('button:has-text("Add to Cart")').first();
  if (await addButton.isVisible().catch(() => false)) {
    await addButton.click();
    await page.waitForNavigation().catch(() => null);
  }
}

/**
 * Submit payment with test card
 */
export async function submitPayment(
  page: Page,
  cardData?: {
    cardNumber?: string;
    expiryDate?: string;
    cvc?: string;
  }
) {
  // Use default Stripe test card if not provided
  const card = cardData?.cardNumber || '4242 4242 4242 4242';
  const expiry = cardData?.expiryDate || '12/25';
  const cvc = cardData?.cvc || '123';

  // Fill Stripe card element iframe
  const iframes = page.locator('iframe').all();
  for (const iframe of await iframes) {
    const frame = await iframe.contentFrame();
    if (frame) {
      try {
        const cardInput = frame.locator('input[aria-label*="card"]').first();
        if (await cardInput.isVisible().catch(() => false)) {
          await cardInput.fill(card);
        }
      } catch {
        // Not the card iframe
      }
    }
  }

  // Click pay button
  const payButton = page.locator('button:has-text("Pay")').first();
  if (await payButton.isVisible().catch(() => false)) {
    await payButton.click();
    await page.waitForNavigation().catch(() => null);
  }
}

/**
 * Send message to expert
 */
export async function sendMessage(page: Page, message: string) {
  const messageInput = page.locator('input[placeholder*="message"]').first();
  if (await messageInput.isVisible().catch(() => false)) {
    await messageInput.fill(message);

    const sendButton = page.locator('button:has-text("Send")').first();
    if (await sendButton.isVisible().catch(() => false)) {
      await sendButton.click();
      await page.waitForNavigation().catch(() => null);
    }
  }
}

/**
 * Set availability for provider
 */
export async function setAvailability(
  page: Page,
  dates: Array<{
    date: string;
    available: boolean;
  }>
) {
  for (const dateEntry of dates) {
    const checkbox = page.locator(`input[data-date="${dateEntry.date}"]`);
    if (await checkbox.isVisible().catch(() => false)) {
      if (dateEntry.available) {
        await checkbox.check();
      } else {
        await checkbox.uncheck();
      }
    }
  }

  // Save availability
  const saveButton = page.locator('button:has-text("Save Availability")').first();
  if (await saveButton.isVisible().catch(() => false)) {
    await saveButton.click();
    await page.waitForNavigation().catch(() => null);
  }
}
