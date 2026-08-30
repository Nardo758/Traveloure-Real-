/**
 * Role-Scoped Expert Service Templates Seed
 *
 * Seeds 4 platform templates per expert role (12 total).
 * Idempotent: skips any template whose `name` already exists as a
 * platform row (expertId IS NULL) with a matching targetRoles value.
 *
 * Roles seeded:
 *   local_expert   — neighbourhood / hidden-gem focused services
 *   travel_expert  — full trip planning / advisory services
 *   event_planner  — event coordination / supplier services
 */
import { db } from "../db";
import { expertServiceCategories, expertServiceOfferings } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";

interface RoleTemplate {
  name: string;
  description: string;
  price: string;
  sortOrder: number;
  targetRoles: string[];
}

const ROLE_TEMPLATES: RoleTemplate[] = [
  // ─── Local Expert ─────────────────────────────────────────────────────────
  {
    name: "Neighbourhood Walking Tour",
    description:
      "A 2–3 hour guided walk through your local neighbourhood, uncovering hidden history, street art, and the best-kept local spots tourists rarely find.",
    price: "45",
    sortOrder: 10,
    targetRoles: ["local_expert"],
  },
  {
    name: "Hidden Gems Insider Session",
    description:
      "A 1-hour video or in-person consultation revealing off-the-beaten-path cafés, markets, and experiences hand-picked by a true local.",
    price: "35",
    sortOrder: 11,
    targetRoles: ["local_expert"],
  },
  {
    name: "Local Neighbourhood Guide",
    description:
      "A curated written guide (PDF + map) covering restaurants, shops, cultural spots, and practical tips for living or visiting like a local.",
    price: "25",
    sortOrder: 12,
    targetRoles: ["local_expert"],
  },
  {
    name: "Bespoke Local Day Plan",
    description:
      "A fully customised day-by-day itinerary built around your exact neighbourhood knowledge — timings, transport tips, and local favourites included.",
    price: "65",
    sortOrder: 13,
    targetRoles: ["local_expert"],
  },

  // ─── Trip Planner (travel_expert) ─────────────────────────────────────────
  {
    name: "Full Trip Planning Package",
    description:
      "End-to-end itinerary design for trips of any length, including accommodation shortlists, activity sequencing, and logistics coordination.",
    price: "120",
    sortOrder: 20,
    targetRoles: ["travel_expert"],
  },
  {
    name: "Destination Deep-Dive Consultation",
    description:
      "A focused 60-minute video consultation on a specific destination — best time to visit, must-see vs. skip, budget estimates, and safety tips.",
    price: "55",
    sortOrder: 21,
    targetRoles: ["travel_expert"],
  },
  {
    name: "Visa & Logistics Advisory",
    description:
      "Expert guidance on visa requirements, entry rules, travel insurance, and cross-border logistics for your planned itinerary.",
    price: "40",
    sortOrder: 22,
    targetRoles: ["travel_expert"],
  },
  {
    name: "Multi-City Itinerary Build",
    description:
      "A detailed multi-destination itinerary with optimised routing, transport connections, accommodation suggestions, and daily activity plans.",
    price: "150",
    sortOrder: 23,
    targetRoles: ["travel_expert"],
  },

  // ─── Event Planner ────────────────────────────────────────────────────────
  {
    name: "Venue Scouting & Shortlist",
    description:
      "Research and compile a shortlist of 5–8 venue options that match your event brief, with capacity, pricing, and availability notes.",
    price: "75",
    sortOrder: 30,
    targetRoles: ["event_planner"],
  },
  {
    name: "Full Event Coordination",
    description:
      "Complete event management from concept to execution — supplier bookings, timeline management, on-the-day coordination, and post-event wrap-up.",
    price: "350",
    sortOrder: 31,
    targetRoles: ["event_planner"],
  },
  {
    name: "Day-Of Management",
    description:
      "On-site coordination on your event day: vendor liaising, schedule management, and guest experience to keep everything running smoothly.",
    price: "200",
    sortOrder: 32,
    targetRoles: ["event_planner"],
  },
  {
    name: "Supplier Sourcing Package",
    description:
      "Identify, vet, and negotiate with caterers, photographers, florists, entertainment, and AV suppliers for your event brief.",
    price: "90",
    sortOrder: 33,
    targetRoles: ["event_planner"],
  },
];

export async function seedRoleScopedTemplates(): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  // Resolve (or create) the canonical category for role-scoped templates
  let categoryRow = await db
    .select({ id: expertServiceCategories.id })
    .from(expertServiceCategories)
    .where(eq(expertServiceCategories.name, "Itinerary Planning"))
    .then((r) => r[0]);

  if (!categoryRow) {
    const [ins] = await db
      .insert(expertServiceCategories)
      .values({ name: "Itinerary Planning", isDefault: true, sortOrder: 1 })
      .returning({ id: expertServiceCategories.id });
    categoryRow = ins;
  }
  const categoryId = categoryRow.id;

  for (const tpl of ROLE_TEMPLATES) {
    // Check for existing platform row with same name.
    // expert_id column was dropped in migration 013; dedup on name alone is sufficient
    // because all ESO rows are now platform templates (no expert-scoped rows).
    const existing = await db
      .select({ id: expertServiceOfferings.id })
      .from(expertServiceOfferings)
      .where(eq(expertServiceOfferings.name, tpl.name))
      .then((r) => r[0]);

    if (existing) {
      skipped++;
      continue;
    }

    await db.insert(expertServiceOfferings).values({
      categoryId,
      name: tpl.name,
      description: tpl.description,
      price: tpl.price,
      isDefault: true,
      sortOrder: tpl.sortOrder,
      targetRoles: tpl.targetRoles,
    });
    inserted++;
  }

  return { inserted, skipped };
}
