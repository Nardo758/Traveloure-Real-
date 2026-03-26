/**
 * PART 3: Reviews, Bookings, and Influencer Content
 * 
 * Creates:
 * - 50-80 Service Reviews (realistic, diverse)
 * - Sample Bookings with various statuses
 * - 15-20 Influencer Content Pieces
 */

import { db } from "../db";
import {
  users,
  reviewRatings,
  serviceReviews,
  serviceBookings,
  influencerCuratedContent,
  providerServices,
} from "@shared/schema";
import { eq } from "drizzle-orm";

// Review templates with realistic variety
const REVIEW_TEMPLATES = {
  excellent: [
    {
      rating: 5,
      templates: [
        "{name} exceeded all my expectations! {specific}. The attention to detail was incredible and {result}. I can't recommend them enough!",
        "Absolutely phenomenal experience with {name}. {specific}. Everything was perfect from start to finish. {result}. Worth every penny!",
        "I've worked with many travel experts, but {name} is truly exceptional. {specific}. {result}. Will definitely book again!",
        "10/10 experience! {name} {specific}. {result}. This made our trip unforgettable. Thank you!",
      ]
    }
  ],
  good: [
    {
      rating: 4,
      templates: [
        "Really enjoyed working with {name}. {specific}. {minor_issue}, but overall a great experience. {result}.",
        "Solid experience with {name}. {specific}. {result}. {minor_issue}, but I'd still recommend!",
        "{name} did a great job! {specific}. {result}. Only small suggestion: {minor_issue}.",
        "Very good service from {name}. {specific}. {minor_issue}, but everything else was excellent. {result}.",
      ]
    }
  ],
  average: [
    {
      rating: 3,
      templates: [
        "Mixed feelings about this. {specific}. {issue}. However, {positive}. Overall decent but room for improvement.",
        "Service was okay. {specific} was good, but {issue}. {positive} though. Average experience overall.",
        "{name} has potential but {issue}. {specific} was nice. {positive}. Could be better with some improvements.",
      ]
    }
  ],
  critical: [
    {
      rating: 2,
      templates: [
        "Unfortunately disappointed. {issue}. {specific}. {positive} was the only bright spot. Needs significant improvement.",
        "Expected more based on reviews. {issue}. {specific}. {positive}, but overall not what I hoped for.",
      ]
    }
  ]
};

// Review contexts for each service type
const REVIEW_CONTEXTS = {
  planning: {
    specific: [
      "The itinerary was so detailed and thoughtful",
      "Every recommendation was spot-on",
      "The restaurant reservations were amazing",
      "The custom map made navigation so easy",
      "All the insider tips proved invaluable",
      "The pacing of the itinerary was perfect",
    ],
    result: [
      "our trip was absolutely perfect",
      "we discovered places we never would have found",
      "we felt like locals instead of tourists",
      "it saved us so much time and stress",
      "we had zero issues during the entire trip",
      "everyone in our group was thrilled",
    ],
    minor_issue: [
      "Response time was a bit slow",
      "Could have included more budget options",
      "Wish there were more photos in the guide",
      "A few restaurants were closed when we went",
    ],
    issue: [
      "Some recommendations didn't match our style",
      "The itinerary felt rushed in places",
      "Several suggested places were touristy",
      "Communication could have been better",
    ],
    positive: [
      "the main attractions were well planned",
      "most recommendations were solid",
      "the expert responded eventually",
      "got us to the key sights",
    ]
  },
  consultation: {
    specific: [
      "The expert really listened to our needs",
      "Got so many insider tips in one call",
      "The personalized recommendations were gold",
      "Learned things I'd never find online",
      "The expert's local knowledge was incredible",
    ],
    result: [
      "we felt confident planning our trip",
      "it saved us hours of research",
      "we discovered amazing hidden gems",
      "the advice was worth 10x the price",
      "our trip was so much better because of this",
    ],
    minor_issue: [
      "Could have been longer",
      "Wished we covered more neighborhoods",
      "Some tips were a bit generic",
    ],
    issue: [
      "Felt rushed during the call",
      "Not as personalized as expected",
      "Some information was outdated",
    ],
    positive: [
      "the main advice was helpful",
      "got a few good restaurant suggestions",
      "the expert was friendly enough",
    ]
  },
  experience: {
    specific: [
      "Every moment was magical",
      "The group size was perfect",
      "Our guide's knowledge was incredible",
      "All logistics were handled flawlessly",
      "The accommodations were outstanding",
      "The included meals were delicious",
    ],
    result: [
      "it was the highlight of our entire trip",
      "we made memories that will last forever",
      "it exceeded every expectation",
      "we're already planning to come back",
      "everyone in our group raved about it",
    ],
    minor_issue: [
      "One day felt a bit rushed",
      "Weather wasn't great on one day",
      "WiFi at accommodations was spotty",
      "Wish it had been one day longer",
    ],
    issue: [
      "Some activities felt disorganized",
      "The pace was too rushed for our group",
      "Accommodations didn't match photos",
      "A couple activities were canceled last minute",
    ],
    positive: [
      "the guide tried their best",
      "most activities were enjoyable",
      "the main sights were covered",
    ]
  }
};

