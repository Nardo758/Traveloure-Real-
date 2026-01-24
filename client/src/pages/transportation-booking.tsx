import { useState } from 'react';
import { TwelveGoWidget, TwelveGoDeepLink } from '@/components/widgets/TwelveGoWidget';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Train, Bus, Ship, ArrowRight, MapPin } from 'lucide-react';

const popularRoutes = [
  { from: 'bangkok', to: 'chiang-mai', label: 'Bangkok → Chiang Mai', icon: Train },
  { from: 'bangkok', to: 'phuket', label: 'Bangkok → Phuket', icon: Bus },
  { from: 'phuket', to: 'phi-phi', label: 'Phuket → Koh Phi Phi', icon: Ship },
  { from: 'siem-reap', to: 'bangkok', label: 'Siem Reap → Bangkok', icon: Bus },
  { from: 'hanoi', to: 'sapa', label: 'Hanoi → Sapa', icon: Bus },
  { from: 'kuala-lumpur', to: 'singapore', label: 'KL → Singapore', icon: Bus },
];

export default function TransportationBookingPage() {
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [searchRoute, setSearchRoute] = useState<{ from?: string; to?: string }>({});

  const handleSearch = () => {
    if (customFrom && customTo) {
      setSearchRoute({ from: customFrom.toLowerCase().replace(/\s+/g, '-'), to: customTo.toLowerCase().replace(/\s+/g, '-') });
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Book Ground Transportation</h1>
        <p className="text-muted-foreground">
          Trains, buses, ferries and more across Southeast Asia
        </p>
      </div>

      <Tabs defaultValue="search" className="space-y-6">
        <TabsList>
          <TabsTrigger value="search" data-testid="tab-search">Search</TabsTrigger>
          <TabsTrigger value="popular" data-testid="tab-popular">Popular Routes</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Custom Route Search
              </CardTitle>
              <CardDescription>
                Enter your origin and destination to search for available transportation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="from">From</Label>
                  <Input
                    id="from"
                    placeholder="e.g., Bangkok"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    data-testid="input-from"
                  />
                </div>
                <ArrowRight className="hidden sm:block h-5 w-5 text-muted-foreground mb-2" />
                <div className="flex-1 space-y-2">
                  <Label htmlFor="to">To</Label>
                  <Input
                    id="to"
                    placeholder="e.g., Chiang Mai"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    data-testid="input-to"
                  />
                </div>
                <Button 
                  onClick={handleSearch}
                  disabled={!customFrom || !customTo}
                  data-testid="button-search"
                >
                  Search Routes
                </Button>
              </div>
            </CardContent>
          </Card>

          {searchRoute.from && searchRoute.to ? (
            <TwelveGoWidget 
              type="timetable" 
              from={searchRoute.from} 
              to={searchRoute.to}
            />
          ) : (
            <TwelveGoWidget type="search" />
          )}
        </TabsContent>

        <TabsContent value="popular" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {popularRoutes.map((route) => (
              <TwelveGoDeepLink
                key={`${route.from}-${route.to}`}
                from={route.from}
                to={route.to}
                className="block"
              >
                <Card className="hover-elevate cursor-pointer h-full">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <route.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{route.label}</p>
                        <p className="text-sm text-muted-foreground">
                          View schedules & prices
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TwelveGoDeepLink>
            ))}
          </div>

          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <Train className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Why Book with 12Go?</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Compare all operators in one place</li>
                    <li>• Instant e-tickets - no printing needed</li>
                    <li>• 24/7 customer support</li>
                    <li>• Free cancellation on many routes</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
