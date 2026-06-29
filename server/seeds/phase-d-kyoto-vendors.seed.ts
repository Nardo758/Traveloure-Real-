#!/usr/bin/env tsx

/**
 * Phase D: Kyoto launch-market inventory — Wedding & Corporate vendors.
 *
 * SERP-fill surfaces discovery content; this seed creates real, bookable
 * vendor profiles on the platform so the Kyoto city feed has actual supply
 * to match against gems in Gion, Higashiyama, Arashiyama, etc.
 *
 * Creates:
 *   5 wedding vendors  — bridal, ceremony, florals, photography, music
 *   4 corporate vendors — retreat planning, team-building, interpretation, transport
 *
 * Each vendor = 1 users row + 1 serviceProviderForms row + 2-4 providerServices rows.
 *
 * Idempotency: keyed on users.email. Re-running is safe; existing rows are skipped.
 *
 * Run standalone: tsx server/seeds/phase-d-kyoto-vendors.seed.ts
 */

import { db } from "../db";
import { users, serviceProviderForms, providerServices, serviceCategories } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import * as crypto from "crypto";

// ─── Category placeholders (vendor arrays reference these at module load time) ─
// Values are key names — the seed function resolves real IDs from the DB at runtime.
const CAT = {
  ATTIRE_FASHION:       "ATTIRE_FASHION",
  BEAUTY_STYLING:       "BEAUTY_STYLING",
  EVENTS_CELEBRATIONS:  "EVENTS_CELEBRATIONS",
  FLORAL_DECORATION:    "FLORAL_DECORATION",
  PHOTOGRAPHY_VIDEO:    "PHOTOGRAPHY_VIDEO",
  MUSIC_PERFORMANCE:    "MUSIC_PERFORMANCE",
  CORPORATE_SERVICES:   "CORPORATE_SERVICES",
  CULTURAL_EDUCATIONAL: "CULTURAL_EDUCATIONAL",
  LANGUAGE_TRANSLATION: "LANGUAGE_TRANSLATION",
  RENTAL_SERVICES:      "RENTAL_SERVICES",
} as const;

// ─── Map from key name → slug in service_categories ─────────────────────────
// Slugs are guaranteed to exist after seedCategories() runs before this seed.
const CAT_KEY_TO_SLUG: Record<string, string> = {
  ATTIRE_FASHION:       "services-wedding",
  BEAUTY_STYLING:       "beauty-styling",
  EVENTS_CELEBRATIONS:  "events-celebrations",
  FLORAL_DECORATION:    "events-celebrations",
  PHOTOGRAPHY_VIDEO:    "photography-videography",
  MUSIC_PERFORMANCE:    "events-celebrations",
  CORPORATE_SERVICES:   "services-corporate",
  CULTURAL_EDUCATIONAL: "tours-experiences",
  LANGUAGE_TRANSLATION: "language-translation",
  RENTAL_SERVICES:      "specialty-services",
};

async function resolveCategoryIds(): Promise<Record<string, string>> {
  const slugs = [...new Set(Object.values(CAT_KEY_TO_SLUG))];
  const rows = await db
    .select({ id: serviceCategories.id, slug: serviceCategories.slug })
    .from(serviceCategories)
    .where(inArray(serviceCategories.slug, slugs));

  const slugToId = Object.fromEntries(rows.map((r) => [r.slug, r.id]));

  const keyToId: Record<string, string> = {};
  for (const [key, slug] of Object.entries(CAT_KEY_TO_SLUG)) {
    if (slugToId[slug]) {
      keyToId[key] = slugToId[slug];
    } else {
      console.warn(`[Phase D] Category slug "${slug}" not found in DB — services using key "${key}" will be skipped.`);
    }
  }
  return keyToId;
}

// ─── Unsplash photos (free, retina-ready) ────────────────────────────────
const IMG = {
  kimono:     "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800",
  ceremony:   "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=800",
  florals:    "https://images.unsplash.com/photo-1487530811015-780780a4b0f7?w=800",
  wedding_ph: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=800",
  koto:       "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800",
  corporate:  "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800",
  zen:        "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800",
  interpret:  "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=800",
  transport:  "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800",
};

interface VendorDef {
  email: string;
  firstName: string;
  lastName: string;
  businessName: string;
  businessType: string;
  mobile: string;
  address: string;
  description: string;
  website?: string;
  instagramLink?: string;
  photo1: string;
  services: ServiceDef[];
}

interface ServiceDef {
  serviceName: string;
  shortDescription: string;
  description: string;
  serviceType: string;
  categoryId: string;
  price: string;
  priceType: string;
  deliveryMethod: string;
  neighborhood: string;
  serviceImage: string;
  whatIncluded: string[];
  location: string;
  isFeatured?: boolean;
  contentAffinityTags?: string[];
}

// ─── WEDDING VENDORS ──────────────────────────────────────────────────────

