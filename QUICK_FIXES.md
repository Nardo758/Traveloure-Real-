# ⚡ Quick Fixes - Beta Launch Priority

**Top 5 Things to Fix Before Beta Launch**

These are the MUST-FIX items in priority order. Focus on these before anything else.

**Total Estimated Time:** 12-14 hours (1.5-2 days)

---

## 🔥 FIX #1: Configure Database Connection

**Priority:** 🔴 CRITICAL  
**Estimated Time:** 30 minutes  
**Impact:** BLOCKS EVERYTHING  
**Difficulty:** Easy

### Problem

Server won't start due to missing `DATABASE_URL` environment variable.

```
Error: DATABASE_URL must be set. Did you forget to provision a database?
```

### Fix

**Option A: Deploy to Replit (FASTEST)**

```bash
# 1. Push code to Replit
git push origin main

# 2. Replit automatically provisions PostgreSQL-16
# DATABASE_URL is auto-configured

# 3. Run migrations
npm run db:push

# 4. Start server
npm run dev

# ✅ Done in 5 minutes
```

**Option B: Local PostgreSQL**

```bash
# 1. Install PostgreSQL
sudo apt-get update && sudo apt-get install -y postgresql postgresql-contrib

# 2. Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE traveloure;
CREATE USER traveloure_user WITH PASSWORD 'secure_password_123';
GRANT ALL PRIVILEGES ON DATABASE traveloure TO traveloure_user;
ALTER DATABASE traveloure OWNER TO traveloure_user;
\q
EOF

# 3. Set environment variable
export DATABASE_URL="postgresql://traveloure_user:secure_password_123@localhost:5432/traveloure"

# 4. Run migrations
npm run db:push

# 5. Start server
npm run dev

# ✅ Done in 20-30 minutes
```

### Validation

```bash
# Test database connection
psql $DATABASE_URL -c "SELECT version();"

# Test server
npm run dev
# Should output: "Server running on port 5000"

# Test API endpoint
curl http://localhost:5000/api/experience-types
# Should return: JSON array (may be empty)
```

### Success Criteria

- ✅ Server starts without errors
- ✅ No DATABASE_URL error
- ✅ API endpoints respond
- ✅ Database connection pool active

---

## 🔥 FIX #2: Implement Content Studio Backend

**Priority:** 🔴 CRITICAL  
**Estimated Time:** 4-5 hours  
**Impact:** Core feature non-functional  
**Difficulty:** Medium

### Problem

Content Studio UI exists but cannot save/retrieve content. No backend endpoints exist.

**Missing:**
- `GET /api/expert/content` - List content
- `POST /api/expert/content` - Create content  
- `PATCH /api/expert/content/:id` - Update content
- `DELETE /api/expert/content/:id` - Delete content

### Fix

**Step 1: Add Database Schema (30 min)**

Create `shared/schema/expert-content.ts`:

```typescript
import { pgTable, serial, text, timestamp, integer, boolean, varchar, jsonb } from "drizzle-orm/pg-core";
import { users } from "./users";
import { createInsertSchema } from "drizzle-zod";

export const expertContent = pgTable("expert_content", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  contentType: varchar("content_type", { length: 50 }).notNull(),
  description: text("description").notNull(),
  destination: varchar("destination", { length: 255 }).notNull(),
  coverImageUrl: text("cover_image_url"),
  tags: jsonb("tags").$type<string[]>().default([]),
  instagramCaption: text("instagram_caption"),
  instagramHashtags: text("instagram_hashtags"),
  publishToInstagram: boolean("publish_to_instagram").default(false),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  instagramPostId: text("instagram_post_id"),
  views: integer("views").default(0),
  likes: integer("likes").default(0),
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertExpertContentSchema = createInsertSchema(expertContent).omit({
  id: true,
  userId: true,
  views: true,
  likes: true,
  createdAt: true,
  updatedAt: true,
});
```

Export in `shared/schema/index.ts`:
```typescript
export * from "./expert-content";
```

**Step 2: Add Storage Methods (1 hour)**

Add to `server/storage.ts`:

