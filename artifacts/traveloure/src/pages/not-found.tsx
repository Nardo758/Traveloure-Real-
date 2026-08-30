import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Map } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-center px-4">
      <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-6">
        <Map className="w-12 h-12" />
      </div>
      <h1 className="text-4xl font-display font-bold text-slate-900 mb-2">404 - Lost at Sea?</h1>
      <p className="text-slate-500 max-w-md mb-8">
        We couldn't find the page you're looking for. It might have been moved or doesn't exist.
      </p>
      <Link href="/">
        <Button size="lg" className="rounded-full px-8">Return Home</Button>
      </Link>
    </div>
  );
}
