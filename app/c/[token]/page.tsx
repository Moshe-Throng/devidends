import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { shortName } from "@/lib/name-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Dynamic OG tags so LinkedIn / Twitter / WhatsApp render a rich card
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const sb = getAdmin();
  const { data: cc } = await sb
    .from("co_creators")
    .select("name, role_title")
    .eq("invite_token", token)
    .maybeSingle();

  const displayName = shortName(cc?.name);
  const title = cc
    ? `${displayName} · Devidends Co-Creator`
    : "Devidends Co-Creator";
  const description = cc?.role_title
    ? `${displayName} · ${cc.role_title} · Founding member of the Devidends network.`
    : `Founding member of Devidends — Horn of Africa's development talent network.`;
  const ogUrl = `https://devidends.net/api/og/co-creator/${token}`;
  const pageUrl = `https://devidends.net/c/${token}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "Devidends",
      images: [{ url: ogUrl, width: 1200, height: 630, alt: title }],
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogUrl],
    },
  };
}

export default async function CoCreatorSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const sb = getAdmin();
  const { data: cc } = await sb
    .from("co_creators")
    .select("name, role_title, preferred_sectors, joined_at, profile_id, status")
    .eq("invite_token", token)
    .maybeSingle();

  if (!cc || cc.status !== "joined") {
    return (
      <main className="min-h-screen bg-[#f7f9fb] flex items-center justify-center p-6 font-[Montserrat]">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-bold text-[#212121] mb-2">Not found</h1>
          <p className="text-sm text-[#666]">This Co-Creator card isn&apos;t available.</p>
          <Link href="/" className="inline-block mt-6 text-[#27ABD2] underline">
            Visit Devidends
          </Link>
        </div>
      </main>
    );
  }

  let headline: string | null = cc.role_title;
  if (!headline && cc.profile_id) {
    const { data: p } = await sb
      .from("profiles")
      .select("headline")
      .eq("id", cc.profile_id)
      .maybeSingle();
    headline = p?.headline || null;
  }

  const sectors: string[] = (cc.preferred_sectors || []).slice(0, 5);

  return (
    <main className="min-h-screen bg-gradient-to-br from-white via-[#f7f9fb] to-[#eaf6fb] font-[Montserrat]">
      <div className="max-w-2xl mx-auto px-5 py-10 md:py-16">
        {/* Logo */}
        <Link href="/" className="inline-block mb-10 text-2xl font-bold tracking-tight">
          <span className="text-[#27ABD2]">Dev</span>
          <span className="text-[#212121]">idends</span>
        </Link>

        {/* Main card */}
        <div className="bg-white rounded-2xl border border-[#e5e9ed] p-10 md:p-14 shadow-sm">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#27ABD2]/10 border border-[#27ABD2]/30 mb-8">
            <span className="w-2 h-2 rounded-full bg-[#27ABD2]" />
            <span className="text-xs font-bold text-[#1e98bd] tracking-wider uppercase">
              Founding Co-Creator
            </span>
          </div>

          {/* Name */}
          <h1 className="text-4xl md:text-5xl font-bold text-[#212121] tracking-tight mb-3 leading-tight">
            {shortName(cc.name)}
          </h1>

          {/* Headline */}
          {headline && (
            <p className="text-lg text-[#555] leading-relaxed mb-6">{headline}</p>
          )}

          {/* Sectors */}
          {sectors.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-10">
              {sectors.map((s) => (
                <span
                  key={s}
                  className="px-3 py-1 rounded-full bg-[#f7f9fb] border border-[#e5e9ed] text-sm text-[#444] font-medium"
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          <div className="border-t border-[#e5e9ed] pt-8">
            <p className="text-[15px] text-[#444] leading-relaxed mb-6">
              <span className="font-semibold text-[#212121]">{shortName(cc.name).split(" ")[0]}</span>{" "}
              is a founding member of the <strong>Devidends Co-Creators</strong> — a trusted
              circle of development professionals shaping how Ethiopian and Horn of Africa
              talent connects with the right opportunities.
            </p>

            <p className="text-[15px] text-[#444] leading-relaxed mb-8">
              Devidends serves 1,000+ development professionals, aggregates 400+ live
              opportunities daily from 20+ donor sources, and scores CVs free against
              GIZ, World Bank, EU, and UN standards.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[#27ABD2] hover:bg-[#1e98bd] text-white font-semibold text-sm transition-colors"
              >
                Explore Devidends →
              </Link>
              <Link
                href="/score"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-[#d5dade] text-[#212121] hover:border-[#27ABD2] font-semibold text-sm transition-colors"
              >
                Score my CV free
              </Link>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-[#999] mt-8">
          Horn of Africa&apos;s development talent network · devidends.net
        </p>
      </div>
    </main>
  );
}
