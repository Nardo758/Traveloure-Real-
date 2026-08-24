"use client";

import { usePathname } from "next/navigation";
import Header from "../components/Header";
import Footer from "../components/footer";
import { SessionProvider } from "next-auth/react";
import AuthSessionManager from "../components/AuthSessionManager";
// Import axiosInterceptor to ensure interceptors are set up
import "../lib/axiosInterceptor";

export default function Providers({ children }) {
  const pathname = usePathname();

  const hideHeaderFooter = pathname.startsWith("/Itinerary");
  const hideHelpmeDecide = pathname.startsWith("/help-me-decide");
  const dashboard = pathname.startsWith("/dashboard");
  const admin = pathname.startsWith("/admin");
  const aiOptimization = pathname.startsWith("/ai-optimization");
  const localExpertPanel = pathname.startsWith("/local-expert/");
  const serviceProviderPanel = pathname.startsWith("/service-provider-panel");
  const shouldHideHeaderFooter = hideHeaderFooter || hideHelpmeDecide || dashboard || admin || aiOptimization || serviceProviderPanel || localExpertPanel;
  return (
    <SessionProvider>
      <AuthSessionManager />
      {!shouldHideHeaderFooter && <Header />}
      {children}
      {!shouldHideHeaderFooter && <Footer />}
    </SessionProvider>
  );
}