const WEDDING_VENDORS: VendorDef[] = [
  {
    email: "kyoto-bridal@traveloure.test",
    firstName: "Hana",
    lastName: "Yoshida",
    businessName: "Maiko Bridal Studio",
    businessType: "Bridal Services",
    mobile: "+81-75-551-0101",
    address: "14 Hanamikoji, Gion, Kyoto 605-0074",
    description: "Kyoto's premier kimono bridal studio, dressing couples in authentic uchikake and furisode for traditional ceremonies and photography sessions in Gion and Higashiyama.",
    website: "https://maiko-bridal.traveloure.test",
    instagramLink: "https://instagram.com/maiko_bridal_kyoto",
    photo1: IMG.kimono,
    services: [
      {
        serviceName: "Bridal Kimono Rental & Dressing",
        shortDescription: "Full uchikake set with dresser and accessories for your ceremony day.",
        description: "Complete bridal kimono experience: uchikake selection, professional dresser, hair ornaments, obijime, zori sandals. Includes one fitting session and same-day ceremony assistance. Available in Gion and Higashiyama studio.",
        serviceType: "experience",
        categoryId: CAT.ATTIRE_FASHION,
        price: "480",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "gion",
        serviceImage: IMG.kimono,
        whatIncluded: ["Uchikake kimono (bridal outer robe)", "Pre-ceremony fitting session", "Professional kimono dresser", "Hair ornaments & accessories", "Zori sandals & tabi socks"],
        location: "Gion, Kyoto",
        isFeatured: true,
        contentAffinityTags: ["wedding", "kimono", "ceremony"],
      },
      {
        serviceName: "Kimono Portrait Session Package",
        shortDescription: "Furisode kimono rental + professional photo shoot in Higashiyama.",
        description: "Dress in a vibrant furisode and explore Higashiyama's stone-paved lanes with a professional photographer. 2-hour session, 60+ edited digital photos delivered within 5 days. Perfect for couples, solo travellers, and pre-wedding shoots.",
        serviceType: "experience",
        categoryId: CAT.PHOTOGRAPHY_VIDEO,
        price: "320",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "higashiyama",
        serviceImage: IMG.wedding_ph,
        whatIncluded: ["Furisode kimono rental", "Hair & obi styling", "2-hour Higashiyama shoot", "60+ retouched digital photos", "Private online gallery"],
        location: "Higashiyama, Kyoto",
        contentAffinityTags: ["kimono", "photography", "couple"],
      },
      {
        serviceName: "Bridal Hair & Make-up (Wafū Style)",
        shortDescription: "Traditional Japanese bridal beauty for ceremony or shoot day.",
        description: "Authentic wafū (Japanese-style) bridal hair and make-up by certified Kyoto cosmetologists. Includes shimada wig fitting or up-do, oshiroi (white powder) application, and floral kanzashi placement. 2-hour preparation slot.",
        serviceType: "specialty",
        categoryId: CAT.BEAUTY_STYLING,
        price: "280",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "gion",
        serviceImage: IMG.kimono,
        whatIncluded: ["Wafū hair styling or shimada wig", "Traditional make-up application", "Kanzashi hair ornaments", "Touch-up kit for the day"],
        location: "Gion, Kyoto",
        contentAffinityTags: ["wedding", "beauty", "kimono"],
      },
    ],
  },

  {
    email: "kyoto-ceremony@traveloure.test",
    firstName: "Keiko",
    lastName: "Tanaka",
    businessName: "Kyoto Ceremony Co.",
    businessType: "Wedding & Ceremony Planning",
    mobile: "+81-75-552-0202",
    address: "3-8 Chayamachi, Higashiyama, Kyoto 605-0862",
    description: "Full-service wedding ceremony coordination for intimate to mid-size ceremonies at Kyoto's licensed temples, gardens, and historic machiya. Specialists in Shinto rites, garden ceremonies, and bespoke elopements.",
    website: "https://kyoto-ceremony.traveloure.test",
    instagramLink: "https://instagram.com/kyoto_ceremony_co",
    photo1: IMG.ceremony,
    services: [
      {
        serviceName: "Temple Garden Wedding Coordination",
        shortDescription: "Licensed Shinto ceremony at a Kyoto temple garden — full planning.",
        description: "End-to-end coordination of an intimate garden or Shinto ceremony at one of Kyoto's licensed venues. Includes shrine liaison, rehearsal, officiant arrangement, ceremony script translation, guest seating, and day-of coordination for up to 30 guests.",
        serviceType: "experience",
        categoryId: CAT.EVENTS_CELEBRATIONS,
        price: "2800",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "higashiyama",
        serviceImage: IMG.ceremony,
        whatIncluded: ["Licensed temple/garden venue coordination", "Shinto officiant & translation", "Ceremony rehearsal", "Day-of coordination (6 hours)", "Vendor liaison (florist, photographer, caterer)", "Up to 30 guests"],
        location: "Higashiyama / Arashiyama, Kyoto",
        isFeatured: true,
        contentAffinityTags: ["wedding", "ceremony", "temple"],
      },
      {
        serviceName: "Intimate Elopement Package",
        shortDescription: "Just the two of you — ceremony, kimono, and photos in Arashiyama.",
        description: "All-inclusive elopement day in Arashiyama: kimono dressing, bamboo grove ceremony, officiant, professional photography (2 hours), and kaiseki lunch for two. Up to 4 guests welcome.",
        serviceType: "experience",
        categoryId: CAT.EVENTS_CELEBRATIONS,
        price: "1400",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "arashiyama",
        serviceImage: IMG.ceremony,
        whatIncluded: ["Ceremony officiant & script", "Kimono dressing for couple", "Bamboo grove location permit", "2-hour photography", "Kaiseki lunch for two"],
        location: "Arashiyama, Kyoto",
        isFeatured: true,
        contentAffinityTags: ["wedding", "elopement", "intimate"],
      },
      {
        serviceName: "Wedding Planning Consultation",
        shortDescription: "1.5-hour planning session to scope your Kyoto ceremony options.",
        description: "60–90 minute video or in-person consultation covering venue options, budget planning, vendor recommendations, Shinto vs. garden ceremony differences, and a personalised planning checklist. Ideal starting point for couples planning from abroad.",
        serviceType: "consultation",
        categoryId: CAT.EVENTS_CELEBRATIONS,
        price: "120",
        priceType: "fixed",
        deliveryMethod: "call",
        neighborhood: "higashiyama",
        serviceImage: IMG.ceremony,
        whatIncluded: ["90-minute consultation", "Venue shortlist (3 options)", "Budget breakdown template", "Vendor contact list", "Personalised planning checklist"],
        location: "Kyoto (video call available)",
        contentAffinityTags: ["wedding", "planning", "consultation"],
      },
    ],
  },

  {
    email: "kyoto-florals@traveloure.test",
    firstName: "Midori",
    lastName: "Hayashi",
    businessName: "Sakura Blooms Kyoto",
    businessType: "Floral Design",
    mobile: "+81-75-553-0303",
    address: "22 Omiya-dori, Nishijin, Kyoto 602-8357",
    description: "Kyoto-born floral studio blending ikebana philosophy with contemporary wedding design. Seasonal blooms sourced daily from Nishiki Market and Fushimi growers.",
    website: "https://sakura-blooms.traveloure.test",
    instagramLink: "https://instagram.com/sakura_blooms_kyoto",
    photo1: IMG.florals,
    services: [
      {
        serviceName: "Ceremony Arch & Altar Arrangement",
        shortDescription: "Bespoke floral arch or torii-inspired altar installation for your ceremony.",
        description: "Custom floral installation for ceremony spaces: bamboo-framed arch, torii gate dressing, or altar arrangement. Uses seasonal Japanese blooms — sakura, wisteria, chrysanthemum, peony — arranged in modern-ikebana style. Installation and breakdown included.",
        serviceType: "specialty",
        categoryId: CAT.FLORAL_DECORATION,
        price: "1200",
        priceType: "variable",
        deliveryMethod: "in_person",
        neighborhood: "higashiyama",
        serviceImage: IMG.florals,
        whatIncluded: ["Bespoke arch or altar design", "Seasonal Japanese blooms", "Day-of installation & breakdown", "Consultation & mood-board"],
        location: "All Kyoto venues",
        isFeatured: true,
        contentAffinityTags: ["wedding", "florals", "ceremony"],
      },
      {
        serviceName: "Bridal Bouquet & Party Flowers",
        shortDescription: "Hand-tied bouquet, buttonholes, and bridesmaid posies.",
        description: "Bridal bouquet in cascading or round style, matching buttonholes for the party, and three bridesmaid posies. Delivered to venue or hotel same morning. Available in seasonal Japanese or Western florals.",
        serviceType: "specialty",
        categoryId: CAT.FLORAL_DECORATION,
        price: "420",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "gion",
        serviceImage: IMG.florals,
        whatIncluded: ["Bridal bouquet", "3 bridesmaid posies", "Buttonholes (up to 4)", "Same-morning delivery"],
        location: "Gion / Higashiyama delivery",
        contentAffinityTags: ["wedding", "florals", "bouquet"],
      },
      {
        serviceName: "Ikebana Reception Table Centrepieces",
        shortDescription: "Minimalist ikebana-style centrepieces for up to 10 reception tables.",
        description: "Ikebana-inspired centrepieces using seasonal Japanese botanicals — each a unique composition reflecting ma (negative space) and harmony. Priced per centrepiece; minimum 3. Includes delivery and removal.",
        serviceType: "specialty",
        categoryId: CAT.FLORAL_DECORATION,
        price: "160",
        priceType: "variable",
        deliveryMethod: "in_person",
        neighborhood: "nishijin",
        serviceImage: IMG.florals,
        whatIncluded: ["Ikebana centrepiece per table", "Seasonal Japanese botanicals", "Delivery, placement & removal"],
        location: "All Kyoto venues",
        contentAffinityTags: ["wedding", "reception", "florals"],
      },
    ],
  },

  {
    email: "kyoto-wedding-photo@traveloure.test",
    firstName: "Riku",
    lastName: "Mori",
    businessName: "Yashiro Photography",
    businessType: "Photography & Videography",
    mobile: "+81-75-554-0404",
    address: "5-2 Ninenzaka, Higashiyama, Kyoto 605-0826",
    description: "Award-winning Kyoto wedding and portrait photographer. Documentary-style coverage of Shinto ceremonies, kimono sessions, and elopements across Arashiyama, Higashiyama, and Fushimi.",
    website: "https://yashiro-photo.traveloure.test",
    instagramLink: "https://instagram.com/yashiro_photo_kyoto",
    photo1: IMG.wedding_ph,
    services: [
      {
        serviceName: "Full-Day Wedding Photography",
        shortDescription: "8-hour documentary coverage from prep to reception, 400+ edited images.",
        description: "Complete wedding day coverage: getting-ready, ceremony, portraits in Kyoto's historic lanes, and reception. Delivered as 400+ professionally edited high-resolution images in a private online gallery within 3 weeks. Second shooter available on request.",
        serviceType: "experience",
        categoryId: CAT.PHOTOGRAPHY_VIDEO,
        price: "2200",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "higashiyama",
        serviceImage: IMG.wedding_ph,
        whatIncluded: ["8-hour coverage", "400+ edited photos", "Private online gallery", "High-res digital download", "Optional second shooter (+¥50,000)"],
        location: "All Kyoto venues",
        isFeatured: true,
        contentAffinityTags: ["wedding", "photography", "ceremony"],
      },
      {
        serviceName: "Pre-Wedding Shoot in Arashiyama",
        shortDescription: "2-hour golden-hour session in bamboo grove or riverbank.",
        description: "Pre-wedding or anniversary session in Arashiyama: bamboo grove, Togetsukyo bridge, or Jojakko-ji garden. Best at sunrise or golden hour. Includes kimono coordination if booked alongside Maiko Bridal Studio. 80+ edited images delivered within 10 days.",
        serviceType: "experience",
        categoryId: CAT.PHOTOGRAPHY_VIDEO,
        price: "780",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "arashiyama",
        serviceImage: IMG.wedding_ph,
        whatIncluded: ["2-hour Arashiyama session", "Location scouting", "80+ edited photos", "Online gallery"],
        location: "Arashiyama, Kyoto",
        isFeatured: false,
        contentAffinityTags: ["photography", "couple", "arashiyama"],
      },
      {
        serviceName: "Ceremony Highlight Video (Short-form)",
        shortDescription: "3–5 minute cinematic highlight reel of your ceremony.",
        description: "Cinematic short-form highlight video shot in 4K during your ceremony (up to 3 hours). Delivered within 4 weeks with licensed background music. Perfect for sharing on social media and preserving memories.",
        serviceType: "experience",
        categoryId: CAT.PHOTOGRAPHY_VIDEO,
        price: "1100",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "gion",
        serviceImage: IMG.wedding_ph,
        whatIncluded: ["3-hour ceremony filming", "3-5 min 4K highlight video", "Licensed music", "Digital delivery"],
        location: "All Kyoto venues",
        contentAffinityTags: ["wedding", "video", "ceremony"],
      },
    ],
  },

  {
    email: "kyoto-music@traveloure.test",
    firstName: "Ayano",
    lastName: "Shimizu",
    businessName: "Koto Wedding Ensemble",
    businessType: "Music & Performance",
    mobile: "+81-75-555-0505",
    address: "8 Kitagawa, Gion, Kyoto 605-0001",
    description: "Professional koto, shamisen, and shakuhachi ensemble performing at Kyoto weddings and receptions. From intimate Shinto ceremonies to full reception performances.",
    website: "https://koto-ensemble.traveloure.test",
    photo1: IMG.koto,
    services: [
      {
        serviceName: "Koto Ceremony Performance",
        shortDescription: "Solo koto for processional, ceremony, and recessional (up to 2 hours).",
        description: "Professional koto player performing traditional and modern pieces during ceremony: bridal procession, ceremony, and recessional. Two-hour slot. Repertoire includes Rokudan no Shirabe, Haru no Umi, and bespoke arrangements of Western pieces on request.",
        serviceType: "experience",
        categoryId: CAT.MUSIC_PERFORMANCE,
        price: "650",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "gion",
        serviceImage: IMG.koto,
        whatIncluded: ["Solo koto performance", "2-hour ceremony slot", "Custom repertoire consultation", "Setup & teardown"],
        location: "All Kyoto venues",
        isFeatured: true,
        contentAffinityTags: ["wedding", "music", "ceremony"],
      },
      {
        serviceName: "Shamisen & Shakuhachi Duo",
        shortDescription: "Atmospheric duo performance for ceremony or reception ambience.",
        description: "Shamisen and shakuhachi (flute) duo performing during ceremony and/or cocktail hour. Blends classical Japanese court music (gagaku-influenced) with folk pieces. 3-hour total performance window.",
        serviceType: "experience",
        categoryId: CAT.MUSIC_PERFORMANCE,
        price: "900",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "pontocho",
        serviceImage: IMG.koto,
        whatIncluded: ["Shamisen & shakuhachi duo", "3-hour performance window", "Setlist consultation", "Setup & teardown"],
        location: "All Kyoto venues",
        contentAffinityTags: ["wedding", "music", "reception"],
      },
    ],
  },
];