```typescript
// Get expert's content with optional status filter
async getExpertContent(userId: string, status?: string) {
  let query = db.select().from(expertContent)
    .where(eq(expertContent.userId, userId));
  
  if (status) {
    query = query.where(eq(expertContent.status, status));
  }
  
  return await query.orderBy(desc(expertContent.createdAt));
},

// Get single content item
async getExpertContentItem(id: number, userId: string) {
  const [content] = await db.select().from(expertContent)
    .where(and(
      eq(expertContent.id, id), 
      eq(expertContent.userId, userId)
    ));
  return content || null;
},

// Create content
async createExpertContent(data: any) {
  const [content] = await db.insert(expertContent)
    .values({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return content;
},

// Update content
async updateExpertContent(id: number, userId: string, data: any) {
  const [updated] = await db.update(expertContent)
    .set({ 
      ...data, 
      updatedAt: new Date() 
    })
    .where(and(
      eq(expertContent.id, id), 
      eq(expertContent.userId, userId)
    ))
    .returning();
  return updated || null;
},

// Delete content
async deleteExpertContent(id: number, userId: string) {
  await db.delete(expertContent)
    .where(and(
      eq(expertContent.id, id), 
      eq(expertContent.userId, userId)
    ));
},
```

**Step 3: Add API Routes (1 hour)**

Add to `server/routes.ts` (after Instagram routes, around line 100):

```typescript
// === Expert Content Studio Routes ===

// Get expert's content
app.get("/api/expert/content", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = (req.user as any).claims.sub;
  const status = req.query.status as string | undefined;
  const content = await storage.getExpertContent(userId, status);
  res.json(content);
}));

// Get single content item
app.get("/api/expert/content/:id", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = (req.user as any).claims.sub;
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    throw new ValidationError("Invalid content ID");
  }
  
  const content = await storage.getExpertContentItem(id, userId);
  
  if (!content) {
    throw new NotFoundError("Content not found");
  }
  
  res.json(content);
}));

// Create content
app.post("/api/expert/content", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = (req.user as any).claims.sub;
  
  const parseResult = insertExpertContentSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError(parseResult.error.errors[0].message);
  }
  
  const content = await storage.createExpertContent({
    ...parseResult.data,
    userId,
  });
  
  res.status(201).json(content);
}));

// Update content
app.patch("/api/expert/content/:id", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = (req.user as any).claims.sub;
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    throw new ValidationError("Invalid content ID");
  }
  
  const parseResult = insertExpertContentSchema.partial().safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError(parseResult.error.errors[0].message);
  }
  
  const updated = await storage.updateExpertContent(id, userId, parseResult.data);
  
  if (!updated) {
    throw new NotFoundError("Content not found");
  }
  
  res.json(updated);
}));

// Delete content
app.delete("/api/expert/content/:id", isAuthenticated, asyncHandler(async (req, res) => {
  const userId = (req.user as any).claims.sub;
  const id = parseInt(req.params.id);
  
  if (isNaN(id)) {
    throw new ValidationError("Invalid content ID");
  }
  
  await storage.deleteExpertContent(id, userId);
  res.status(204).send();
}));
```

**Step 4: Update Frontend (1 hour)**

Update `client/src/pages/expert/content-studio.tsx`:

Replace mock data queries with real API calls:

```typescript
// Remove mockContent array

// Replace with real query
const { data: contentList = [], isLoading, error } = useQuery({
  queryKey: ["expert-content"],
  queryFn: async () => {
    const res = await apiRequest("/api/expert/content");
    if (!res.ok) throw new Error("Failed to fetch content");
    return res.json();
  },
});

// Create mutation
const createMutation = useMutation({
  mutationFn: async (data: ContentFormData) => {
    const res = await apiRequest("/api/expert/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to create content");
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["expert-content"] });
    toast({ title: "Content created successfully!" });
    setIsCreateDialogOpen(false);
  },
  onError: (error) => {
    toast({ 
      title: "Error creating content", 
      description: error.message,
      variant: "destructive" 
    });
  },
});

// Update mutation
const updateMutation = useMutation({
  mutationFn: async ({ id, data }: { id: number; data: Partial<ContentFormData> }) => {
    const res = await apiRequest(`/api/expert/content/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update content");
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["expert-content"] });
    toast({ title: "Content updated successfully!" });
    setIsEditDialogOpen(false);
  },
});

