/**
 * expert-inbox-questions.spec.ts — the expert inbox's Questions tab (work plan L2-9, enhancement 6;
 * spec v1.3.5 §1, ruling R-bj; ledger `2026-10-05-inbox-questions-tab`).
 *
 *   T01 — the tab lists the questions the server sends; answering one POSTs exactly `{ answer }` to
 *         that question and the answered question leaves the list (the server-side half — the answer
 *         landing on the traveler's item thread — is R309's DB test, expert-inbox-questions.db.test.ts)
 *   T02 — an answer refused with 409 (another local answered first) says so and the list refreshes
 *   T03 — no questions: "No questions yet", and the tab label carries no "(0)"
 *
 * Auth strategy: page.route() intercepts, as expert-booking-decline-dialog.spec.ts does.
 *
 * Run: npx playwright test playwright/tests/expert-inbox-questions.spec.ts --workers=1
 */
import { test, expect, type Page, type Route } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:5000";

const EXPERT_USER = {
  id: 42,
  firstName: "Sam",
  lastName: "Expert",
  email: "sam-expert@traveloure.test",
  role: "travel_expert",
  profileImageUrl: null,
  termsAcceptedAt: "2025-01-01T00:00:00.000Z",
  privacyAcceptedAt: "2025-01-01T00:00:00.000Z",
};

const Q1 = {
  id: "q-111",
  question: "Is it very crowded at 7am?",
  itemTitle: "Fushimi Inari",
  dayNumber: 2,
  city: "Kyoto",
  askedAt: "2026-10-01T09:00:00.000Z",
  fromYourReadyMadeTrip: true,
};
const Q2 = {
  id: "q-222",
  question: null,
  itemTitle: "Nishiki Market",
  dayNumber: 1,
  city: null,
  askedAt: "2026-10-02T09:00:00.000Z",
  fromYourReadyMadeTrip: false,
};

async function mockAuth(page: Page) {
  await page.route("**/api/auth/user", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EXPERT_USER) }),
  );
}

/** The questions list answers with whatever `current()` holds at the time of each GET. */
async function mockQuestions(page: Page, current: () => unknown[]) {
  await page.route("**/api/expert/inbox/questions", (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ questions: current() }) });
  });
}

async function gotoQuestions(page: Page) {
  await page.goto(`${BASE}/expert/inbox?tab=questions`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector('[data-testid="section-inbox-questions"]', { timeout: 15_000 });
}

test.describe("T01 — answer a question", () => {
  test("lists the server's questions, POSTs { answer } to that question, and the answered one leaves the list", async ({ page }) => {
    await mockAuth(page);
    let list: unknown[] = [Q1, Q2];
    await mockQuestions(page, () => list);
    let posted: { url: string; body: unknown } | null = null;
    await page.route("**/api/expert/inbox/questions/*/answer", async (route) => {
      posted = { url: route.request().url(), body: route.request().postDataJSON() };
      list = [Q2];
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ answerId: "a1", commentId: "c1" }) });
    });

    await gotoQuestions(page);
    await expect(page.getByTestId("tab-inbox-questions")).toHaveText("Questions (2)");
    await expect(page.getByTestId(`text-question-${Q1.id}`)).toHaveText(`"${Q1.question}"`);
    await expect(page.getByTestId(`text-question-context-${Q1.id}`)).toHaveText("Day 2 · Fushimi Inari · Kyoto");
    await expect(page.getByTestId(`badge-question-ready-made-${Q1.id}`)).toBeVisible();
    // A question asked with no text says so; no city is omitted, never "Unknown".
    await expect(page.getByTestId(`text-question-${Q2.id}`)).toHaveText("Asked about this stop without writing a question");
    await expect(page.getByTestId(`text-question-context-${Q2.id}`)).toHaveText("Day 1 · Nishiki Market");

    await expect(page.getByTestId(`button-answer-question-${Q1.id}`)).toBeDisabled();
    await page.getByTestId(`input-question-answer-${Q1.id}`).fill("Go before 7 — it's quiet until the tour buses at 9.");
    await page.getByTestId(`button-answer-question-${Q1.id}`).click();

    await expect(page.getByTestId(`inbox-question-${Q1.id}`)).toHaveCount(0, { timeout: 10_000 });
    expect(posted).not.toBeNull();
    expect(posted!.url).toContain(`/api/expert/inbox/questions/${Q1.id}/answer`);
    expect(posted!.body).toEqual({ answer: "Go before 7 — it's quiet until the tour buses at 9." });
    await expect(page.getByTestId("tab-inbox-questions")).toHaveText("Questions (1)");
  });
});

test.describe("T02 — someone else answered first", () => {
  test("a 409 says another local answered, and the list refreshes", async ({ page }) => {
    await mockAuth(page);
    let list: unknown[] = [Q1];
    await mockQuestions(page, () => list);
    await page.route("**/api/expert/inbox/questions/*/answer", async (route) => {
      list = [];
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ code: "already_answered", message: "This question has already been answered" }),
      });
    });

    await gotoQuestions(page);
    await page.getByTestId(`input-question-answer-${Q1.id}`).fill("Early morning is best.");
    await page.getByTestId(`button-answer-question-${Q1.id}`).click();
    await expect(page.getByText("Another local already answered this question.").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("empty-inbox-questions")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("T03 — no questions", () => {
  test("says so, and the tab carries no (0)", async ({ page }) => {
    await mockAuth(page);
    await mockQuestions(page, () => []);
    await gotoQuestions(page);
    await expect(page.getByTestId("empty-inbox-questions")).toBeVisible();
    await expect(page.getByTestId("tab-inbox-questions")).toHaveText("Questions");
  });
});