// Reviewer profiles (realistic names and personas)
const REVIEWERS = [
  { name: "Emma & Jake", type: "couple", style: "romantic" },
  { name: "The Martinez Family", type: "family", style: "family-friendly" },
  { name: "David P.", type: "solo", style: "adventure" },
  { name: "Sarah & Friends", type: "group", style: "party" },
  { name: "Linda M.", type: "solo", style: "cultural" },
  { name: "The Johnsons", type: "couple", style: "luxury" },
  { name: "Mike T.", type: "solo", style: "budget" },
  { name: "Jennifer & Tom", type: "couple", style: "honeymoon" },
  { name: "Robert W.", type: "solo", style: "photography" },
  { name: "The Chen Family", type: "family", style: "educational" },
  { name: "Amanda K.", type: "solo", style: "wellness" },
  { name: "Brian & Lisa", type: "couple", style: "foodie" },
  { name: "Jessica R.", type: "solo", style: "backpacker" },
  { name: "The Andersons", type: "family", style: "active" },
  { name: "Mark S.", type: "solo", style: "business" },
];

export async function seedReviewsAndBookings(
  experts: any[],
  travelers: any[],
  services: any[]
) {
  console.log("\n⭐ Creating Service Reviews...");
  
  const reviews: any[] = [];
  const reviewDistribution = {
    excellent: 0.55, // 55% 5-star
    good: 0.30,      // 30% 4-star
    average: 0.10,   // 10% 3-star
    critical: 0.05,  // 5% 2-star
  };

  // Generate 70 reviews across services
  for (let i = 0; i < 70; i++) {
    const service = services[Math.floor(Math.random() * services.length)];
    const traveler = travelers[Math.floor(Math.random() * travelers.length)];
    const expert = experts.find(e => e.id === service.userId);
    const reviewer = REVIEWERS[Math.floor(Math.random() * REVIEWERS.length)];
    
    // Determine rating tier
    const rand = Math.random();
    let ratingTier: 'excellent' | 'good' | 'average' | 'critical';
    if (rand < reviewDistribution.excellent) {
      ratingTier = 'excellent';
    } else if (rand < reviewDistribution.excellent + reviewDistribution.good) {
      ratingTier = 'good';
    } else if (rand < reviewDistribution.excellent + reviewDistribution.good + reviewDistribution.average) {
      ratingTier = 'average';
    } else {
      ratingTier = 'critical';
    }

    const tierData = REVIEW_TEMPLATES[ratingTier][0];
    const template = tierData.templates[Math.floor(Math.random() * tierData.templates.length)];
    const rating = tierData.rating;
    
    // Get context based on service type
    const serviceType = service.serviceType || 'planning';
    const context = REVIEW_CONTEXTS[serviceType as keyof typeof REVIEW_CONTEXTS] || REVIEW_CONTEXTS.planning;
    
    // Build review text
    let reviewText = template
      .replace('{name}', expert.firstName)
      .replace('{specific}', context.specific[Math.floor(Math.random() * context.specific.length)])
      .replace('{result}', context.result[Math.floor(Math.random() * context.result.length)])
      .replace('{minor_issue}', context.minor_issue ? context.minor_issue[Math.floor(Math.random() * context.minor_issue.length)] : '')
      .replace('{issue}', context.issue ? context.issue[Math.floor(Math.random() * context.issue.length)] : '')
      .replace('{positive}', context.positive ? context.positive[Math.floor(Math.random() * context.positive.length)] : '');

    // Add trip details paragraph
    const tripDetails = [
      `We used this service for our ${reviewer.style} trip in ${new Date().getFullYear()}.`,
      `Perfect for ${reviewer.type} travelers!`,
      `Booked this for our ${new Date().toLocaleString('default', { month: 'long' })} trip.`,
    ];
    reviewText += " " + tripDetails[Math.floor(Math.random() * tripDetails.length)];

    reviews.push({
      localExpertId: expert.id,
      reviewerId: traveler.id,
      review: reviewText,
      rating: rating,
      createdAt: randomPastDate(120),
      updatedAt: randomPastDate(30),
    });
  }

  // Insert reviews
  for (const review of reviews) {
    await db.insert(reviewRatings).values(review);
  }
  
  console.log(`  ✓ Created ${reviews.length} expert reviews`);
  
  // Create service-specific reviews
  console.log("\n💬 Creating Service Reviews...");
  
  const serviceReviewsData: any[] = [];
  
  for (let i = 0; i < 50; i++) {
    const service = services[Math.floor(Math.random() * services.length)];
    const traveler = travelers[Math.floor(Math.random() * travelers.length)];
    const reviewer = REVIEWERS[Math.floor(Math.random() * REVIEWERS.length)];
    
    // Similar rating distribution
    const rand = Math.random();
    let rating = 5;
    if (rand < 0.55) rating = 5;
    else if (rand < 0.85) rating = 4;
    else if (rand < 0.95) rating = 3;
    else rating = 2;
    
    const reviewTexts = [
      "Fantastic service! Everything was exactly as described. The expert went above and beyond to make sure we had everything we needed. Highly recommend!",
      "Great experience overall. Very professional and knowledgeable. A few minor hiccups but nothing major. Would book again.",
      "The service was good but could be better. Some recommendations didn't quite fit our style, but the main content was solid.",
      "Really impressive attention to detail. The expert clearly knows their stuff and it shows in every recommendation. Best money we've spent!",
      "Solid service. Got what we paid for. A couple things could have been clearer, but overall satisfied with the outcome.",
      "Absolutely loved this! Made our trip so much easier and more enjoyable. Can't thank the expert enough for all the insider tips.",
      "Decent service but felt a bit generic. Some good suggestions but also some misses. Average experience overall.",
      "Outstanding from start to finish! The expert was responsive, knowledgeable, and genuinely cared about making our trip perfect. 10/10!",
    ];
    
    serviceReviewsData.push({
      bookingId: crypto.randomUUID(), // Mock booking ID
      serviceId: service.id,
      providerId: service.userId,
      travelerId: traveler.id,
      rating: rating,
      reviewText: reviewTexts[Math.floor(Math.random() * reviewTexts.length)] + (rating === 5 ? " Exceeded all expectations!" : ""),
      isVerified: Math.random() > 0.2, // 80% verified
      createdAt: randomPastDate(90),
    });
  }
  
  console.log(`  ✓ Created ${serviceReviewsData.length} service reviews`);
  
  // Create sample bookings
  console.log("\n📅 Creating Sample Bookings...");
  
  const bookings: any[] = [];
  const bookingStatuses = [
    { status: 'completed', weight: 0.60 },
    { status: 'confirmed', weight: 0.25 },
    { status: 'in_progress', weight: 0.10 },
    { status: 'pending', weight: 0.05 },
  ];
  
  for (let i = 0; i < 45; i++) {
    const service = services[Math.floor(Math.random() * services.length)];
    const traveler = travelers[Math.floor(Math.random() * travelers.length)];
    
    // Determine status
    const rand = Math.random();
    let status = 'completed';
    let cumulative = 0;
    for (const s of bookingStatuses) {
      cumulative += s.weight;
      if (rand < cumulative) {
        status = s.status;
        break;
      }
    }
    
    const price = parseFloat(service.price);
    const platformFee = price * 0.15; // 15% platform fee
    const providerEarnings = price - platformFee;
    
    const createdAt = randomPastDate(180);
    const confirmedAt = status !== 'pending' ? new Date(createdAt.getTime() + 24 * 60 * 60 * 1000) : null;
    const completedAt = status === 'completed' ? new Date(createdAt.getTime() + 14 * 24 * 60 * 60 * 1000) : null;
    
    bookings.push({
      trackingNumber: `TR${10000 + i}`,
      serviceId: service.id,
      travelerId: traveler.id,
      providerId: service.userId,
      bookingDetails: {
        travelDates: {
          start: randomFutureDate(30, 90),
          end: randomFutureDate(35, 95),
        },
        travelers: Math.floor(Math.random() * 4) + 1,
        specialRequests: "Vegetarian meals preferred",
      },
      status: status,
      totalAmount: price.toFixed(2),
      platformFee: platformFee.toFixed(2),
      providerEarnings: providerEarnings.toFixed(2),
      stripePaymentIntentId: `pi_${crypto.randomUUID().substring(0, 24)}`,
      confirmedAt: confirmedAt,
      completedAt: completedAt,
      createdAt: createdAt,
      updatedAt: new Date(),
    });
  }
  
  // Insert bookings
  for (const booking of bookings) {
    await db.insert(serviceBookings).values(booking);
  }
  
  console.log(`  ✓ Created ${bookings.length} sample bookings`);
  
  return { reviews, serviceReviewsData, bookings };
}

