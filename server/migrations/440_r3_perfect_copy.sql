-- 440_r3_perfect_copy.sql
-- R3-15 (EXP-QA round 3 follow-ups; ruling, Nov 5, 2026; ledger 2026-11-05-r3-followups). DATA ONLY.
-- Removes "perfect" / "perfectly" from traveler-visible copy in travel_pulse_hidden_gems: the title (place_name)
-- and the description. No title holds the word. Six descriptions do, each a repo seed text that no later migration
-- rewrote (four from server/data/hidden-gems.json, two from server/seeds/popular-cities-content.seed.ts). Each sentence
-- loses the word, or the clause it heads, and is reflowed; no word is added. The seed sources carry the same new text,
-- so a fresh boot (seeds insert only absent rows, after migrations) writes it too.
-- Match is city + place_name + the exact stored description: a row is written only while it still holds the seed
-- text. Any other value is left alone, and a second run changes nothing. why_locals_love_it and every other table
-- are untouched.
-- DATA ONLY: no ALTER, no CHECK, no index, no DEFAULT, no DELETE. Expected rowcount per statement: 1 where the seed row
-- is present with its seed text, else 0; 0 on rerun. 6 rows on a database that holds every seed row.

UPDATE travel_pulse_hidden_gems
SET description = $n0$A serene park with panoramic views of Rome$n0$
WHERE city = $c0$Rome$c0$
  AND place_name = $p0$Giardino degli Aranci (Orange Garden)$p0$
  AND description = $o0$A serene park with panoramic views of Rome, perfect for a quiet escape$o0$;

UPDATE travel_pulse_hidden_gems
SET description = $n1$Stunning colorful arches$n1$
WHERE city = $c1$Jaipur$c1$
  AND place_name = $p1$Patrika Gate$p1$
  AND description = $o1$Stunning colorful arches, perfect for photography$o1$;

UPDATE travel_pulse_hidden_gems
SET description = $n2$Rome's largest public park, with stunning views.$n2$
WHERE city = $c2$Rome$c2$
  AND place_name = $p2$Villa Doria Pamphili$p2$
  AND description = $o2$Rome's largest public park, perfect for a quiet escape with stunning views.$o2$;

UPDATE travel_pulse_hidden_gems
SET description = $n3$Secluded beach accessible by boat$n3$
WHERE city = $c3$Goa$c3$
  AND place_name = $p3$Butterfly Beach$p3$
  AND description = $o3$Secluded beach accessible by boat, perfect for tranquility$o3$;

UPDATE travel_pulse_hidden_gems
SET description = $n4$The Manhattan Bridge framed down Washington Street with the Brooklyn Bridge in the background — arguably the most photographed street perspective in New York. Best at blue hour when the bridge lights come on.$n4$
WHERE city = $c4$New York$c4$
  AND place_name = $p4$DUMBO Brooklyn Bridge Viewpoint$p4$
  AND description = $o4$The Manhattan Bridge perfectly framed down Washington Street with the Brooklyn Bridge in the background — arguably the most photographed street perspective in New York. Best at blue hour when the bridge lights come on.$o4$;

UPDATE travel_pulse_hidden_gems
SET description = $n5$A keyhole in the Knights of Malta priory gate on the Aventine Hill frames a tunnel of cypress trees with St Peter's dome centred at the vanishing point. One of Rome's most secretive photo spots.$n5$
WHERE city = $c5$Rome$c5$
  AND place_name = $p5$Aventine Hill Orange Garden Keyhole$p5$
  AND description = $o5$A keyhole in the Knights of Malta priory gate on the Aventine Hill frames a perfect tunnel of cypress trees with St Peter's dome centred at the vanishing point. One of Rome's most secretive photo spots.$o5$;
