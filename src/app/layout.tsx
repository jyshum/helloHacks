import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import PageTransition from "@/components/app/PageTransition";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Hopped",
  description: "Ride to UBC together.",
  // PWA install + web push (iOS only allows push for apps added to the Home Screen).
  manifest: "/manifest.webmanifest",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Hopped", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F5F8FC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Local demo recordings only: share the server's shifted clock with the page. */}
      {process.env.DEMO_CLOCK_OFFSET_MS && (
        <head>
          <script dangerouslySetInnerHTML={{ __html: `window.__clockOffset=${Number(process.env.DEMO_CLOCK_OFFSET_MS)};` }} />
        </head>
      )}
      <body className={inter.variable}>
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}
