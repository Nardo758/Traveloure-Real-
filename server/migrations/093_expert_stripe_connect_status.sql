-- Migration 093: Add stripe_connect_status to local_expert_forms
-- Tracks Stripe Connect onboarding separately from application approval status.
-- An expert can be approved (routing-eligible) without being payable.
-- Values: not_started | pending | complete
ALTER TABLE local_expert_forms
  ADD COLUMN IF NOT EXISTS stripe_connect_status varchar(20) DEFAULT 'not_started';
