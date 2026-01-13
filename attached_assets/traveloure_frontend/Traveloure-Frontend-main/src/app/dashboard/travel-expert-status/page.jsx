"use client"

import { useEffect } from "react";
import { useTravelExperts } from "../../../hooks/useTravelExperts";
import { Button } from "../../../components/ui/button";
import ProtectedRoute from "../../../components/protectedroutes/ProtectedRoutes";
import { useSession } from "next-auth/react";

const StatusIcon = ({ status }) => {
  if (status === "pending") {
    return (
      <div className="relative flex items-center justify-center" style={{ height: 80, width: 80 }}>
        <div style={{ position: 'absolute', width: 80, height: 80, borderRadius: '50%', background: '#FFF9E6', zIndex: 1 }} />
        <div style={{ position: 'absolute', width: 56, height: 56, borderRadius: '50%', background: '#FFF3C4', zIndex: 2 }} />
        <div style={{ position: 'absolute', width: 36, height: 36, borderRadius: '50%', background: '#FFC107', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 8v4" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="16" r="1" fill="#fff"/><circle cx="12" cy="12" r="10" stroke="#fff" strokeWidth="0" fill="none"/></svg>
        </div>
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="relative flex items-center justify-center" style={{ height: 80, width: 80 }}>
        <div style={{ position: 'absolute', width: 80, height: 80, borderRadius: '50%', background: '#FFE6E6', zIndex: 1 }} />
        <div style={{ position: 'absolute', width: 56, height: 56, borderRadius: '50%', background: '#FFD6D6', zIndex: 2 }} />
        <div style={{ position: 'absolute', width: 36, height: 36, borderRadius: '50%', background: '#FF385C', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M15 9l-6 6M9 9l6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
        </div>
      </div>
    );
  }
  if (status === "approved" || status === "accepted") {
    return (
      <div className="relative flex items-center justify-center" style={{ height: 80, width: 80 }}>
        <div style={{ position: 'absolute', width: 80, height: 80, borderRadius: '50%', background: '#E6F9EC', zIndex: 1 }} />
        <div style={{ position: 'absolute', width: 56, height: 56, borderRadius: '50%', background: '#C4F3D6', zIndex: 2 }} />
        <div style={{ position: 'absolute', width: 36, height: 36, borderRadius: '50%', background: '#12B76A', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M7 13l3 3 7-7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
      </div>
    );
  }
  return null;
};

const StatusBadge = ({ status }) => {
  let color = "#FFC107", bg = "#FFF9E6", text = "#FFC107", label = "Under Review";
  if (status === "rejected") { color = "#FF385C"; bg = "#FFE6E6"; text = "#FF385C"; label = "Rejected"; }
  if (status === "approved" || status === "accepted") { color = "#12B76A"; bg = "#E6F9EC"; text = "#12B76A"; label = "Approved"; }
  return (
    <span style={{ background: bg, color: text, borderRadius: 8, padding: '4px 14px', fontWeight: 600, fontSize: 14, display: 'inline-block' }}>{label}</span>
  );
};

export default function TravelExpertStatusPage() {
  const { data: session } = useSession();
  const { myApplicationStatus, fetchMyApplicationStatus, loading } = useTravelExperts();

  useEffect(() => {
    fetchMyApplicationStatus();
    // eslint-disable-next-line
  }, []);

  // Use correct path for API response
  const statusRaw = myApplicationStatus?.data?.status;
  const status = typeof statusRaw === "string" ? statusRaw.toLowerCase() : "";

  const name = myApplicationStatus?.data?.user?.first_name || session?.user?.name || "User";
  const email = myApplicationStatus?.data?.user?.email || session?.user?.email || "";

  let title = "";
  let message = "";
  if (status === "pending") {
    title = `Hi ${name}! Your Application is Under Review`;
    message = `We've received your submission. Our team will review your details and get back to you within 3–5 business days. A confirmation will be sent to ${email} once the review is complete.`;
  } else if (status === "rejected") {
    title = `Sorry ${name}, Your Application was Rejected`;
    message = `We regret to inform you that your application was not approved. Please check your email (${email}) for more details or contact support for further assistance.`;
  } else if (status === "approved" || status === "accepted") {
    title = `Congratulations ${name}! Your Application is Approved`;
    message = `Your profile is now live and you can start receiving leads and bookings. A confirmation has been sent to ${email}.`;
  } else {
    title = `No Application Found`;
    message = `You haven't submitted a local expert application yet. Please complete the registration to get started.`;
  }

  return (
    <ProtectedRoute>
      <div className="bg-gray-50 py-10 px-2 min-h-[60vh]">
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-8 max-w-2xl mx-auto w-full text-center border border-gray-100">
          <div className="flex flex-row items-start justify-end mb-4 gap-2">
          {status && status !== "" && status !== "no application" && (
              <div className="flex-shrink-0">
                <StatusBadge status={status} />
              </div>
            )}
           
          </div>
          <div className="flex flex-row items-start justify-center mb-4 gap-2">
            <div className="flex-shrink-0">
              <StatusIcon status={status} />
            </div>
           
          </div>
          <h2 className="text-lg sm:text-2xl font-bold mb-2">{title}</h2>
          <p className="text-gray-600 mb-6 text-sm sm:text-base">{message}</p>
          <div className="flex justify-center">
            <button
              style={{ border: '2px solid #FF385C', color: '#FF385C', background: '#fff', fontSize: '1rem' }}
              className="rounded-lg px-4 py-2 font-semibold hover:bg-[#FFF0F4] transition w-full sm:w-auto"
              onClick={() => window.location.href = "/"}
            >
              Go to Homepage
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
} 