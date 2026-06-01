import {
    Menu, Bell, MapPin, ChevronRight, Pencil, Search, Sparkles, Link2,
    AlertTriangle, Send, MessageSquare, Plus, Filter, Zap,
    Navigation, Train, Footprints, Car, Lock, Unlock, Eye, EyeOff,
    FileText, DollarSign, CheckCircle, Clock, ChevronDown, LayoutTemplate,
    TrendingUp, StickyNote, X, ShieldCheck, ExternalLink, User, Mail,
    Phone, CreditCard, CalendarDays
  } from "lucide-react";
  import { useState } from "react";

  const P = "#FF385C";
  const G: Record<number,string> = {
    50:"#F9FAFB",100:"#F3F4F6",200:"#E5E7EB",300:"#D1D5DB",
    400:"#9CA3AF",500:"#6B7280",600:"#4B5563",700:"#374151",900:"#111827"
  };

  function Av({ i, s=32 }: { i:string; s?:number }) {
    return <div style={{width:s,height:s,borderRadius:"50%",background:"linear-gradient(135deg,#FF385C,#FF6B8A)",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:s*0.35,fontWeight:600,flexShrink:0}}>{i}</div>;
  }

  function Bdg({ children, c="gray" }: { children:any; c?:string }) {
    const m: any = {
      gray:{bg:G[100],tx:G[600]}, amber:{bg:"#FEF3C7",tx:"#B45309"},
      green:{bg:"#BBF7D0",tx:"#15803D"}, rose:{bg:"#FFE4E6",tx:"#BE123C"},
      violet:{bg:"#EDE9FE",tx:"#7C3AED"}, blue:{bg:"#DBEAFE",tx:"#2563EB"},
      primary:{bg:P+"18",tx:P}, teal:{bg:"#CCFBF1",tx:"#0F766E"},
    };
    const col = m[c]||m.gray;
    return <span style={{background:col.bg,color:col.tx,fontSize:11,fontWeight:600,padding:"2px 7px",borderRadius:99,display:"inline-flex",alignItems:"center",gap:3}}>{children}</span>;
  }

  function Chip({ children, active=false, onClick }: any) {
    return <button onClick={onClick} style={{padding:"4px 10px",borderRadius:99,fontSize:12,fontWeight:500,cursor:"pointer",border:active?`1.5px solid ${P}`:`1.5px solid ${G[200]}`,background:active?`${P}0F`:"white",color:active?P:G[600]}}>{children}</button>;
  }

  function TConn({ mode, dur }: { mode:string; dur:string }) {
    return (
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"2px 0 2px 10px",margin:"1px 0"}}>
        <div style={{width:1,height:12,background:G[200],marginLeft:3}}/>
        <div style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",background:G[50],border:`1px solid ${G[200]}`,borderRadius:99,color:G[500],fontSize:11}}>
          {mode==="walk"?<Footprints style={{width:10,height:10}}/>:mode==="taxi"?<Car style={{width:10,height:10}}/>:<Train style={{width:10,height:10}}/>}
          {dur}
        </div>
      </div>
    );
  }

  function ARow({ time, cat, name, price, edited, alts, gap, onAddOne }: any) {
    const dots: any = {food:"#EA580C",culture:"#2563EB",hotel:"#7C3AED",transport:"#16A34A",free:G[400]};
    if (gap) return (
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,border:`1.5px dashed ${P}50`,background:`${P}06`,margin:"3px 0"}}>
        <AlertTriangle style={{width:13,height:13,color:P,flexShrink:0}}/>
        <span style={{fontSize:12,color:P,fontWeight:500}}>No dinner booked — <span onClick={onAddOne} style={{textDecoration:"underline",cursor:"pointer"}}>Add one?</span></span>
      </div>
    );
    return (
      <div style={{display:"flex",alignItems:"center",gap:7,padding:"6px 7px",borderRadius:8,background:"white",border:`1px solid ${G[100]}`,margin:"2px 0"}}>
        <span style={{fontSize:11,color:G[400],minWidth:40,fontFamily:"monospace",flexShrink:0}}>{time}</span>
        <div style={{width:7,height:7,borderRadius:"50%",background:dots[cat]||G[400],flexShrink:0}}/>
        <span style={{fontSize:13,color:G[900],fontWeight:500,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span>
        {price&&<span style={{fontSize:11,color:G[500],background:G[100],padding:"2px 6px",borderRadius:6,flexShrink:0}}>{price}</span>}
        {edited&&<Bdg c="amber">edited</Bdg>}
        {alts&&<button style={{fontSize:11,color:P,background:`${P}10`,border:`1px solid ${P}30`,borderRadius:6,padding:"2px 7px",cursor:"pointer",flexShrink:0,fontWeight:500}}>Find Alternatives</button>}
        <button style={{background:"none",border:"none",cursor:"pointer",padding:2,color:G[400],flexShrink:0,display:"flex"}}><Pencil style={{width:11,height:11}}/></button>
      </div>
    );
  }

  function AddedRow({ name, bookingStatus, onBookNow }: any) {
    return (
      <div style={{display:"flex",alignItems:"center",gap:7,padding:"6px 7px",borderRadius:8,
        background: bookingStatus==="confirmed" ? "#F0FDF4" : "#FFFBEB",
        border: `1px solid ${bookingStatus==="confirmed" ? "#BBF7D0" : "#FEF08A"}`,
        margin:"2px 0"}}>
        <span style={{fontSize:11,color:G[400],minWidth:40,fontFamily:"monospace",flexShrink:0}}>19:30</span>
        <div style={{width:7,height:7,borderRadius:"50%",background:"#EA580C",flexShrink:0}}/>
        <span style={{fontSize:13,color:G[900],fontWeight:500,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span>
        {bookingStatus==="confirmed" ? (
          <Bdg c="green"><CheckCircle style={{width:9,height:9}}/> Confirmed</Bdg>
        ) : (
          <>
            <Bdg c="amber">Needs Booking</Bdg>
            <button onClick={onBookNow} style={{fontSize:11,color:"#B45309",background:"#FEF3C7",border:"1.5px solid #FDE68A",borderRadius:6,padding:"2px 8px",cursor:"pointer",flexShrink:0,fontWeight:600,whiteSpace:"nowrap"}}>Book →</button>
          </>
        )}
      </div>
    );
  }

  function DayCard({ day, date, loc, children }: any) {
    return (
      <div style={{background:"white",borderRadius:12,border:`1px solid ${G[200]}`,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",marginBottom:12,overflow:"hidden"}}>
        <div style={{padding:"9px 14px",borderBottom:`1px solid ${G[100]}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:28,height:28,borderRadius:8,background:`${P}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:P}}>{day}</div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:G[900]}}>Day {day} · {date}</div>
              <div style={{display:"flex",alignItems:"center",gap:3,fontSize:11,color:G[500]}}><MapPin style={{width:10,height:10}}/>{loc}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:5}}>
            <button style={{display:"flex",alignItems:"center",gap:3,fontSize:11,color:G[600],background:G[50],border:`1px solid ${G[200]}`,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontWeight:500}}>
              <LayoutTemplate style={{width:11,height:11}}/> Template
            </button>
            <button style={{display:"flex",alignItems:"center",gap:3,fontSize:11,color:P,background:`${P}10`,border:`1px solid ${P}30`,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontWeight:500}}>
              <Plus style={{width:11,height:11}}/> Add
            </button>
          </div>
        </div>
        <div style={{padding:"8px 10px"}}>{children}</div>
      </div>
    );
  }

  function BookingBriefModal({ provider, onClose, onConfirm }: { provider: string; onClose: () => void; onConfirm?: () => void }) {
    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
        <div style={{background:"white",borderRadius:16,width:"100%",maxWidth:420,boxShadow:"0 20px 60px rgba(0,0,0,0.25)",overflow:"hidden"}}>
          {/* Header */}
          <div style={{padding:"14px 18px",borderBottom:`1px solid ${G[200]}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:32,height:32,borderRadius:8,background:`${P}15`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <ShieldCheck style={{width:16,height:16,color:P}}/>
              </div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:G[900]}}>Booking Brief</div>
                <div style={{fontSize:11,color:G[500]}}>Secure client details for {provider}</div>
              </div>
            </div>
            <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:G[400],padding:4,display:"flex"}}>
              <X style={{width:18,height:18}}/>
            </button>
          </div>

          {/* Privacy notice */}
          <div style={{margin:"12px 18px 0",padding:"8px 12px",background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,display:"flex",alignItems:"flex-start",gap:8}}>
            <Lock style={{width:13,height:13,color:"#2563EB",flexShrink:0,marginTop:1}}/>
            <span style={{fontSize:11,color:"#1D4ED8",lineHeight:1.5}}>
              Booking context only. Use these details to complete your client's reservation. Do not save or share with unrelated third parties.
            </span>
          </div>

          {/* Client details */}
          <div style={{padding:"14px 18px",display:"flex",flexDirection:"column",gap:10}}>
            {[
              {icon:<User style={{width:13,height:13}}/>, label:"Booking name", value:"Sarah & James Chen"},
              {icon:<Mail style={{width:13,height:13}}/>, label:"Confirmation email", value:"sarah.chen@gmail.com"},
              {icon:<Phone style={{width:13,height:13}}/>, label:"Contact number", value:"+44 7700 900847"},
              {icon:<CreditCard style={{width:13,height:13}}/>, label:"Passport (lead traveller)", value:"GB · GN123456 · Exp 2029"},
              {icon:<CalendarDays style={{width:13,height:13}}/>, label:"Travel dates", value:"Mar 15–22, 2025 · 2 adults"},
            ].map((row,i) => (
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:G[50],borderRadius:8,border:`1px solid ${G[200]}`}}>
                <div style={{color:G[400],flexShrink:0}}>{row.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,color:G[400],fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>{row.label}</div>
                  <div style={{fontSize:13,fontWeight:600,color:G[900]}}>{row.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Special notes */}
          <div style={{margin:"0 18px",padding:"9px 12px",background:"#FFFBEB",border:"1px solid #FEF08A",borderRadius:8}}>
            <div style={{fontSize:10,fontWeight:700,color:"#B45309",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>Special requirements</div>
            <div style={{fontSize:12,color:"#92400E"}}>No crowds / private seating preferred. Cherry blossom view if available. Anniversary setup — surprise element.</div>
          </div>

          {/* Actions */}
          <div style={{padding:"14px 18px",display:"flex",gap:8}}>
            <button onClick={onClose} style={{flex:1,padding:"8px",borderRadius:8,border:`1.5px solid ${G[200]}`,background:"white",fontSize:13,fontWeight:600,color:G[600],cursor:"pointer"}}>
              Cancel
            </button>
            <button onClick={()=>{ onConfirm?.(); onClose(); }} style={{flex:2,padding:"8px",borderRadius:8,border:"none",background:P,color:"white",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <ExternalLink style={{width:13,height:13}}/> Continue to {provider}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function PCard({ name, cat, rating, price, tag, onAdd, bookingStatus, onBookNow, targetDay=3 }: any) {
    return (
      <div style={{display:"flex",alignItems:"center",gap:9,padding:"9px 10px",borderRadius:10,
        border:`1px solid ${bookingStatus==="confirmed"?"#BBF7D0":bookingStatus==="needs-booking"?"#FDE68A":G[100]}`,
        background:bookingStatus==="confirmed"?"#F0FDF4":bookingStatus==="needs-booking"?"#FFFBEB":"white",
        marginBottom:7,boxShadow:"0 1px 3px rgba(0,0,0,0.03)"}}>
        <div style={{width:38,height:38,borderRadius:8,background:G[100],flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>🍽</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,color:G[900],overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
          <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
            <span style={{fontSize:11,color:G[500]}}>{cat}</span>
            <span style={{color:G[300]}}>·</span>
            <span style={{fontSize:11,color:"#F59E0B",fontWeight:600}}>★ {rating}</span>
            <span style={{color:G[300]}}>·</span>
            <span style={{fontSize:11,color:G[500]}}>{price}</span>
            {tag&&<Bdg c="rose">{tag}</Bdg>}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
          {bookingStatus==="confirmed" ? (
            <button disabled style={{padding:"5px 10px",borderRadius:7,fontSize:11,fontWeight:700,background:"#DCFCE7",color:"#15803D",border:"1.5px solid #86EFAC",cursor:"default",display:"flex",alignItems:"center",gap:4}}>
              <CheckCircle style={{width:11,height:11}}/> Confirmed
            </button>
          ) : bookingStatus==="needs-booking" ? (
            <button onClick={onBookNow} style={{padding:"5px 10px",borderRadius:7,fontSize:11,fontWeight:700,background:"#FEF3C7",color:"#B45309",border:"1.5px solid #FDE68A",cursor:"pointer",display:"flex",alignItems:"center",gap:4,animation:"pulse 1.5s infinite"}}>
              <Clock style={{width:11,height:11}}/> Book Now →
            </button>
          ) : (
            <button onClick={onAdd} style={{padding:"5px 10px",borderRadius:7,fontSize:11,fontWeight:600,background:P,color:"white",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              <Plus style={{width:10,height:10}}/> Add to Day {targetDay}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Approval workflow steps ──
  const STEPS = [
    { key:"draft", label:"Draft", icon:<FileText style={{width:11,height:11}}/> },
    { key:"review", label:"Expert Review", icon:<Eye style={{width:11,height:11}}/> },
    { key:"pending", label:"Awaiting Approval", icon:<Clock style={{width:11,height:11}}/> },
    { key:"confirmed", label:"Confirmed", icon:<CheckCircle style={{width:11,height:11}}/> },
  ];

  function ApprovalBar({ current }: { current: string }) {
    const idx = STEPS.findIndex(s=>s.key===current);
    return (
      <div style={{background:"white",borderBottom:`1px solid ${G[200]}`,padding:"7px 18px",display:"flex",alignItems:"center",gap:0,flexShrink:0}}>
        {STEPS.map((s,i)=>{
          const done = i<idx, active = i===idx, future = i>idx;
          return (
            <div key={s.key} style={{display:"flex",alignItems:"center",flex:i<STEPS.length-1?1:"auto"}}>
              <div style={{display:"flex",alignItems:"center",gap:5,padding:"3px 10px 3px 6px",borderRadius:99,
                background:active?`${P}12`:done?"#F0FDF4":"transparent",
                border:active?`1.5px solid ${P}40`:done?"1.5px solid #86EFAC":"1.5px solid transparent"
              }}>
                <div style={{width:18,height:18,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
                  background:active?P:done?"#22C55E":"white",
                  border:future?`1.5px solid ${G[300]}`:"none",
                  color:active||done?"white":G[400],flexShrink:0
                }}>{done?<CheckCircle style={{width:11,height:11}}/>:s.icon}</div>
                <span style={{fontSize:11,fontWeight:active?700:500,color:active?P:done?"#15803D":G[400],whiteSpace:"nowrap"}}>{s.label}</span>
              </div>
              {i<STEPS.length-1&&<div style={{flex:1,height:1,background:i<idx?"#86EFAC":G[200],margin:"0 2px"}}/>}
            </div>
          );
        })}
        <button style={{marginLeft:12,padding:"4px 12px",borderRadius:7,fontSize:11,fontWeight:600,background:P,color:"white",border:"none",cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",gap:4}}>
          <Send style={{width:10,height:10}}/> Submit for Approval
        </button>
      </div>
    );
  }

  export function Workspace() {
    const [rightTab, setRightTab] = useState("gaps");
    const [cat, setCat] = useState("dining");
    const [cTab, setCTab] = useState("itinerary");
    const [collapsed, setCollapsed] = useState(false);
    const [identityRevealed, setIdentityRevealed] = useState(false);
    const [noteText, setNoteText] = useState("Client is very budget-aware despite honeymoon setting. James mentioned surprise cherry blossom picnic as a priority. Avoid Shibuya Crossing — crowds anxiety noted in intake form.");
    const [bookingBriefProvider, setBookingBriefProvider] = useState<string|null>(null);
    const [bookingConfirmItem, setBookingConfirmItem] = useState<string|null>(null);
    const [addedItems, setAddedItems] = useState<Record<string,{status:"needs-booking"|"confirmed",provider:string,day:number}>>({});

    function addToDay(name: string, provider: string, day: number) {
      setAddedItems(prev => ({...prev, [name]: {status:"needs-booking", provider, day}}));
    }
    function openBooking(name: string, provider: string) {
      setBookingConfirmItem(name);
      setBookingBriefProvider(provider);
    }
    function confirmBooking() {
      if (bookingConfirmItem) {
        setAddedItems(prev => ({...prev, [bookingConfirmItem]: {...prev[bookingConfirmItem], status:"confirmed"}}));
      }
      setBookingConfirmItem(null);
      setBookingBriefProvider(null);
    }

    const clientCode = "TK-2847";
    const clientName = "Sarah & James C.";
    const initials = "SJ";

    return (
      <div style={{fontFamily:"'Inter',-apple-system,sans-serif",height:"100vh",display:"flex",flexDirection:"column",background:G[50],overflow:"hidden"}}>
        {bookingBriefProvider && <BookingBriefModal provider={bookingBriefProvider} onClose={()=>{setBookingBriefProvider(null);setBookingConfirmItem(null);}} onConfirm={confirmBooking}/>}

        {/* ── Header ── */}
        <header style={{height:56,background:"white",borderBottom:`1px solid ${G[200]}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={()=>setCollapsed(!collapsed)} style={{background:"none",border:"none",cursor:"pointer",padding:4,color:G[500],display:"flex"}}><Menu style={{width:20,height:20}}/></button>
            <span style={{fontSize:15,fontWeight:700,color:G[900]}}>Itinerary Workspace</span>
            <ChevronRight style={{width:14,height:14,color:G[400]}}/>
            {/* Anonymized client reference */}
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 10px",background:G[50],borderRadius:99,border:`1px solid ${G[200]}`}}>
              <Lock style={{width:11,height:11,color:G[400]}}/>
              <span style={{fontSize:13,color:G[600],fontWeight:500}}>
                {identityRevealed ? clientName : `Client #${clientCode}`}
              </span>
              <button onClick={()=>setIdentityRevealed(!identityRevealed)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",padding:0,color:G[400]}}>
                {identityRevealed?<EyeOff style={{width:13,height:13}}/>:<Eye style={{width:13,height:13}}/>}
              </button>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",background:"#F0FDF4",borderRadius:99,border:"1px solid #BBF7D0"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:"#16A34A"}}/>
              <span style={{fontSize:12,fontWeight:600,color:"#15803D"}}>AI: Active</span>
            </div>
            <div style={{position:"relative"}}>
              <button style={{background:"none",border:"none",cursor:"pointer",padding:6,display:"flex",color:G[600]}}><Bell style={{width:18,height:18}}/></button>
              <div style={{position:"absolute",top:2,right:2,width:16,height:16,background:P,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"white",fontWeight:700}}>3</div>
            </div>
            <Av i="SC" s={32}/>
          </div>
        </header>

        {/* ── Approval Workflow Bar ── */}
        <ApprovalBar current="review" />

        {/* ── Body ── */}
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>

          {/* ══ Zone 1: Left Rail ══ */}
          {!collapsed && (
            <aside style={{width:282,background:"white",borderRight:`1px solid ${G[200]}`,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
              <div style={{flex:1,overflowY:"auto",padding:"12px 11px"}}>

                {/* Trip header with identity masking */}
                <div style={{borderRadius:10,overflow:"hidden",marginBottom:11,border:`1px solid ${G[200]}`}}>
                  <div style={{height:64,background:"linear-gradient(135deg,#FF385C22,#FF6B8A33)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                    <span style={{fontSize:24}}>🌸</span>
                    <div style={{position:"absolute",bottom:6,right:8,background:"white",borderRadius:6,padding:"2px 6px",fontSize:10,fontWeight:600,color:P}}>7 nights</div>
                    {/* Privacy badge */}
                    <div style={{position:"absolute",top:6,left:8,display:"flex",alignItems:"center",gap:4,background:"rgba(0,0,0,0.35)",borderRadius:99,padding:"2px 7px"}}>
                      <Lock style={{width:9,height:9,color:"white"}}/>
                      <span style={{fontSize:9,color:"white",fontWeight:600}}>PRIVATE</span>
                    </div>
                  </div>
                  <div style={{padding:"9px 11px"}}>
                    <div style={{fontSize:14,fontWeight:700,color:G[900]}}>Tokyo Honeymoon</div>
                    <div style={{fontSize:11,color:G[500],marginTop:2}}>📅 Mar 15–22, 2025</div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:7}}>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        <Av i={identityRevealed?initials:"??"} s={20}/>
                        <span style={{fontSize:12,color:G[700],fontWeight:500}}>
                          {identityRevealed ? clientName : `Client #${clientCode}`}
                        </span>
                      </div>
                      <button onClick={()=>setIdentityRevealed(!identityRevealed)} style={{display:"flex",alignItems:"center",gap:3,background:"none",border:`1px solid ${G[200]}`,borderRadius:99,padding:"2px 7px",fontSize:10,color:G[500],cursor:"pointer",fontWeight:600}}>
                        {identityRevealed?<><EyeOff style={{width:9,height:9}}/> Hide</>:<><Eye style={{width:9,height:9}}/> Reveal</>}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Experience DNA */}
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:G[400],letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:5}}>Experience DNA</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}><Bdg c="rose">💑 Honeymoon</Bdg><Bdg c="amber">High Contingency</Bdg><Bdg c="violet">Couple Split</Bdg><Bdg c="blue">2 Guests</Bdg></div>
                </div>

                {/* Preferences */}
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:G[400],letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:5}}>User Preferences</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {["Romantic dining","Private experiences","Mid-luxury","🌸 Cherry blossom","No crowds"].map(p=>(
                      <span key={p} style={{fontSize:11,background:G[100],color:G[600],padding:"2px 8px",borderRadius:99,fontWeight:500}}>{p}</span>
                    ))}
                  </div>
                </div>

                {/* Temporal Anchors */}
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:G[400],letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:5}}>Temporal Anchors</div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {[{e:"✈️",l:"Arrive NRT",t:"Mar 15, 3:40 PM"},{e:"🏨",l:"Shinjuku Granbell",t:"Mar 15, 6:00 PM"},{e:"✈️",l:"Depart NRT",t:"Mar 22, 11:00 AM"}].map((a,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 8px",background:G[50],borderRadius:7,border:`1px solid ${G[200]}`}}>
                        <div style={{width:7,height:7,borderRadius:"50%",background:P,flexShrink:0}}/>
                        <span style={{fontSize:11}}>{a.e}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:11,fontWeight:600,color:G[700],overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.l}</div>
                          <div style={{fontSize:10,color:G[400]}}>{a.t} · immovable</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Budget vs. Ceiling — NEW */}
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:G[400],letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:5}}>Budget Tracker</div>
                  <div style={{background:G[50],border:`1px solid ${G[200]}`,borderRadius:8,padding:"8px 10px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <span style={{fontSize:11,color:G[600],fontWeight:500}}>Estimated spend</span>
                      <span style={{fontSize:11,fontWeight:700,color:G[900]}}>¥304,400</span>
                    </div>
                    <div style={{height:6,background:G[200],borderRadius:99,overflow:"hidden",marginBottom:5}}>
                      <div style={{width:"76%",height:"100%",background:"linear-gradient(90deg,#22C55E,#86EFAC)",borderRadius:99}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontSize:10,color:G[500]}}>76% of ¥400,000 ceiling</span>
                      <span style={{fontSize:10,color:"#15803D",fontWeight:600}}>¥95,600 slack</span>
                    </div>
                  </div>
                </div>

                {/* AI Gap Analysis */}
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:G[400],letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:5}}>AI Gap Analysis</div>
                  <div style={{background:"#FFFBEB",border:"1px solid #FEF3C7",borderRadius:8,padding:"8px 10px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}><AlertTriangle style={{width:13,height:13,color:"#D97706"}}/><span style={{fontSize:12,fontWeight:700,color:"#B45309"}}>3 gaps found</span></div>
                    {["Day 3 — no dinner booked","Day 5 — no transport Shinjuku→Hakone","Day 6 — budget slack ¥32,000"].map((g,i)=>(
                      <div key={i} style={{display:"flex",gap:5,marginBottom:3}}><span style={{fontSize:10,color:"#D97706",marginTop:1}}>•</span><span style={{fontSize:11,color:"#B45309"}}>{g}</span></div>
                    ))}
                  </div>
                </div>

                {/* Expert Private Notes — NEW */}
                <div style={{marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <div style={{fontSize:10,fontWeight:700,color:G[400],letterSpacing:"0.08em",textTransform:"uppercase"}}>Expert Notes</div>
                      <Bdg c="violet">Private</Bdg>
                    </div>
                    <StickyNote style={{width:12,height:12,color:G[400]}}/>
                  </div>
                  <textarea
                    value={noteText}
                    onChange={e=>setNoteText(e.target.value)}
                    style={{
                      width:"100%",minHeight:72,padding:"7px 8px",fontSize:11,
                      color:G[700],lineHeight:1.5,
                      background:"#FEFCE8",border:"1px solid #FEF08A",borderRadius:8,
                      resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box"
                    }}
                  />
                  <div style={{fontSize:10,color:G[400],marginTop:3}}>🔒 Only you can see this</div>
                </div>

                <button style={{width:"100%",padding:"6px 12px",borderRadius:8,border:`1px solid ${G[200]}`,background:"white",fontSize:12,color:G[600],cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5,fontWeight:500}}>
                  <Navigation style={{width:12,height:12}}/> Open Full Logistics <ChevronRight style={{width:11,height:11,color:G[400]}}/>
                </button>
              </div>
            </aside>
          )}

          {/* ══ Zone 2: Center Itinerary ══ */}
          <main style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
            <div style={{background:"white",borderBottom:`1px solid ${G[200]}`,padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"space-between",height:44,flexShrink:0}}>
              <div style={{display:"flex",gap:4}}>
                {[{k:"itinerary",l:"📋 Itinerary"},{k:"map",l:"🗺 Map View"}].map(t=>(
                  <button key={t.k} onClick={()=>setCTab(t.k)} style={{padding:"5px 12px",borderRadius:7,fontSize:13,fontWeight:500,background:cTab===t.k?`${P}12`:"none",color:cTab===t.k?P:G[500],border:cTab===t.k?`1.5px solid ${P}40`:"1.5px solid transparent",cursor:"pointer"}}>{t.l}</button>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button style={{padding:"5px 12px",borderRadius:8,fontSize:13,fontWeight:600,background:"white",color:G[700],border:`1.5px solid ${G[200]}`,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                  <MessageSquare style={{width:13,height:13}}/> Chat
                </button>
                <button style={{padding:"5px 12px",borderRadius:8,fontSize:13,fontWeight:600,background:P,color:"white",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                  <Send style={{width:13,height:13}}/> Send Edits
                </button>
              </div>
            </div>

            <div style={{flex:1,overflowY:"auto",padding:"14px 16px"}}>
              <DayCard day={1} date="Mar 15" loc="Tokyo, Shinjuku">
                <ARow time="15:40" cat="transport" name="Arrive Narita Airport (NRT)"/>
                <TConn mode="subway" dur="1h 10min subway"/>
                <ARow time="18:00" cat="hotel" name="Check-in Shinjuku Granbell Hotel" price="¥28,000/night" edited/>
                <TConn mode="walk" dur="8 min walk"/>
                <ARow time="20:00" cat="food" name="Dinner at Omoide Yokocho" price="¥4,500" alts/>
              </DayCard>

              <DayCard day={2} date="Mar 16" loc="Tokyo, Asakusa">
                <ARow time="09:00" cat="culture" name="Senso-ji Temple & Nakamise-dori" price="Free"/>
                <TConn mode="subway" dur="6 min subway"/>
                <ARow time="12:30" cat="food" name="Lunch at Asakusa Imahan" price="¥8,000"/>
                <TConn mode="taxi" dur="22 min taxi"/>
                <ARow time="15:00" cat="culture" name="teamLab Planets Tokyo" price="¥3,200"/>
                <TConn mode="subway" dur="35 min subway"/>
                <ARow time="19:30" cat="food" name="Omakase — Sushi Yoshitake" price="¥35,000" edited/>
              </DayCard>

              <DayCard day={3} date="Mar 17" loc="Tokyo, Shinjuku">
                <ARow time="09:00" cat="culture" name="Shinjuku Gyoen National Garden" price="¥500"/>
                <TConn mode="walk" dur="18 min walk"/>
                <ARow time="12:00" cat="food" name="Lunch at Tsukemen Gonokami" price="¥1,800"/>
                {Object.entries(addedItems).filter(([,v])=>v.day===3).length > 0 ? (
                  Object.entries(addedItems).filter(([,v])=>v.day===3).map(([name,item])=>(
                    <div key={name} style={{marginTop:5}}>
                      <TConn mode="walk" dur="10 min walk"/>
                      <AddedRow name={name} bookingStatus={item.status} onBookNow={()=>openBooking(name, item.provider)}/>
                    </div>
                  ))
                ) : (
                  <div style={{marginTop:5}}><ARow time="19:00" cat="food" name="" price="" gap onAddOne={()=>setRightTab("browse")}/></div>
                )}
              </DayCard>

              {/* Budget summary footer */}
              <div style={{background:"white",borderRadius:10,border:`1px solid ${G[200]}`,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",gap:20}}>
                  {[{l:"Activities",v:"¥46,700"},{l:"Dining",v:"¥49,300"},{l:"Transport",v:"¥12,400"},{l:"Hotels",v:"¥196,000"}].map(s=>(
                    <div key={s.l}><div style={{fontSize:10,color:G[400],fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>{s.l}</div><div style={{fontSize:13,fontWeight:700,color:G[900]}}>{s.v}</div></div>
                  ))}
                </div>
                <div><div style={{fontSize:10,color:G[400],fontWeight:600,textTransform:"uppercase"}}>Total Est.</div><div style={{fontSize:16,fontWeight:800,color:P}}>¥304,400</div></div>
              </div>
            </div>
          </main>

          {/* ══ Zone 3: Right Panel ══ */}
          <aside style={{width:398,background:"white",borderLeft:`1px solid ${G[200]}`,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
            <div style={{borderBottom:`1px solid ${G[200]}`,padding:"0 10px",display:"flex",gap:0,flexShrink:0}}>
              {[{k:"gaps",l:"⚡ AI Gaps"},{k:"browse",l:"🔍 Browse"},{k:"commission",l:"💰 Earnings"},{k:"providers",l:"👥 Providers"},{k:"affiliates",l:"🔗 Affiliates"}].map(t=>(
                <button key={t.k} onClick={()=>setRightTab(t.k)} style={{padding:"10px 7px",fontSize:11,fontWeight:600,cursor:"pointer",background:"none",border:"none",borderBottom:rightTab===t.k?`2px solid ${P}`:"2px solid transparent",color:rightTab===t.k?P:G[500],marginBottom:-1,whiteSpace:"nowrap"}}>{t.l}</button>
              ))}
            </div>

            {/* ── Browse Tab ── */}
            {rightTab==="browse" && (
              <div style={{flex:1,overflowY:"auto",padding:"12px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:9}}>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <span style={{fontSize:14,fontWeight:700,color:G[900]}}>Tokyo Providers</span>
                    <span style={{fontSize:11,background:G[100],padding:"2px 7px",borderRadius:99,color:G[500],display:"flex",alignItems:"center",gap:3}}><MapPin style={{width:10,height:10}}/> Tokyo, JP</span>
                  </div>
                  <button style={{background:"none",border:"none",cursor:"pointer",color:G[400]}}><Filter style={{width:14,height:14}}/></button>
                </div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
                  {[{k:"all",l:"All"},{k:"dining",l:"🍽 Dining"},{k:"activities",l:"🏛 Activities"},{k:"hotels",l:"🏨 Hotels"},{k:"transport",l:"🚌 Transport"}].map(c=>(
                    <Chip key={c.k} active={cat===c.k} onClick={()=>setCat(c.k)}>{c.l}</Chip>
                  ))}
                </div>
                <div style={{background:`${P}08`,border:`1px solid ${P}25`,borderRadius:8,padding:"6px 10px",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
                  <Sparkles style={{width:13,height:13,color:P,flexShrink:0}}/>
                  <span style={{fontSize:11,color:P}}>Filtered for <strong>Honeymoon</strong> · romantic dining · Day 3 gap</span>
                </div>
                <PCard name="Kozue Restaurant" cat="Fine Dining" rating="4.9" price="¥¥¥¥" tag="Romantic"
                  bookingStatus={addedItems["Kozue Restaurant"]?.status}
                  onAdd={()=>addToDay("Kozue Restaurant","Viator",3)}
                  onBookNow={()=>openBooking("Kozue Restaurant","Viator")}/>
                <PCard name="Nakamura-ro Kaiseki" cat="Japanese" rating="4.7" price="¥¥¥"
                  bookingStatus={addedItems["Nakamura-ro Kaiseki"]?.status}
                  onAdd={()=>addToDay("Nakamura-ro Kaiseki","Viator",3)}
                  onBookNow={()=>openBooking("Nakamura-ro Kaiseki","Viator")}/>
                <PCard name="Nobu Tokyo" cat="Contemporary" rating="4.8" price="¥¥¥¥"
                  bookingStatus={addedItems["Nobu Tokyo"]?.status}
                  onAdd={()=>addToDay("Nobu Tokyo","Booking.com",3)}
                  onBookNow={()=>openBooking("Nobu Tokyo","Booking.com")}/>
                <PCard name="New York Bar, Park Hyatt" cat="Cocktail Bar" rating="4.9" price="¥¥" tag="Views"
                  bookingStatus={addedItems["New York Bar, Park Hyatt"]?.status}
                  onAdd={()=>addToDay("New York Bar, Park Hyatt","Viator",3)}
                  onBookNow={()=>openBooking("New York Bar, Park Hyatt","Viator")}/>
                <PCard name="Tempura Tsunahachi" cat="Traditional" rating="4.6" price="¥¥"
                  bookingStatus={addedItems["Tempura Tsunahachi"]?.status}
                  onAdd={()=>addToDay("Tempura Tsunahachi","Viator",3)}
                  onBookNow={()=>openBooking("Tempura Tsunahachi","Viator")}/>
                <div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${G[100]}`,textAlign:"center"}}><span style={{fontSize:10,color:G[400]}}>Powered by Traveloure · Viator · Google Places</span></div>
              </div>
            )}

            {/* ── Earnings / Revenue Share Tab ── */}
            {rightTab==="commission" && (
              <div style={{flex:1,overflowY:"auto",padding:"14px 12px"}}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}><TrendingUp style={{width:14,height:14,color:P}}/><span style={{fontSize:14,fontWeight:700,color:G[900]}}>Your Earnings</span></div>

                {/* Model explanation pill */}
                <div style={{display:"flex",alignItems:"flex-start",gap:7,padding:"8px 10px",background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,marginBottom:14}}>
                  <DollarSign style={{width:13,height:13,color:"#2563EB",flexShrink:0,marginTop:1}}/>
                  <span style={{fontSize:11,color:"#1D4ED8",lineHeight:1.5}}>
                    Traveloure earns booking revenue from partner platforms. <strong>You receive 30% of that as your revenue share</strong> for every booking you add to a client's itinerary.
                  </span>
                </div>

                {/* Summary card */}
                <div style={{background:"linear-gradient(135deg,#FF385C12,#FF6B8A08)",border:`1px solid ${P}30`,borderRadius:12,padding:"14px",marginBottom:14}}>
                  <div style={{fontSize:11,color:G[500],marginBottom:2}}>Your estimated earnings · this trip</div>
                  <div style={{fontSize:28,fontWeight:800,color:G[900]}}>¥7,460</div>
                  <div style={{fontSize:12,color:"#15803D",fontWeight:600,marginTop:2}}>≈ $50 USD · 30% revenue share</div>
                  <div style={{height:1,background:G[200],margin:"10px 0"}}/>
                  <div style={{display:"flex",gap:16}}>
                    <div><div style={{fontSize:10,color:G[400],fontWeight:600,textTransform:"uppercase"}}>Confirmed</div><div style={{fontSize:13,fontWeight:700,color:"#15803D"}}>¥4,655</div></div>
                    <div><div style={{fontSize:10,color:G[400],fontWeight:600,textTransform:"uppercase"}}>Pending</div><div style={{fontSize:13,fontWeight:700,color:"#B45309"}}>¥2,805</div></div>
                    <div><div style={{fontSize:10,color:G[400],fontWeight:600,textTransform:"uppercase"}}>If gaps filled</div><div style={{fontSize:13,fontWeight:700,color:G[500]}}>+¥2,646</div></div>
                  </div>
                </div>

                {/* Per-booking breakdown */}
                <div style={{fontSize:10,fontWeight:700,color:G[400],letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>Your Share · Booking Breakdown</div>
                {[
                  {name:"Shinjuku Granbell Hotel",cat:"Hotel · Booking.com",platformEarned:"¥11,760",yourShare:"¥3,528",status:"confirmed"},
                  {name:"teamLab Planets",cat:"Activity · Viator",platformEarned:"¥256",yourShare:"¥77",status:"confirmed"},
                  {name:"Sushi Yoshitake",cat:"Dining · Traveloure",platformEarned:"¥3,500",yourShare:"¥1,050",status:"confirmed"},
                  {name:"NRT Airport Transfer",cat:"Transport · 12Go",platformEarned:"¥9,350",yourShare:"¥2,805",status:"pending"},
                  {name:"Day 3 Dinner",cat:"Dining · unfilled gap",platformEarned:"—",yourShare:"est. ¥720",status:"potential"},
                  {name:"Hakone Transport",cat:"Transport · unfilled",platformEarned:"—",yourShare:"est. ¥540",status:"potential"},
                ].map((b,i)=>{
                  const sc: any = {confirmed:"#15803D",pending:"#B45309",potential:G[400]};
                  const bc: any = {confirmed:"#DCFCE7",pending:"#FEF3C7",potential:G[100]};
                  return (
                    <div key={i} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 10px",border:`1px solid ${G[100]}`,borderRadius:9,marginBottom:7,background:"white"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:G[900],overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</div>
                        <div style={{fontSize:11,color:G[400]}}>{b.cat}</div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                        <span style={{fontSize:12,fontWeight:700,color:sc[b.status]}}>{b.yourShare}</span>
                        <span style={{fontSize:10,fontWeight:600,background:bc[b.status],color:sc[b.status],padding:"1px 6px",borderRadius:99,textTransform:"capitalize"}}>{b.status}</span>
                      </div>
                    </div>
                  );
                })}

                <div style={{background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:8,padding:"8px 12px",marginTop:6}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#15803D",display:"flex",alignItems:"center",gap:5}}>
                    <TrendingUp style={{width:12,height:12}}/> Fill Day 3 dinner gap to add ≈¥720 to your earnings
                  </div>
                </div>
              </div>
            )}

            {/* ── AI Gaps Tab ── */}
            {rightTab==="gaps" && (
              <div style={{flex:1,overflowY:"auto",padding:"14px 12px"}}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}><Zap style={{width:14,height:14,color:P}}/><span style={{fontSize:14,fontWeight:700,color:G[900]}}>AI Gap Analysis</span></div>
                {[
                  {day:"Day 3",title:"No dinner booked",sev:"high",fix:"Fill with romantic dining recommendation",comm:"est. ¥720 your share",tab:"browse"},
                  {day:"Day 5",title:"No transport Shinjuku→Hakone",sev:"high",fix:"Book 12Go Romancecar train",comm:"est. ¥540 your share",tab:"affiliates"},
                  {day:"Day 6",title:"Budget slack ¥32,000",sev:"low",fix:"Add optional activity or hotel upgrade",comm:"est. ¥960 your share",tab:"browse"},
                ].map((g,i)=>(
                  <div key={i} style={{border:`1px solid ${g.sev==="high"?P+"40":G[200]}`,borderRadius:10,padding:"10px 12px",marginBottom:9,background:g.sev==="high"?`${P}05`:"white"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}><Bdg c={g.sev==="high"?"primary":"gray"}>{g.day}</Bdg><span style={{fontSize:13,fontWeight:600,color:G[900]}}>{g.title}</span></div>
                    <p style={{fontSize:12,color:G[500],margin:"0 0 5px"}}>{g.fix}</p>
                    <div style={{fontSize:11,color:"#15803D",fontWeight:600,marginBottom:7}}>💰 {g.comm}</div>
                    <button onClick={()=>setRightTab(g.tab)} style={{padding:"5px 12px",borderRadius:7,fontSize:12,fontWeight:600,background:P,color:"white",border:"none",cursor:"pointer"}}>Fill This Gap →</button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Providers Tab ── */}
            {rightTab==="providers" && (
              <div style={{flex:1,overflowY:"auto",padding:"14px 12px"}}>
                <div style={{marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:20,height:20,borderRadius:6,background:P,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <User style={{width:11,height:11,color:"white"}}/>
                      </div>
                      <span style={{fontSize:13,fontWeight:700,color:G[900]}}>Platform Service Providers</span>
                    </div>
                    <Bdg c="primary">Tokyo · JP</Bdg>
                  </div>
                  <p style={{fontSize:11,color:G[500],marginBottom:10}}>Traveloure-verified providers you can book directly for this client.</p>

                  {[
                    {name:"Haruki Mori",role:"Honeymoon Photographer",sub:"Cherry blossom & golden hour specialist",rating:"4.97",reviews:142,price:"¥48,000",unit:"half-day",avail:true,e:"📸",verified:true},
                    {name:"Chef Aiko Suzuki",role:"Private Kaiseki Chef",sub:"In-room dining · Michelin-trained · 2 hrs",rating:"4.9",reviews:87,price:"¥32,000",unit:"per session",avail:true,e:"👩‍🍳",verified:true},
                    {name:"Takeshi Yamamoto",role:"Private City Guide",sub:"Asakusa & hidden Shinjuku specialist",rating:"4.88",reviews:204,price:"¥22,000",unit:"full day",avail:false,e:"🗾",verified:true},
                    {name:"Yuki Transport",role:"Luxury Transfer Driver",sub:"Airport · hotel · day trips · English-speaking",rating:"4.95",reviews:310,price:"¥15,000",unit:"per transfer",avail:true,e:"🚗",verified:false},
                  ].map((sp,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"flex-start",gap:9,padding:"10px 11px",border:`1px solid ${G[100]}`,borderRadius:10,marginBottom:7,background:"white",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                      {/* Avatar circle */}
                      <div style={{width:38,height:38,borderRadius:"50%",background:`linear-gradient(135deg,${P}30,${P}60)`,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>
                        {sp.e}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:1}}>
                          <span style={{fontSize:13,fontWeight:700,color:G[900]}}>{sp.name}</span>
                          {sp.verified && (
                            <div title="Traveloure Verified" style={{width:14,height:14,borderRadius:"50%",background:"#2563EB",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                              <CheckCircle style={{width:9,height:9,color:"white"}}/>
                            </div>
                          )}
                          {!sp.avail && <Bdg c="amber">Busy</Bdg>}
                        </div>
                        <div style={{fontSize:12,fontWeight:600,color:G[700],marginBottom:1}}>{sp.role}</div>
                        <div style={{fontSize:11,color:G[400],marginBottom:4}}>{sp.sub}</div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:11,color:"#B45309",fontWeight:600}}>★ {sp.rating}</span>
                          <span style={{fontSize:10,color:G[400]}}>({sp.reviews} reviews)</span>
                          <span style={{fontSize:11,fontWeight:700,color:G[900]}}>{sp.price}</span>
                          <span style={{fontSize:10,color:G[400]}}>/{sp.unit}</span>
                        </div>
                      </div>
                      <button
                        onClick={()=>setBookingBriefProvider(sp.name)}
                        disabled={!sp.avail}
                        style={{
                          flexShrink:0,padding:"5px 10px",borderRadius:7,fontSize:11,fontWeight:600,
                          background:sp.avail?P:"white",
                          color:sp.avail?"white":G[300],
                          border:sp.avail?`none`:`1.5px solid ${G[200]}`,
                          cursor:sp.avail?"pointer":"default",
                          whiteSpace:"nowrap"
                        }}
                      >
                        {sp.avail?"Book for Client":"Unavailable"}
                      </button>
                    </div>
                  ))}

                  <button style={{width:"100%",padding:"6px",borderRadius:8,border:`1px dashed ${G[300]}`,background:"none",fontSize:11,color:G[500],cursor:"pointer",fontWeight:500}}>
                    + Browse all Tokyo providers →
                  </button>
                </div>
              </div>
            )}

            {/* ── Affiliates Tab ── */}
            {rightTab==="affiliates" && (
              <div style={{flex:1,overflowY:"auto",padding:"14px 12px"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <div style={{width:20,height:20,borderRadius:6,background:"#2563EB",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <Link2 style={{width:11,height:11,color:"white"}}/>
                  </div>
                  <span style={{fontSize:13,fontWeight:700,color:G[900]}}>Affiliate Networks</span>
                </div>
                <p style={{fontSize:11,color:G[500],marginBottom:12}}>External booking networks integrated by Traveloure. Use these to complete bookings on behalf of your client.</p>
                {[
                  {n:"Booking.com",c:"Hotels",e:"🏨",active:true,note:"Use for hotel reservations — enter client details from Booking Brief"},
                  {n:"Viator",c:"Activities & Experiences",e:"🎭",active:true,note:"Best for tours, tickets & experiences — client name required at checkout"},
                  {n:"12Go Asia",c:"Ground Transport",e:"🚅",active:true,note:"Trains, buses, ferries — book for Day 5 Shinjuku→Hakone gap"},
                  {n:"SafetyWing",c:"Travel Insurance",e:"🛡️",active:false,note:"Connect to offer travel insurance add-ons"},
                  {n:"Airalo",c:"eSIM Data",e:"📱",active:false,note:"Connect to offer Japan eSIM before departure"},
                ].map((p,i)=>(
                  <div key={i} style={{padding:"10px 11px",border:`1px solid ${p.active?G[200]:G[100]}`,borderRadius:10,marginBottom:8,background:"white"}}>
                    <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:p.active?6:0}}>
                      <span style={{fontSize:20,flexShrink:0}}>{p.e}</span>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                          <span style={{fontSize:13,fontWeight:600,color:G[900]}}>{p.n}</span>
                          {p.active&&<Bdg c="green">Active</Bdg>}
                        </div>
                        <div style={{fontSize:11,color:G[400]}}>{p.c}</div>
                      </div>
                      <button style={{flexShrink:0,padding:"4px 9px",borderRadius:7,fontSize:11,fontWeight:600,background:p.active?"white":P,color:p.active?P:"white",border:`1.5px solid ${P}`,cursor:"pointer"}}>
                        {p.active?"Open →":"Connect →"}
                      </button>
                    </div>
                    {p.active && <div style={{fontSize:11,color:G[500],background:G[50],borderRadius:6,padding:"5px 8px"}}>{p.note}</div>}
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    );
  }
  