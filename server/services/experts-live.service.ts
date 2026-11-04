// COPY-1 §4k (ledger `2026-11-04-copy1-exp-qa-swaps`; group review Nov 3: "local-expert lines appear only once a
// market has an approved expert"): is there an approved, non-test expert in the launch market?
//
// The SAME read the public directory serves (`GET /api/experts?location=<city>`): the routable experts
// (`directoryExperts` — approved, verified, payable; never the concierge pool or a seed account), filtered by the ONE
// location rule (`locationQueryMatches`). Test accounts (`isTestAccount`, the QA domain) are dropped on top. No launch
// market, or an unreadable answer, is false — a sentence about local experts is then omitted, never guessed.
import { storage } from "../storage";
import { locationQueryMatches } from "@shared/location-match";
import { launchCityName } from "@shared/ticker";
import { directoryExperts } from "./expert-routability";
import { testAccountUserIds } from "./test-account";

export async function expertsLiveIn(launchMarketSlug: string | null): Promise<boolean> {
  const city = launchCityName(launchMarketSlug);
  if (!city) return false;
  try {
    const experts = (await directoryExperts((await storage.getExpertsWithProfiles()) as any[])).filter((expert: any) => {
      const form = expert.expertForm;
      if (!form) return false;
      return locationQueryMatches(city, { destinations: form.destinations || [], city: form.city, country: form.country });
    });
    if (experts.length === 0) return false;
    const testIds = await testAccountUserIds(experts.map((e: any) => String(e.id)));
    return experts.some((e: any) => !testIds.has(String(e.id)));
  } catch (err: any) {
    console.error(`[experts-live] read failed: ${err?.code ?? err?.message ?? "unknown"}`);
    return false;
  }
}
