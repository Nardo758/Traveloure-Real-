/**
 * occasions.routes.ts — mount: app.use(occasionsRoutes). The Plus intake surface
 * (ledger 2026-08-27-plus-is-delivery):
 *
 *   GET    /api/occasions            list my occasions
 *   POST   /api/occasions            add an occasion (owner = session; never the body — §14)
 *   PATCH  /api/occasions/:id        edit an occasion I own (allowlist fields only)
 *   DELETE /api/occasions/:id        delete an occasion I own
 *   GET    /api/me/home-city         my home city + the operating-market options
 *   PATCH  /api/me/home-city         set my home city (validated against operating markets)
 *
 * The two home-city routes are PLAIN `isAuthenticated` routes and are deliberately NOT Plus-gated:
 * `users.home_city` is read by the plan modal's date-night pre-fill (CLAUDE.md Locked Decision 38)
 * as well as by the Plus draft scheduler. They live in this file for historical reasons — Plus was
 * the first surface to need them — and the traveler Profile page is now a SECOND SURFACE on the
 * same pair (ledger `2026-09-05-slip-events-first-render`). `users.home_city` still has exactly
 * ONE writer: the PATCH below. Do not add a second one.
 *   GET    /api/plus/config          UI gate: sales-enabled flag, my Plus status, vocab, markets
 *
 * template_key / recurrence are validated against the app-side catalog (no DB CHECK). Writes gate
 * on WRITE via the session user id; user_id is stamped server-side, never trusted from the body.
 */
import { Router } from "express";
import { getUserId } from "../utils/auth";
import { isAuthenticated } from "../replit_integrations/auth";
import { db } from "../db";
import { occasions, users } from "@shared/schema";
import { and, eq, asc } from "drizzle-orm";
import {
  canonicalMarketName,
  OPERATING_MARKET_CITY_NAMES,
} from "@shared/operating-markets";
import {
  OCCASION_TEMPLATE_KEYS,
  OCCASION_TEMPLATES,
  OCCASION_RECURRENCES,
} from "../services/occasion-templates";
import { isActivePlus } from "../services/plan-membership.service";
import { isPlusSalesEnabled } from "../config/plus-sales";

const router = Router();

/**
 * The market list and its matcher moved to `shared/operating-markets.ts`
 * (ledger `2026-09-05-slip-events-first-render`) so the traveler Profile page's home-city picker
 * and this route's validation read ONE list and ONE matcher. `users.home_city` still has exactly
 * ONE writer — the PATCH below — and the Profile page is a second SURFACE on it, never a second
 * writer. Do not re-derive either constant here.
 */
const MARKET_NAMES = OPERATING_MARKET_CITY_NAMES;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidTemplateKey(v: unknown): v is string {
  return typeof v === "string" && OCCASION_TEMPLATE_KEYS.includes(v);
}
function isValidRecurrence(v: unknown): v is string {
  return typeof v === "string" && (OCCASION_RECURRENCES as readonly string[]).includes(v);
}
function isValidDate(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t);
}
/** Match a submitted home city to an operating market case-insensitively; returns canonical name.
 *  ONE implementation, in `shared/operating-markets.ts` — see the note on `MARKET_NAMES` above. */
const canonicalMarket = canonicalMarketName;

// ── GET /api/occasions ─────────────────────────────────────────────────────────
router.get("/api/occasions", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const rows = await db
      .select()
      .from(occasions)
      .where(eq(occasions.userId, userId))
      .orderBy(asc(occasions.occasionDate));
    return res.json(rows);
  } catch (err) {
    console.error("[occasions] GET error:", err);
    return res.status(500).json({ message: "Failed to load occasions" });
  }
});

// ── POST /api/occasions ──────────────────────────────────────────────────────
router.post("/api/occasions", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { templateKey, occasionDate, recurrence, label, active } = req.body ?? {};

    if (!isValidTemplateKey(templateKey)) {
      return res.status(400).json({ message: `templateKey must be one of: ${OCCASION_TEMPLATE_KEYS.join(", ")}` });
    }
    if (!isValidDate(occasionDate)) {
      return res.status(400).json({ message: "occasionDate must be a valid YYYY-MM-DD date" });
    }
    const rec = recurrence ?? "none";
    if (!isValidRecurrence(rec)) {
      return res.status(400).json({ message: `recurrence must be one of: ${OCCASION_RECURRENCES.join(", ")}` });
    }
    if (label != null && (typeof label !== "string" || label.length > 200)) {
      return res.status(400).json({ message: "label must be a string up to 200 chars" });
    }

    const [row] = await db
      .insert(occasions)
      .values({
        userId, // stamped from session, never the body (§14 identity)
        templateKey,
        occasionDate,
        recurrence: rec,
        label: typeof label === "string" ? label.trim() || null : null,
        active: active === undefined ? true : Boolean(active),
      })
      .returning();
    return res.status(201).json(row);
  } catch (err) {
    console.error("[occasions] POST error:", err);
    return res.status(500).json({ message: "Failed to create occasion" });
  }
});