// Delete mutation
const deleteMutation = useMutation({
  mutationFn: async (id: number) => {
    const res = await apiRequest(`/api/expert/content/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete content");
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["expert-content"] });
    toast({ title: "Content deleted successfully!" });
  },
});
```

**Step 5: Test (1 hour)**

```bash
# Run migrations
npm run db:push

# Restart server
npm run dev

# Test create
curl -X POST http://localhost:5000/api/expert/content \
  -H "Cookie: session=..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Content",
    "contentType": "travel-guide",
    "description": "Test description",
    "destination": "Paris",
    "status": "draft"
  }'

# Test list
curl http://localhost:5000/api/expert/content \
  -H "Cookie: session=..."

# Test update
curl -X PATCH http://localhost:5000/api/expert/content/1 \
  -H "Cookie: session=..." \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated Title"}'

# Test delete
curl -X DELETE http://localhost:5000/api/expert/content/1 \
  -H "Cookie: session=..."
```

### Validation

- ✅ Can create content via UI
- ✅ Content persists after page refresh
- ✅ Can edit existing content
- ✅ Can delete content
- ✅ Draft/published status works
- ✅ Content list shows all user's content

---

## 🔥 FIX #3: Create Database Seed Script

**Priority:** 🟡 HIGH  
**Estimated Time:** 4-5 hours  
**Impact:** Empty database = poor user experience  
**Difficulty:** Medium

### Problem

Database is empty after initial setup. Beta testers will see empty pages everywhere.

### Fix

**Create `scripts/seed-database.ts`:**

```typescript
import { db } from "../server/db";
import { 
  experienceTypes, 
  users, 
  providerServices, 
  serviceCategories,
  faqs,
  serviceSubcategories,
} from "@shared/schema";

async function seed() {
  console.log("🌱 Starting database seed...\n");

  // 1. Experience Types
  console.log("Creating experience types...");
  const expTypes = await db.insert(experienceTypes).values([
    {
      name: "Date Night",
      slug: "date-night",
      description: "Romantic experiences for couples",
      icon: "heart",
      featured: true,
    },
    {
      name: "Wedding",
      slug: "wedding",
      description: "Complete wedding planning services",
      icon: "rings",
      featured: true,
    },
    {
      name: "Honeymoon",
      slug: "honeymoon",
      description: "Romantic getaways for newlyweds",
      icon: "plane-heart",
      featured: true,
    },
    {
      name: "Bachelor/Bachelorette",
      slug: "bachelor-bachelorette",
      description: "Pre-wedding celebrations",
      icon: "party",
      featured: true,
    },
    {
      name: "Corporate Events",
      slug: "corporate-events",
      description: "Business events and team building",
      icon: "briefcase",
      featured: false,
    },
    {
      name: "Anniversary",
      slug: "anniversary",
      description: "Celebrate your love",
      icon: "heart-handshake",
      featured: false,
    },
    {
      name: "Birthday",
      slug: "birthday",
      description: "Memorable birthday celebrations",
      icon: "cake",
      featured: false,
    },
    {
      name: "Proposal",
      slug: "proposal",
      description: "Perfect proposal planning",
      icon: "ring",
      featured: true,
    },
    {
      name: "Group Travel",
      slug: "group-travel",
      description: "Travel with friends or family",
      icon: "users",
      featured: false,
    },
    {
      name: "Solo Adventure",
      slug: "solo-adventure",
      description: "Experiences for solo travelers",
      icon: "backpack",
      featured: false,
    },
  ]).returning();
  console.log(`✅ Created ${expTypes.length} experience types\n`);

  // 2. Service Categories
  console.log("Creating service categories...");
  const categories = await db.insert(serviceCategories).values([
    { name: "Photography", slug: "photography", categoryType: "service", description: "Professional photography services" },
    { name: "Videography", slug: "videography", categoryType: "service", description: "Video production services" },
    { name: "Accommodation", slug: "accommodation", categoryType: "service", description: "Hotels and lodging" },
    { name: "Dining", slug: "dining", categoryType: "service", description: "Restaurant reservations and experiences" },
    { name: "Transportation", slug: "transportation", categoryType: "service", description: "Travel and local transport" },
    { name: "Tours", slug: "tours", categoryType: "activity", description: "Guided tours and experiences" },
    { name: "Spa & Wellness", slug: "spa-wellness", categoryType: "activity", description: "Relaxation and wellness services" },
    { name: "Entertainment", slug: "entertainment", categoryType: "activity", description: "Shows, concerts, and events" },
    { name: "Adventure Sports", slug: "adventure-sports", categoryType: "activity", description: "Outdoor and adventure activities" },
    { name: "Cultural Experiences", slug: "cultural", categoryType: "activity", description: "Local culture and traditions" },
  ]).returning();
  console.log(`✅ Created ${categories.length} service categories\n`);

  // 3. Sample Experts
  console.log("Creating sample experts...");
  const sampleExperts = [
    {
      email: "sarah.paris@traveloure.com",
      firstName: "Sarah",
      lastName: "Martinez",
      role: "expert" as const,
      city: "Paris",
      country: "France",
      bio: "Luxury travel expert specializing in Parisian romance. 8 years of experience creating unforgettable moments.",
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400",
      phoneNumber: "+33 1 23 45 67 89",
      termsAcceptedAt: new Date(),
      privacyAcceptedAt: new Date(),
    },
    {
      email: "david.tokyo@traveloure.com",
      firstName: "David",
      lastName: "Chen",
      role: "expert" as const,
      city: "Tokyo",
      country: "Japan",
      bio: "Cultural experiences and hidden gems specialist. 12 years guiding travelers through Tokyo.",
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
      phoneNumber: "+81 3-1234-5678",
      termsAcceptedAt: new Date(),
      privacyAcceptedAt: new Date(),
    },
    {
      email: "maria.barcelona@traveloure.com",
      firstName: "Maria",
      lastName: "Garcia",
      role: "expert" as const,
      city: "Barcelona",
      country: "Spain",
      bio: "Wedding and event planning expert. Creating magical moments in Barcelona for 10+ years.",
      avatarUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400",
      phoneNumber: "+34 93 123 4567",
      termsAcceptedAt: new Date(),
      privacyAcceptedAt: new Date(),
    },
    {
      email: "james.london@traveloure.com",
      firstName: "James",
      lastName: "Williams",
      role: "expert" as const,
      city: "London",
      country: "United Kingdom",
      bio: "Corporate events and luxury experiences. 15 years in high-end travel planning.",
      avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400",
      phoneNumber: "+44 20 7123 4567",
      termsAcceptedAt: new Date(),
      privacyAcceptedAt: new Date(),
    },
    {
      email: "lisa.newyork@traveloure.com",
      firstName: "Lisa",
      lastName: "Anderson",
      role: "expert" as const,
      city: "New York",
      country: "United States",
      bio: "NYC specialist for all occasions. From romantic dinners to corporate events.",
      avatarUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400",
      phoneNumber: "+1 212-555-0123",
      termsAcceptedAt: new Date(),
      privacyAcceptedAt: new Date(),
    },
  ];
  
  const experts = await db.insert(users).values(sampleExperts).returning();
  console.log(`✅ Created ${experts.length} sample experts\n`);

  // 4. Sample Services
  console.log("Creating sample services...");
  const services = [];
  
  for (const expert of experts) {
    const photoCategory = categories.find(c => c.slug === "photography");
    const diningCategory = categories.find(c => c.slug === "dining");
    const toursCategory = categories.find(c => c.slug === "tours");
    
    services.push(
      {
        userId: expert.id,
        serviceName: `Romantic Dinner Experience in ${expert.city}`,
        shortDescription: "Curated romantic dinner at an exclusive restaurant",
        description: `Enjoy a personally curated romantic dining experience in the heart of ${expert.city}. I'll handle reservations, dietary preferences, and special touches to make your evening unforgettable.`,
        categoryId: diningCategory!.id,
        price: "150.00",
        currency: "USD",
        location: expert.city,
        status: "active",
        deliveryMethod: "in-person",
        deliveryTimeframe: "2-3 hours",
        averageRating: "4.8",
        reviewCount: 24,
      },
      {
        userId: expert.id,
        serviceName: `Professional Couple Photography in ${expert.city}`,
        shortDescription: "1-hour photoshoot at iconic locations",
        description: `Capture your special moments with a professional photographer. Includes 1-hour shoot, 50+ edited photos, and perfect Instagram spots in ${expert.city}.`,
        categoryId: photoCategory!.id,
        price: "250.00",
        currency: "USD",
        location: expert.city,
        status: "active",
        deliveryMethod: "in-person",
        deliveryTimeframe: "3-4 hours (including editing)",
        averageRating: "4.9",
        reviewCount: 18,
      },
      {
        userId: expert.id,
        serviceName: `Private ${expert.city} Walking Tour`,
        shortDescription: "3-hour guided tour of hidden gems",
        description: `Discover ${expert.city} like a local. I'll take you to hidden spots tourists never find, share local stories, and help you experience authentic culture.`,
        categoryId: toursCategory!.id,
        price: "120.00",
        currency: "USD",
        location: expert.city,
        status: "active",
        deliveryMethod: "in-person",
        deliveryTimeframe: "3 hours",
        averageRating: "4.7",
        reviewCount: 31,
      }
    );
  }
  
  await db.insert(providerServices).values(services);
  console.log(`✅ Created ${services.length} sample services\n`);

  // 5. FAQs
  console.log("Creating FAQs...");
  const faqData = [
    {
      category: "general",
      question: "What is Traveloure?",
      answer: "Traveloure connects you with local travel experts who curate personalized experiences for your special occasions - from romantic date nights to complete wedding planning.",
      displayOrder: 1,
      isActive: true,
    },
    {
      category: "booking",
      question: "How do I book a service?",
      answer: "Browse our marketplace, select a service you like, and click 'Book Now'. You'll be connected with the expert to discuss details and finalize your booking.",
      displayOrder: 2,
      isActive: true,
    },
    {
      category: "booking",
      question: "Can I customize a service?",
      answer: "Absolutely! Our experts specialize in customization. Message them through the platform to discuss your specific needs.",
      displayOrder: 3,
      isActive: true,
    },
    {
      category: "payment",
      question: "When do I pay?",
      answer: "Payment is processed when you confirm your booking. We hold funds securely and release them to the expert after your experience is completed.",
      displayOrder: 4,
      isActive: true,
    },
    {
      category: "payment",
      question: "What payment methods do you accept?",
      answer: "We accept all major credit cards, PayPal, and platform credits. Payment is processed securely through our platform.",
      displayOrder: 5,
      isActive: true,
    },
    {
      category: "cancellation",
      question: "What's your cancellation policy?",
      answer: "Cancellation policies vary by expert and service. Most offer full refunds if cancelled 48+ hours in advance. Check the specific service page for details.",
      displayOrder: 6,
      isActive: true,
    },
    {
      category: "experts",
      question: "How are experts vetted?",
      answer: "All experts go through a rigorous application process. We verify their credentials, experience, and reviews before approval.",
      displayOrder: 7,
      isActive: true,
    },
    {
      category: "experts",
      question: "Can I become an expert?",
      answer: "Yes! If you're a local travel expert, event planner, or service provider, apply through our 'Become an Expert' page.",
      displayOrder: 8,
      isActive: true,
    },
  ];
  
  await db.insert(faqs).values(faqData);
  console.log(`✅ Created ${faqData.length} FAQs\n`);

  console.log("🎉 Database seeded successfully!");
  console.log("\n📊 Summary:");
  console.log(`   - ${expTypes.length} experience types`);
  console.log(`   - ${categories.length} service categories`);
  console.log(`   - ${experts.length} expert accounts`);
  console.log(`   - ${services.length} services`);
  console.log(`   - ${faqData.length} FAQs`);
  console.log("\n✅ Ready for beta testing!");
}

