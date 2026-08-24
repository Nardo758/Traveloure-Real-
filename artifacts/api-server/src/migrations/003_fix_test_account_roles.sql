-- Migration: Fix Test Account Roles
-- Date: 2025-03-26
-- Description: Updates test accounts to have their intended roles instead of default 'user'
-- 
-- Run this migration on Replit:
--   1. Open the Replit shell
--   2. Connect to PostgreSQL: psql $DATABASE_URL
--   3. Run: \i server/migrations/003_fix_test_account_roles.sql
--   OR copy/paste the UPDATE statements below

-- Fix expert accounts
UPDATE users SET role = 'expert' WHERE email = 'test-travel-expert@traveloure.test';
UPDATE users SET role = 'expert' WHERE email = 'test-local-expert@traveloure.test';
UPDATE users SET role = 'expert' WHERE email = 'test-event-planner@traveloure.test';

-- Fix provider account
UPDATE users SET role = 'provider' WHERE email = 'test-provider@traveloure.test';

-- Fix executive assistant account
UPDATE users SET role = 'ea' WHERE email = 'test-ea@traveloure.test';

-- Verify the changes
SELECT email, role FROM users WHERE email LIKE 'test-%@traveloure.test';
