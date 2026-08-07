import { db } from "../db";
import { serviceCategories } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const exists = await db
    .select()
    .from(serviceCategories)
    .where(eq(serviceCategories.slug, "visa-assistance"))
    .then((r) => r[0]);

  if (!exists) {
    await db.insert(serviceCategories).values({
      name: "Visa Assistance",
      slug: "visa-assistance",
      description:
        "Expert visa guidance, document preparation, application support, and embassy appointment scheduling",
      categoryType: "hybrid",
      verificationRequired: true,
      requiredDocuments: ["certification", "license", "references"],
      priceRange: { min: 75, max: 800 },
      // R2 (ruling 51): service_categories.commission_band_key is NOT NULL — a category may never
      // exist without a commission band, because the resolver is fail-loud by design. `moderate` per
      // R1's interim assignment for categories the ruling did not name individually (see FOLLOWUPS
      // FU-5, which tracks these for explicit assignment).
      commissionBandKey: "moderate",
      sortOrder: 16,
    });
    console.log("Created Visa Assistance category");
  } else {
    console.log("Visa Assistance already exists:", exists.id);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
