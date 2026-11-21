import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Libre_Caslon_Text } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

// Caslon: the face of colonial Boston printing. Hanken Grotesk: a clean signage sans.
const caslon = Libre_Caslon_Text({ variable: "--font-caslon", subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"] });
const hanken = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TQuest: make every ride an adventure",
  description: "Turn Boston's MBTA into a city exploration game: guided journeys, station stamps, Gemini landmark recognition and Guess Boston.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "TQuest", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f5efe0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${caslon.variable} ${hanken.variable} antialiased`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
