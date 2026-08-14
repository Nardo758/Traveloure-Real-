/**
 * GET /api/exchange-rates — three-tier fallback handler.
 *
 * Extracted from content.routes.ts so the exact handler function can be
 * imported and tested without pulling in the entire router module.
 *
 * Tier 1: live Frankfurter fetch (cached in-process for TTL).
 * Tier 2: DB fx_rates rows via storage.getLatestFxRates() → fallback:true.
 * Tier 3: honest 503 when both tiers are unavailable.
 */
import type { Request, Response } from "express";
import { storage } from "../storage";

let _exchangeRateCache: { rates: Record<string, number>; fetchedAt: number } | null = null;
const EXCHANGE_RATE_TTL_MS = 60 * 60 * 1000;

/** Reset the in-process cache — call between tests to force a fresh fetch. */
export function resetExchangeRateCache(): void {
  _exchangeRateCache = null;
}

export async function handleExchangeRates(_req: Request, res: Response): Promise<void> {
  try {
    const now = Date.now();
    if (_exchangeRateCache && now - _exchangeRateCache.fetchedAt < EXCHANGE_RATE_TTL_MS) {
      res.json({ base: "USD", rates: _exchangeRateCache.rates, cachedAt: _exchangeRateCache.fetchedAt });
      return;
    }
    const resp = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,AUD,SGD");
    if (!resp.ok) throw new Error(`Frankfurter API error: ${resp.status}`);
    const data = (await resp.json()) as { rates: Record<string, number> };
    _exchangeRateCache = { rates: data.rates, fetchedAt: now };
    res.json({ base: "USD", rates: data.rates, cachedAt: now });
  } catch (err) {
    console.error("Exchange rate fetch error:", err);
    // Tier 2: DB-backed fallback (migration 217): fx_rates is seeded at migration
    // time and refreshed daily by fx-rate-refresh.service.ts — never a hardcoded
    // literal that goes stale between deploys. If the DB has no rows, say so honestly.
    try {
      const dbRates = await storage.getLatestFxRates();
      if (dbRates) {
        res.json({
          base: "USD",
          rates: dbRates.rates,
          cachedAt: dbRates.updatedAt ? new Date(dbRates.updatedAt).getTime() : Date.now(),
          fallback: true,
        });
        return;
      }
    } catch (dbErr) {
      console.error("Exchange rate DB fallback error:", dbErr);
    }
    // Tier 3: honest unavailable
    res.status(503).json({ base: "USD", rates: null, error: "Exchange rates unavailable" });
  }
}
