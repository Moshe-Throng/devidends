import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

/**
 * GET /api/cv/score-card?score=78&name=Mussie+Tsegaye&ref=ABC123
 *
 * Generates a branded shareable score card image (1200x630 OG size).
 * Users share this on LinkedIn/Telegram/WhatsApp — each card is a mini-ad.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const score = parseInt(searchParams.get("score") || "0", 10);
  const name = searchParams.get("name") || "Development Professional";
  const ref = searchParams.get("ref") || "";
  const dims = searchParams.get("dims") || ""; // comma-separated "Structure:75,Experience:82,..."

  // Parse dimensions
  const dimensions = dims
    ? dims.split(",").map((d) => {
        const [label, val] = d.split(":");
        return { label, score: parseInt(val, 10) };
      }).filter(d => d.label && !isNaN(d.score))
    : [];

  // Score color
  const scoreColor = score >= 75 ? "#10b981" : score >= 55 ? "#f59e0b" : "#ef4444";
  const scoreLabel = score >= 75 ? "Strong Profile" : score >= 55 ? "Good Foundation" : "Needs Work";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://devidends-eta-delta.vercel.app";
  const scoreUrl = ref ? `${siteUrl}/score?ref=${ref}` : `${siteUrl}/score`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Dot grid overlay */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.05,
            backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />

        {/* Left side — Score */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "400px",
            padding: "40px",
          }}
        >
          {/* Score circle */}
          <div
            style={{
              width: "200px",
              height: "200px",
              borderRadius: "100px",
              border: `8px solid ${scoreColor}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            <div style={{ fontSize: "72px", fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
              {score}
            </div>
            <div style={{ fontSize: "16px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>
              / 100
            </div>
          </div>

          <div
            style={{
              marginTop: "16px",
              padding: "6px 20px",
              borderRadius: "20px",
              background: scoreColor,
              color: "white",
              fontSize: "16px",
              fontWeight: 700,
            }}
          >
            {scoreLabel}
          </div>
        </div>

        {/* Right side — Details */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            padding: "40px 40px 40px 0",
          }}
        >
          {/* Branding */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: "24px" }}>
            <span style={{ fontSize: "28px", fontWeight: 800, color: "#27ABD2" }}>Dev</span>
            <span style={{ fontSize: "28px", fontWeight: 800, color: "white" }}>idends</span>
            <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginLeft: "12px" }}>
              CV Score Card
            </span>
          </div>

          {/* Name */}
          <div style={{ fontSize: "36px", fontWeight: 800, color: "white", marginBottom: "8px" }}>
            {name}
          </div>

          <div style={{ fontSize: "16px", color: "rgba(255,255,255,0.5)", marginBottom: "24px" }}>
            International Development Professional
          </div>

          {/* Dimension bars */}
          {dimensions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "24px" }}>
              {dimensions.slice(0, 5).map((dim) => (
                <div key={dim.label} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "140px", fontSize: "13px", color: "rgba(255,255,255,0.6)", textAlign: "right" }}>
                    {dim.label}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      height: "12px",
                      borderRadius: "6px",
                      background: "rgba(255,255,255,0.1)",
                      overflow: "hidden",
                      display: "flex",
                    }}
                  >
                    <div
                      style={{
                        width: `${dim.score}%`,
                        height: "100%",
                        borderRadius: "6px",
                        background: dim.score >= 75 ? "#10b981" : dim.score >= 55 ? "#f59e0b" : "#ef4444",
                      }}
                    />
                  </div>
                  <div style={{ width: "36px", fontSize: "14px", fontWeight: 700, color: "white" }}>
                    {dim.score}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CTA */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                padding: "10px 24px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #27ABD2, #24CFD6)",
                color: "white",
                fontSize: "16px",
                fontWeight: 700,
              }}
            >
              Score Your CV Free →
            </div>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
              devidends.net/score
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
