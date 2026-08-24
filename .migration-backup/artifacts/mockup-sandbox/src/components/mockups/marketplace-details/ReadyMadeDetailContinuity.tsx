import { useState } from "react";
import {
  ArrowLeft, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3,
  Eye, FileText, LockKeyhole, MapPin, Pencil, ShoppingBag, Sparkles,
  UserRound, X
} from "lucide-react";
import { ContinuityShell } from "./_shared/ContinuityShell";
import "./ReadyMadeDetailContinuity.css";

const listing = {
  title: "Kyoto in Bloom",
  city: "Kyoto, Japan",
  duration: "4 days",
  season: "Late March – early April",
  price: "$249.00",
  author: "Mika Tanaka",
  counts: ["4 planned days", "18 itinerary items", "9 activities", "5 food & dining"],
};

export function ReadyMadeDetailContinuity() {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);

  return (
    <ContinuityShell active="Marketplace">
      <div className="rmdc-page">
        <div className="tc-breadcrumb rmdc-breadcrumb">
          <button type="button"><ArrowLeft size={13} /> Marketplace</button><ChevronRight size={13} /><strong>Ready-Made Trips</strong><ChevronRight size={13} /><span>{listing.title}</span>
        </div>

        <section className="rmdc-intro">
          <div>
            <p className="rmdc-plan-type">Trip by a local · City itinerary</p>
            <h1>{listing.title}</h1>
            <p className="rmdc-deck">A thoughtful first pass through Kyoto, timed for blossom season and built around the places that reward a slower pace.</p>
          </div>
          <div className="rmdc-intro-side">
            <div className="rmdc-local"><span className="rmdc-avatar">M</span><span>Built by {listing.author}</span></div>
            <p className="rmdc-proof">Local perspective · fixed one-time price</p>
            <div style={{ position: "relative", marginTop: 10 }}>
              <button className="tc-secondary-button" type="button" onClick={() => setLanguageOpen(!languageOpen)}>EN <ChevronRight size={13} style={{ transform: "rotate(90deg)" }} /></button>
              {languageOpen && <div style={{ position: "absolute", right: 0, top: 42, zIndex: 2, minWidth: 120, padding: 5, border: "1px solid var(--tc-line)", borderRadius: 8, background: "#fff", boxShadow: "0 8px 20px rgba(20,43,69,.12)" }}>
                {["English", "Français", "日本語"].map((label) => <button type="button" key={label} onClick={() => setLanguageOpen(false)} style={{ display: "flex", width: "100%", justifyContent: "space-between", border: 0, padding: "8px", background: "transparent", color: "#344054", fontSize: 11 }}>{label}{label === "English" && <Check size={12} />}</button>)}
              </div>}
            </div>
          </div>
        </section>

        <figure className="rmdc-hero" aria-label="Stylized Kyoto route preview">
          <div className="rmdc-hero-main"><div className="rmdc-hero-copy"><span>Kyoto · Spring edition</span><strong>Four days with room to notice the details.</strong></div></div>
          <div className="rmdc-hero-art"><div className="rmdc-map-label"><span>Route preview</span><span>Kyoto</span></div><div className="rmdc-map"><i className="rmdc-map-pin one" /><i className="rmdc-map-pin two" /><i className="rmdc-map-pin three" /></div><div className="rmdc-map-lock"><LockKeyhole size={13} /> Stops unlock with purchase</div></div>
        </figure>

        <div className="rmdc-layout">
          <main className="rmdc-main">
            <section className="tc-card rmdc-card">
              <h2>Know what you’re buying</h2>
              <p className="rmdc-card-intro">A complete starting plan that becomes yours after checkout. Preview the shape here; the day-by-day stops stay private until you own it.</p>
              <div className="rmdc-facts">
                <div className="rmdc-fact"><strong><MapPin size={13} /> Kyoto</strong>Destination</div>
                <div className="rmdc-fact"><strong><CalendarDays size={13} /> {listing.duration}</strong>Planned length</div>
                <div className="rmdc-fact"><strong><Clock3 size={13} /> Flexible</strong>Start date</div>
                <div className="rmdc-fact"><strong><Sparkles size={13} /> Spring</strong>Best in {listing.season}</div>
              </div>
              <div className="rmdc-lock-row"><LockKeyhole size={16} /><span>Full stop names and timing are private before purchase.</span><button type="button" onClick={() => setPreviewOpen(true)}>Preview structure</button></div>
            </section>
            <section className="tc-card rmdc-card">
              <h2>What’s included</h2>
              <p className="rmdc-card-intro">Every item can be edited, re-dated, or booked from your own trip after purchase.</p>
              <div className="rmdc-facts">{listing.counts.map((count) => <div className="rmdc-fact" key={count}><strong>{count.split(" ")[0]}</strong>{count.substring(count.indexOf(" ") + 1)}</div>)}</div>
              <div className="rmdc-note" style={{ marginTop: 18 }}><ConciergeIcon /><p><strong>Includes 1 consultation + 1 revision.</strong> Request it from your Trip Slip after purchase. No consultation is scheduled before you buy.</p></div>
            </section>
          </main>
          <aside className="tc-card rmdc-buy-card">
            {purchased ? <div className="rmdc-owned"><strong><CheckCircle2 size={15} /> This trip is in your Trip Slip</strong>You own the editable plan now. Open it to change dates, stops, and notes.</div> : null}
            <p className="tc-eyebrow">One-time purchase</p>
            <h2>{purchased ? "Ready to make it yours" : "Start with Kyoto"}</h2>
            <div className="rmdc-price">{listing.price}</div><p className="rmdc-price-note">No recurring fee · local creator receives the listed price</p>
            <button className="tc-primary-button rmdc-buy" type="button" onClick={() => purchased ? undefined : setCheckoutOpen(true)}><ShoppingBag size={16} />{purchased ? "Trip added" : "Get this trip"}</button>
            <div className="rmdc-benefits"><span><Pencil size={14} />Edit every itinerary item</span><span><FileText size={14} />Keep it in your Trip Slip</span><span><UserRound size={14} />Ask Mika for one revision</span></div>
            <button className="tc-secondary-button rmdc-share" type="button" onClick={() => navigator.clipboard?.writeText("Kyoto in Bloom — Traveloure")}>Copy trip link</button>
          </aside>
        </div>

        {previewOpen && <div className="rmdc-overlay" role="dialog" aria-modal="true" aria-labelledby="preview-title"><div className="rmdc-dialog"><button className="rmdc-close" type="button" aria-label="Close preview" onClick={() => setPreviewOpen(false)}><X size={17} /></button><p className="tc-eyebrow">Private before purchase</p><h2 id="preview-title">A clear shape, not a spoiler</h2><p>The route and count are representative. The private plan reveals exact stops only after purchase.</p><ul className="rmdc-modal-list"><li><Eye size={14} />Day 1 · Orientation and a neighborhood walk</li><li><Eye size={14} />Day 2 · Temple route with a flexible lunch window</li><li><Eye size={14} />Day 3 · Craft, gardens, and an evening suggestion</li><li><Eye size={14} />Day 4 · A gentle final morning</li></ul><button className="tc-primary-button" style={{ width: "100%" }} type="button" onClick={() => setPreviewOpen(false)}>Keep browsing</button></div></div>}
        {checkoutOpen && <div className="rmdc-overlay" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><div className="rmdc-dialog"><button className="rmdc-close" type="button" aria-label="Close purchase confirmation" onClick={() => setCheckoutOpen(false)}><X size={17} /></button><p className="tc-eyebrow">Purchase confirmation</p><h2 id="checkout-title">Add this trip to your plans?</h2><p>This prototype does not process payment. Confirming shows the truthful post-purchase ownership state.</p><div className="rmdc-order"><span>{listing.title}</span><strong>{listing.price}</strong></div><div className="rmdc-dialog-actions"><button className="tc-secondary-button" type="button" onClick={() => setCheckoutOpen(false)}>Not yet</button><button className="tc-primary-button" type="button" onClick={() => { setPurchased(true); setCheckoutOpen(false); }}>Confirm purchase</button></div></div></div>}
      </div>
    </ContinuityShell>
  );
}

function ConciergeIcon() {
  return <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 6, background: "#fff", color: "#287a79", flex: "0 0 auto" }}><Sparkles size={14} /></span>;
}