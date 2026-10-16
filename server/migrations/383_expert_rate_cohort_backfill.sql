-- FE-2 (ledger 2026-10-16-fe2-beta-cohort). HELD data migration: the backfill.
-- DATA ONLY. No schema change, so nothing to declare in shared/schema.ts.
--
-- Every already-approved expert in the three cohort roles (ruling 3: travel_expert,
-- local_expert, event_planner) joins the approval cohort, beta_2026. rate_locked_at is their
-- approval timestamp (ruling 5). The only record of an approval's time is the role_change
-- audit row the approval route writes (reason admin_expert_application_approved), so the latest
-- such row is used; with none, now(). The platform concierge account is never a cohort member.
--
-- Idempotent: an expert who already has a cohort is never touched, so a second run changes
-- nothing. No audit rows: access_audit_logs.actor_id is NOT NULL and a migration has no actor;
-- the ledger row records the backfill instead.

UPDATE users u
   SET rate_cohort = 'beta_2026',
       rate_locked_at = COALESCE(
         (SELECT max(a.created_at)
            FROM access_audit_logs a
           WHERE a.target_user_id = u.id
             AND a.action = 'role_change'
             AND a.metadata->>'reason' = 'admin_expert_application_approved'),
         now())
 WHERE u.rate_cohort IS NULL
   AND u.role IN ('travel_expert', 'local_expert', 'event_planner')
   AND EXISTS (SELECT 1 FROM local_expert_forms f WHERE f.user_id = u.id AND f.status = 'approved')
   AND u.id IS DISTINCT FROM (SELECT setting_value FROM platform_settings
                               WHERE setting_key = 'platform_concierge_user_id');
