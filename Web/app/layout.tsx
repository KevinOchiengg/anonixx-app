import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import "./app.css";
import { SITE_URL } from "@/lib/api";
import { AuthProvider } from "@/lib/auth";

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
  openGraph: { siteName: "Anonixx", type: "website", locale: "en_KE" },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0308",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
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
