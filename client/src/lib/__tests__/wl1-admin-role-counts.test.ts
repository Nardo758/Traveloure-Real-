import { test } from "node:test";
import assert from "node:assert/strict";
import { marketOpenedAllConfirmLine, roleCountsLine } from "@/components/admin/WaitlistMarketOpenedAllCard";

test("WL-1 role counts use the singular at one and the plural otherwise", () => {
  assert.equal(
    roleCountsLine({ traveler: 1, expert: 1, provider: 1 }),
    "1 traveler · 1 expert · 1 provider",
  );
  assert.equal(
    marketOpenedAllConfirmLine("Kyoto", { traveler: 1, expert: 1, provider: 1 }),
    "Email 1 traveler, 1 expert and 1 provider that Kyoto is open?",
  );
});

test("WL-1 role counts use the plural at two", () => {
  assert.equal(
    roleCountsLine({ traveler: 2, expert: 2, provider: 2 }),
    "2 travelers · 2 experts · 2 providers",
  );
  assert.equal(
    marketOpenedAllConfirmLine("Kyoto", { traveler: 2, expert: 2, provider: 2 }),
    "Email 2 travelers, 2 experts and 2 providers that Kyoto is open?",
  );
});
