-- V.1 — admin-switchable gate for public /p/{handle} storefront visibility on identity
-- verification (docs/backoffice/EXECUTION_ROADMAP.md task V.1).
--
-- WHY: the storefront (server/routes/storefront.routes.ts loadStorefront) currently 404s an
-- earner's public page only when they have zero admin-approved offerings. Gating public
-- visibility on identity verification too is filed for once V.2/V.3 sequence the verification
-- flows — flipping this switch must not brick today's dev/test storefronts before that lands, so
-- the gate defaults OFF and is admin-editable via the existing platform_settings admin list.
--
-- BEHAVIOR-NEUTRAL ON APPLY: loadStorefront treats an absent row / read error the same as "false"
-- (fail-open to today's behavior), so seeding this row changes no behavior — it only makes the
-- knob DISCOVERABLE/editable (mirrors the 067 feed-composition and 124 insurance seed pattern).
--
-- IDEMPOTENT: ON CONFLICT (setting_key) DO NOTHING — an admin-tuned value is never overwritten.
-- No schema/CHECK change → no publish-time push trap.

INSERT INTO platform_settings (setting_key, setting_value, description, updated_at)
VALUES
  (
    'storefront_require_verified',
    'false',
    'V.1 gate: when "true", the public /p/{handle} storefront (and its /api/storefront/:handle JSON) 404s for an earner unless they have a local_expert_forms or service_provider_forms row with identity_verification_status = ''verified''. Default "false" preserves today''s behavior (approved-offerings-only gate). Flip to "true" once V.2/V.3 verification-flow sequencing lands. Handle claim (PATCH /api/me/handle) and the owner''s own console are never gated by this setting — public visibility only.',
    NOW()
  )
ON CONFLICT (setting_key) DO NOTHING;
