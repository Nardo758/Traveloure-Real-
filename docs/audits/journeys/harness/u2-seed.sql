-- U2 local test data (audit only, local DB): one approved partner + one active Kyoto product so the
-- curated-content "Add to plan" card (curated-content-section.tsx) can render. Never run against prod.
INSERT INTO affiliate_partners (id, name, website_url, category, approval_status)
VALUES ('audit-partner-1', 'Audit Partner', 'https://example.test', 'tours', 'approved')
ON CONFLICT (id) DO NOTHING;
INSERT INTO affiliate_products (id, partner_id, name, product_url, city, country, location, category, is_active)
VALUES ('audit-product-1', 'audit-partner-1', 'Audit Kyoto Walking Tour', 'https://example.test/tour', 'Kyoto', 'Japan', 'Kyoto, Japan', 'tours', true)
ON CONFLICT (id) DO NOTHING;
