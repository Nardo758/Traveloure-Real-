# Guest Invite System Integration Guide

**Quick start guide for integrating the guest invite system into Traveloure Platform**

---

## 🚀 Quick Start (5 Minutes)

### Step 1: Apply Database Migration

```bash
# Navigate to project root
cd /home/leon/clawd/Traveloure-Platform

# Apply migration
psql $DATABASE_URL -f server/migrations/001_guest_invite_system.sql

# Verify tables created
psql $DATABASE_URL -c "\dt event_invites"
```

### Step 2: Update Schema Exports

Add to `/shared/schema.ts`:

```typescript
// At the top of the file, add:
export * from "./guest-invites-schema";
```

### Step 3: Register Routes

In `/server/index.ts`, add:

```typescript
// Import
import { setupGuestInviteRoutes } from './routes/guest-invites';

// After other route registrations
setupGuestInviteRoutes(app);
```

### Step 4: Add Frontend Route

In `/client/src/App.tsx` (or your router config):

```typescript
import { GuestInvitePage } from './pages/GuestInvitePage';

// Add route
<Route path="/invite/:token" element={<GuestInvitePage />} />
```

### Step 5: Add Organizer Component to Event Page

In your event details/management page:

```typescript
import { GuestInviteManager } from '@/components/GuestInviteManager';

// Inside your event page component
<GuestInviteManager
  experienceId={experience.id}
  eventName={experience.title}
  eventDestination={experience.destination}
  eventDate={experience.startDate}
/>
```

---

## 📋 Detailed Integration Steps

### 1. Database Setup

#### Option A: Using Drizzle ORM (Recommended)

```bash
# Generate migration
npm run db:generate

# Push to database
npm run db:push
```

#### Option B: Manual SQL

```bash
psql $DATABASE_URL -f server/migrations/001_guest_invite_system.sql
```

#### Verify Tables

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%invite%';

-- Should show:
-- event_invites
-- guest_travel_plans
-- invite_templates
-- invite_send_log
```

---

### 2. Backend Integration

#### Update `server/index.ts`

```typescript
import { Express } from 'express';
import { setupGuestInviteRoutes } from './routes/guest-invites';

export function setupRoutes(app: Express) {
  // ... existing routes ...
  
  // Guest invite system
  setupGuestInviteRoutes(app);
  
  // ... rest of routes ...
}
```

#### Test Endpoints

```bash
# Health check
curl http://localhost:5000/api/events/test-id/invites

# Should return:
# {"invites": []}
```

---

### 3. Frontend Integration

#### Add Dependencies (if missing)

```bash
npm install --save lucide-react
```

#### Update Router

**React Router v6:**

```typescript
// In your main router file
import { GuestInvitePage } from './pages/GuestInvitePage';

<Route path="/invite/:token" element={<GuestInvitePage />} />
```

**Next.js (if using):**

```typescript
// pages/invite/[token].tsx
export { GuestInvitePage as default } from '@/pages/GuestInvitePage';
```

#### Add to Event Management Page

**Example integration in `EventDetailsPage.tsx`:**

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GuestInviteManager } from '@/components/GuestInviteManager';

export function EventDetailsPage() {
  const { experienceId } = useParams();
  const [experience, setExperience] = useState(null);
  
  return (
    <div>
      <h1>{experience?.title}</h1>
      
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Event Details</TabsTrigger>
          <TabsTrigger value="planning">Planning</TabsTrigger>
          <TabsTrigger value="invites">Guest Invites</TabsTrigger>
        </TabsList>
        
        <TabsContent value="details">
          {/* Event details */}
        </TabsContent>
        
        <TabsContent value="planning">
          {/* Planning tools */}
        </TabsContent>
        
        <TabsContent value="invites">
          <GuestInviteManager
            experienceId={experienceId}
            eventName={experience.title}
            eventDestination={experience.destination}
            eventDate={experience.startDate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

---

### 4. Environment Variables

Add to `.env`:

```bash
# Guest Invite System
APP_URL=https://traveloure.com  # Or http://localhost:5000 for dev
```

---

## 🧪 Testing

### Manual Testing Flow

#### 1. Create Test Event

```bash
# Via API or UI, create a test event
curl -X POST http://localhost:5000/api/user-experiences \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "experienceTypeId": "wedding",
    "title": "Test Wedding",
    "destination": "New York City",
    "startDate": "2025-03-10"
  }'
```

#### 2. Create Guest Invites

```bash
curl -X POST http://localhost:5000/api/events/YOUR_EXPERIENCE_ID/invites \
  -H "Content-Type: application/json" \
  -d '{
    "guests": [
      {"email": "guest1@test.com", "name": "Guest One"},
      {"email": "guest2@test.com", "name": "Guest Two"}
    ]
  }'
```

**Expected Response:**
```json
{
  "message": "Created 2 invites",
  "invites": [
    {
      "id": "...",
      "uniqueToken": "abc123xyz",
      "inviteLink": "http://localhost:5000/invite/abc123xyz"
    },
    ...
  ]
}
```

#### 3. Open Invite Link

Navigate to: `http://localhost:5000/invite/abc123xyz`

**Expected:**
- Welcome page with guest name
- Event details displayed
- "Get Started" button

#### 4. Complete Guest Flow

