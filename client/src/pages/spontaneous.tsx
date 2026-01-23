import { Layout } from "@/components/layout";
import SpontaneousDiscovery from "@/components/spontaneous-discovery";

export default function SpontaneousPage() {
  return (
    <Layout>
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Live Intel Engine</h1>
          <p className="text-muted-foreground max-w-2xl">
            Discover spontaneous activities, trending experiences, and last-minute deals 
            happening in real-time. Enter a city to find opportunities happening tonight, 
            tomorrow, or this weekend.
          </p>
        </div>
        
        <SpontaneousDiscovery />
      </div>
    </Layout>
  );
}
