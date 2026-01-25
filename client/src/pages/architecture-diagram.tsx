import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ArchitectureDiagram() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6" data-testid="text-page-title">Traveloure System Architecture</h1>
        
        <div className="w-full overflow-auto">
          <svg viewBox="0 0 1200 900" className="w-full min-w-[1000px]" style={{ background: 'hsl(var(--background))' }}>
            {/* Title */}
            <text x="600" y="40" textAnchor="middle" className="fill-foreground text-xl font-bold" fontSize="24">
              Traveloure Platform Architecture
            </text>

            {/* ============ CLIENT LAYER ============ */}
            <rect x="50" y="70" width="1100" height="140" rx="8" className="fill-blue-500/10 stroke-blue-500" strokeWidth="2" />
            <text x="100" y="95" className="fill-blue-500 font-semibold" fontSize="14">CLIENT LAYER</text>
            
            {/* Frontend Box */}
            <rect x="80" y="110" width="200" height="80" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="180" y="140" textAnchor="middle" className="fill-foreground font-medium" fontSize="13">React 18 + TypeScript</text>
            <text x="180" y="160" textAnchor="middle" className="fill-muted-foreground" fontSize="11">Vite + TanStack Query</text>
            <text x="180" y="175" textAnchor="middle" className="fill-muted-foreground" fontSize="11">Wouter Routing</text>

            {/* UI Components */}
            <rect x="310" y="110" width="180" height="80" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="400" y="140" textAnchor="middle" className="fill-foreground font-medium" fontSize="13">UI Components</text>
            <text x="400" y="160" textAnchor="middle" className="fill-muted-foreground" fontSize="11">Tailwind + shadcn/ui</text>
            <text x="400" y="175" textAnchor="middle" className="fill-muted-foreground" fontSize="11">Framer Motion</text>

            {/* Experience Templates */}
            <rect x="520" y="110" width="180" height="80" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="610" y="140" textAnchor="middle" className="fill-foreground font-medium" fontSize="13">Experience Templates</text>
            <text x="610" y="160" textAnchor="middle" className="fill-muted-foreground" fontSize="11">22+ Template Types</text>
            <text x="610" y="175" textAnchor="middle" className="fill-muted-foreground" fontSize="11">Dynamic Tabs & Filters</text>

            {/* Role Dashboards */}
            <rect x="730" y="110" width="180" height="80" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="820" y="140" textAnchor="middle" className="fill-foreground font-medium" fontSize="13">Role Dashboards</text>
            <text x="820" y="160" textAnchor="middle" className="fill-muted-foreground" fontSize="11">Provider / Admin / EA</text>
            <text x="820" y="175" textAnchor="middle" className="fill-muted-foreground" fontSize="11">Collapsible Sidebars</text>

            {/* Maps */}
            <rect x="940" y="110" width="180" height="80" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="1030" y="140" textAnchor="middle" className="fill-foreground font-medium" fontSize="13">Maps & Routing</text>
            <text x="1030" y="160" textAnchor="middle" className="fill-muted-foreground" fontSize="11">Google Maps API</text>
            <text x="1030" y="175" textAnchor="middle" className="fill-muted-foreground" fontSize="11">Route Visualization</text>

            {/* Arrow down */}
            <path d="M600 210 L600 240" className="stroke-muted-foreground" strokeWidth="2" markerEnd="url(#arrowhead)" />

            {/* ============ API LAYER ============ */}
            <rect x="50" y="250" width="1100" height="130" rx="8" className="fill-green-500/10 stroke-green-500" strokeWidth="2" />
            <text x="100" y="275" className="fill-green-500 font-semibold" fontSize="14">API LAYER</text>

            {/* Backend */}
            <rect x="80" y="290" width="200" height="70" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="180" y="318" textAnchor="middle" className="fill-foreground font-medium" fontSize="13">Express + TypeScript</text>
            <text x="180" y="338" textAnchor="middle" className="fill-muted-foreground" fontSize="11">RESTful APIs + Zod</text>

            {/* Auth */}
            <rect x="310" y="290" width="180" height="70" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="400" y="318" textAnchor="middle" className="fill-foreground font-medium" fontSize="13">Authentication</text>
            <text x="400" y="338" textAnchor="middle" className="fill-muted-foreground" fontSize="11">Replit Auth + OIDC</text>

            {/* AI Orchestrator */}
            <rect x="520" y="290" width="180" height="70" rx="6" className="fill-purple-500/20 stroke-purple-500" strokeWidth="1" />
            <text x="610" y="318" textAnchor="middle" className="fill-foreground font-medium" fontSize="13">AI Orchestrator</text>
            <text x="610" y="338" textAnchor="middle" className="fill-muted-foreground" fontSize="11">Routes to Grok / Claude</text>

            {/* Caching Layer */}
            <rect x="730" y="290" width="180" height="70" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="820" y="318" textAnchor="middle" className="fill-foreground font-medium" fontSize="13">Caching Layer</text>
            <text x="820" y="338" textAnchor="middle" className="fill-muted-foreground" fontSize="11">24hr API Cache</text>

            {/* Unified Catalog */}
            <rect x="940" y="290" width="180" height="70" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="1030" y="318" textAnchor="middle" className="fill-foreground font-medium" fontSize="13">Unified Catalog</text>
            <text x="1030" y="338" textAnchor="middle" className="fill-muted-foreground" fontSize="11">Cross-Provider Search</text>

            {/* Arrow down */}
            <path d="M600 380 L600 410" className="stroke-muted-foreground" strokeWidth="2" markerEnd="url(#arrowhead)" />

            {/* ============ DATA LAYER ============ */}
            <rect x="50" y="420" width="500" height="130" rx="8" className="fill-orange-500/10 stroke-orange-500" strokeWidth="2" />
            <text x="100" y="445" className="fill-orange-500 font-semibold" fontSize="14">DATA LAYER</text>

            {/* PostgreSQL */}
            <rect x="80" y="460" width="200" height="70" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="180" y="488" textAnchor="middle" className="fill-foreground font-medium" fontSize="13">PostgreSQL</text>
            <text x="180" y="508" textAnchor="middle" className="fill-muted-foreground" fontSize="11">Drizzle ORM</text>

            {/* Cache Tables */}
            <rect x="310" y="460" width="210" height="70" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="415" y="488" textAnchor="middle" className="fill-foreground font-medium" fontSize="13">Cache Tables</text>
            <text x="415" y="508" textAnchor="middle" className="fill-muted-foreground" fontSize="11">POI, Transfers, Safety</text>

            {/* ============ AI SERVICES ============ */}
            <rect x="580" y="420" width="570" height="130" rx="8" className="fill-purple-500/10 stroke-purple-500" strokeWidth="2" />
            <text x="630" y="445" className="fill-purple-500 font-semibold" fontSize="14">AI SERVICES</text>

            {/* Grok */}
            <rect x="610" y="460" width="160" height="70" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="690" y="485" textAnchor="middle" className="fill-foreground font-medium" fontSize="13">Grok (xAI)</text>
            <text x="690" y="502" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Expert Matching</text>
            <text x="690" y="516" textAnchor="middle" className="fill-muted-foreground" fontSize="10">City Intelligence</text>

            {/* Claude */}
            <rect x="790" y="460" width="160" height="70" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="870" y="485" textAnchor="middle" className="fill-foreground font-medium" fontSize="13">Anthropic Claude</text>
            <text x="870" y="502" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Chat & Optimization</text>
            <text x="870" y="516" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Transport Analysis</text>

            {/* Hidden Gems */}
            <rect x="970" y="460" width="160" height="70" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="1050" y="485" textAnchor="middle" className="fill-foreground font-medium" fontSize="13">AI Discovery</text>
            <text x="1050" y="502" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Hidden Gems</text>
            <text x="1050" y="516" textAnchor="middle" className="fill-muted-foreground" fontSize="10">12 Categories</text>

            {/* Arrow down */}
            <path d="M600 550 L600 580" className="stroke-muted-foreground" strokeWidth="2" markerEnd="url(#arrowhead)" />

            {/* ============ EXTERNAL INTEGRATIONS ============ */}
            <rect x="50" y="590" width="1100" height="150" rx="8" className="fill-cyan-500/10 stroke-cyan-500" strokeWidth="2" />
            <text x="100" y="615" className="fill-cyan-500 font-semibold" fontSize="14">EXTERNAL INTEGRATIONS</text>

            {/* Amadeus */}
            <rect x="80" y="630" width="150" height="90" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="155" y="655" textAnchor="middle" className="fill-foreground font-medium" fontSize="12">Amadeus API</text>
            <text x="155" y="672" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Flights & Hotels</text>
            <text x="155" y="686" textAnchor="middle" className="fill-muted-foreground" fontSize="10">POIs & Transfers</text>
            <text x="155" y="700" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Safety Ratings</text>

            {/* Viator */}
            <rect x="250" y="630" width="140" height="90" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="320" y="655" textAnchor="middle" className="fill-foreground font-medium" fontSize="12">Viator API</text>
            <text x="320" y="675" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Tours & Activities</text>
            <text x="320" y="692" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Real-time Booking</text>

            {/* Fever */}
            <rect x="410" y="630" width="140" height="90" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="480" y="655" textAnchor="middle" className="fill-foreground font-medium" fontSize="12">Fever API</text>
            <text x="480" y="675" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Events & Tickets</text>
            <text x="480" y="692" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Global Cities</text>

            {/* 12Go */}
            <rect x="570" y="630" width="140" height="90" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="640" y="655" textAnchor="middle" className="fill-foreground font-medium" fontSize="12">12Go Asia</text>
            <text x="640" y="675" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Ground Transport</text>
            <text x="640" y="692" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Affiliate: 13805109</text>

            {/* SerpAPI */}
            <rect x="730" y="630" width="140" height="90" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="800" y="655" textAnchor="middle" className="fill-foreground font-medium" fontSize="12">SerpAPI</text>
            <text x="800" y="675" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Venue Search</text>
            <text x="800" y="692" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Hybrid Results</text>

            {/* Affiliate Scraping */}
            <rect x="890" y="630" width="140" height="90" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="960" y="655" textAnchor="middle" className="fill-foreground font-medium" fontSize="12">Affiliate Scraper</text>
            <text x="960" y="675" textAnchor="middle" className="fill-muted-foreground" fontSize="10">AI-Powered</text>
            <text x="960" y="692" textAnchor="middle" className="fill-muted-foreground" fontSize="10">Click Tracking</text>

            {/* Google Maps */}
            <rect x="1050" y="630" width="80" height="90" rx="6" className="fill-card stroke-border" strokeWidth="1" />
            <text x="1090" y="660" textAnchor="middle" className="fill-foreground font-medium" fontSize="11">Google</text>
            <text x="1090" y="677" textAnchor="middle" className="fill-foreground font-medium" fontSize="11">Maps</text>
            <text x="1090" y="697" textAnchor="middle" className="fill-muted-foreground" fontSize="9">Transit</text>

            {/* ============ KEY FEATURES BOX ============ */}
            <rect x="50" y="760" width="1100" height="120" rx="8" className="fill-primary/10 stroke-primary" strokeWidth="2" />
            <text x="100" y="785" className="fill-primary font-semibold" fontSize="14">KEY FEATURES</text>

            {/* Feature boxes */}
            <rect x="80" y="800" width="130" height="60" rx="4" className="fill-card stroke-border" strokeWidth="1" />
            <text x="145" y="823" textAnchor="middle" className="fill-foreground font-medium" fontSize="11">Trip Transport</text>
            <text x="145" y="840" textAnchor="middle" className="fill-muted-foreground" fontSize="9">Planner</text>

            <rect x="230" y="800" width="130" height="60" rx="4" className="fill-card stroke-border" strokeWidth="1" />
            <text x="295" y="823" textAnchor="middle" className="fill-foreground font-medium" fontSize="11">AI Itinerary</text>
            <text x="295" y="840" textAnchor="middle" className="fill-muted-foreground" fontSize="9">Builder</text>

            <rect x="380" y="800" width="130" height="60" rx="4" className="fill-card stroke-border" strokeWidth="1" />
            <text x="445" y="823" textAnchor="middle" className="fill-foreground font-medium" fontSize="11">Expert</text>
            <text x="445" y="840" textAnchor="middle" className="fill-muted-foreground" fontSize="9">Matching</text>

            <rect x="530" y="800" width="130" height="60" rx="4" className="fill-card stroke-border" strokeWidth="1" />
            <text x="595" y="823" textAnchor="middle" className="fill-foreground font-medium" fontSize="11">Hidden Gems</text>
            <text x="595" y="840" textAnchor="middle" className="fill-muted-foreground" fontSize="9">Discovery</text>

            <rect x="680" y="800" width="130" height="60" rx="4" className="fill-card stroke-border" strokeWidth="1" />
            <text x="745" y="823" textAnchor="middle" className="fill-foreground font-medium" fontSize="11">Spontaneous</text>
            <text x="745" y="840" textAnchor="middle" className="fill-muted-foreground" fontSize="9">Activities</text>

            <rect x="830" y="800" width="130" height="60" rx="4" className="fill-card stroke-border" strokeWidth="1" />
            <text x="895" y="823" textAnchor="middle" className="fill-foreground font-medium" fontSize="11">Coordination</text>
            <text x="895" y="840" textAnchor="middle" className="fill-muted-foreground" fontSize="9">Hub</text>

            <rect x="980" y="800" width="130" height="60" rx="4" className="fill-card stroke-border" strokeWidth="1" />
            <text x="1045" y="823" textAnchor="middle" className="fill-foreground font-medium" fontSize="11">Wallet &</text>
            <text x="1045" y="840" textAnchor="middle" className="fill-muted-foreground" fontSize="9">Billing</text>

            {/* Arrow marker definition */}
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" className="fill-muted-foreground" />
              </marker>
            </defs>
          </svg>
        </div>

        {/* Legend */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle data-testid="text-legend-title">Architecture Legend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-blue-500/20 border border-blue-500"></div>
                <span className="text-sm">Client Layer</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-500/20 border border-green-500"></div>
                <span className="text-sm">API Layer</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-orange-500/20 border border-orange-500"></div>
                <span className="text-sm">Data Layer</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-purple-500/20 border border-purple-500"></div>
                <span className="text-sm">AI Services</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-cyan-500/20 border border-cyan-500"></div>
                <span className="text-sm">External Integrations</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-primary/20 border border-primary"></div>
                <span className="text-sm">Key Features</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
