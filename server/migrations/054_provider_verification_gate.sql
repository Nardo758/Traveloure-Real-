-- Migration 054: Provider verification gate columns on users table
-- Adds providerVerificationStatus and backgroundCheckConfirmed so the
-- publish-gate logic can check whether a provider is cleared to go live
-- on categories that require background checks or elevated insurance bands.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS provider_verification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS background_check_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
