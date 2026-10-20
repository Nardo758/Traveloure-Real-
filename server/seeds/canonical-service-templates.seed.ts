/**
 * Canonical service templates and expert offerings (moved out of server/routes.ts, ledger
 * `2026-10-18-boot-reference-seeding`). Reference data, insert-if-missing, run inside the boot seeding lock.
 * Both tables are admin-editable (admin can delete a template or an offering), so each seeds only while
 * NONE of its own keys is present — no migration creates them — and a deleted row never comes back.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { expertServiceCategories, expertServiceOfferings, serviceTemplates } from "@shared/schema";
import { noSeederOnlyKeyPresent } from "./lib/boot-seed-rules";

// The six templates previously hardcoded in the frontend, promoted to DB rows so there is one canonical source.
export const CANONICAL_TEMPLATES = [
  {
    title: "Quick Consultation",
    description: "15-minute video call to answer quick travel questions and provide immediate guidance",
    serviceType: "consultation",
    deliveryMethod: "video",
    deliveryTimeframe: "15 min",
    suggestedPrice: "29",
    requirements: JSON.stringify(["Travel question or topic to discuss"]),
    whatIncluded: JSON.stringify(["15-min video call", "Personalized advice", "Follow-up summary email"]),
    isActive: true,
    sortOrder: 1,
  },
  {
    title: "Cart Review & Optimization",
    description: "Expert review of your travel cart to find savings and better alternatives",
    serviceType: "review",
    // 'pdf' per the canonical deliveryMethodEnum (migration 109 CHECK); was 'document'
    deliveryMethod: "pdf",
    deliveryTimeframe: "24 hours",
    suggestedPrice: "49",
    requirements: JSON.stringify(["Cart link or selections", "Budget constraints"]),
    whatIncluded: JSON.stringify(["Written recommendations", "Alternative suggestions", "Savings estimate"]),
    isActive: true,
    sortOrder: 2,
  },
  {
    title: "Full Trip Planning",
    description: "Comprehensive trip planning from start to finish with personalized itinerary",
    serviceType: "planning",
    deliveryMethod: "hybrid",
    deliveryTimeframe: "3-5 days",
    suggestedPrice: "249",
    requirements: JSON.stringify(["Destination", "Dates", "Budget", "Interests", "Travel style"]),
    whatIncluded: JSON.stringify(["Full itinerary", "Booking links", "Restaurant reservations", "Daily schedule", "Packing list"]),
    isActive: true,
    sortOrder: 3,
  },
  {
    title: "Destination Deep Dive",
    description: "In-depth guide to a specific destination with local insights and local picks",
    serviceType: "custom",
    // 'pdf' per the canonical deliveryMethodEnum (migration 109 CHECK); was 'document'
    deliveryMethod: "pdf",
    deliveryTimeframe: "48 hours",
    suggestedPrice: "79",
    requirements: JSON.stringify(["Destination", "Travel dates", "Interests"]),
    whatIncluded: JSON.stringify(["PDF guide", "Local recommendations", "Maps", "Local tips", "Safety advice"]),
    isActive: true,
    sortOrder: 4,
  },
  {
    title: "Honeymoon Planning Package",
    description: "Romantic trip planning with special touches and memorable experiences",
    serviceType: "planning",
    deliveryMethod: "hybrid",
    deliveryTimeframe: "5-7 days",
    suggestedPrice: "399",
    requirements: JSON.stringify(["Couple preferences", "Budget", "Dates", "Special requests"]),
    whatIncluded: JSON.stringify(["Custom itinerary", "Romantic experiences", "Special arrangements", "Booking assistance"]),
    isActive: true,
    sortOrder: 5,
  },
  {
    title: "Group Trip Coordinator",
    description: "Organize and coordinate travel for groups with complex logistics",
    serviceType: "planning",
    deliveryMethod: "video",
    deliveryTimeframe: "1 week",
    suggestedPrice: "349",
    requirements: JSON.stringify(["Group size", "Budget per person", "Destination preferences", "Special needs"]),
    whatIncluded: JSON.stringify(["Group logistics", "Shared itinerary", "Booking coordination", "Communication support"]),
    isActive: true,
    sortOrder: 6,
  },
];

/** Seeds the canonical service templates while none of their titles is present. Returns rows inserted. */
export async function seedCanonicalServiceTemplates(): Promise<number> {
  const titles = CANONICAL_TEMPLATES.map((t) => t.title);
  if (!(await noSeederOnlyKeyPresent(serviceTemplates, serviceTemplates.title, titles))) return 0;
  let inserted = 0;
  for (const tpl of CANONICAL_TEMPLATES) {
    await storage.createServiceTemplate(tpl as any);
    inserted++;
  }
  return inserted;
}

// expert_service_offerings is the canonical template catalog; these six back the from-template flow.
// The "Itinerary Planning" category is looked up at run time (migration 030 creates it) rather than a UUID.
export const CANONICAL_OFFERINGS = [
  { name: "Quick Consultation",         description: "15-minute video call to answer quick travel questions and provide immediate guidance",         price: "29.00",  sortOrder: 101 },
  { name: "Cart Review & Optimization", description: "Expert review of your travel cart to find savings and better alternatives",                   price: "49.00",  sortOrder: 102 },
  { name: "Full Trip Planning",         description: "Comprehensive trip planning from start to finish with personalized itinerary",                price: "249.00", sortOrder: 103 },
  { name: "Destination Deep Dive",      description: "In-depth guide to a specific destination with local insights and local picks",                price: "79.00",  sortOrder: 104 },
  { name: "Honeymoon Planning Package", description: "Romantic trip planning with special touches and memorable experiences",                      price: "399.00", sortOrder: 105 },
  { name: "Group Trip Coordinator",     description: "Organize and coordinate travel for groups with complex logistics",                           price: "349.00", sortOrder: 106 },
];

/** Seeds the canonical expert offerings while none of their names is present. Returns rows inserted. */
export async function seedCanonicalExpertOfferings(): Promise<number> {
  const names = CANONICAL_OFFERINGS.map((o) => o.name);
  if (!(await noSeederOnlyKeyPresent(expertServiceOfferings, expertServiceOfferings.name, names))) return 0;
  let categoryId: string | null = null;
  const categoryRows = await db
    .select({ id: expertServiceCategories.id })
    .from(expertServiceCategories)
    .where(eq(expertServiceCategories.name, "Itinerary Planning"))
    .limit(1);
  if (categoryRows.length > 0) {
    categoryId = categoryRows[0].id;
  } else {
    const [newCategory] = await db
      .insert(expertServiceCategories)
      .values({ name: "Itinerary Planning", isDefault: true, sortOrder: 0 })
      .returning();
    categoryId = newCategory.id;
  }
  if (!categoryId) return 0;
  let inserted = 0;
  for (const offering of CANONICAL_OFFERINGS) {
    await db.insert(expertServiceOfferings).values({
      categoryId,
      name: offering.name,
      description: offering.description,
      price: offering.price,
      isDefault: true,
      sortOrder: offering.sortOrder,
    });
    inserted++;
  }
  return inserted;
}
