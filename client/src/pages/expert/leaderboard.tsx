import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Award } from "lucide-react";

export default function ExpertLeaderboard() {
  return (
    <ExpertLayout title="Leaderboard">
      <div className="p-6">
        <div className="max-w-2xl mx-auto">
          <Card className="border border-gray-200">
            <CardContent className="p-12 text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                  <Award className="w-8 h-8 text-amber-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Leaderboard Coming Soon
              </h2>
              <p className="text-gray-600 text-sm mb-4 max-w-md mx-auto">
                Expert rankings based on ratings, response time, and client satisfaction will appear here once we have enough data.
              </p>
              <p className="text-xs text-gray-500">
                Keep delivering exceptional experiences to earn your place on the leaderboard!
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </ExpertLayout>
  );
}