// Influencer content pieces
export async function seedInfluencerContent(experts: any[]) {
  console.log("\n📱 Creating Influencer Content...");
  
  const influencerExperts = experts.filter(e => 
    e.email.includes('yuki') || 
    e.email.includes('maya') || 
    e.email.includes('amelie') ||
    e.email.includes('sofia') ||
    e.email.includes('lucia') ||
    e.email.includes('erik') ||
    e.email.includes('sarah')
  );
  
  const content: any[] = [
    // Yuki's Content (Japan)
    {
      influencerId: influencerExperts.find(e => e.email.includes('yuki'))?.id,
      title: "Ultimate Kyoto Temple Guide: 10 Sacred Sites You Can't Miss",
      description: "From the golden pavilion of Kinkaku-ji to the thousand torii gates of Fushimi Inari, discover Kyoto's most breathtaking temples. Includes best times to visit, photography tips, and cultural etiquette.",
      category: "Travel Guides",
      contentType: "guide",
      platform: "instagram",
      externalUrl: "https://instagram.com/p/example1",
      imageUrl: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800",
      destinations: ["Kyoto", "Japan"],
      experiences: ["Cultural Travel", "Photography", "Temples"],
      tags: ["japan", "kyoto", "temples", "culture", "photography"],
      viewCount: 12450,
      saveCount: 892,
      isFeatured: true,
      isActive: true,
      publishedAt: randomPastDate(45),
    },
    {
      influencerId: influencerExperts.find(e => e.email.includes('yuki'))?.id,
      title: "Tokyo Ramen Crawl: 7 Shops Locals Actually Eat At",
      description: "Forget tourist-trap ramen. These are the spots where Tokyo locals line up for hours. From rich tonkotsu to light shoyu, this guide covers the best bowls in the city.",
      category: "Food & Drink",
      contentType: "guide",
      platform: "youtube",
      externalUrl: "https://youtube.com/watch?v=example",
      imageUrl: "https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=800",
      destinations: ["Tokyo", "Japan"],
      experiences: ["Food Tours", "Local Experiences"],
      tags: ["tokyo", "ramen", "food", "japan", "authentic"],
      viewCount: 28900,
      saveCount: 1653,
      isFeatured: true,
      isActive: true,
      publishedAt: randomPastDate(30),
    },
    {
      influencerId: influencerExperts.find(e => e.email.includes('yuki'))?.id,
      title: "Japan Photography Spots: Seasonal Guide to Cherry Blossoms",
      description: "The best locations for cherry blossom photography across Japan. Includes lesser-known spots, optimal timing, and composition tips for that perfect shot.",
      category: "Photography",
      contentType: "guide",
      platform: "instagram",
      imageUrl: "https://images.unsplash.com/photo-1522383225653-ed111181a951?w=800",
      destinations: ["Japan", "Tokyo", "Kyoto"],
      experiences: ["Photography", "Nature"],
      tags: ["japan", "cherry-blossoms", "photography", "spring"],
      viewCount: 15670,
      saveCount: 2104,
      isActive: true,
      publishedAt: randomPastDate(90),
    },
    
    // Maya's Content (Thailand)
    {
      influencerId: influencerExperts.find(e => e.email.includes('maya'))?.id,
      title: "Bangkok Street Food Safety Guide: What to Eat, What to Skip",
      description: "Essential guide to navigating Bangkok's incredible street food scene safely. Learn which vendors to trust, food safety tips, and the dishes you absolutely must try.",
      category: "Food & Drink",
      contentType: "tips",
      platform: "tiktok",
      externalUrl: "https://tiktok.com/@example",
      imageUrl: "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=800",
      destinations: ["Bangkok", "Thailand"],
      experiences: ["Food Tours", "Street Food"],
      tags: ["bangkok", "street-food", "thailand", "safety", "foodie"],
      viewCount: 45300,
      saveCount: 3890,
      isFeatured: true,
      isActive: true,
      publishedAt: randomPastDate(20),
    },
    {
      influencerId: influencerExperts.find(e => e.email.includes('maya'))?.id,
      title: "Thailand Island Hopping Budget Breakdown: 10 Days Under $800",
      description: "Complete budget breakdown for 10 days of island hopping in Thailand. Includes accommodation, food, activities, and transportation costs with money-saving tips.",
      category: "Budget Travel",
      contentType: "guide",
      platform: "youtube",
      imageUrl: "https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?w=800",
      destinations: ["Thailand", "Phuket", "Krabi"],
      experiences: ["Budget Travel", "Island Hopping"],
      tags: ["thailand", "budget", "islands", "backpacking"],
      viewCount: 19850,
      saveCount: 1567,
      isActive: true,
      publishedAt: randomPastDate(60),
    },
    
    // Amélie's Content (Paris)
    {
      influencerId: influencerExperts.find(e => e.email.includes('amelie'))?.id,
      title: "Hidden Paris: 12 Secret Courtyards and Gardens Parisians Love",
      description: "Escape the tourist crowds and discover Paris's most charming hidden courtyards and secret gardens. These peaceful oases are where locals actually relax.",
      category: "Travel Guides",
      contentType: "guide",
      platform: "instagram",
      imageUrl: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800",
      destinations: ["Paris", "France"],
      experiences: ["Hidden Gems", "Local Experiences"],
      tags: ["paris", "hidden-gems", "secret-paris", "france"],
      viewCount: 32100,
      saveCount: 2847,
      isFeatured: true,
      isActive: true,
      publishedAt: randomPastDate(35),
    },
    {
      influencerId: influencerExperts.find(e => e.email.includes('amelie'))?.id,
      title: "Best Croissants in Paris: A Former Louvre Employee's Guide",
      description: "After 10 years working near the Louvre, I've tried every croissant in Paris. Here are the 8 bakeries that make the butter, flaky perfection you're dreaming of.",
      category: "Food & Drink",
      contentType: "guide",
      platform: "instagram",
      imageUrl: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800",
      destinations: ["Paris", "France"],
      experiences: ["Food Tours", "Bakeries"],
      tags: ["paris", "croissants", "bakery", "french-food"],
      viewCount: 41200,
      saveCount: 5102,
      isFeatured: true,
      isActive: true,
      publishedAt: randomPastDate(15),
    },
    
    // Sofia's Content (Greece)
    {
      influencerId: influencerExperts.find(e => e.email.includes('sofia'))?.id,
      title: "Santorini on a Budget: How to Do Luxury for Less",
      description: "Think Santorini is only for the wealthy? Think again. Here's how to experience the island's magic without breaking the bank—best viewpoints, affordable eats, and budget-friendly hotels.",
      category: "Budget Travel",
      contentType: "tips",
      platform: "instagram",
      imageUrl: "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800",
      destinations: ["Santorini", "Greece"],
      experiences: ["Budget Travel", "Islands"],
      tags: ["santorini", "greece", "budget", "islands"],
      viewCount: 23400,
      saveCount: 1923,
      isActive: true,
      publishedAt: randomPastDate(50),
    },
    
    // Erik's Content (Iceland)
    {
      influencerId: influencerExperts.find(e => e.email.includes('erik'))?.id,
      title: "Chasing Northern Lights: Complete Photography Guide for Iceland",
      description: "Everything you need to know about photographing the Aurora Borealis in Iceland. Camera settings, best locations, timing, and how to predict auroral activity.",
      category: "Photography",
      contentType: "guide",
      platform: "youtube",
      imageUrl: "https://images.unsplash.com/photo-1483347756197-71ef80e95f73?w=800",
      destinations: ["Iceland", "Reykjavik"],
      experiences: ["Photography", "Northern Lights", "Nature"],
      tags: ["iceland", "northern-lights", "aurora", "photography"],
      viewCount: 67800,
      saveCount: 8934,
      isFeatured: true,
      isActive: true,
      publishedAt: randomPastDate(25),
    },
    {
      influencerId: influencerExperts.find(e => e.email.includes('erik'))?.id,
      title: "Iceland Road Trip Itinerary: 7 Days Around the Ring Road",
      description: "The ultimate week-long Iceland road trip covering waterfalls, glaciers, hot springs, and black sand beaches. Includes daily breakdown, accommodation suggestions, and photography stops.",
      category: "Travel Guides",
      contentType: "itinerary",
      platform: "instagram",
      imageUrl: "https://images.unsplash.com/photo-1504893524553-b855bce32c67?w=800",
      destinations: ["Iceland"],
      experiences: ["Road Trips", "Adventure", "Photography"],
      tags: ["iceland", "road-trip", "ring-road", "adventure"],
      viewCount: 34500,
      saveCount: 4120,
      isFeatured: true,
      isActive: true,
      publishedAt: randomPastDate(40),
    },
    
    // Lucía's Content (Peru)
    {
      influencerId: influencerExperts.find(e => e.email.includes('lucia'))?.id,
      title: "Machu Picchu: Inca Trail vs. Alternative Treks Compared",
      description: "Detailed comparison of the Inca Trail, Salkantay Trek, and Lares Trek to Machu Picchu. Which is right for you? Includes difficulty levels, scenery, crowds, and cost.",
      category: "Adventure",
      contentType: "guide",
      platform: "youtube",
      imageUrl: "https://images.unsplash.com/photo-1526392060635-9d6019884377?w=800",
      destinations: ["Peru", "Machu Picchu", "Cusco"],
      experiences: ["Hiking", "Adventure", "Ancient Ruins"],
      tags: ["peru", "machu-picchu", "hiking", "inca-trail"],
      viewCount: 28900,
      saveCount: 2341,
      isFeatured: true,
      isActive: true,
      publishedAt: randomPastDate(55),
    },
    {
      influencerId: influencerExperts.find(e => e.email.includes('lucia'))?.id,
      title: "Packing List for Machu Picchu Trek: What I Actually Used",
      description: "After guiding 50+ Machu Picchu treks, here's what you really need to pack (and what you can leave at home). Includes gear recommendations and altitude sickness prevention.",
      category: "Packing & Gear",
      contentType: "tips",
      platform: "instagram",
      imageUrl: "https://images.unsplash.com/photo-1622481738883-4e1b35f8ac5e?w=800",
      destinations: ["Peru", "Machu Picchu"],
      experiences: ["Hiking", "Adventure"],
      tags: ["packing", "machu-picchu", "hiking", "gear"],
      viewCount: 15670,
      saveCount: 2890,
      isActive: true,
      publishedAt: randomPastDate(70),
    },
    
    // Sarah's Content (Digital Nomad/Budget)
    {
      influencerId: influencerExperts.find(e => e.email.includes('sarah'))?.id,
      title: "Best Digital Nomad Cities in 2024: Cost, WiFi, and Lifestyle Ranked",
      description: "After 7 years as a full-time digital nomad, these are the cities that offer the best value, reliable internet, and great quality of life. Complete breakdown with costs.",
      category: "Digital Nomad",
      contentType: "guide",
      platform: "youtube",
      imageUrl: "https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?w=800",
      destinations: ["Global", "Southeast Asia", "Europe"],
      experiences: ["Digital Nomad", "Remote Work"],
      tags: ["digital-nomad", "remote-work", "travel", "budget"],
      viewCount: 89300,
      saveCount: 12450,
      isFeatured: true,
      isActive: true,
      publishedAt: randomPastDate(10),
    },
    {
      influencerId: influencerExperts.find(e => e.email.includes('sarah'))?.id,
      title: "How I Travel 12 Months a Year on $25,000: Budget Breakdown",
      description: "Complete annual budget breakdown showing exactly how I afford full-time travel. Includes accommodation hacks, flight deals, food costs, and unexpected expenses.",
      category: "Budget Travel",
      contentType: "guide",
      platform: "tiktok",
      imageUrl: "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=800",
      destinations: ["Global"],
      experiences: ["Budget Travel", "Backpacking"],
      tags: ["budget-travel", "digital-nomad", "budget-breakdown"],
      viewCount: 156000,
      saveCount: 18900,
      isFeatured: true,
      isActive: true,
      publishedAt: randomPastDate(18),
    },
    {
      influencerId: influencerExperts.find(e => e.email.includes('sarah'))?.id,
      title: "Backpacking Southeast Asia: Complete 3-Month Itinerary Under $3K",
      description: "The ultimate guide to backpacking Thailand, Vietnam, Cambodia, and Laos on a tight budget. Includes day-by-day itinerary, accommodation tips, and must-see spots.",
      category: "Travel Guides",
      contentType: "itinerary",
      platform: "instagram",
      imageUrl: "https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?w=800",
      destinations: ["Southeast Asia", "Thailand", "Vietnam", "Cambodia"],
      experiences: ["Backpacking", "Budget Travel"],
      tags: ["southeast-asia", "backpacking", "budget", "itinerary"],
      viewCount: 42100,
      saveCount: 5670,
      isActive: true,
      publishedAt: randomPastDate(65),
    },
    {
      influencerId: influencerExperts.find(e => e.email.includes('sarah'))?.id,
      title: "Solo Female Travel Safety: Real Talk from 65 Countries",
      description: "Honest advice about solo female travel safety based on my experiences in 65 countries. What to watch out for, how to stay safe, and which places are most welcoming.",
      category: "Safety & Tips",
      contentType: "tips",
      platform: "youtube",
      imageUrl: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800",
      destinations: ["Global"],
      experiences: ["Solo Travel", "Female Travel"],
      tags: ["solo-travel", "female-travel", "safety", "tips"],
      viewCount: 73200,
      saveCount: 9845,
      isFeatured: true,
      isActive: true,
      publishedAt: randomPastDate(28),
    },
  ];
  
  // Insert content
  for (const piece of content) {
    if (piece.influencerId) {
      await db.insert(influencerCuratedContent).values({
        ...piece,
        createdAt: piece.publishedAt,
        updatedAt: new Date(),
      });
    }
  }
  
  console.log(`  ✓ Created ${content.length} influencer content pieces`);
  
  return content;
}

// Helper functions
function randomPastDate(daysAgo: number): Date {
  const now = new Date();
  return new Date(now.getTime() - Math.random() * daysAgo * 24 * 60 * 60 * 1000);
}

function randomFutureDate(minDays: number, maxDays: number): Date {
  const now = new Date();
  const days = minDays + Math.random() * (maxDays - minDays);
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export default { seedReviewsAndBookings, seedInfluencerContent };
