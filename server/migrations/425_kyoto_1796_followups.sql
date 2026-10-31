-- 425 — DATA ONLY. Two #1796 follow-ups on Kyoto discover gems (items 8 and 9).
--
-- Item 8: the Yoshida Sanso Ryokan seeded card is hidden. hidden_at is stamped
-- only while it is NULL, so a card hidden earlier keeps its first timestamp. No
-- DELETE: the row comes back if the property joins as a provider. A fresh seed
-- stamps the same card hidden through kyotoGemSeedOverlay
-- (shared/kyoto-feed-cleanup.ts, KYOTO_GEMS_HIDDEN_BY_425).
--
-- Item 9: three Unsplash ids answer 404. Where a row still stores one of them,
-- image_url and image_credit are set to NULL and the card shows its typographic
-- face. No photo is substituted. A row migration 420 already rewrote stores a
-- different URL and is not matched.
--
-- HELD for Leon's comment before merge. The citation form is in
-- server/migrations/AUTHORING.md. This file does not carry that sentence.
--
-- Match is city + place_name (item 8) and city + the exact stored URL (item 9).
-- A second run changes nothing.
--
-- DATA ONLY: no ALTER, no CHECK, no index, no DEFAULT, no DELETE.

UPDATE travel_pulse_hidden_gems
SET hidden_at = now()
WHERE city ILIKE 'kyoto'
  AND place_name = 'Yoshida Sanso Ryokan'
  AND hidden_at IS NULL;

UPDATE travel_pulse_hidden_gems
SET image_url = NULL,
    image_credit = NULL
WHERE city ILIKE 'kyoto'
  AND image_url IN (
    'https://images.unsplash.com/photo-1548165892-cd6be85a7f69?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1580917922805-21d32edd27e3?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1601823984263-6ec76b4c8aaf?auto=format&fit=crop&w=800&q=80'
  );