// ─── CORPORATE VENDORS ────────────────────────────────────────────────────

const CORPORATE_VENDORS: VendorDef[] = [
  {
    email: "kyoto-corporate-retreats@traveloure.test",
    firstName: "Hiroshi",
    lastName: "Kobayashi",
    businessName: "Kyoto Executive Retreats",
    businessType: "Corporate Event Planning",
    mobile: "+81-75-556-0606",
    address: "12F Karasuma Gojo Tower, Shimogyo, Kyoto 600-8146",
    description: "End-to-end corporate retreat and offsite planning for teams of 8–80. Specialists in immersive Kyoto cultural programming, strategic offsite facilitation, and executive hospitality.",
    website: "https://kyoto-exec-retreats.traveloure.test",
    photo1: IMG.corporate,
    services: [
      {
        serviceName: "Corporate Retreat — Full Planning Package",
        shortDescription: "3-day immersive Kyoto retreat for leadership teams (8–25 people).",
        description: "Turnkey 3-day corporate retreat: venue sourcing (ryokan or kaiseki restaurant private dining), cultural programming (tea ceremony, zen garden workshop, temple morning meditation), strategic facilitation sessions, all ground transport, and group dinners. Includes pre-trip discovery call and post-retreat report.",
        serviceType: "planning",
        categoryId: CAT.CORPORATE_SERVICES,
        price: "5500",
        priceType: "variable",
        deliveryMethod: "in_person",
        neighborhood: "arashiyama",
        serviceImage: IMG.corporate,
        whatIncluded: ["3-day programme design & facilitation", "Venue sourcing (ryokan/restaurant)", "Cultural experiences (3 sessions)", "All ground transport", "Group dinners (2 evenings)", "Post-retreat summary"],
        location: "Kyoto & surrounds",
        isFeatured: true,
        contentAffinityTags: ["corporate", "retreat", "team"],
      },
      {
        serviceName: "Executive Offsite Day — Strategy & Culture",
        shortDescription: "Full-day facilitated offsite blending strategy and Kyoto cultural immersion.",
        description: "One-day facilitated executive offsite for up to 15 leaders. Morning: strategic session in a private tatami room. Afternoon: mindful cultural experience (choice of Zen garden design, sado tea ceremony, or ikebana). Includes catered kaiseki bento lunch and evening drinks at a Pontocho riverside restaurant.",
        serviceType: "experience",
        categoryId: CAT.CORPORATE_SERVICES,
        price: "2200",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "pontocho",
        serviceImage: IMG.corporate,
        whatIncluded: ["Private tatami meeting room (4 hours)", "Facilitated strategic session", "Cultural experience (choice of 3)", "Kaiseki bento lunch", "Evening riverside drinks"],
        location: "Kyoto Station / Pontocho area",
        isFeatured: true,
        contentAffinityTags: ["corporate", "offsite", "executive"],
      },
      {
        serviceName: "Corporate Event Logistics Consultation",
        shortDescription: "90-min planning consultation for your Kyoto corporate event.",
        description: "Structured 90-minute video consultation covering venue options (ryokan, temple, modern hotel), cultural programme design, ground transport logistics, catering options, and budget planning for groups of 8–80. Delivered with a written brief and vendor shortlist.",
        serviceType: "consultation",
        categoryId: CAT.CORPORATE_SERVICES,
        price: "180",
        priceType: "fixed",
        deliveryMethod: "call",
        neighborhood: "kyoto-station",
        serviceImage: IMG.corporate,
        whatIncluded: ["90-min planning session", "Venue shortlist (5 options)", "Cultural programme outline", "Budget planning template", "Vendor contact list"],
        location: "Video call",
        contentAffinityTags: ["corporate", "planning", "consultation"],
      },
    ],
  },

  {
    email: "kyoto-teambuilding@traveloure.test",
    firstName: "Nao",
    lastName: "Fujiwara",
    businessName: "Zen & Team Japan",
    businessType: "Cultural Team-Building",
    mobile: "+81-75-557-0707",
    address: "Arashiyama Cultural Centre, Ukyo, Kyoto 616-0007",
    description: "Experiential team-building through authentic Kyoto cultural practices. From Zen meditation and tea ceremony to sake brewing and traditional craft workshops — designed for corporate groups.",
    website: "https://zen-and-team.traveloure.test",
    instagramLink: "https://instagram.com/zen_and_team_japan",
    photo1: IMG.zen,
    services: [
      {
        serviceName: "Zen Mindfulness Retreat (Half-Day)",
        shortDescription: "Zazen meditation, garden walk & mindful lunch at an Arashiyama temple.",
        description: "4-hour team mindfulness experience at a private Arashiyama temple. Certified Zen priest guides 45-minute zazen session, followed by a contemplative garden walk, mindful garden clean-up (sōji), and a shōjin ryōri (Buddhist plant-based) lunch. Up to 20 participants. Research shows Zen practices measurably reduce team burnout.",
        serviceType: "experience",
        categoryId: CAT.CULTURAL_EDUCATIONAL,
        price: "280",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "arashiyama",
        serviceImage: IMG.zen,
        whatIncluded: ["Zazen session with Zen priest", "Contemplative garden walk", "Temple garden sōji (cleaning)", "Shōjin ryōri lunch", "Mindfulness worksheet"],
        location: "Arashiyama, Kyoto",
        isFeatured: true,
        contentAffinityTags: ["corporate", "teambuilding", "zen"],
      },
      {
        serviceName: "Sado Tea Ceremony Team Workshop",
        shortDescription: "Collaborative matcha preparation — learn to make and serve tea as a team.",
        description: "2-hour sado (tea ceremony) team workshop in a licensed Urasenke-affiliated tearoom. Participants learn chakin (whisk) technique, tatami etiquette, and take turns serving each other. Builds attention, patience, and cross-cultural appreciation. Up to 16 participants. Vegetarian wagashi sweets included.",
        serviceType: "experience",
        categoryId: CAT.CULTURAL_EDUCATIONAL,
        price: "180",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "higashiyama",
        serviceImage: IMG.zen,
        whatIncluded: ["2-hour tea ceremony workshop", "Urasenke-affiliated tearoom", "Matcha whisk instruction", "Traditional wagashi sweets", "Certificate of participation"],
        location: "Higashiyama, Kyoto",
        isFeatured: true,
        contentAffinityTags: ["corporate", "teambuilding", "culture"],
      },
      {
        serviceName: "Nishijin Weaving & Craft Workshop",
        shortDescription: "Hands-on traditional Nishijin textile weaving for corporate groups.",
        description: "3-hour Nishijin-ori (silk weaving) workshop in a 4th-generation weaving studio. Participants create a small obi sample on a traditional loom — a tactile lesson in craftsmanship, precision, and collaboration. Up to 12 participants. Finished samples kept as souvenirs.",
        serviceType: "experience",
        categoryId: CAT.CULTURAL_EDUCATIONAL,
        price: "220",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "nishijin",
        serviceImage: IMG.zen,
        whatIncluded: ["3-hour weaving workshop", "Traditional loom instruction", "Materials & thread", "Woven sample souvenir", "Studio tour"],
        location: "Nishijin, Kyoto",
        contentAffinityTags: ["corporate", "teambuilding", "craft"],
      },
      {
        serviceName: "Fushimi Sake Brewery Corporate Tasting",
        shortDescription: "Private tour of a Fushimi sake brewery with guided tasting for teams.",
        description: "2.5-hour private tour of a 200-year-old Fushimi sake brewery: production hall, fermentation tanks, and aging cellar, followed by a guided tasting of 6 premium sake styles (junmai, ginjo, daiginjo) with a traditional kaiseki appetizer. Up to 20 participants.",
        serviceType: "experience",
        categoryId: CAT.CULTURAL_EDUCATIONAL,
        price: "200",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "fushimi",
        serviceImage: IMG.zen,
        whatIncluded: ["2.5-hour brewery tour", "6-sake guided tasting", "Traditional appetizer", "Sake pairing notes", "Exclusive purchase access"],
        location: "Fushimi, Kyoto",
        contentAffinityTags: ["corporate", "sake", "teambuilding"],
      },
    ],
  },

  {
    email: "kyoto-interpreter@traveloure.test",
    firstName: "Satoshi",
    lastName: "Ono",
    businessName: "Kansai Business Language",
    businessType: "Business Interpretation & Translation",
    mobile: "+81-75-558-0808",
    address: "Kawaramachi Business Centre, Nakagyo, Kyoto 604-0000",
    description: "JAIS-certified business interpreters and translators serving international companies operating in Kyoto and the Kansai region. Specialising in manufacturing, hospitality, and tech sectors.",
    website: "https://kansai-bizlang.traveloure.test",
    photo1: IMG.interpret,
    services: [
      {
        serviceName: "Business Meeting Interpretation (Full Day)",
        shortDescription: "Consecutive or simultaneous interpretation for business meetings — full day.",
        description: "Full-day (8 hours) business meeting interpretation in English–Japanese by a JAIS-certified interpreter. Covers consecutive interpretation for negotiations, factory tours, executive briefings, and site visits in Kyoto and surrounding Kansai prefectures. Half-day (4 hours) option available at 60% of rate.",
        serviceType: "specialty",
        categoryId: CAT.LANGUAGE_TRANSLATION,
        price: "680",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "kawaramachi-sanjo",
        serviceImage: IMG.interpret,
        whatIncluded: ["8-hour interpretation", "JAIS-certified interpreter", "Pre-meeting briefing (30 min)", "Travel within Kyoto included", "Meeting notes summary"],
        location: "Kyoto & Kansai region",
        isFeatured: true,
        contentAffinityTags: ["corporate", "interpretation", "business"],
      },
      {
        serviceName: "Conference & Event Interpretation",
        shortDescription: "Simultaneous interpretation equipment & team for conferences up to 200 people.",
        description: "Simultaneous interpretation service for conferences, product launches, and AGMs. Includes two interpreters (relay system for sessions over 4 hours), booth and headset rental for up to 200 delegates, and technical sound check. Available in English–Japanese and with French, German, or Mandarin as a third language.",
        serviceType: "specialty",
        categoryId: CAT.LANGUAGE_TRANSLATION,
        price: "2400",
        priceType: "variable",
        deliveryMethod: "in_person",
        neighborhood: "kyoto-station",
        serviceImage: IMG.interpret,
        whatIncluded: ["2 simultaneous interpreters", "Booth & headset equipment (200 seats)", "Sound check & tech support", "Third language on request"],
        location: "Kyoto Convention venues",
        contentAffinityTags: ["corporate", "conference", "interpretation"],
      },
      {
        serviceName: "Business Document Translation",
        shortDescription: "Certified Japanese–English business document translation.",
        description: "Professional certified translation of business documents: contracts, MOUs, technical manuals, financial reports, and marketing materials. Rate per 400 Japanese characters (≈200 English words). Certification included. Typical turnaround 3–5 business days; express 24-hour service available.",
        serviceType: "specialty",
        categoryId: CAT.LANGUAGE_TRANSLATION,
        price: "0.08",
        priceType: "variable",
        deliveryMethod: "async_messaging",
        neighborhood: "kawaramachi-sanjo",
        serviceImage: IMG.interpret,
        whatIncluded: ["Certified translation", "Proofreading by second translator", "PDF & Word delivery", "Express option available"],
        location: "Remote",
        contentAffinityTags: ["corporate", "translation", "documents"],
      },
    ],
  },

  {
    email: "kyoto-exec-transport@traveloure.test",
    firstName: "Kenji",
    lastName: "Watanabe",
    businessName: "Kansai Executive Transport",
    businessType: "Chauffeur & Executive Transport",
    mobile: "+81-75-559-0909",
    address: "Kyoto Station East Exit, Shimogyo, Kyoto 600-8214",
    description: "Premium chauffeur service for corporate executives visiting Kyoto and the Kansai region. English-speaking drivers, late-model luxury vehicles, and punctual airport transfers.",
    website: "https://kansai-exec-transport.traveloure.test",
    photo1: IMG.transport,
    services: [
      {
        serviceName: "Osaka KIX / Itami Airport Transfer",
        shortDescription: "Executive airport transfer to/from Kyoto in a luxury sedan.",
        description: "Door-to-door executive transfer between Kyoto hotel/venue and Osaka Kansai International (KIX) or Itami (ITM) airport. English-speaking driver, meet-and-greet with name sign at arrivals, complimentary mineral water. Late-model Mercedes-Benz E-Class or Toyota Alphard for groups.",
        serviceType: "experience",
        categoryId: CAT.RENTAL_SERVICES,
        price: "220",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "kyoto-station",
        serviceImage: IMG.transport,
        whatIncluded: ["Airport meet & greet", "Luggage handling", "English-speaking driver", "Mineral water", "Flight monitoring for delays"],
        location: "Kyoto ↔ Osaka KIX/ITM",
        isFeatured: true,
        contentAffinityTags: ["corporate", "transport", "airport"],
      },
      {
        serviceName: "Half-Day Executive Chauffeur (4 hours)",
        shortDescription: "4-hour private driver for meetings, site visits, or sightseeing.",
        description: "4-hour private chauffeur service within Kyoto city and surrounds. Ideal for back-to-back meetings, factory visits to Uji or Fushimi, or executive sightseeing. English-speaking driver with local knowledge. Additional hours at ¥8,000/hour.",
        serviceType: "experience",
        categoryId: CAT.RENTAL_SERVICES,
        price: "380",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "kyoto-station",
        serviceImage: IMG.transport,
        whatIncluded: ["4-hour private driver", "English-speaking chauffeur", "Fuel & expressway tolls", "Complimentary refreshments"],
        location: "Kyoto city & surrounds",
        isFeatured: false,
        contentAffinityTags: ["corporate", "transport", "chauffeur"],
      },
      {
        serviceName: "Full-Day Executive Chauffeur (8 hours)",
        shortDescription: "All-day private driver — Kyoto, Nara, Osaka, or Kansai region.",
        description: "8-hour private chauffeur service covering Kyoto and greater Kansai. Ideal for multi-site corporate visits across Kyoto, Nara, and Osaka in a single day. Luxury 7-seater Alphard for groups up to 6 executives. Driver provides local recommendations and cultural briefing en route.",
        serviceType: "experience",
        categoryId: CAT.RENTAL_SERVICES,
        price: "720",
        priceType: "fixed",
        deliveryMethod: "in_person",
        neighborhood: "kyoto-station",
        serviceImage: IMG.transport,
        whatIncluded: ["8-hour private chauffeur", "7-seater luxury vehicle", "Kyoto & Kansai coverage", "Fuel, expressway & parking tolls", "Cultural briefing en route"],
        location: "Kyoto & Kansai region",
        isFeatured: true,
        contentAffinityTags: ["corporate", "transport", "kansai"],
      },
    ],
  },
];

