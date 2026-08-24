import { db } from "./db";
import { serviceCategories } from "@workspace/db";
import { eq } from "drizzle-orm";

const coreCategories = [
  { name: "Photography & Videography", slug: "photography-videography", description: "Portrait, event, engagement, family, architectural photography and travel videos, drone footage", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["portfolio", "insurance"], priceRange: { min: 150, max: 1000 }, sortOrder: 1 , commissionBandKey: "limited" },
  { name: "Transportation & Logistics", slug: "transportation-logistics", description: "Private drivers, airport transfers, day trips, specialty transport", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "insurance", "vehicle_registration"], priceRange: { min: 50, max: 800 }, sortOrder: 2 , commissionBandKey: "commercial" },
  { name: "Food & Culinary", slug: "food-culinary", description: "Private chefs, cooking lessons, meal prep, sommelier services, food tours", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["culinary_credentials", "food_handler_license"], priceRange: { min: 100, max: 600 }, sortOrder: 3 , commissionBandKey: "moderate" },
  { name: "Childcare & Family", slug: "childcare-family", description: "Babysitters, nannies, kids activity coordinators, family assistants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["background_check", "cpr_certification", "references"], priceRange: { min: 20, max: 150 }, sortOrder: 4 , commissionBandKey: "moderate" },
  { name: "Tours & Experiences", slug: "tours-experiences", description: "Tour guides, walking tours, museum tours, adventure guides, cultural experiences", categoryType: "hybrid", verificationRequired: true, requiredDocuments: ["tour_guide_license", "insurance"], priceRange: { min: 100, max: 500 }, sortOrder: 5 , commissionBandKey: "limited" },
  { name: "Personal Assistance", slug: "personal-assistance", description: "Travel companions, personal concierge, executive assistants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["background_check", "references", "first_aid"], priceRange: { min: 100, max: 300 }, sortOrder: 6 , commissionBandKey: "limited" },
  { name: "TaskRabbit Services", slug: "taskrabbit-services", description: "Handyman, delivery, cleaning, property management", categoryType: "service_provider", verificationRequired: false, requiredDocuments: [], priceRange: { min: 30, max: 200 }, sortOrder: 7 , commissionBandKey: "moderate" },
  { name: "Health & Wellness", slug: "health-wellness", description: "Fitness instructors, massage therapists, yoga teachers, wellness coaches", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["certification", "insurance"], priceRange: { min: 50, max: 200 }, sortOrder: 8 , commissionBandKey: "moderate" },
  { name: "Beauty & Styling", slug: "beauty-styling", description: "Hair stylists, makeup artists, personal stylists", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 75, max: 300 }, sortOrder: 9 , commissionBandKey: "limited" },
  { name: "Pets & Animals", slug: "pets-animals", description: "Pet sitters, dog walkers, animal experience guides", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["references"], priceRange: { min: 25, max: 100 }, sortOrder: 10 , commissionBandKey: "moderate" },
  { name: "Events & Celebrations", slug: "events-celebrations", description: "Event coordinators, florists, bakers, party planners", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 100, max: 1500 }, sortOrder: 11 , commissionBandKey: "moderate" },
  { name: "Technology & Connectivity", slug: "technology-connectivity", description: "Tech support, social media management, photography editing", categoryType: "service_provider", verificationRequired: false, requiredDocuments: [], priceRange: { min: 50, max: 150 }, sortOrder: 12 , commissionBandKey: "commercial" },
  { name: "Language & Translation", slug: "language-translation", description: "Translators, interpreters, language tutors", categoryType: "hybrid", verificationRequired: true, requiredDocuments: ["certification", "references"], priceRange: { min: 50, max: 200 }, sortOrder: 13 , commissionBandKey: "commercial" },
  { name: "Specialty Services", slug: "specialty-services", description: "Wedding coordinators, relocation specialists, legal/visa assistants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "insurance"], priceRange: { min: 200, max: 2000 }, sortOrder: 14 , commissionBandKey: "moderate" },
  // FP-1 / A1 (docs/testing/PROVIDER_BATCH_EXERCISE.md): `categoryKey` is DELIBERATE and
  // load-bearing here. This is the ONE core category migration 034's taxonomy UPSERT does not
  // create ("outside brief taxonomy"), so on a fresh database this seeder is what brings the row
  // into existence — and it runs AFTER runMigrations(), which is why migration 189's identical
  // backfill matched nothing and the row was born with category_key = NULL. That NULL is what made
  // the provider wizard's "Something else / not listed" offering render Category "—" and leave
  // Publish permanently disabled: service_offering_types.custom_other_offering points at
  // category_key='custom_other' and nothing carried it. Every other row here gets its key from
  // migration 034 before this seeder ever sees it. Do not drop this field.
  { name: "Custom / Other", slug: "custom-other", categoryKey: "custom_other", description: "Custom service requests, user-suggested categories", categoryType: "service_provider", verificationRequired: true, requiredDocuments: [], priceRange: { min: 0, max: 0 }, sortOrder: 15 , commissionBandKey: "moderate" },
  { name: "Visa Assistance", slug: "visa-assistance", description: "Expert visa guidance, document preparation, application support, and embassy appointment scheduling", categoryType: "hybrid", verificationRequired: true, requiredDocuments: ["certification", "license", "references"], priceRange: { min: 75, max: 800 }, sortOrder: 16 , commissionBandKey: "moderate" },
  
  // Experience-specific service bundles
  { name: "Travel Services", slug: "services-travel", description: "Travel insurance, visa assistance, guides, translation, photography for travelers", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "insurance"], priceRange: { min: 50, max: 500 }, sortOrder: 20 , commissionBandKey: "moderate" },
  { name: "Wedding Services", slug: "services-wedding", description: "Planners, coordinators, officiants, rentals, beauty, transportation for weddings", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["portfolio", "insurance", "license"], priceRange: { min: 200, max: 5000 }, sortOrder: 21 , commissionBandKey: "limited" },
  { name: "Proposal Services", slug: "services-proposal", description: "Planners, musicians, lighting, signage, transportation for proposals", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["portfolio", "insurance"], priceRange: { min: 100, max: 2000 }, sortOrder: 22 , commissionBandKey: "limited" },
  { name: "Birthday Services", slug: "services-birthday", description: "Planners, performers, face painters, balloon artists, rentals for parties", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 50, max: 1000 }, sortOrder: 23 , commissionBandKey: "limited" },
  { name: "Trip Services", slug: "services-trip", description: "Guides, photographers, transportation, concierge for group trips", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "insurance"], priceRange: { min: 75, max: 800 }, sortOrder: 24 , commissionBandKey: "moderate" },
  { name: "Romance Services", slug: "services-romance", description: "Photographers, musicians, transportation, flowers, gifts for romantic occasions", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 50, max: 500 }, sortOrder: 25 , commissionBandKey: "limited" },
  { name: "Corporate Services", slug: "services-corporate", description: "Registration, transportation, swag, speakers, A/V support for corporate events", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "insurance"], priceRange: { min: 200, max: 5000 }, sortOrder: 26 , commissionBandKey: "limited" },
  { name: "Retreat Services", slug: "services-retreat", description: "Facilitators, instructors, transportation, wellness coordinators for retreats", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["certification", "insurance"], priceRange: { min: 100, max: 1500 }, sortOrder: 27 , commissionBandKey: "limited" },
  { name: "Event Services", slug: "services-event", description: "Photographers, transportation, coordinators, rentals for general events", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 75, max: 1000 }, sortOrder: 28 , commissionBandKey: "limited" },
  { name: "Party Services", slug: "services-party", description: "Photographers, rentals, coordinators, DJs, performers for parties", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 50, max: 800 }, sortOrder: 29 , commissionBandKey: "limited" },
];

