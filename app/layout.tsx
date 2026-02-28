import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const siteUrl = "https://app.devidends.org";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#27ABD2",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default:
      "Devidends — Empowering Your Ventures in International Development",
    template: "%s | Devidends",
  },
  description:
    "AI-powered intelligence platform for international development professionals. Browse 845+ jobs, tenders & grants from 84+ sources. Score and build donor-ready CVs.",
  keywords: [
    "development jobs Ethiopia",
    "international development careers",
    "consulting opportunities East Africa",
    "GIZ jobs",
    "World Bank tenders",
    "UNDP vacancies",
    "UN jobs Ethiopia",
    "grants East Africa",
    "CV scorer",
    "donor-ready CV",
    "development sector",
    "NGO jobs",
  ],
  authors: [{ name: "Devidends", url: "https://www.devidends.org" }],
  creator: "Envest Technologies PLC",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Devidends",
    title: "Devidends — International Development Intelligence Platform",
    description:
      "Browse 845+ opportunities from 84+ sources. AI-powered CV tools for development professionals.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Devidends — Empowering Your Ventures in International Development",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Devidends — International Development Intelligence",
    description:
      "Browse 845+ opportunities from 84+ sources. AI-powered CV tools for development professionals.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className={`${montserrat.variable} antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