seed()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
```

**Run the seed script:**

```bash
# Make sure database is configured
npm run db:push

# Run seed
tsx scripts/seed-database.ts
```

### Validation

```bash
# Check experience types
curl http://localhost:5000/api/experience-types
# Should return: 10 experience types

# Check experts
curl http://localhost:5000/api/experts
# Should return: 5 experts

# Check services
curl http://localhost:5000/api/provider-services
# Should return: 15 services

# Check categories
curl http://localhost:5000/api/service-categories
# Should return: 10 categories

# Check FAQs
curl http://localhost:5000/api/faqs
# Should return: 8 FAQs
```

---

## 🔥 FIX #4: Configure Instagram OAuth

**Priority:** 🟡 MEDIUM  
**Estimated Time:** 1 hour  
**Impact:** Content Studio Instagram feature broken  
**Difficulty:** Easy

### Problem

Instagram integration missing OAuth credentials.

### Fix

**Step 1: Create Meta App (30 min)**

1. Go to https://developers.facebook.com/apps
2. Click "Create App"
3. Select "Business" type
4. Name: "Traveloure Platform"
5. Add "Instagram Basic Display" product
6. Configure OAuth redirect URI:
   ```
   Production: https://traveloure.replit.app/api/instagram/callback
   Development: http://localhost:5000/api/instagram/callback
   ```
7. Save App ID and App Secret

**Step 2: Configure Environment (10 min)**

**In Replit Secrets:**
```
META_APP_ID=123456789012345
META_APP_SECRET=abcd1234567890abcd1234567890abcd
```

**Locally (.env):**
```bash
META_APP_ID=123456789012345
META_APP_SECRET=abcd1234567890abcd1234567890abcd
```

**Step 3: Test (20 min)**

```bash
# Restart server
npm run dev

