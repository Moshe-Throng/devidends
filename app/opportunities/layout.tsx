import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Opportunities — Jobs, Tenders & Grants in International Development",
  description:
    "Browse 845+ curated jobs, tenders, and consulting opportunities from 84+ sources including World Bank, GIZ, UNDP, UN agencies, and NGOs across East Africa.",
  openGraph: {
    title: "Development Opportunities — Jobs, Tenders & Grants",
    description:
      "845+ curated opportunities from 84+ sources. Filtered, quality-scored, and updated daily.",
    url: "/opportunities",
  },
  alternates: {
    canonical: "/opportunities",
  },
};

export default function OpportunitiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
