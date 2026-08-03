import "./globals.css";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Bricolage_Grotesque } from "next/font/google";
import type { ReactNode } from "react";

// Überschriften-Schrift. Variabel, technisch-redaktionell, mit eigenem
// Charakter — Geist trägt weiter Fließtext und Bedienung, Geist Mono den
// Timecode. Nur die Schnitte laden, die auch benutzt werden.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-bricolage",
  display: "swap",
});

export const metadata = {
  title: "CreatorHQ",
  description: "Aus deinen Videos werden Clips — Schnitt, Terminplanung und Veröffentlichung auf allen Kanälen",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="de"
      className={`${GeistSans.variable} ${GeistMono.variable} ${bricolage.variable}`}
    >
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
