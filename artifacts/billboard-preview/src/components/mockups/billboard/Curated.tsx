import "./_group.css";

// Isolated copy of the updated curated-card presentation. These are the
// existing Kyoto fallback words, image paths and credits, not new live data.
const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const TILE_FRAME = "relative flex flex-col justify-end overflow-hidden rounded-[14px] p-3 text-white";
const TILE_GROUND = { background: "linear-gradient(160deg,#7C6A63,#1E3A5F)" };

const tiles = [
  {
    key: "weekend-away",
    image: "hero-generic-expert.jpg",
    headline: "Two days in Kyoto, walked with a local",
    creator: "Mico Medel",
    source: "https://www.pexels.com/photo/group-tour-guide-engaging-with-visitors-outdoors-37573881/",
  },
  {
    key: "early-start",
    image: "hero-fushimi-inari.jpg",
    headline: "Fushimi Inari at first light",
    creator: "G N",
    source: "https://www.pexels.com/photo/vibrant-torii-gates-pathway-in-fushimi-inari-kyoto-29537651/",
  },
  {
    key: "date-night",
    image: "hero-kyoto-temple.jpg",
    headline: "An evening under the Yasaka Pagoda",
    creator: "Alec Doualetas",
    source: "https://www.pexels.com/photo/kyoto-yasaka-pagoda-at-dusk-in-historic-district-36900988/",
  },
] as const;

const SLOT_LABELS = ["LOCAL EXPERT · KYOTO", "HIDDEN GEM", "BOOK ON TRAVELOURE"] as const;

function CuratedCard({ tile, large, slotLabel }: { tile: typeof tiles[number]; large: boolean; slotLabel: string }) {
  return (
    <div className={`${TILE_FRAME} pt-10 ${large ? "row-span-2 min-h-[330px]" : "min-h-[220px]"}`} style={TILE_GROUND} data-testid={`hero-billboard-${tile.key}`}>
      <img src={`/__billboard/images/${tile.image}`} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(13,33,55,.15) 0%,rgba(13,33,55,.9) 100%)" }} aria-hidden="true" />
      <span className="absolute left-2.5 top-2.5 z-10 rounded-[6px] bg-black/45 px-[7px] py-[3px] text-[9px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: EARN_MONO }}>
        Representative photo · Kyoto
      </span>
      <span className="relative z-10 mb-1 text-[9px] font-medium uppercase tracking-[0.1em] opacity-85" style={{ fontFamily: EARN_MONO }}>
        {slotLabel}
      </span>
      <b className={`relative z-10 font-semibold leading-tight ${large ? "text-[20px]" : "text-[15px]"}`} style={{ fontFamily: FRAUNCES }}>
        {tile.headline}
      </b>
      <div className="relative z-10 mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="inline-flex min-h-[36px] items-center rounded-[7px] px-2.5 text-[12px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" style={{ background: "var(--earn-coral-ink, #DF5852)" }}>
          Start this plan
        </button>
      </div>
      <a href={tile.source} target="_blank" rel="noopener noreferrer" className="relative z-10 mt-2 text-[9.5px] opacity-75 hover:underline" style={{ fontFamily: EARN_MONO }}>
        Photo: {tile.creator} · Pexels
      </a>
    </div>
  );
}

export function Curated() {
  return (
    <main className="billboard-review min-h-screen bg-[#FAFAF8] px-8 py-8">
      <div className="mx-auto max-w-[680px]">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#CF5750]" style={{ fontFamily: EARN_MONO }}>
          Kyoto fallback · production copy and credited photos
        </p>
        <h1 className="mb-5 text-2xl font-semibold" style={{ fontFamily: FRAUNCES }}>Kyoto fallback cards</h1>
        <div className="grid grid-cols-2 gap-2.5">
          {tiles.map((tile, index) => <CuratedCard key={tile.key} tile={tile} large={index === 0} slotLabel={SLOT_LABELS[index]} />)}
        </div>
      </div>
    </main>
  );
}