// ─── Seed function ────────────────────────────────────────────────────────

export async function seedPhaseDKyotoVendors(): Promise<{
  vendorsInserted: number;
  vendorsSkipped: number;
  servicesInserted: number;
}> {
  let vendorsInserted = 0;
  let vendorsSkipped = 0;
  let servicesInserted = 0;

  const catKeyToId = await resolveCategoryIds();

  const ALL_VENDORS = [...WEDDING_VENDORS, ...CORPORATE_VENDORS];

  for (const vendor of ALL_VENDORS) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, vendor.email))
      .limit(1);

    let userId: string;

    if (existing.length > 0) {
      userId = existing[0].id;
      vendorsSkipped++;
    } else {
      userId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        email: vendor.email,
        firstName: vendor.firstName,
        lastName: vendor.lastName,
        role: "service_provider",
        profileImageUrl: vendor.photo1,
        authProvider: "email",
      });

      await db.insert(serviceProviderForms).values({
        userId,
        businessName: vendor.businessName,
        name: `${vendor.firstName} ${vendor.lastName}`,
        email: vendor.email,
        mobile: vendor.mobile,
        country: "Japan",
        address: vendor.address,
        businessType: vendor.businessType,
        description: vendor.description,
        website: vendor.website ?? null,
        instagramLink: vendor.instagramLink ?? null,
        photo1: vendor.photo1,
        instantBooking: true,
        termsAndConditions: true,
        infoConfirmation: true,
        status: "approved",
      });

      vendorsInserted++;
    }

    for (const svc of vendor.services) {
      const resolvedCategoryId = catKeyToId[svc.categoryId];
      if (!resolvedCategoryId) {
        console.warn(`[Phase D] Skipping service "${svc.serviceName}" — category key "${svc.categoryId}" could not be resolved.`);
        continue;
      }

      const existingSvc = await db
        .select({ id: providerServices.id })
        .from(providerServices)
        .where(eq(providerServices.serviceName, svc.serviceName))
        .limit(1);

      if (existingSvc.length > 0) continue;

      await db.insert(providerServices).values({
        userId,
        serviceName: svc.serviceName,
        shortDescription: svc.shortDescription,
        description: svc.description,
        serviceType: svc.serviceType as any,
        categoryId: resolvedCategoryId,
        price: svc.price,
        priceType: svc.priceType as any,
        deliveryMethod: svc.deliveryMethod as any,
        neighborhood: svc.neighborhood,
        serviceImage: svc.serviceImage,
        whatIncluded: svc.whatIncluded,
        location: svc.location,
        isFeatured: svc.isFeatured ?? false,
        contentAffinityTags: svc.contentAffinityTags ?? [],
        approvalStatus: "approved",
        status: "active",
        revenueShareRate: "0.75",
        leadTimeHours: 48,
      });
      servicesInserted++;
    }
  }

  console.log(
    `[Phase D] Vendors: ${vendorsInserted} inserted, ${vendorsSkipped} already present. Services: ${servicesInserted} inserted.`,
  );
  return { vendorsInserted, vendorsSkipped, servicesInserted };
}

// ─── CLI entry ─────────────────────────────────────────────────────────────
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedPhaseDKyotoVendors()
    .then(({ vendorsInserted, vendorsSkipped, servicesInserted }) => {
      console.log(
        `[Phase D] Done: ${vendorsInserted} vendors + ${servicesInserted} services inserted (${vendorsSkipped} skipped).`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Phase D] Seed failed:", err);
      process.exit(1);
    });
}
