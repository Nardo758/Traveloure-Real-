-- 246_dmo_raw_content_inventory_class.sql
--
-- Operation Trailhead LANE T4 (R-T1-e) — inventory class on the scraped-stub model.
--
-- Adds `inventory_class` to the PARENT dmo_raw_content (not the child dmo_extracted_places).
-- Placement rationale: the traveler discover read already gates on discover_page_visible /
-- status / country / city, all of which live on this parent row, so the class reads off the same
-- row with no extra join; and one value must govern the whole guide stub and every place extracted
-- from it (a child place can never carry a different inventory class than its guide). This mirrors
-- provider_services.source_type living on the sellable row rather than a child. Scraped/DMO content
-- is 'external' — a facts-and-links stub, NEVER a bookable platform service. The enum admits
-- 'provider'|'affiliate' so a later resolution-waterfall (T3) can re-class a stub in place.
--
-- ADDITIVE-NULLABLE-WITH-DEFAULT, NO DB CHECK — the migration-181/195/228 posture, chosen
-- deliberately to avoid the Replit publish-time CHECK trap documented in CLAUDE.md. The
-- 'external'|'provider'|'affiliate' shape is app-enforced (shared/discover-stub.ts
-- INVENTORY_CLASSES). Declared in shared/schema.ts per the publish-trap rule (an object the code
-- depends on must be in the schema or the deploy push is authoritative and will remove it).
--
-- Backfill: every existing row is scraped content, so all pre-existing rows become 'external'. The
-- column default handles rows inserted after this migration; the explicit UPDATE covers the
-- (already-present) rows and is a no-op if the DEFAULT already populated them.

ALTER TABLE dmo_raw_content
  ADD COLUMN IF NOT EXISTS inventory_class VARCHAR(20) NOT NULL DEFAULT 'external';

UPDATE dmo_raw_content
  SET inventory_class = 'external'
  WHERE inventory_class IS NULL OR inventory_class = '';

COMMENT ON COLUMN dmo_raw_content.inventory_class IS
  'Trailhead T4 inventory class: ''external'' (scraped/DMO facts-and-links stub, never bookable) | ''provider'' | ''affiliate'' (reserved for a later resolution-waterfall re-class). App-enforced, no DB CHECK. Backfilled to ''external''.';