# Navigate to Content Studio
# Click "Connect Instagram"
# Should redirect to Instagram OAuth
# Authorize app
# Should redirect back with success

# Check status
curl http://localhost:5000/api/instagram/status
# Should return: {"connected": true}
```

### Validation

- ✅ OAuth redirect works
- ✅ Can authorize app on Instagram
- ✅ Redirects back successfully
- ✅ Status shows connected
- ✅ Can publish test image

---

## 🔥 FIX #5: Add Environment Documentation

**Priority:** 🟢 LOW  
**Estimated Time:** 30 minutes  
**Impact:** Onboarding confusion  
**Difficulty:** Easy

### Problem

No documentation for required environment variables.

### Fix

**Create `.env.example`:**

```bash
# Database (Required)
DATABASE_URL="postgresql://user:password@localhost:5432/traveloure"

# Instagram Integration (Optional - for Content Studio)
META_APP_ID="your_meta_app_id"
META_APP_SECRET="your_meta_app_secret"

# AI Services (Optional - for AI features)
ANTHROPIC_API_KEY="your_anthropic_api_key"
OPENAI_API_KEY="your_openai_api_key"

# Google Maps (Optional - for location features)
VITE_GOOGLE_MAPS_API_KEY="your_google_maps_api_key"

# Transportation (Optional - for transport booking)
TWELVEGO_AFFILIATE_ID="your_affiliate_id"

