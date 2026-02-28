import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subscribe — Get Weekly Development Opportunities",
  description:
    "Subscribe to weekly curated development opportunities via email or Telegram. Jobs, tenders, and grants from 84+ sources, filtered by your preferences. Free.",
  openGraph: {
    title: "Subscribe to Devidends — Weekly Opportunity Alerts",
    description:
      "Get curated development opportunities delivered weekly. Email or Telegram. Free.",
    url: "/subscribe",
  },
  alternates: {
    canonical: "/subscribe",
  },
};

export default function SubscribeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
