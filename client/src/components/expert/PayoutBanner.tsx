import { useState } from "react";

interface PayoutBannerProps {
  stripeConnectStatus: string;
  isPayable: boolean;
}

export function PayoutBanner({
  stripeConnectStatus,
  isPayable,
}: PayoutBannerProps) {
  const [loading, setLoading] = useState(false);

  if (isPayable) return null;

  const handleConnect = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Connect failed", err);
    } finally {
      setLoading(false);
    }
  };

  const isPending = stripeConnectStatus === "pending";

  return (
    <div
      className={`rounded-xl border p-4 mb-6 flex items-start justify-between gap-4 ${
        isPending ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"
      }`}
    >
      <div>
        <p
          className={`text-sm font-semibold mb-1 ${
            isPending ? "text-amber-800" : "text-red-800"
          }`}
        >
          {isPending ? "⏳ Payout setup in progress" : "⚠️ Payouts not available yet"}
        </p>
        <p className={`text-xs ${isPending ? "text-amber-600" : "text-red-600"}`}>
          {isPending
            ? "Your Stripe account is being reviewed. You can still receive leads."
            : "Complete Stripe Connect setup to receive payouts for your bookings. You are already receiving leads."}
        </p>
      </div>
      {!isPending && (
        <button
          onClick={handleConnect}
          disabled={loading}
          className="shrink-0 text-xs font-semibold px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {loading ? "Loading..." : "Set up payouts"}
        </button>
      )}
    </div>
  );
}
