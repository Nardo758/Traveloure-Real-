# Traveloure Beta Launch Seed Data

## Overview

This directory contains comprehensive, production-quality seed data for the Traveloure Beta Launch. The data is designed to make the platform look active, professional, and ready for beta testers to explore.

## What's Included

### 1. Expert Profiles (15 Experts)
**Diverse Specializations:**
- 🇯🇵 **3 Asia Specialists**: Japan (Yuki Tanaka), Thailand (Maya Chen), Bali (Made Wirawan)
- 🇫🇷 **3 Europe Specialists**: Paris (Amélie Dubois), Italy (Marco Rossi), Greece (Sofia Papadopoulos)
- 🇲🇽 **3 Americas Specialists**: Mexico (Carlos Rivera), Peru (Lucía Mendoza), NYC (James Wilson)
- 🏔️ **2 Adventure Experts**: Iceland (Erik Andersen), Costa Rica (Gabriela Santos)
- 💎 **2 Luxury Experts**: Victoria Ashford, Alexandre Beaumont
- 🎒 **2 Budget/Backpacker Experts**: Sarah Mitchell, Ahmed Hassan

**Each Expert Has:**
- Realistic bio (2-3 paragraphs)
- Professional avatar
- Specializations and languages
- Years of experience (5-15 years)
- Response time
- Social media links
- Rating (4.7-4.9 stars)
- Review count (15-50)
- Completed bookings (30-120)

### 2. Expert Services (40+ Services)
**Service Types:**
- 📋 Trip Planning Consultations
- 🗺️ Custom Itineraries
- 🎯 Day Tours
- 🌟 Multi-day Experiences
- 💬 Virtual Consultations
- 🆘 Emergency Travel Support

**Price Ranges:**
- Budget: $50-100
- Mid-range: $150-500
- Premium: $1000-3000

**Each Service Includes:**
- Detailed description
- What's included list
- Requirements from travelers
- FAQs
- High-quality images (Unsplash)
- Reviews and ratings
- Booking count

### 3. Reviews & Ratings (70+ Reviews)
**Realistic Distribution:**
- 55% Excellent (5 stars)
- 30% Good (4 stars)
- 10% Average (3 stars)
- 5% Critical (2-3 stars)

**Review Features:**
- Diverse reviewer personas (couples, families, solo travelers)
- Detailed feedback (2-4 paragraphs)
- Trip context (dates, travel style)
- Verified badges (80%)
- Expert responses (for some)

### 4. Sample Bookings (45 Bookings)
**Status Mix:**
- 60% Completed
- 25% Confirmed
- 10% In Progress
- 5% Pending

**Each Booking Includes:**
- Tracking number
- Booking details
- Payment information
- Status timeline
- Platform fee breakdown

### 5. Influencer Content (15-20 Pieces)
**Content Types:**
- 📖 Travel Guides (3)
- 🍽️ Restaurant Reviews (3)
- 🏨 Hotel Reviews (2)
- 📸 Photo Galleries (2)
- 🎒 Packing Lists (2)
- 💰 Budget Breakdowns (2)
- 🗓️ Day Itineraries (1)
- ⚠️ Safety Tips (1)

**Content Features:**
- SEO-optimized titles
- Tied to expert profiles
- Realistic engagement metrics (views, saves)
- Platform tags (Instagram, YouTube, TikTok)
- Destination and experience tags
- Cover images
- Free or premium pricing ($5-15)

### 6. Sample Traveler Users (5 Users)
Realistic user profiles for testing bookings and reviews

## File Structure

```
seeds/
├── README.md                          # This file
├── beta-launch-data.ts                # Main seed script (experts, users, categories)
├── beta-data-extended.ts              # Expert services (40+ services)
├── beta-reviews-bookings.ts           # Reviews, bookings, influencer content
└── run-beta-seed.ts                   # Execution script
```

## How to Run

### Prerequisites
1. PostgreSQL database running
2. Database connection configured in `.env`
3. Node.js and npm installed

### Execution

```bash
# Navigate to project root
cd /home/leon/Traveloure-Platform

# Install dependencies (if not already done)
npm install

# Run the seed script
npm run seed:beta
```

Or run directly with tsx:

```bash
tsx server/seeds/run-beta-seed.ts
```

### What Happens:
1. ✅ Creates 15 expert user accounts
2. ✅ Creates approved expert applications
3. ✅ Creates 5 sample traveler accounts
4. ✅ Creates service categories
5. ✅ Creates 40+ expert services
6. ✅ Creates 70+ reviews and ratings
7. ✅ Creates 45 sample bookings
8. ✅ Creates 15-20 influencer content pieces

**Total Time:** ~30-45 seconds

## Test Credentials

### Expert Accounts

