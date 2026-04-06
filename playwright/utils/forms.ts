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
  // Wait for async profile data to load (Skeleton disappears, textarea appears)
  await page.waitForSelector('[data-testid="profile-bio"]', { state: 'visible', timeout: 20000 });

  // Fill bio
  await page.fill('[data-testid="profile-bio"]', data.bio);

  // Fill hourly rate (also async-loaded, wait for it)
  const hourlyRateField = page.locator('[data-testid="hourly-rate"]');
  await hourlyRateField.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);
  if (await hourlyRateField.isVisible().catch(() => false)) {
    await hourlyRateField.fill(data.hourlyRate.toString());
  }

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
  const saveButton = page.locator('[data-testid="button-save-profile"], button:has-text("Save")').first();
  if (await saveButton.isVisible().catch(() => false)) {
    await saveButton.click();
    await page.waitForLoadState('networkidle').catch(() => null);
  }
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
  const createButton = page.locator('[data-testid="button-add-service"], [data-testid="button-create-first-service"], button:has-text("Create Service")').first();
  if (await createButton.isVisible().catch(() => false)) {
    await createButton.click();
    await page.waitForLoadState('networkidle').catch(() => null);
  }

  // Wait for form to appear
  await page.waitForSelector('[data-testid="service-name"]', { state: 'visible', timeout: 10000 }).catch(() => null);

  // Fill service form
  const nameField = page.locator('[data-testid="service-name"]');
  if (await nameField.isVisible().catch(() => false)) {
    await nameField.fill(data.name);
  }

  const descField = page.locator('[data-testid="service-description"]');
  if (await descField.isVisible().catch(() => false)) {
    await descField.fill(data.description);
  }

  const priceField = page.locator('[data-testid="service-price"]');
  if (await priceField.isVisible().catch(() => false)) {
    await priceField.fill(data.price.toString());
  }

  const durationField = page.locator('[data-testid="service-duration"]');
  if (await durationField.isVisible().catch(() => false)) {
    await durationField.fill(data.duration.toString());
  }

  // Select currency if provided
  if (data.currency) {
    const currencySelect = page.locator('[data-testid="service-currency"]');
    if (await currencySelect.isVisible().catch(() => false)) {
      await currencySelect.selectOption(data.currency);
    }
  }

  // Save service — button says "Publish" on the service form
  const saveButton = page.locator('[data-testid="button-submit-service"], button:has-text("Publish"), button:has-text("Save Service")').first();
  if (await saveButton.isVisible().catch(() => false)) {
    await saveButton.click();
    await page.waitForLoadState('networkidle').catch(() => null);
  }
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
  const businessNameField = page.locator('[data-testid="business-name"]');
  if (await businessNameField.isVisible().catch(() => false)) {
    await businessNameField.fill(data.businessName);
  }

  // Fill description
  const descField = page.locator('[data-testid="business-description"]');
  if (await descField.isVisible().catch(() => false)) {
    await descField.fill(data.description);
  }

  // Select service types
  for (const serviceType of data.serviceTypes) {
    const checkbox = page.locator(`input[value="${serviceType}"]`);
    if (await checkbox.isVisible().catch(() => false)) {
      await checkbox.check();
    }
  }

  // Save profile
  const saveButton = page.locator('button:has-text("Save")').first();
  if (await saveButton.isVisible().catch(() => false)) {
    await saveButton.click();
    await page.waitForLoadState('networkidle').catch(() => null);
  }
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
    await page.waitForLoadState('networkidle').catch(() => null);
  }

  // Fill destination
  const destField = page.locator('[data-testid="trip-destination"]');
  if (await destField.isVisible().catch(() => false)) {
    await destField.fill(data.destination);
  }

  // Fill dates
  const startDateField = page.locator('[data-testid="trip-start-date"]');
  if (await startDateField.isVisible().catch(() => false)) {
    await startDateField.fill(data.startDate);
  }

  const endDateField = page.locator('[data-testid="trip-end-date"]');
  if (await endDateField.isVisible().catch(() => false)) {
    await endDateField.fill(data.endDate);
  }

  // Fill guests
  const guestsField = page.locator('[data-testid="trip-guests"]');
  if (await guestsField.isVisible().catch(() => false)) {
    await guestsField.fill(data.guests.toString());
  }

  // Fill budget
  const budgetField = page.locator('[data-testid="trip-budget"]');
  if (await budgetField.isVisible().catch(() => false)) {
    await budgetField.fill(data.budget.toString());
  }

  // Select experience type if provided
  if (data.experienceType) {
    const typeSelect = page.locator('[data-testid="trip-type"]');
    if (await typeSelect.isVisible().catch(() => false)) {
      await typeSelect.selectOption(data.experienceType);
    }
  }

  // Save trip
  const saveButton = page.locator('button:has-text("Create Trip")').first();
  if (await saveButton.isVisible().catch(() => false)) {
    await saveButton.click();
    await page.waitForLoadState('networkidle').catch(() => null);
  }
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

  const nameField = page.locator('[data-testid="activity-name"]');
  if (await nameField.isVisible().catch(() => false)) {
    await nameField.fill(activity.name);
  }

  if (activity.description) {
    const descField = page.locator('[data-testid="activity-description"]');
    if (await descField.isVisible().catch(() => false)) {
      await descField.fill(activity.description);
    }
  }

  if (activity.date) {
    const dateField = page.locator('[data-testid="activity-date"]');
    if (await dateField.isVisible().catch(() => false)) {
      await dateField.fill(activity.date);
    }
  }

  // Save activity
  const saveButton = page.locator('button:has-text("Save Activity")').first();
  if (await saveButton.isVisible().catch(() => false)) {
    await saveButton.click();
    await page.waitForLoadState('networkidle').catch(() => null);
  }
}

/**
 * Add item to cart
 */
export async function addToCart(page: Page, serviceId?: string) {
  const addButton = page.locator('button:has-text("Add to Cart")').first();
  if (await addButton.isVisible().catch(() => false)) {
    await addButton.click();
    await page.waitForLoadState('networkidle').catch(() => null);
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
    await page.waitForLoadState('networkidle').catch(() => null);
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
      await page.waitForLoadState('networkidle').catch(() => null);
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
    await page.waitForLoadState('networkidle').catch(() => null);
  }
}
