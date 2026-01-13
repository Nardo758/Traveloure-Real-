"use client"

import Link from "next/link"
import { Button } from "../../components/ui/button"
import Header from "../../components/Header"
import Footer from "../../components/footer"
import Image from "next/image"
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { getLocalExpertStatus, clearExpertStatus } from "../redux-features/Travelexperts/travelexpertsSlice";
import { getServiceProviderStatus, clearProviderStatus } from "../redux-features/service-provider/serviceProviderSlice";

export default function PartnerWithUsPage() {
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState(""); // "pending", "approved", "rejected"
  const [pendingRedirect, setPendingRedirect] = useState(""); // "expert" or "provider"
  const [checkingType, setCheckingType] = useState(""); // "expert" or "provider"
  const { data: session } = useSession();
  const router = useRouter();
  const dispatch = useDispatch();
  
  const { expertStatus, expertStatusLoading, expertStatusError } = useSelector(
    (state) => state.travelExperts || {}
  );
  
  const { serviceProviderStatus, loading: providerStatusLoading, error: providerStatusError } = useSelector(
    (state) => state.serviceProvider || {}
  );

  // Handle expert status response
  useEffect(() => {
    if (expertStatus && expertStatus.data) {
      const status = expertStatus.data.status;
      
      if (status === "pending") {
        setStatusType("pending");
        setStatusMessage("Your form is already submitted. Please wait for approval.");
        setShowStatusModal(true);
      } else if (status === "approved") {
        setStatusType("approved");
        setStatusMessage("Your application has been approved! You need to logout and login again to access expert features.");
        setShowStatusModal(true);
      } else if (status === "rejected") {
        // Rejected - allow user to reapply by going to form
        router.push("/travel-experts");
      }
    }
  }, [expertStatus, router]);

  // Handle error (404 means user hasn't applied yet)
  useEffect(() => {
    if (expertStatusError) {
      if (expertStatusError.notFound) {
        // User hasn't applied yet, redirect to form
        router.push("/travel-experts");
      }
      // Clear error after handling
      dispatch(clearExpertStatus());
    }
  }, [expertStatusError, router, dispatch]);

  const handleJoinAsExpert = async () => {
    if (!session?.backendData?.accessToken) {
      setPendingRedirect("expert");
      setShowLoginPrompt(true);
    } else {
      // Check expert status first
      setCheckingType("expert");
      await dispatch(getLocalExpertStatus({ token: session.backendData.accessToken }));
    }
  };

  const handleJoinAsProvider = async () => {
    if (!session?.backendData?.accessToken) {
      setPendingRedirect("provider");
      setShowLoginPrompt(true);
    } else {
      // Check provider status first
      setCheckingType("provider");
      await dispatch(getServiceProviderStatus({ token: session.backendData.accessToken }));
    }
  };

  // Handle service provider status response
  useEffect(() => {
    if (serviceProviderStatus && serviceProviderStatus.data) {
      const status = serviceProviderStatus.data.status;
      
      if (status === "pending") {
        setStatusType("pending");
        setStatusMessage("Your service provider application is already submitted. Please wait for approval.");
        setShowStatusModal(true);
      } else if (status === "approved") {
        setStatusType("approved");
        setStatusMessage("Your service provider application has been approved! You need to logout and get your new credentials from your email and login again.");
        setShowStatusModal(true);
      } else if (status === "rejected") {
        // Rejected - allow user to reapply by going to form
        router.push("/services-provider");
      }
    }
  }, [serviceProviderStatus, router]);

  // Handle provider error (404 means user hasn't applied yet)
  useEffect(() => {
    if (providerStatusError) {
      if (providerStatusError.notFound) {
        // User hasn't applied yet, redirect to form
        router.push("/services-provider");
      }
      // Clear error after handling
      dispatch(clearProviderStatus());
    }
  }, [providerStatusError, router, dispatch]);

  return (
    <>
      <div className="min-h-[80vh] flex flex-col items-center justify-center bg-gradient-to-br from-white to-gray-50 py-12 px-2">
      <h1 className="text-3xl sm:text-4xl font-bold text-center mb-2">
        <span className="text-[#58ac00]">Partner With Us</span> to Shape Smarter Journeys
      </h1>
      <p className="text-center text-gray-500 max-w-[758px] mb-8">
        Become a part of Travel AI—help travelers plan better or promote your travel services through intelligent trip planning tools.
      </p>
      <div className="flex flex-col md:flex-row gap-6 w-full max-w-4xl justify-center">
        {/* Local Travel Expert Card */}
        <div className="flex-1 bg-white rounded-2xl shadow-md border p-8 flex flex-col items-center text-center">
          <Image src="/traveler-expert.png" alt="Expert" className="mb-6" width={24} height={24} />
          <h2 className="font-semibold text-lg mb-2">Want to Become a Local Travel Expert?</h2>
          <p className="text-gray-500 mb-6 text-sm">Help travellers by reviewing and customizing their AI itineraries with your local insights.</p>
          <Button
            className="bg-[#FF385C] hover:bg-[#e23350] text-white w-full max-w-[150px] py-2 rounded-md font-semibold"
            onClick={handleJoinAsExpert}
            disabled={expertStatusLoading}
          >
            {expertStatusLoading ? "Checking..." : "Join as Expert"}
          </Button>
        </div>
        {/* Service Provider Card */}
        <div className="flex-1 bg-white rounded-2xl shadow-md border p-8 flex flex-col items-center text-center">
          <Image src="/service-pro.png" alt="Provider" className="mb-6" width={24} height={24} />
          <h2 className="font-semibold text-lg mb-4">Want to Become a Service Provider?</h2>
          <p className="text-gray-500 mb-7 text-sm">Offer your services—tours, stays, transport—and get featured in AI itineraries.</p>
          <Button
            className="bg-[#FF385C] hover:bg-[#e23350] text-white w-full max-w-[150px] py-2 rounded-md font-semibold"
            onClick={handleJoinAsProvider}
            disabled={providerStatusLoading}
          >
            {providerStatusLoading ? "Checking..." : "Join as Provider"}
          </Button>
        </div>
      </div>
      {/* Login Prompt Modal */}
      {showLoginPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-sm w-full text-center">
            <h2 className="text-xl font-bold mb-4">You have to login first</h2>
            <div className="flex gap-4 justify-center">
              <Button
                className="bg-[#FF385C] text-white"
                onClick={() => {
                  setShowLoginPrompt(false);
                  router.push("/login");
                }}
              >
                Go to Login
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowLoginPrompt(false);
                  router.push("/");
                }}
              >
                No, Go to Home
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Application Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
            <div className="flex flex-col items-center text-center">
              {/* Icon based on status */}
              {statusType === "pending" && (
                <div className="mb-4">
                  <div className="relative flex items-center justify-center" style={{ height: 80, width: 80 }}>
                    <div style={{
                      position: 'absolute',
                      width: 80,
                      height: 80,
                      borderRadius: '50%',
                      background: '#FFF7ED',
                      zIndex: 1
                    }} />
                    <div style={{
                      position: 'absolute',
                      width: 55,
                      height: 55,
                      borderRadius: '50%',
                      background: '#FFEDD5',
                      zIndex: 2
                    }} />
                    <div style={{
                      position: 'absolute',
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: '#F97316',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 3
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}
              {statusType === "approved" && (
                <div className="mb-4">
                  <div className="relative flex items-center justify-center" style={{ height: 80, width: 80 }}>
                    <div style={{
                      position: 'absolute',
                      width: 80,
                      height: 80,
                      borderRadius: '50%',
                      background: '#F0FDF4',
                      zIndex: 1
                    }} />
                    <div style={{
                      position: 'absolute',
                      width: 55,
                      height: 55,
                      borderRadius: '50%',
                      background: '#DCFCE7',
                      zIndex: 2
                    }} />
                    <div style={{
                      position: 'absolute',
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: '#16A34A',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 3
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}
              
              <h2 className="text-2xl font-bold mb-3">
                {statusType === "pending" ? "Application Pending" : "Application Approved!"}
              </h2>
              <p className="text-gray-600 mb-6">
                {statusMessage}
              </p>
              
              <div className="flex gap-3 w-full">
                {statusType === "approved" && (
                  <Button
                    className="flex-1 bg-[#FF385C] text-white hover:bg-[#e23350]"
                    onClick={async () => {
                      setShowStatusModal(false);
                      if (checkingType === "expert") {
                        dispatch(clearExpertStatus());
                      } else {
                        dispatch(clearProviderStatus());
                      }
                      // Logout user and redirect to login page
                      await signOut({ redirect: false });
                      router.push("/login");
                    }}
                  >
                    Logout & Login Again
                  </Button>
                )}
                <Button
                  variant={statusType === "approved" ? "outline" : "default"}
                  className={statusType === "approved" ? "flex-1" : "w-full bg-[#FF385C] text-white hover:bg-[#e23350]"}
                  onClick={() => {
                    setShowStatusModal(false);
                    if (checkingType === "expert") {
                      dispatch(clearExpertStatus());
                    } else {
                      dispatch(clearProviderStatus());
                    }
                    router.push("/");
                  }}
                >
                  Go to Home
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  )
} 