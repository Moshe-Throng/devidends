/**
 * Shared taxonomy constants used across the platform.
 * Keep in sync with tools/normalize_fields.py categories.
 */

export const SECTORS = [
  // Core development sectors
  "Humanitarian Aid & Emergency",
  "Global Health",
  "Food Security & Nutrition",
  "Agriculture & Rural Development",
  "WASH (Water, Sanitation & Hygiene)",
  "Education & Training",
  "Environment & Climate Change",
  "Energy & Infrastructure",
  "Economic Development & Trade",
  "Governance & Rule of Law",
  "Gender & Social Inclusion",
  "Peace & Security",
  "Migration & Displacement",
  // Professional / cross-cutting
  "Finance & Banking",
  "Innovation & ICT",
  "Project Management & M&E",
  "Supply Chain & Logistics",
  "Human Resources & Admin",
  "Media & Communications",
  "Research & Data Analytics",
  "Legal & Compliance",
  "Procurement & Grants",
  // Specialized
  "Child Protection",
  "Youth & Livelihoods",
  "Urban Development & Housing",
  "Transport",
  "Mining & Extractives",
  "Private Sector Development",
] as const;

export const DONORS = [
  "GIZ",
  "World Bank",
  "EU / EuropeAid",
  "UNDP",
  "USAID",
  "AfDB",
  "UNICEF",
  "DFID / FCDO",
  "KfW",
  "SIDA",
  "WHO",
  "UNHCR",
  "WFP",
  "UNFPA",
  "ILO",
  "FAO",
  "DANIDA",
  "NORAD",
  "JICA",
  "Gates Foundation",
  "Global Fund",
  "GAVI",
  "MasterCard Foundation",
] as const;

export const COUNTRIES = [
  "Ethiopia",
  "Kenya",
  "Uganda",
  "Tanzania",
  "Somalia",
  "South Sudan",
  "Sudan",
  "Djibouti",
  "Eritrea",
  "Rwanda",
  "DRC",
  "Nigeria",
  "Mozambique",
  "Remote / Global",
] as const;

export const NEWS_CATEGORIES = [
  { id: "Humanitarian",        label: "Humanitarian",          emoji: "🆘" },
  { id: "Policy & Governance", label: "Policy & Governance",   emoji: "🏛️" },
  { id: "Funding & Donors",    label: "Funding & Donors",      emoji: "💰" },
  { id: "Health",              label: "Health",                emoji: "🏥" },
  { id: "Economy & Trade",     label: "Economy & Trade",       emoji: "📈" },
  { id: "Climate & Environment", label: "Climate & Environment", emoji: "🌍" },
  { id: "Education",           label: "Education",             emoji: "📚" },
  { id: "General",             label: "General",               emoji: "📰" },
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number]["id"];
export type Sector = (typeof SECTORS)[number];
export type Donor = (typeof DONORS)[number];
export type Country = (typeof COUNTRIES)[number];
