import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isAdmin } from "@/lib/admin";

/**
 * GET /api/admin/devex-bench
 *
 * Admin-only. Returns coverage summary, miss domains, and sample unmatched
 * entries for the /admin/bid-support/devex-bench dashboard.
 */

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };
  if (!isAdmin(user.id)) return { ok: false, status: 403 };
  return { ok: true };
}

export async function GET(_req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });

  const sb = getAdmin();
  const [coverageRes, missesRes, unmatchedRes] = await Promise.all([
    sb.from("devex_coverage_daily").select("*").order("batch_date", { ascending: false }).limit(14),
    sb.from("devex_miss_domains").select("*").order("miss_count", { ascending: false }).limit(20),
    sb
      .from("devex_benchmark")
      .select("id, batch_date, alert_type, title, url, organization, country, miss_domain")
      .is("matched_opportunity_id", null)
      .eq("match_method", "none")
      .order("email_received_at", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    coverage: coverageRes.data || [],
    miss_domains: missesRes.data || [],
    unmatched: unmatchedRes.data || [],
  });
}