// ── PATCH /api/occasions/:id ───────────────────────────────────────────────────
router.patch("/api/occasions/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { templateKey, occasionDate, recurrence, label, active } = req.body ?? {};

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (templateKey !== undefined) {
      if (!isValidTemplateKey(templateKey)) return res.status(400).json({ message: "invalid templateKey" });
      patch.templateKey = templateKey;
    }
    if (occasionDate !== undefined) {
      if (!isValidDate(occasionDate)) return res.status(400).json({ message: "invalid occasionDate" });
      patch.occasionDate = occasionDate;
    }
    if (recurrence !== undefined) {
      if (!isValidRecurrence(recurrence)) return res.status(400).json({ message: "invalid recurrence" });
      patch.recurrence = recurrence;
    }
    if (label !== undefined) {
      if (label != null && (typeof label !== "string" || label.length > 200)) {
        return res.status(400).json({ message: "invalid label" });
      }
      patch.label = typeof label === "string" ? label.trim() || null : null;
    }
    if (active !== undefined) patch.active = Boolean(active);

    const [row] = await db
      .update(occasions)
      .set(patch)
      .where(and(eq(occasions.id, req.params.id), eq(occasions.userId, userId)))
      .returning();
    if (!row) return res.status(404).json({ message: "Occasion not found" });
    return res.json(row);
  } catch (err) {
    console.error("[occasions] PATCH error:", err);
    return res.status(500).json({ message: "Failed to update occasion" });
  }
});

// ── DELETE /api/occasions/:id ──────────────────────────────────────────────────
router.delete("/api/occasions/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const [row] = await db
      .delete(occasions)
      .where(and(eq(occasions.id, req.params.id), eq(occasions.userId, userId)))
      .returning();
    if (!row) return res.status(404).json({ message: "Occasion not found" });
    return res.json({ ok: true, id: row.id });
  } catch (err) {
    console.error("[occasions] DELETE error:", err);
    return res.status(500).json({ message: "Failed to delete occasion" });
  }
});

// ── GET/PATCH /api/me/home-city ────────────────────────────────────────────────
router.get("/api/me/home-city", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const [u] = await db.select({ homeCity: users.homeCity }).from(users).where(eq(users.id, userId)).limit(1);
    return res.json({ homeCity: u?.homeCity ?? null, markets: MARKET_NAMES });
  } catch (err) {
    console.error("[occasions] GET home-city error:", err);
    return res.status(500).json({ message: "Failed to load home city" });
  }
});

router.patch("/api/me/home-city", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { homeCity } = req.body ?? {};
    if (homeCity === null || homeCity === "") {
      await db.update(users).set({ homeCity: null, updatedAt: new Date() }).where(eq(users.id, userId));
      return res.json({ homeCity: null, markets: MARKET_NAMES });
    }
    const canonical = canonicalMarket(homeCity);
    if (!canonical) {
      return res.status(400).json({ message: `homeCity must be one of: ${MARKET_NAMES.join(", ")}`, markets: MARKET_NAMES });
    }
    await db.update(users).set({ homeCity: canonical, updatedAt: new Date() }).where(eq(users.id, userId));
    return res.json({ homeCity: canonical, markets: MARKET_NAMES });
  } catch (err) {
    console.error("[occasions] PATCH home-city error:", err);
    return res.status(500).json({ message: "Failed to set home city" });
  }
});

// ── GET /api/plus/config ───────────────────────────────────────────────────────
// One read for the calendar UI and the pricing/landing gate: sales flag, my Plus status, and the
// vocab/markets the intake form needs. templates are surfaced as {key, label} for the picker.
router.get("/api/plus/config", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const plus = await isActivePlus(userId);
    return res.json({
      salesEnabled: isPlusSalesEnabled(),
      isPlus: plus,
      templates: OCCASION_TEMPLATE_KEYS.map((k) => ({ key: k, label: OCCASION_TEMPLATES[k].defaultLabel })),
      recurrences: OCCASION_RECURRENCES,
      markets: MARKET_NAMES,
    });
  } catch (err) {
    console.error("[occasions] GET plus/config error:", err);
    return res.status(500).json({ message: "Failed to load Plus config" });
  }
});

export default router;
