import "./_group.css";

// Isolated extraction of the three live-source tile presentations in
// client/src/components/landing/landing-hero.tsx. The values here are examples;
// nothing in this artifact is read by the live billboard or its dispatch API.
const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const TILE_FRAME = "relative flex flex-col justify-end overflow-hidden rounded-[14px] p-3 text-white";
const TILE_GROUND = { background: "linear-gradient(160deg,#7C6A63,#1E3A5F)" };

const examples = [
  {
    image: "hero-generic-expert.jpg",
    creator: "Mico Medel",
    source: "https://www.pexels.com/photo/group-tour-guide-engaging-with-visitors-outdoors-37573881/",
  },
  {
    image: "hero-fushimi-inari.jpg",
    creator: "G N",
    source: "https://www.pexels.com/photo/vibrant-torii-gates-pathway-in-fushimi-inari-kyoto-29537651/",
  },
  {
    image: "hero-kyoto-temple.jpg",
    creator: "Alec Doualetas",
    source: "https://www.pexels.com/photo/kyoto-yasaka-pagoda-at-dusk-in-historic-district-36900988/",
  },
] as const;

function Photo({ index }: { index: number }) {
  return (
    <>
      <img src={`/__billboard/images/${examples[index].image}`} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(13,33,55,.15) 0%,rgba(13,33,55,.9) 100%)" }} aria-hidden="true" />
      <span className="absolute left-2.5 top-2.5 z-10 rounded-[6px] bg-black/45 px-[7px] py-[3px] text-[9px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: EARN_MONO }}>
        Representative photo · Kyoto
      </span>
    </>
  );
}

function Credit({ index }: { index: number }) {
  return (
    <a href={examples[index].source} target="_blank" rel="noopener noreferrer" className="relative z-10 mt-2 text-[9.5px] opacity-75 hover:underline" style={{ fontFamily: EARN_MONO }}>
      Photo: {examples[index].creator} · Pexels
    </a>
  );
}

function ExpertCard() {
  return (
    <div className={`${TILE_FRAME} pt-10 row-span-2 min-h-[330px]`} style={TILE_GROUND}>
      <Photo index={0} />
      <span className="relative z-10 mb-1 text-[9px] font-medium uppercase tracking-[0.1em] opacity-85" style={{ fontFamily: EARN_MONO }}>
        LOCAL EXPERT · KYOTO
      </span>
      <b className="relative z-10 text-[20px] font-semibold leading-tight" style={{ fontFamily: FRAUNCES }}>
        Dawn at Fushimi Inari with Aiko
      </b>
      <div className="relative z-10 mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="inline-flex min-h-[36px] items-center rounded-[7px] px-2.5 text-[12px] font-semibold text-white" style={{ background: "var(--earn-coral-ink)" }}>
          Plan with @aiko <span> · $120</span>
        </button>
        <a href="#" onClick={(event) => event.preventDefault()} className="inline-flex min-h-[36px] items-center rounded-[7px] border border-white/70 bg-black/20 px-2.5 text-[12px] font-semibold text-white">
          View listing
        </a>
      </div>
      <Credit index={0} />
    </div>
  );
}

function GemCard() {
  return (
    <div className={`${TILE_FRAME} pt-10 min-h-[220px]`} style={TILE_GROUND}>
      <Photo index={1} />
      <span className="absolute right-2.5 top-2.5 z-10 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-[#1e3148]" aria-label="Sample score 87">87</span>
      <span className="relative z-10 mb-1 text-[9px] font-medium uppercase tracking-[0.1em] opacity-85" style={{ fontFamily: EARN_MONO }}>
        HIDDEN GEM
      </span>
      <b className="relative z-10 text-[15px] font-semibold leading-tight" style={{ fontFamily: FRAUNCES }}>Example Kyoto garden stop</b>
      <button type="button" className="relative z-10 mt-2 inline-flex min-h-[36px] items-center self-start rounded-[7px] px-2.5 text-[12px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" style={{ background: "var(--earn-coral-ink, #DF5852)" }}>
        Plan around this gem
      </button>
      <Credit index={1} />
    </div>
  );
}

function BookableCard() {
  return (
    <div className={`${TILE_FRAME} pt-10 min-h-[220px]`} style={TILE_GROUND}>
      <Photo index={2} />
      <span className="absolute right-2.5 top-2.5 z-10 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-[#1e3148]">$145</span>
      <span className="relative z-10 mb-1 text-[9px] font-medium uppercase tracking-[0.1em] opacity-85" style={{ fontFamily: EARN_MONO }}>
        BOOK ON TRAVELOURE
      </span>
      <b className="relative z-10 text-[15px] font-semibold leading-tight" style={{ fontFamily: FRAUNCES }}>Tea ceremony in a machiya</b>
      <a href="#" onClick={(event) => event.preventDefault()} className="relative z-10 mt-2 inline-flex min-h-[36px] items-center self-start rounded-[7px] px-2.5 text-[12px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" style={{ background: "var(--earn-coral-ink, #DF5852)" }}>
        Book now
      </a>
      <Credit index={2} />
    </div>
  );
}

export function Current() {
  return (
    <main className="billboard-review min-h-screen bg-[#FAFAF8] px-8 py-8">
      <div className="mx-auto max-w-[680px]">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#CF5750]" style={{ fontFamily: EARN_MONO }}>
          Isolated format preview · sample data only
        </p>
        <h1 className="mb-2 text-2xl font-semibold" style={{ fontFamily: FRAUNCES }}>Three real-source billboard card types</h1>
        <p className="mb-5 max-w-[620px] text-sm text-slate-600">
          These names, score, and prices are preview examples, not live listings or offers. The live page continues to use source gates and Kyoto fallback cards.
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <ExpertCard />
          <GemCard />
          <BookableCard />
        </div>
      </div>
    </main>
  );
}