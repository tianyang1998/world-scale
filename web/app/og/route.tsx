import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import { TIER_GROUPS } from "@/lib/types";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const name    = searchParams.get("name")    || "Unknown Hero";
  const tier    = searchParams.get("tier")    || "Apprentice";
  const power   = searchParams.get("power")   || "0";
  const realm   = searchParams.get("realm")   || "academia";
  const exp     = searchParams.get("exp")     || "0";
  const prestige= searchParams.get("prestige")|| "0";
  const impact  = searchParams.get("impact")  || "0";
  const creds   = searchParams.get("creds")   || "0";
  const network = searchParams.get("network") || "0";
  const abilities = (searchParams.get("abilities") || "").split(",").filter(Boolean);

  const colors = TIER_GROUPS[tier] || TIER_GROUPS["Apprentice"];
  const realmLabel = realm === "academia" ? "Academia Realm" : "Tech Realm";
  const realmIcon  = realm === "academia" ? "📚" : "⚡";

  const initials = name
    .split(" ")
    .filter((w) => w.length > 1)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  const stats = [
    { label: "Expertise",   val: Number(exp) },
    { label: "Prestige",    val: Number(prestige) },
    { label: "Impact",      val: Number(impact) },
    { label: "Credentials", val: Number(creds) },
    { label: "Network",     val: Number(network) },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#0f0f0f",
          display: "flex",
          fontFamily: "sans-serif",
          padding: "48px",
          gap: "48px",
        }}
      >
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", width: "340px", gap: "24px" }}>
          {/* Avatar */}
          <div style={{
            width: "100px", height: "100px", borderRadius: "50%",
            background: colors.bg, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: "36px", fontWeight: 700,
            color: colors.text,
          }}>
            {initials}
          </div>

          {/* Name + realm */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "32px", fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>{name}</div>
            <div style={{ fontSize: "16px", color: "#888" }}>{realmIcon} {realmLabel}</div>
          </div>

          {/* Tier badge */}
          <div style={{
            display: "flex", flexDirection: "column", gap: "4px",
          }}>
            <div style={{
              fontSize: "28px", fontWeight: 700, color: colors.color,
            }}>{tier}</div>
            <div style={{ fontSize: "14px", color: "#555" }}>power {Number(power).toLocaleString()}</div>
          </div>

          {/* Abilities */}
          {abilities.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ fontSize: "12px", color: "#555", textTransform: "uppercase", letterSpacing: "0.1em" }}>Abilities</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {abilities.slice(0, 4).map((ab, i) => (
                  <div key={i} style={{
                    fontSize: "22px", background: "#1a1a1a",
                    borderRadius: "8px", padding: "6px 10px",
                  }}>{ab}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: "1px", background: "#222", flexShrink: 0 }} />

        {/* Right column — stats */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: "20px", justifyContent: "center" }}>
          <div style={{ fontSize: "13px", color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
            Stat breakdown
          </div>
          {stats.map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ fontSize: "15px", color: "#888", width: "110px" }}>{s.label}</div>
              <div style={{
                flex: 1, height: "8px", background: "#1a1a1a",
                borderRadius: "4px", overflow: "hidden",
              }}>
                <div style={{
                  width: `${s.val}%`, height: "100%",
                  background: colors.color, borderRadius: "4px",
                }} />
              </div>
              <div style={{ fontSize: "15px", fontWeight: 600, color: "#fff", width: "32px", textAlign: "right" }}>
                {s.val}
              </div>
            </div>
          ))}

          {/* Footer */}
          <div style={{
            marginTop: "auto", paddingTop: "24px",
            borderTop: "1px solid #1a1a1a",
            fontSize: "13px", color: "#333",
          }}>
            World Scale · worldscale.dev
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
