/**
 * LG-2 (decision-maker rulings, Oct 18, 2026): what KIND of OpenStreetMap feature a place is. Pure, and the ONE home of
 * both readings (§18 rule 1):
 *
 *   · `kindFromName` — read from a place's NAME (a ward/city suffix, a street word, or a neighbourhood the spine
 *     carries). Ask 1's review uses it on the stored rows, which carry no OSM class; the matcher uses it as a second
 *     check beside the class.
 *   · `osmFeatureKind` — read from the OSM class and type Nominatim states with every jsonv2 answer (Ask 2). Only a
 *     feature that fits a visitable place is a `place`; a named pedestrian way is a `street` (accepted only when the
 *     item IS that street — the caller decides); everything else — administrative areas, neighbourhoods, road
 *     segments, unlisted classes — is `null` and never resolves a named place.
 *
 * NEGATIVE SPACE (§18d): a class list cannot know every tag. A visitable feature under an unlisted class is refused
 * (an honest unlocated stop), never guessed onto the map.
 */

/** Pure. Lower-case letters and digits only (macrons folded), so "Higashiyama-ku" and "higashiyama ku" compare equal. */
export function foldName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9぀-ヿ一-鿿]+/g, "");
}

// A ward, city, prefecture or smaller unit, in English or Japanese (-ku / -shi / -fu / -chō …, 区 / 市 / 府 / 町 / 村).
const ADMIN_NAME = /(^|[\s-])(ward|city|prefecture|town|village|district|ku|shi|fu|cho|machi|mura)$|[区市府町村]$/i;
// A street, road or lane, in English or Japanese (dōri / dori / kōji / koji / 通 / 小路).
const STREET_NAME = /(^|[\s-])(street|st\.?|road|rd\.?|avenue|ave\.?|lane|alley|dori|doori|koji|kouji)$|(dori|koji|kouji)$|通り?$|小路$/i;

/** Pure. The kind a place's name says it is, or null. A neighbourhood is a name the spine (`city_neighborhoods`) carries. */
export function kindFromName(
  name: string | null | undefined,
  neighbourhoodNames: ReadonlySet<string>,
): "admin" | "neighbourhood" | "street" | null {
  const raw = (name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();
  if (!raw) return null;
  if (neighbourhoodNames.has(foldName(raw))) return "neighbourhood";
  if (ADMIN_NAME.test(raw)) return "admin";
  if (STREET_NAME.test(raw)) return "street";
  return null;
}

/** Classes whose every feature is a place someone visits. */
const VISITABLE_CLASSES = new Set(["tourism", "amenity", "historic", "leisure", "natural"]);
/** A religious building or site. */
const RELIGIOUS_BUILDING_TYPES = new Set(["temple", "shrine", "church", "cathedral", "chapel", "mosque", "synagogue", "monastery", "religious", "pagoda"]);
/** A shop for food items. */
const FOOD_SHOP_TYPES = new Set([
  "bakery", "butcher", "cheese", "chocolate", "coffee", "confectionery", "dairy", "deli", "farm", "food", "frozen_food",
  "greengrocer", "health_food", "pasta", "pastry", "seafood", "spices", "tea", "wine", "alcohol", "beverages",
]);
/** A railway station. */
const STATION_TYPES = new Set(["station", "halt"]);
/** A way people walk along — a candidate only when the item IS that street. */
const PEDESTRIAN_WAY_TYPES = new Set(["pedestrian", "footway", "living_street", "steps", "path"]);

/**
 * Pure. The kind an OSM class/type pair says a feature is: `place` (visitable), `street` (a named pedestrian way), or
 * null (an administrative area, a neighbourhood, a road segment, or a class this list does not name). A missing class
 * is `unstated` — the caller then falls back to the name reading.
 */
export function osmFeatureKind(osmClass: string | null | undefined, osmType: string | null | undefined): "place" | "street" | "unstated" | null {
  const cls = (osmClass ?? "").trim().toLowerCase();
  const type = (osmType ?? "").trim().toLowerCase();
  if (!cls) return "unstated";
  if (VISITABLE_CLASSES.has(cls)) return "place";
  if (cls === "building" && RELIGIOUS_BUILDING_TYPES.has(type)) return "place";
  if (cls === "landuse" && type === "religious") return "place";
  if ((cls === "railway" || cls === "public_transport") && STATION_TYPES.has(type)) return "place";
  if (cls === "shop" && FOOD_SHOP_TYPES.has(type)) return "place";
  if (cls === "highway" && PEDESTRIAN_WAY_TYPES.has(type)) return "street";
  return null;
}
