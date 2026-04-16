/**
 * Devidends Co-Creators — founding circle helpers.
 * Token generation, name matching to existing profiles, admin-side utilities.
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

export function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** 8-char alphanumeric token. Not cryptographically sensitive — just hard to guess. */
export function generateInviteToken(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // avoid i/l/o/0/1 confusion
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** Find an existing profile by fuzzy name match (case-insensitive, first-word). */
export async function findProfileByName(name: string) {
  const sb = getAdmin();
  const firstName = name.trim().split(/\s+/)[0];
  if (!firstName) return null;

  // Try exact case-insensitive first
  const { data: exact } = await sb
    .from("profiles")
    .select("id, name, headline, sectors, cv_score, claimed_at, cv_structured_data")
    .ilike("name", name.trim())
    .limit(1)
    .maybeSingle();
  if (exact) return exact;

  // Fall back to starts-with on first name
  const { data: prefix } = await sb
    .from("profiles")
    .select("id, name, headline, sectors, cv_score, claimed_at, cv_structured_data")
    .ilike("name", `${firstName}%`)
    .limit(5);

  return prefix && prefix.length === 1 ? prefix[0] : null;
}

export const INTEREST_OPTIONS = [
  { id: "priority_alerts", label: "Priority alerts on jobs & tenders (24h early)" },
  { id: "tor_preview", label: "Pre-announcements of ToRs before they're public" },
  { id: "shortlists", label: "Request shortlists for bids I'm leading" },
  { id: "recommend", label: "Recommend consultants to the network" },
  { id: "gigs_inbound", label: "Get short-term gigs / consulting opportunities" },
  { id: "gigs_outbound", label: "Post my own consulting availability" },
  { id: "share_tors", label: "Share/announce ToRs I'm running" },
  { id: "cv_tools", label: "CV scoring + donor-ready templates" },
  { id: "network_access", label: "Connect with other Co-Creators in my sector" },
  { id: "leaderboard", label: "Be featured on the Co-Creators leaderboard" },
];

export const SECTOR_OPTIONS = [
  "Humanitarian Aid & Emergency",
  "Global Health",
  "WASH",
  "Food Security & Nutrition",
  "Agriculture & Rural Development",
  "Education & Training",
  "Environment & Climate Change",
  "Economic Development & Trade",
  "Gender & Social Inclusion",
  "Project Management & M&E",
  "Research & Data Analytics",
  "Procurement & Grants",
  "Governance & Public Sector",
  "Private Sector Development",
  "ICT & Digital",
  "Finance & Banking",
];

export const REGION_OPTIONS = [
  "Ethiopia",
  "East Africa",
  "Horn of Africa",
  "Pan-African",
  "Global",
];