1. Click "Get Started"
2. Enter origin city (e.g., "Tampa, FL")
3. Click "Continue"
4. Fill RSVP form
5. Submit RSVP
6. See recommendations page (placeholder UI for now)

#### 5. Verify in Database

```sql
SELECT 
  guest_name, 
  guest_email, 
  origin_city, 
  rsvp_status, 
  view_count 
FROM event_invites;
```

---

## 🔧 Troubleshooting

### Issue: "Invite not found"

**Cause:** Invalid token or invite deleted

**Fix:**
- Verify token exists: `SELECT * FROM event_invites WHERE unique_token = 'abc123xyz'`
- Check for typos in URL
- Ensure migration ran successfully

---

### Issue: "Failed to create invites"

**Possible Causes:**
1. Missing `experience_id` in database
2. Database connection issue
3. Missing required fields

**Debug:**
```sql
-- Check if experience exists
SELECT * FROM user_experiences WHERE id = 'YOUR_ID';

-- Check database logs
SELECT * FROM pg_stat_activity;
```

---

### Issue: Components not rendering

**Possible Causes:**
1. Missing UI dependencies
2. Import path issues
3. shadcn/ui components not installed

**Fix:**
```bash
# Install missing dependencies
npm install @radix-ui/react-dialog
npm install @radix-ui/react-tabs
npm install @radix-ui/react-checkbox

# Or install all shadcn components
npx shadcn-ui@latest add dialog tabs checkbox input textarea label
```

---

## 🎨 Customization

### Change Invite URL Format

In `server/routes/guest-invites.ts`:

```typescript
// Change from:
inviteLink: `${process.env.APP_URL}/invite/${uniqueToken}`

// To:
inviteLink: `${process.env.APP_URL}/events/${experienceId}/guest/${uniqueToken}`
```

### Add Custom Invite Email Template

```typescript
const defaultTemplate = {
  subject: "You're Invited to {{event_name}}!",
  messageBody: `
    Hi {{guest_name}},
    
    You're invited to {{event_name}} in {{event_destination}} on {{event_date}}!
    
    Click here to RSVP and get personalized travel recommendations:
    {{invite_link}}
    
    We can't wait to celebrate with you!
    
    {{organizer_name}}
  `
};
```

### Customize Color Scheme

In `GuestInvitePage.tsx`:

```typescript
// Change gradient
<div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">

// To:
<div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
```

---

## 📊 Monitoring

### Analytics to Track

1. **Invite Metrics**
   ```sql
   -- Invite view rate
   SELECT 
     COUNT(*) as total_invites,
     COUNT(invite_viewed_at) as viewed,
     COUNT(invite_viewed_at)::float / COUNT(*) * 100 as view_rate
   FROM event_invites;
   ```

2. **RSVP Conversion**
   ```sql
   -- RSVP rate
   SELECT 
     rsvp_status,
     COUNT(*) as count
   FROM event_invites
   GROUP BY rsvp_status;
   ```

3. **Origin City Distribution**
   ```sql
   -- Most common origin cities
   SELECT 
     origin_city,
     COUNT(*) as guest_count
   FROM event_invites
   WHERE origin_city IS NOT NULL
   GROUP BY origin_city
   ORDER BY guest_count DESC;
   ```

---

## 🚀 Next Steps

### Phase 1: SERP API Integration

1. **Google Flights API**
   - Sign up: https://developers.google.com/flights
   - Get API key
   - Add to `server/services/flight-search.ts`

2. **Booking.com Affiliate API**
   - Sign up: https://www.booking.com/affiliate-program
   - Get credentials
   - Add to `server/services/hotel-search.ts`

3. **Update `/api/invites/:token/recommendations`**
   - Call flight search API when guest has origin city
   - Cache results in `guest_travel_plans.flight_options`
   - Return real data instead of placeholders

### Phase 2: Email Integration

1. **SendGrid Setup**
   ```bash
   npm install @sendgrid/mail
   ```

2. **Create Email Templates**
   - Use `invite_templates` table
   - Support variable interpolation

3. **Add Send Endpoint**
   ```typescript
   POST /api/invites/:inviteId/send
   ```

---

## 📚 Additional Resources

- [GUEST_INVITE_SYSTEM.md](./GUEST_INVITE_SYSTEM.md) - Full technical documentation
- [TEMPLATE_ANALYSIS_REPORT.md](./TEMPLATE_ANALYSIS_REPORT.md) - Context and requirements
- [shadcn/ui Docs](https://ui.shadcn.com/) - UI component library
- [Drizzle ORM Docs](https://orm.drizzle.team/) - Database ORM

---

## ✅ Integration Checklist

- [ ] Database migration applied
- [ ] Schema exported in `/shared/schema.ts`
- [ ] Routes registered in `/server/index.ts`
- [ ] Frontend route added (`/invite/:token`)
- [ ] `<GuestInviteManager />` added to event page
- [ ] Environment variables set (`APP_URL`)
- [ ] Dependencies installed (lucide-react, shadcn components)
- [ ] Test invite created successfully
- [ ] Guest can open invite link
- [ ] Guest can submit RSVP
- [ ] Organizer can view invite stats
- [ ] Analytics queries tested

---

**Integration Time:** ~30 minutes  
**Difficulty:** Easy to Moderate  
**Impact:** High (game-changing feature)

For questions or issues, refer to the main documentation in `GUEST_INVITE_SYSTEM.md`.
