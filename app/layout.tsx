import type { Metadata } from "next";
import { Manrope, Inter } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "ProspectIQ",
    template: "%s | ProspectIQ",
  },
  description:
    "AI-powered B2B revenue intelligence: company discovery, research, opportunity detection, and personalized outreach — all evidence-first.",
  keywords: ["B2B", "lead generation", "revenue intelligence", "sales automation", "outreach"],
};

import { Providers } from "./providers";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${manrope.variable} ${inter.variable}`}>
      <body className={`antialiased bg-[#F5F5F7] text-[#1D1D1F] ${inter.className}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

