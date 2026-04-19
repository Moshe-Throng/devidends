import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

const SIZE = { width: 1200, height: 630 };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: cc } = await supabase
    .from("co_creators")
    .select("name, role_title, preferred_sectors, joined_at, profile_id, member_number")
    .eq("invite_token", token)
    .maybeSingle();

  if (!cc) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f7f9fb",
            fontSize: 48,
            color: "#212121",
            fontFamily: "Helvetica",
          }}
        >
          Devidends
        </div>
      ),
      SIZE
    );
  }

  // Pull extra signal from linked profile (headline + CV score)
  let headline: string | null = null;
  let sectors: string[] = cc.preferred_sectors || [];
  if (cc.profile_id) {
    const { data: p } = await supabase
      .from("profiles")
      .select("headline, sectors")
      .eq("id", cc.profile_id)
      .maybeSingle();
    headline = p?.headline || null;
    if ((!sectors || sectors.length === 0) && p?.sectors) sectors = p.sectors;
  }

  // Short name: drop 3rd+ words (grandfather names)
  const shortedName = (() => {
    const parts = cc.name.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 2) return cc.name.trim();
    return parts.slice(0, 2).join(" ");
  })();

  const roleRaw = cc.role_title || headline || "Development Professional";
  // Truncate gracefully if very long (preserves words)
  const role = roleRaw.length > 90
    ? roleRaw.slice(0, 87).replace(/\s\S*$/, "") + "…"
    : roleRaw;
  const topSectors = (sectors || []).slice(0, 3).join(" · ");

  // Dynamic font sizes to avoid overflow
  const nameFontSize = shortedName.length > 22 ? 72 : shortedName.length > 16 ? 84 : 96;
  const roleFontSize = role.length > 70 ? 22 : role.length > 50 ? 26 : 30;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #ffffff 0%, #f7f9fb 60%, #eaf6fb 100%)",
          padding: 64,
          position: "relative",
          fontFamily: "Helvetica",
        }}
      >
        {/* Background accent — soft diagonal cyan shape */}
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 480,
            height: 480,
            borderRadius: 240,
            background: "radial-gradient(circle, rgba(39,171,210,0.18) 0%, rgba(39,171,210,0) 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -80,
            left: -80,
            width: 280,
            height: 280,
            borderRadius: 140,
            background: "radial-gradient(circle, rgba(36,207,214,0.15) 0%, rgba(36,207,214,0) 70%)",
            display: "flex",
          }}
        />

        {/* Header: logo + badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", fontSize: 38, fontWeight: 800 }}>
            <span style={{ color: "#27ABD2" }}>Dev</span>
            <span style={{ color: "#212121" }}>idends</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 22px",
              borderRadius: 40,
              background: "rgba(39,171,210,0.1)",
              border: "1.5px solid rgba(39,171,210,0.4)",
              color: "#1e98bd",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                background: "#27ABD2",
                display: "flex",
              }}
            />
            Founding Co-Creator
          </div>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1, display: "flex" }} />

        {/* Main content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontSize: 20,
              color: "#888",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            A new member of the Devidends Co-Creators
          </div>
          <div
            style={{
              fontSize: nameFontSize,
              fontWeight: 800,
              color: "#212121",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              display: "flex",
              maxWidth: 1000,
            }}
          >
            {shortedName}
          </div>
          {role && (
            <div
              style={{
                fontSize: roleFontSize,
                color: "#555",
                fontWeight: 400,
                marginTop: 4,
                display: "flex",
                maxWidth: 1000,
                lineHeight: 1.3,
              }}
            >
              {role}
            </div>
          )}
          {topSectors && (
            <div
              style={{
                fontSize: 20,
                color: "#27ABD2",
                fontWeight: 600,
                marginTop: 8,
                letterSpacing: "0.01em",
                display: "flex",
              }}
            >
              {topSectors}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1, display: "flex" }} />

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            paddingTop: 24,
            borderTop: "1px solid #e5e9ed",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 18, color: "#555", fontWeight: 600 }}>
              Horn of Africa&apos;s development talent network
            </div>
            <div style={{ fontSize: 16, color: "#888" }}>devidends.net</div>
          </div>

          {/* Three dots accent */}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 5, background: "#27ABD2", display: "flex" }} />
            <div style={{ width: 10, height: 10, borderRadius: 5, background: "#24CFD6", display: "flex" }} />
            <div style={{ width: 10, height: 10, borderRadius: 5, background: "#c8ccd4", display: "flex" }} />
          </div>
        </div>
      </div>
    ),
    SIZE
  );
}
