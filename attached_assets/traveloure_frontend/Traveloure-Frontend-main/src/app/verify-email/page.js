"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import axios from "axios";
import { Button } from "../../components/ui/button";

function VerifyEmailPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");

  // Extract token from URL parameters
  useEffect(() => {
    // Extract the token from the URL
    const urlToken = searchParams.get("token");
    if (urlToken) {
      setToken(urlToken);
    } else {
      toast.error("Invalid or missing token. Please try again.");
      router.push("/");
    }
  }, [searchParams, router]);

  // Handle the email verification
  const handleEmailVerification = async () => {
    if (!token) {
      toast.error("No token found. Please try again.");
      return;
    }

    setLoading(true);
    try {
      // Use the token for verification
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/auth/tokenverify/${token}/`
      );
      toast.success("Email verified successfully!");
      router.push("/login"); // Redirect to home after verification
    } catch (error) {
      toast.error(
        error.response?.data?.detail || "Email verification failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center text-green-600">
          Verifying Your Email...
        </h2>
        <Button onClick={handleEmailVerification} disabled={loading} className="w-full">
          {loading ? "Verifying..." : "Verify Email"}
        </Button>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <VerifyEmailPageContent />
    </Suspense>
  );
}