| Name | Email | Specialization | Password |
|------|-------|---------------|----------|
| Yuki Tanaka | yuki.tanaka@traveloure.com | Japan Expert | (Use Replit Auth) |
| Maya Chen | maya.chen@traveloure.com | Thailand Expert | (Use Replit Auth) |
| Amélie Dubois | amelie.dubois@traveloure.com | Paris Expert | (Use Replit Auth) |
| Marco Rossi | marco.rossi@traveloure.com | Italy Expert | (Use Replit Auth) |
| Sofia Papadopoulos | sofia.papadopoulos@traveloure.com | Greece Expert | (Use Replit Auth) |
| Erik Andersen | erik.andersen@traveloure.com | Iceland Expert | (Use Replit Auth) |
| Sarah Mitchell | sarah.mitchell@traveloure.com | Budget/Nomad Expert | (Use Replit Auth) |

### Traveler Accounts

| Name | Email | Password |
|------|-------|----------|
| Emma Johnson | emma.johnson@example.com | (Use Replit Auth) |
| Michael Brown | michael.brown@example.com | (Use Replit Auth) |
| Sophia Davis | sophia.davis@example.com | (Use Replit Auth) |

### Sample Use Cases

**Browse Experts:**
- Navigate to experts page
- See 15 diverse experts with ratings and specializations
- Filter by destination, specialty, or experience type

**View Expert Profiles:**
- Click any expert
- See detailed bio, services, reviews, and ratings
- View their influencer content (if applicable)

**Explore Services:**
- Browse 40+ services across all price ranges
- See detailed descriptions, inclusions, and requirements
- Read authentic reviews from past travelers

**Check Reviews:**
- 70+ realistic reviews across experts and services
- Mix of 5-star raves and constructive 3-4 star feedback
- Verified traveler badges
- Expert responses

**View Bookings (Admin):**
- See sample booking history
- Mix of completed, confirmed, and pending bookings
- Revenue analytics ready

**Influencer Content:**
- 15-20 high-quality content pieces
- Travel guides, food reviews, packing lists, budget breakdowns
- Realistic engagement metrics

## Data Quality Standards

All seed data follows these principles:

✅ **Realistic** - Could be real people and businesses
✅ **Diverse** - Different cultures, price points, travel styles
✅ **High-Quality** - Well-written, professional descriptions
✅ **Consistent** - Same experts across services and reviews
✅ **Engaging** - Makes users want to book and interact
✅ **SEO-Friendly** - Good titles, descriptions, tags

❌ **No lorem ipsum**
❌ **No "Test User 1, Test User 2"**
❌ **No broken image links**
❌ **No inconsistent data**
❌ **No low-quality descriptions**

## Image Sources

All images use high-quality sources:
- **Unsplash**: Free, high-resolution travel photography
- **Pravatar**: Professional avatar placeholders
- All images have public URLs (no local files)

### Image Categories:
- Destination photos (cities, landmarks)
- Expert profile avatars
- Service cover images
- Content imagery

## Database Tables Populated

The seed script populates these tables:

- `users` - Expert and traveler accounts
- `local_expert_forms` - Approved expert applications
- `expert_service_categories` - Service categories
- `expert_service_offerings` - Default service offerings
- `provider_services` - Individual expert services
- `review_ratings` - Expert reviews
- `service_reviews` - Service-specific reviews
- `service_bookings` - Sample bookings
- `influencer_curated_content` - Influencer content pieces

## Resetting/Rerunning

To reset and rerun the seed data:

```bash
# Drop and recreate database (careful!)
npm run db:reset

# Run migrations
npm run db:migrate

# Run seed script
npm run seed:beta
```

Or use the Drizzle Studio to manually delete data:

```bash
npm run db:studio
```

## Success Criteria

After seeding, the platform should:
- ✅ Look active and populated
- ✅ Have diverse, realistic data
- ✅ Support all user flows (browse, book, review)
- ✅ Show engagement (reviews, bookings, content)
- ✅ Be professional enough for screenshots/demos
- ✅ Represent different use cases (budget, luxury, adventure, etc.)

## Troubleshooting

### "Database connection failed"
- Check your `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Verify database exists

### "Foreign key constraint failed"
- Run migrations first: `npm run db:migrate`
- Check if tables exist

### "Duplicate key error"
- Data already exists
- Reset database or delete existing data first

### Script hangs/takes too long
- Check database connection
- Ensure no locks on tables
- Try running with fewer records first

## Next Steps

After seeding:
1. **Browse the platform** - See if everything looks good
2. **Test user flows** - Try booking, reviewing, browsing
3. **Take screenshots** - Get demos ready
4. **Invite beta testers** - Platform is ready!

## Support

For issues or questions:
- Check the code comments in each seed file
- Review database schema in `shared/schema.ts`
- Check console logs during execution

---

**Created for Traveloure Beta Launch** 🚀
Production-quality seed data for confident beta testing.