export async function seedCategories(): Promise<{ created: number; existing: number }> {
  let created = 0;
  let existing = 0;

  for (const cat of coreCategories) {
    const exists = await db.select().from(serviceCategories)
      .where(eq(serviceCategories.slug, cat.slug))
      .then(r => r[0]);
    
    if (!exists) {
      await db.insert(serviceCategories).values({
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        categoryType: cat.categoryType as "service_provider" | "local_expert" | "hybrid",
        verificationRequired: cat.verificationRequired,
        requiredDocuments: cat.requiredDocuments,
        priceRange: cat.priceRange,
        sortOrder: cat.sortOrder,
        // Fee-ledger NOT NULL (migration 179 lane): the band was added to the DATA rows above but
        // this explicit projection dropped it, so boot inserts still sent `default` → NULL →
        // not-null violation (seen live in the journey-suite PG logs at 7240a33a, "TaskRabbit
        // Services"). Every new column added to coreCategories must also be named here.
        commissionBandKey: cat.commissionBandKey,
        // FP-1 / A1: optional per-row taxonomy key. Only "Custom / Other" carries one here (every
        // other core row is created with its key by migration 034's UPSERT, which runs first);
        // omitting it left the offering picker's catch-all pointing at a key no category held.
        // `undefined` leaves the column at its NULL default for the rows that have none.
        categoryKey: (cat as { categoryKey?: string }).categoryKey,
      });
      created++;
      console.log(`Created category: ${cat.name}`);
    } else {
      existing++;
    }
  }

  console.log(`Seed complete: ${created} created, ${existing} already existed`);
  return { created, existing };
}