# Session (Auto-configured)
SESSION_SECRET="auto_generated_in_production"

# Server (Auto-configured)
PORT="5000"
NODE_ENV="development"
```

**Update README.md:**

```markdown
## Environment Setup

1. Copy `.env.example` to `.env`:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

2. Fill in required variables:
   - `DATABASE_URL` - PostgreSQL connection string (REQUIRED)
   - Other variables are optional but recommended

3. Run database migrations:
   \`\`\`bash
   npm run db:push
   \`\`\`

4. Seed database (optional):
   \`\`\`bash
   tsx scripts/seed-database.ts
   \`\`\`

5. Start server:
   \`\`\`bash
   npm run dev
   \`\`\`
```

---

## 📊 Priority Summary

| Fix # | Name | Priority | Time | Blocks Beta? |
|-------|------|----------|------|--------------|
| 1 | Database Connection | 🔴 CRITICAL | 30 min | ✅ YES |
| 2 | Content Studio Backend | 🔴 CRITICAL | 5 hours | ✅ YES |
| 3 | Database Seed Data | 🟡 HIGH | 5 hours | ⚠️ PARTIAL |
| 4 | Instagram OAuth | 🟡 MEDIUM | 1 hour | ⚠️ PARTIAL |
| 5 | Environment Docs | 🟢 LOW | 30 min | ❌ NO |

**Total Time: 12 hours**

---

## 🎯 Recommended Workflow

### Day 1 - Morning (4 hours)
1. ✅ Fix #1: Database (30 min)
2. ✅ Fix #4: Instagram OAuth (1 hour)
3. ✅ Fix #5: Docs (30 min)
4. ✅ Start Fix #2: Content Studio (2 hours - schema + storage)

### Day 1 - Afternoon (4 hours)
1. ✅ Complete Fix #2: Content Studio (2 hours - routes + frontend)
2. ✅ Test Fix #2 (1 hour)
3. ✅ Start Fix #3: Seed script (1 hour)

### Day 2 - Morning (4 hours)
1. ✅ Complete Fix #3: Seed script (2 hours)
2. ✅ Run seed (30 min)
3. ✅ End-to-end testing (1.5 hours)

### Day 2 - Afternoon
1. ✅ Bug fixes from testing
2. ✅ Final validation
3. ✅ **READY FOR BETA** 🚀

---

## ✅ Success Checklist

Before declaring beta-ready:

### Fix #1: Database
- [ ] Server starts without errors
- [ ] Database connection active
- [ ] API endpoints respond
- [ ] No console errors

### Fix #2: Content Studio
- [ ] Can create content via UI
- [ ] Content persists after refresh
- [ ] Can edit/delete content
- [ ] All endpoints working

### Fix #3: Seed Data
- [ ] 10+ experts visible
- [ ] 20+ services available
- [ ] FAQs populated
- [ ] Experience types loaded

### Fix #4: Instagram
- [ ] OAuth flow works
- [ ] Can connect account
- [ ] Can publish test image
- [ ] Status displays correctly

### Fix #5: Documentation
- [ ] .env.example created
- [ ] README updated
- [ ] Setup instructions clear

---

**Once all 5 fixes are complete, proceed to full beta testing.**

**Estimated Beta Launch:** 2 days from start

**Good luck! 🚀**
