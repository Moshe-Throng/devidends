import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CV Builder — Transform Your CV to Donor-Ready Format",
  description:
    "Upload any CV and transform it into World Bank or UN format. AI-powered extraction with professional DOCX export. Built for development professionals.",
  openGraph: {
    title: "CV Builder — Donor-Ready CV in Minutes",
    description:
      "Transform your CV to World Bank/UN format with AI extraction and DOCX export.",
    url: "/cv-builder",
  },
  alternates: {
    canonical: "/cv-builder",
  },
};

export default function CvBuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
