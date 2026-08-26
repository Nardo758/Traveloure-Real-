/**
 * Ensures development data includes a public, city-scoped Ready-Made template
 * for every configured launch market. It never changes an existing listing and
 * requires --apply before writing.
 *
 * Usage:
 *   npx tsx scripts/seed-ready-made-launch-markets.ts          # report only
 *   npx tsx scripts/seed-ready-made-launch-markets.ts --apply  # seed development
 */
import { and, eq, ilike } from "drizzle-orm";
import { db } from "../server/db";
import { expertTemplates, users } from "../shared/schema";
import { LAUNCH_MARKETS } from "../shared/launch-markets";

const APPLY = process.argv.includes("--apply");
const SEED_AUTHOR_EMAIL = "seed-ready-made-author@traveloure.test";

async function getSeedAuthorId() {
  const [inserted] = await db
    .insert(users)
    .values({
      email: SEED_AUTHOR_EMAIL,
      firstName: "Traveloure",
      lastName: "Editorial",
      role: "local_expert",
      bio: "Development seed author for public Ready-Made listings.",
    })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });

  if (inserted) return inserted.id;

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SEED_AUTHOR_EMAIL))
    .limit(1);
  if (!existing) throw new Error("Unable to resolve the Ready-Made seed author.");
  return existing.id;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("This development seed is disabled in production.");
  }

  for (const market of LAUNCH_MARKETS) {
    const [existing] = await db
      .select({ id: expertTemplates.id, title: expertTemplates.title })
      .from(expertTemplates)
      .where(
        and(
          ilike(expertTemplates.destination, `%${market}%`),
          eq(expertTemplates.approvalStatus, "approved"),
          eq(expertTemplates.isPublished, true),
        ),
      )
      .limit(1);

    if (existing) {
      console.log(`✓ ${market}: ${existing.title} is already approved and published`);
      continue;
    }

    if (!APPLY) {
      console.log(`• ${market}: would seed one approved, published city-wide Ready-Made template`);
      continue;
    }

    const authorId = await getSeedAuthorId();
    await db.insert(expertTemplates).values({
      expertId: authorId,
      title: `A considered week in ${market}`,
      description: `A city-wide, editorially curated seven-day introduction to ${market}.`,
      shortDescription: `A city-wide week in ${market}, ready to make your own.`,
      destination: market,
      duration: 7,
      price: "149.00",
      currency: "USD",
      category: "city-guide",
      tags: ["city-wide", "development-seed"],
      highlights: [`A flexible week across ${market}`, "Local food and cultural stops"],
      isPublished: true,
      approvalStatus: "approved",
    });
    console.log(`✓ ${market}: seeded one approved, published city-wide Ready-Made template`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});