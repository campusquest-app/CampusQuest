import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

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
  themeColor: "#0A1F44",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "CampusQuest — Level Up Your College Experience",
  description: "CampusQuest helps you level up your college experience. Log workouts, study sessions, and campus life while you earn XP, build stats, and compete on The Quad.",
  openGraph: {
    title: "CampusQuest — Level Up Your College Experience",
    description: "Level Up Your College Experience with CampusQuest. Earn XP, build stats, and compete on The Quad.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="font-sans flex min-h-[100dvh] flex-col overflow-x-hidden bg-cq-app">
        {children}
      </body>
    </html>
  );
}
