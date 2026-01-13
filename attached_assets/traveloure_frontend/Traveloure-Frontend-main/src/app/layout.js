// src/app/layout.js
import "./globals.css";
import { Geist } from "next/font/google";
import ReduxProvider from "../components/ReduxProvider";
import Providers from "./Provider";
import RedirectAuth from "../components/RedirectAuth";
import ChunkErrorHandler from "../components/ChunkErrorHandler";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: "Traveloure",
  description: "Your Travel Companion",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={geistSans.variable}>
      <head>
        {/* Travelpayouts Verification Script */}
        <script
          data-noptimize="1"
          data-cfasync="false"
          data-wpfc-render="false"
          dangerouslySetInnerHTML={{
            __html: `(function () {
              var script = document.createElement("script");
              script.async = 1;
              script.src = 'https://emrldtp.com/NDM0NTU1.js?t=434555';
              document.head.appendChild(script);
            })();`,
          }}
        />
        {/* Chunk Error Handler Script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Handle chunk load errors
                window.addEventListener('error', function(e) {
                  if (e.message && (e.message.includes('Loading chunk') || e.message.includes('ChunkLoadError'))) {
                    console.warn('ChunkLoadError detected, clearing cache and reloading...');
                    // Clear caches
                    if ('caches' in window) {
                      caches.keys().then(function(names) {
                        names.forEach(function(name) {
                          caches.delete(name);
                        });
                      });
                    }
                    // Reload after clearing cache
                    setTimeout(function() {
                      window.location.reload();
                    }, 100);
                  }
                }, true);
                
                // Handle unhandled promise rejections (chunk errors)
                window.addEventListener('unhandledrejection', function(e) {
                  if (e.reason && e.reason.message && 
                      (e.reason.message.includes('Loading chunk') || 
                       e.reason.message.includes('ChunkLoadError') ||
                       e.reason.name === 'ChunkLoadError')) {
                    console.warn('ChunkLoadError in promise, clearing cache and reloading...');
                    e.preventDefault();
                    if ('caches' in window) {
                      caches.keys().then(function(names) {
                        names.forEach(function(name) {
                          caches.delete(name);
                        });
                      });
                    }
                    setTimeout(function() {
                      window.location.reload();
                    }, 100);
                  }
                });
              })();
            `,
          }}
        />
      </head>
      <body>
        <ReduxProvider>
          <Providers>
            <ChunkErrorHandler />
            <RedirectAuth />
            {children}
          </Providers>
        </ReduxProvider>
      </body>
    </html>
  );
}
