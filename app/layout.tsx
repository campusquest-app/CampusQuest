import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { AppRootProviders } from "@/components/AppRootProviders";
import "./globals.css";
import "./manual-log.css";
import "./modal-layer.css";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const viewport: Viewport = {
  themeColor: "#041E42",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "CampusQuest — Your campus, connected",
  description:
    "CampusQuest is the community app for University of Rhode Island students. Discover campus events, personalized For You recommendations, The Realm campus map, organizations, The Quad social feed, messaging, and student perks.",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "CampusQuest — Your campus, connected",
    description:
      "Discover campus events, The Realm map, organizations, The Quad feed, messaging, and student perks — built for URI students.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`} style={{ backgroundColor: "#041E42" }}>
      <head>
        <link rel="preload" href="/campusquest-logo.png" as="image" type="image/png" />
      </head>
      <body
        className="font-sans flex min-h-[100dvh] flex-col overflow-x-hidden bg-uri-navy"
        style={{ backgroundColor: "#041E42" }}
      >
        <AppRootProviders>{children}</AppRootProviders>
      </body>
    </html>
  );
}
