import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Download, 
  ExternalLink, 
  Mail, 
  FileText, 
  Image as ImageIcon,
  Award,
  TrendingUp,
  Users,
  Globe
} from "lucide-react";

const pressReleases = [
  {
    id: 1,
    title: "Traveloure Raises $15M Series A to Transform Travel Planning with AI",
    date: "2024-01-15",
    excerpt: "Leading travel platform secures funding to expand AI-powered recommendations and local expert network worldwide..."
  },
  {
    id: 2,
    title: "Traveloure Surpasses 1 Million Users Milestone",
    date: "2023-12-10",
    excerpt: "Platform celebrates rapid growth as travelers embrace personalized, expert-guided trip planning..."
  },
  {
    id: 3,
    title: "Partnership Announcement: Traveloure Partners with Major Airlines",
    date: "2023-11-05",
    excerpt: "New integrations bring seamless booking experiences to travelers planning their perfect trips..."
  },
];

const mediaKit = [
  {
    title: "Company Logos",
    description: "High-resolution logos in various formats",
    icon: ImageIcon,
    files: ["PNG", "SVG", "EPS"]
  },
  {
    title: "Brand Guidelines",
    description: "Our visual identity and usage rules",
    icon: FileText,
    files: ["PDF"]
  },
  {
    title: "Product Screenshots",
    description: "Platform screenshots and mockups",
    icon: ImageIcon,
    files: ["ZIP"]
  },
  {
    title: "Executive Headshots",
    description: "Leadership team photos",
    icon: ImageIcon,
    files: ["ZIP"]
  },
];

const stats = [
  { label: "Active Users", value: "1M+", icon: Users },
  { label: "Countries", value: "150+", icon: Globe },
  { label: "Local Experts", value: "5,000+", icon: Award },
  { label: "Growth Rate", value: "300%", icon: TrendingUp },
];

const coverage = [
  {
    outlet: "TechCrunch",
    headline: "Traveloure is changing how we plan trips",
    url: "#"
  },
  {
    outlet: "Forbes",
    headline: "The future of personalized travel planning",
    url: "#"
  },
  {
    outlet: "The Wall Street Journal",
    headline: "AI meets local expertise in new travel platform",
    url: "#"
  },
  {
    outlet: "Travel + Leisure",
    headline: "How Traveloure connects travelers with local experts",
    url: "#"
  },
];

export default function PressPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground py-20">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <Badge className="mb-4 bg-white/20 text-white">Press & Media</Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Newsroom
          </h1>
          <p className="text-xl text-primary-foreground/90 mb-8">
            Latest news, press releases, and media resources from Traveloure
          </p>
          <Button variant="secondary" size="lg">
            <Mail className="w-4 h-4 mr-2" />
            Contact Press Team
          </Button>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-b bg-muted/30">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="text-center">
                  <Icon className="w-8 h-8 mx-auto mb-3 text-primary" />
                  <div className="text-3xl font-bold mb-1">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Press Releases */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-3xl font-bold mb-8">Latest Press Releases</h2>
          <div className="space-y-6">
            {pressReleases.map((release) => (
              <Card key={release.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="text-sm text-muted-foreground mb-2">
                        {new Date(release.date).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </div>
                      <h3 className="text-xl font-bold mb-3">{release.title}</h3>
                      <p className="text-muted-foreground mb-4">{release.excerpt}</p>
                      <Button variant="outline">
                        Read Full Release
                        <ExternalLink className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Media Coverage */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-3xl font-bold mb-8 text-center">Featured In</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {coverage.map((item, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-lg mb-2">{item.outlet}</div>
                      <p className="text-muted-foreground text-sm">{item.headline}</p>
                    </div>
                    <Button variant="ghost" size="sm">
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Media Kit */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Media Kit</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Download our brand assets, logos, and other resources for your coverage
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {mediaKit.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6 text-center">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{item.description}</p>
                    <div className="flex flex-wrap gap-2 justify-center mb-4">
                      {item.files.map((format) => (
                        <Badge key={format} variant="secondary">{format}</Badge>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" className="w-full">
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="text-center mt-8">
            <Button size="lg">
              <Download className="w-4 h-4 mr-2" />
              Download Complete Media Kit
            </Button>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-3xl font-bold mb-4">Press Inquiries</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            For media inquiries, interview requests, or additional information, please contact our press team
          </p>
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6">
              <div className="space-y-3 text-left">
                <div>
                  <div className="text-sm text-muted-foreground">Email</div>
                  <div className="font-medium">press@traveloure.com</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Phone</div>
                  <div className="font-medium">+1 (555) 123-4567</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Response Time</div>
                  <div className="font-medium">Within 24 hours</div>
                </div>
              </div>
              <Button className="w-full mt-6">
                <Mail className="w-4 h-4 mr-2" />
                Send Press Inquiry
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
