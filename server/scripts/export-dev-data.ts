import { db } from '../db';
import { 
  travelPulseCalendarEvents,
  travelPulseCities,
  travelPulseHiddenGems,
  travelPulseLiveActivity,
  travelPulseHappeningNow
} from '../../shared/schema';

async function exportData() {
  const calendarEvents = await db.select().from(travelPulseCalendarEvents);
  const cities = await db.select().from(travelPulseCities);
  const hiddenGems = await db.select().from(travelPulseHiddenGems);
  const liveActivity = await db.select().from(travelPulseLiveActivity);
  const happeningNow = await db.select().from(travelPulseHappeningNow);

  console.log(JSON.stringify({
    calendarEvents,
    cities,
    hiddenGems,
    liveActivity,
    happeningNow
  }, null, 2));
}

exportData().catch(console.error);
