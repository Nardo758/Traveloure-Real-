import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, 
  Video, 
  FileText, 
  HelpCircle, 
  MessageSquare, 
  ExternalLink,
  Play,
  Download,
  Star,
  TrendingUp,
  Users,
  Camera
} from "lucide-react";

const guides = [
  {
    id: 1,
    title: "Getting Started as a Provider",
    description: "Learn the basics of setting up your profile and listing your services",
    type: "guide",
    duration: "10 min read",
    featured: true,
  },
  {
    id: 2,
    title: "Optimizing Your Listing",
    description: "Tips to improve your visibility and attract more clients",
    type: "guide",
    duration: "15 min read",
    featured: true,
  },
  {
    id: 3,
    title: "Photography Best Practices",
    description: "How to take stunning photos that showcase your venue",
    type: "guide",
    duration: "8 min read",
    featured: false,
  },
  {
    id: 4,
    title: "Pricing Strategy Guide",
    description: "Set competitive prices that maximize your bookings",
    type: "guide",
    duration: "12 min read",
    featured: false,
  },
];

const videos = [
  {
    id: 1,
    title: "Platform Overview",
    description: "A complete walkthrough of the provider dashboard",
    duration: "5:30",
    thumbnail: true,
  },
  {
    id: 2,
    title: "Managing Bookings",
    description: "How to handle booking requests efficiently",
    duration: "8:15",
    thumbnail: true,
  },
  {
    id: 3,
    title: "Responding to Clients",
    description: "Best practices for client communication",
    duration: "6:45",
    thumbnail: true,
  },
];

const faqs = [
  {
    question: "How do I receive payments?",
    answer: "Payments are processed automatically and deposited to your linked bank account based on your payout schedule.",
  },
  {
    question: "What is the platform fee?",
    answer: "We charge a service fee on completed bookings, which covers payment processing, platform maintenance, and customer support. Your exact rate and net payout are always shown on each booking and on your Earnings page.",
  },
  {
    question: "How do I handle cancellations?",
    answer: "Cancellation policies are set by you. Navigate to Settings > Business Preferences to configure your cancellation terms.",
  },
  {
    question: "Can I offer custom packages?",
    answer: "Yes! You can create custom service packages and quotes for each client through the booking details page.",
  },
];

const downloadables = [
  { name: "Contract Template", type: "PDF", size: "245 KB" },
  { name: "Pricing Worksheet", type: "XLSX", size: "128 KB" },
  { name: "Brand Guidelines", type: "PDF", size: "1.2 MB" },
  { name: "Marketing Toolkit", type: "ZIP", size: "5.8 MB" },
];

export default function ProviderResources() {
  return (
    <ProviderLayout title="Resources">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold text-console-darkest">Learning Resources</h2>
          <p className="text-console-dark">Guides, tutorials, and tools to help you succeed</p>
        </div>

        {/* Featured Guides */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              Featured Guides
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {guides.filter(g => g.featured).map((guide) => (
                <div 
                  key={guide.id}
                  className="p-4 border border-console-light rounded-lg hover:bg-console-hover transition-colors"
                  data-testid={`card-guide-${guide.id}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-[#FF385C]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-6 h-6 text-[#FF385C]" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-console-darkest">{guide.title}</h3>
                      <p className="text-sm text-console-dark mt-1">{guide.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">{guide.duration}</Badge>
                        <Button variant="ghost" size="sm" className="text-[#FF385C]" data-testid={`button-read-guide-${guide.id}`}>
                          Read Now <ExternalLink className="w-3 h-3 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Video Tutorials */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="w-5 h-5 text-blue-600" />
                Video Tutorials
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {videos.map((video) => (
                <div 
                  key={video.id}
                  className="flex items-center gap-4"
                  data-testid={`card-video-${video.id}`}
                >
                  <div className="w-24 h-16 bg-console-bg rounded-lg flex items-center justify-center relative flex-shrink-0">
                    <Play className="w-8 h-8 text-console-mid" />
                    <span className="absolute bottom-1 right-1 text-xs bg-black/70 text-white px-1 rounded">
                      {video.duration}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-console-darkest">{video.title}</h4>
                    <p className="text-sm text-console-mid">{video.description}</p>
                  </div>
                  <Button variant="ghost" size="icon" data-testid={`button-play-video-${video.id}`}>
                    <Play className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button variant="ghost" className="w-full" data-testid="button-view-all-videos">
                View All Videos
              </Button>
            </CardContent>
          </Card>

          {/* Downloadable Resources */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-green-600" />
                Downloadable Resources
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {downloadables.map((file, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between py-2 border-b border-console-light last:border-0"
                  data-testid={`row-download-${index}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-console-bg rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-console-mid" />
                    </div>
                    <div>
                      <p className="font-medium text-console-darkest">{file.name}</p>
                      <p className="text-xs text-console-mid">{file.type} - {file.size}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" data-testid={`button-download-${index}`}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* All Guides */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-purple-600" />
              All Guides
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {guides.map((guide) => (
                <div 
                  key={guide.id}
                  className="flex items-center justify-between p-3 border border-console-light rounded-lg"
                  data-testid={`row-guide-${guide.id}`}
                >
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-5 h-5 text-console-mid" />
                    <div>
                      <p className="font-medium text-console-darkest">{guide.title}</p>
                      <p className="text-xs text-console-mid">{guide.duration}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" data-testid={`button-read-${guide.id}`}>
                    Read
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-amber-600" />
              Frequently Asked Questions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {faqs.map((faq, index) => (
              <div 
                key={index}
                className="p-4 bg-console-bg rounded-lg"
                data-testid={`card-faq-${index}`}
              >
                <h4 className="font-medium text-console-darkest">{faq.question}</h4>
                <p className="text-sm text-console-dark mt-1">{faq.answer}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Need Help */}
        <Card className="bg-[#FF385C]/5 border-[#FF385C]/20">
          <CardContent className="p-6 text-center">
            <MessageSquare className="w-12 h-12 text-[#FF385C] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-console-darkest">Need More Help?</h3>
            <p className="text-console-dark mt-1 mb-4">
              Our support team is available 24/7 to assist you
            </p>
            <div className="flex justify-center gap-3">
              <Button data-testid="button-contact-support">
                Contact Support
              </Button>
              <Button variant="outline" data-testid="button-community">
                Join Community
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProviderLayout>
  );
}
