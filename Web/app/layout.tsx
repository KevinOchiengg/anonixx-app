import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Fraunces } from "next/font/google";
import "./globals.css";
import "./app.css";
import "./parity.css";
import "./compose.css";
import "./profile.css";
import "./unlock.css";
import "./call.css";
import "./feedparity.css";
import "./discover.css";
import "./room.css";
import { SITE_URL } from "@/lib/api";
import { AuthProvider } from "@/lib/auth";
import OfflineBar from "@/components/OfflineBar";
import VisitTracker from "@/components/VisitTracker";

const ADSENSE = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Anonixx — anonymous confessions, real desire",
    template: "%s | Anonixx",
  },
  description:
    "Read anonymous confessions people could never say out loud. Drop yours, stay hidden, and link up only if you both want to.",
  applicationName: "Anonixx",
  openGraph: {
    siteName: "Anonixx", type: "website", locale: "en_US",
    images: [{ url: "/og", width: 1200, height: 630, alt: "Anonixx: say what you can't say out loud." }],
  },
  twitter: { card: "summary_large_image", images: ["/og"] },
  icons: { icon: "/icon.png", apple: "/icon.png" },
  robots: { index: true, follow: true },
  // Google Search Console HTML-tag verification, if that method is used instead of DNS.
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0f18",
};

// Brand serif (same face as the app's display font): caption hooks, text-only
// confessions, compose. Exposed as --font-serif.
const serif = Fraunces({ subsets: ["latin"], style: ["italic"], weight: ["400", "600"], variable: "--font-serif", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={serif.variable}>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <OfflineBar />
        <VisitTracker />
        {ADSENSE ? (
          <Script
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}`}
          />
        ) : null}
      </body>
    </html>
  );
}
