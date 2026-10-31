-- 426 — DATA ONLY. #1796 follow-up, item 7: the Kyoto copy #1804 (migration 421) left.
--
-- Yoshida Sanso Ryokan: "Imperial guesthouse" becomes "villa of the Higashi-Fushimi imperial
-- family" (the one approved rewording); "Nine suites", "kaiseki dinner served in your room" and
-- "no-one under 18" are removed. Philosopher's Path loses "arguably more beautiful than sakura
-- season" with its sentence; the pre-dawn hike loses "magical" and "candlelight"; the dawn tunnel's
-- "yours alone and lit like a film set" was its whole why_locals_love_it, so that column is cleared.
-- Ginkaku-ji is not touched: 421 already writes the approved admission and autumn lines.
-- Constants: shared/kyoto-1796-item7.ts (the seed writes the same values on a fresh boot).
--
-- HELD for Leon's comment before merge. The citation form is in
-- server/migrations/AUTHORING.md. This file does not carry that sentence.
--
-- Match is city + place_name + the stored value: a column is written only while it still holds
-- 421's output or the text before 421. Any other value is left alone. A second run changes nothing.
--
-- DATA ONLY: no ALTER, no CHECK, no index, no DEFAULT, no DELETE.

UPDATE travel_pulse_hidden_gems
SET description = $n0$A converted 1932 villa of the Higashi-Fushimi imperial family on the forested slopes of Mount Yoshida.$n0$
WHERE city ILIKE 'kyoto'
  AND place_name = $pl0$Yoshida Sanso Ryokan$pl0$
  AND description IN (
    $p00$A converted 1932 Imperial guesthouse on the forested slopes of Mount Yoshida. Nine suites, a private garden, and multi-course kaiseki dinner served in your room.$p00$
  );

UPDATE travel_pulse_hidden_gems
SET why_locals_love_it = $n1$The Japanese imperial hospitality tradition is alive here. No-one rushes you, pure Kyoto.$n1$
WHERE city ILIKE 'kyoto'
  AND place_name = $pl1$Yoshida Sanso Ryokan$pl1$
  AND why_locals_love_it IN (
    $p10$The Japanese imperial hospitality tradition is alive here. No-one rushes you, no-one under 18, pure Kyoto.$p10$
  );

UPDATE travel_pulse_hidden_gems
SET description = $n2$The canal-side path connecting Nanzen-ji to Ginkaku-ji.$n2$
WHERE city ILIKE 'kyoto'
  AND place_name = $pl2$Philosopher's Path Canal in Autumn$pl2$
  AND description IN (
    $p20$The canal-side path connecting Nanzen-ji to Ginkaku-ji. The red maple canopy over the water is arguably more beautiful than sakura season.$p20$,
    $p21$The canal-side path connecting Nanzen-ji to Ginkaku-ji. Less visited in autumn than spring, the red maple canopy over the water is arguably more beautiful than sakura season.$p21$
  );

UPDATE travel_pulse_hidden_gems
SET description = $n3$Arriving at 4:30am means walking the full summit trail in mist.$n3$
WHERE city ILIKE 'kyoto'
  AND place_name = $pl3$Fushimi Inari Pre-Dawn Hike$pl3$
  AND description IN (
    $p30$The 10,000 torii path is magical. Arriving at 4:30am means walking the full summit trail in mist and candlelight.$p30$,
    $p31$The 10,000 torii path is magical but overcrowded by 8am. Arriving at 4:30am means walking the full summit trail completely alone in mist and candlelight.$p31$
  );

UPDATE travel_pulse_hidden_gems
SET why_locals_love_it = NULL
WHERE city ILIKE 'kyoto'
  AND place_name = $pl4$Fushimi Inari Torii Tunnel at Dawn$pl4$
  AND why_locals_love_it IN (
    $p40$At dawn it is yours alone and lit like a film set.$p40$,
    $p41$By 9am this exact spot has 200 people queuing. At dawn it is yours alone and lit like a film set.$p41$
  );
