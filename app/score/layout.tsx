import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CV Scorer — AI-Powered CV Analysis for Development Professionals",
  description:
    "Score your CV across 6 dimensions with AI. Get actionable feedback tailored for World Bank, GIZ, UNDP, and UN screening processes. Free and instant.",
  openGraph: {
    title: "CV Scorer — Score Your Development CV with AI",
    description:
      "Get your CV scored across 6 dimensions. AI-powered feedback for international development careers.",
    url: "/score",
  },
  alternates: {
    canonical: "/score",
  },
};

export default function ScoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
