import { sql } from "drizzle-orm";
import { db } from "../../db";

/** Uses the existing admin accounts and outbox; no substitute traveler inbox. */
export async function alertJourneyFailure(source: string) {
  // A provider outage can also prevent the alert's delivery; keep it durable and
  // use ordinary outbox retries. The partial unique index makes escalation once.
  await db.execute(sql`INSERT INTO email_outbox
    (email_type,to_email,subject,html,text_body,status,attempt_count,max_attempts,metadata,created_at,updated_at)
    SELECT 'journey_admin_alert',COALESCE(notification_email,email),
      'Signup journey email needs attention',
      '<p>A signup journey email exhausted its retries. Check the admin email outbox and journey jobs.</p>',
      'A signup journey email exhausted its retries. Check the admin email outbox and journey jobs.',
      'pending',0,5,${JSON.stringify({ journeyAlertFor: source })}::jsonb,NOW(),NOW()
    FROM users WHERE role='admin' AND is_deleted IS NOT TRUE AND COALESCE(notification_email,email) IS NOT NULL
    ON CONFLICT DO NOTHING`);
}