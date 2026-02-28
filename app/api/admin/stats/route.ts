import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isAdmin, isAdminConfigured } from "@/lib/admin";
import fs from "fs";
import path from "path";

const TEST_OUTPUT_DIR = path.join(process.cwd(), "test-output");

interface SourceStats {
  name: string;
  count: number;
  sparse: number;
  avgDescLen: number;
  lastModified: string | null;
}

function getSourceStats(): SourceStats[] {
  const results: SourceStats[] = [];

  if (!fs.existsSync(TEST_OUTPUT_DIR)) return results;

  const files = fs.readdirSync(TEST_OUTPUT_DIR).filter(
    (f) => f.endsWith(".json") && !f.startsWith("_")
  );

  for (const file of files) {
    const filePath = path.join(TEST_OUTPUT_DIR, file);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) continue;

      const stat = fs.statSync(filePath);
      const sparse = data.filter(
        (j: Record<string, unknown>) =>
          !j.description || String(j.description).length < 80
      ).length;

      const totalDescLen = data.reduce(
        (sum: number, j: Record<string, unknown>) =>
          sum + (j.description ? String(j.description).length : 0),
        0
      );

      results.push({
        name: file.replace(".json", ""),
        count: data.length,
        sparse,
        avgDescLen: data.length > 0 ? Math.round(totalDescLen / data.length) : 0,
        lastModified: stat.mtime.toISOString(),
      });
    } catch {
      // Skip malformed files
    }
  }

  return results;
}

export async function GET() {
  // Auth check
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminConfigured()) {
    return NextResponse.json({
      error: "Admin not configured",
      setup_guide: true,
      user_id: user.id,
    }, { status: 403 });
  }

  if (!isAdmin(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Gather stats
  const sourceStats = getSourceStats();
  const totalOpportunities = sourceStats.reduce((s, x) => s + x.count, 0);
  const totalSparse = sourceStats.reduce((s, x) => s + x.sparse, 0);

  // Supabase stats
  const [subscribersRes, profilesRes, cvScoresRes] = await Promise.all([
    supabase.from("subscriptions").select("id, channel, is_active", { count: "exact" }),
    supabase.from("profiles").select("id, cv_score, profile_score_pct, created_at", { count: "exact" }),
    supabase.from("cv_scores").select("id, overall_score", { count: "exact" }),
  ]);

  const subscribers = subscribersRes.data || [];
  const profiles = profilesRes.data || [];
  const cvScores = cvScoresRes.data || [];

  const activeSubscribers = subscribers.filter(
    (s: { is_active: boolean }) => s.is_active
  ).length;
  const emailSubs = subscribers.filter(
    (s: { channel: string }) => s.channel === "email" || s.channel === "both"
  ).length;
  const telegramSubs = subscribers.filter(
    (s: { channel: string }) => s.channel === "telegram" || s.channel === "both"
  ).length;

  const avgCvScore =
    cvScores.length > 0
      ? Math.round(
          cvScores.reduce(
            (s: number, c: { overall_score: number | null }) =>
              s + (c.overall_score || 0),
            0
          ) / cvScores.length
        )
      : 0;

  const avgProfileScore =
    profiles.length > 0
      ? Math.round(
          profiles.reduce(
            (s: number, p: { profile_score_pct: number }) =>
              s + (p.profile_score_pct || 0),
            0
          ) / profiles.length
        )
      : 0;

  return NextResponse.json({
    opportunities: {
      total: totalOpportunities,
      sparse_descriptions: totalSparse,
      pct_with_descriptions: totalOpportunities > 0
        ? Math.round(((totalOpportunities - totalSparse) / totalOpportunities) * 100)
        : 0,
      sources: sourceStats,
    },
    subscribers: {
      total: subscribers.length,
      active: activeSubscribers,
      by_channel: { email: emailSubs, telegram: telegramSubs },
    },
    experts: {
      total: profiles.length,
      with_cv_score: profiles.filter(
        (p: { cv_score: number | null }) => p.cv_score != null && p.cv_score > 0
      ).length,
      avg_cv_score: avgCvScore,
      avg_profile_score: avgProfileScore,
    },
    cv_scores: {
      total: cvScores.length,
      avg_score: avgCvScore,
    },
  });
}
