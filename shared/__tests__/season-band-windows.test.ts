/**
 * Season bands and admin windows (ledger `2026-10-23-season-bands-admin-windows`).
 *
 *   W1  hasWindow is true only when a market's window overlaps the band's months
 *   W2  a window that misses the band, or a market the band does not cover, leaves hasWindow false
 *       and the band is still returned
 *   W3  a month-edge window and a new-year window count when they overlap the months shown
 *   W4  a same-title city row replaces the country row for that city; a different title sits beside it
 *   W5  a blank city is a country row; a city outside the eight markets is omitted
 *
 * Run: npx tsx --test shared/__tests__/season-band-windows.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bandHasWindow, bandsInPeriod, composeBands, windowMonths, type BandRow, type SeasonBand } from "../events-calendar";

const MONTHS = windowMonths("2026-10");

function row(over: Partial<BandRow> & Pick<BandRow, "id" | "title" | "country">): BandRow {
  return {
    city: null,
    startMonth: 3,
    endMonth: 4,
    specificDate: null,
    isRecurring: true,
    year: null,
    ...over,
  };
}

describe("season band windows", () => {
  it("W1 hasWindow is true when a window overlaps the band, false when the market has none", () => {
    const march = [{ from: "2027-03-25", to: "2027-04-10" }];
    const hanami = ["2027-03", "2027-04"];
    const koyo = ["2026-10", "2026-11"];
    assert.equal(bandHasWindow(hanami, ["kyoto"], { kyoto: march }), true);
    assert.equal(bandHasWindow(koyo, ["kyoto"], { kyoto: march }), false, "a March window does not cover October");
    assert.equal(bandHasWindow(hanami, ["kyoto"], {}), false);
    assert.equal(bandHasWindow(hanami, ["kyoto"], { kyoto: [] }), false);
    assert.equal(bandHasWindow(hanami, ["kyoto"], { bogota: march }), false, "another market's window is not this band's");
  });

  it("W2 a windowless band is still returned, and a window does not hide one", () => {
    const bands = composeBands(
      [
        row({ id: "hanami", title: "Cherry blossom season (Hanami)", country: "Japan" }),
        row({ id: "koyo", title: "Autumn Foliage Season (Koyo)", country: "Japan", startMonth: 10, endMonth: 11 }),
      ],
      MONTHS,
      { kyoto: [{ from: "2027-03-25", to: "2027-04-10" }] },
    );
    const hanami = bands.find((b) => b.id === "hanami");
    const koyo = bands.find((b) => b.id === "koyo");
    assert.ok(hanami && koyo, "both bands are returned");
    assert.equal(hanami!.hasWindow, true);
    assert.equal(koyo!.hasWindow, false);
    assert.deepEqual(koyo!.months, ["2026-10", "2026-11"], "no window keeps the whole months");
    assert.equal(koyo!.span, "October and November");
    const listed = bandsInPeriod(bands, "2026-10-01", "2026-10-31").map((b) => b.id);
    assert.deepEqual(listed, ["koyo"], "the windowless band still shows in its month");
    const windowed: SeasonBand = { ...hanami!, hasWindow: true };
    assert.equal(bandsInPeriod([windowed], "2027-03-01", "2027-03-31").length, 1, "a window does not drop the band from its month");
  });

  it("W3 a window across a month edge or the new year overlaps the months it touches", () => {
    const edge = composeBands(
      [row({ id: "hanami", title: "Cherry blossom season (Hanami)", country: "Japan" })],
      MONTHS,
      { kyoto: [{ from: "2027-03-25", to: "2027-04-02" }] },
    );
    assert.equal(edge[0].hasWindow, true, "March 25–April 2 overlaps both months of the band");

    const year = composeBands(
      [row({ id: "wrap", title: "New year season", country: "Japan", startMonth: 12, endMonth: 2 })],
      MONTHS,
      { kyoto: [{ from: "2026-12-28", to: "2027-01-04" }] },
    );
    assert.equal(year[0].hasWindow, true);
    assert.deepEqual(year[0].months, ["2026-12", "2027-01", "2027-02"]);

    const otherYear = composeBands(
      [row({ id: "hanami", title: "Cherry blossom season (Hanami)", country: "Japan" })],
      MONTHS,
      { kyoto: [{ from: "2026-03-25", to: "2026-04-10" }] },
    );
    assert.equal(otherYear[0].hasWindow, false, "March 2026 is outside the months this calendar shows");
    assert.equal(otherYear.length, 1);
  });

  it("W4 a same-title city row overrides that city; a different title sits alongside", () => {
    const kyoto = composeBands(
      [
        row({ id: "country", title: "Cherry blossom season (Hanami)", country: "Japan" }),
        row({ id: "city", title: "  cherry   blossom season (hanami) ", country: "Japan", city: "Kyoto" }),
        row({ id: "beside", title: "Night illuminations", country: "Japan", city: "Kyoto", startMonth: 11, endMonth: 11 }),
        row({ id: "koyo", title: "Autumn Foliage Season (Koyo)", country: "Japan", startMonth: 10, endMonth: 11 }),
      ],
      MONTHS,
      { kyoto: [{ from: "2027-03-20", to: "2027-04-05" }] },
    );
    assert.equal(kyoto.find((b) => b.id === "country"), undefined, "Kyoto's row replaces the country row; Japan has no other market");
    const city = kyoto.find((b) => b.id === "city")!;
    assert.equal(city.place, "Kyoto");
    assert.deepEqual(city.marketKeys, ["kyoto"]);
    assert.equal(city.hasWindow, true, "the city row reads Kyoto's window");
    const beside = kyoto.find((b) => b.id === "beside")!;
    assert.deepEqual(beside.marketKeys, ["kyoto"]);
    assert.equal(beside.hasWindow, false, "November does not overlap the March window");
    const koyo = kyoto.find((b) => b.id === "koyo")!;
    assert.equal(koyo.place, "Japan");
    assert.deepEqual(koyo.marketKeys, ["kyoto"], "a different title leaves the country row in place");

    const india = composeBands(
      [
        row({ id: "country", title: "Monsoon", country: "India", startMonth: 6, endMonth: 8 }),
        row({ id: "mumbai", title: "Monsoon", country: "India", city: "Mumbai", startMonth: 6, endMonth: 8 }),
        row({ id: "goa", title: "Beach week", country: "India", city: "Goa", startMonth: 6, endMonth: 6 }),
      ],
      MONTHS,
      { mumbai: [{ from: "2027-06-01", to: "2027-06-15" }] },
    );
    const country = india.find((b) => b.id === "country")!;
    assert.deepEqual(country.marketKeys, ["goa", "jaipur"], "Mumbai is overridden; Goa's different title stays");
    assert.equal(country.hasWindow, false, "Mumbai's window does not mark the markets the country row still covers");
    assert.equal(india.find((b) => b.id === "mumbai")!.hasWindow, true);
    assert.deepEqual(india.find((b) => b.id === "goa")!.marketKeys, ["goa"]);
  });

  it("W5 a blank city is the country; a city outside the markets is omitted", () => {
    const bands = composeBands(
      [
        row({ id: "blank", title: "Golden Week", country: "Japan", city: "   ", startMonth: 5, endMonth: 5 }),
        row({ id: "osaka", title: "Osaka lights", country: "Japan", city: "Osaka", startMonth: 12, endMonth: 12 }),
      ],
      MONTHS,
      {},
    );
    assert.deepEqual(bands.map((b) => b.id), ["blank"]);
    assert.equal(bands[0].place, "Japan");
    assert.deepEqual(bands[0].marketKeys, ["kyoto"]);
    assert.equal(bands[0].hasWindow, false);
  });
});
