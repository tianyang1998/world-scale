import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const TIER_COLORS: Record<string, { color: string; bg: string; text: string }> = {
  Apprentice:  { color: "#888780", bg: "#F1EFE8", text: "#444441" },
  Initiate:    { color: "#888780", bg: "#F1EFE8", text: "#444441" },
  Acolyte:     { color: "#639922", bg: "#EAF3DE", text: "#27500A" },
  Journeyman:  { color: "#639922", bg: "#EAF3DE", text: "#27500A" },
  Adept:       { color: "#639922", bg: "#EAF3DE", text: "#27500A" },
  Scholar:     { color: "#378ADD", bg: "#E6F1FB", text: "#0C447C" },
  Sage:        { color: "#378ADD", bg: "#E6F1FB", text: "#0C447C" },
  Arcanist:    { color: "#378ADD", bg: "#E6F1FB", text: "#0C447C" },
  Exemplar:    { color: "#7F77DD", bg: "#EEEDFE", text: "#3C3489" },
  Vanguard:    { color: "#7F77DD", bg: "#EEEDFE", text: "#3C3489" },
  Master:      { color: "#BA7517", bg: "#FAEEDA", text: "#633806" },
  Grandmaster: { color: "#BA7517", bg: "#FAEEDA", text: "#633806" },
  Champion:    { color: "#D85A30", bg: "#FAECE7", text: "#712B13" },
  Paragon:     { color: "#D85A30", bg: "#FAECE7", text: "#712B13" },
  Legend:      { color: "#A32D2D", bg: "#FCEBEB", text: "#501313" },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const name     = searchParams.get("name")     || "Unknown Hero";
  const tier     = searchParams.get("tier")     || "Apprentice";
  const power    = searchParams.get("power")    || "0";
  const realm    = searchParams.get("realm")    || "academia";
  const exp      = Number(searchParams.get("exp")      || 0);
  const prestige = Number(searchParams.get("prestige") || 0);
  const impact   = Number(searchParams.get("impact")   || 0);
  const creds    = Number(searchParams.get("creds")    || 0);
  const network  = Number(searchParams.get("network")  || 0);
  const abilities = (searchParams.get("abilities") || "").split(",").filter(Boolean);

  const colors     = TIER_COLORS[tier] || TIER_COLORS["Apprentice"];
  const realmLabel = realm === "academia" ? "Academia Realm" : "Tech Realm";

  const initials = name
    .split(" ")
    .filter((w) => w.length > 1)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || name.slice(0, 2).toUpperCase();

  const stats = [
    { label: "Expertise",   val: exp,      color: "#378ADD" },
    { label: "Prestige",    val: prestige, color: "#7F77DD" },
    { label: "Impact",      val: impact,   color: "#D85A30" },
    { label: "Credentials", val: creds,    color: "#639922" },
    { label: "Network",     val: network,  color: "#BA7517" },
  ];

  return new ImageResponse(
    (
      <div style={{ width: "1200px", height: "630px", background: "#0f0f0f", display: "flex", flexDirection: "row", fontFamily: "sans-serif", padding: "48px", gap: "48px" }}>

        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", width: "320px", gap: "20px" }}>

          {/* Avatar */}
          <div style={{ width: "88px", height: "88px", borderRadius: "44px", background: colors.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "32px", fontWeight: 700, color: colors.text }}>{initials}</span>
          </div>

          {/* Name + realm */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "30px", fontWeight: 700, color: "#ffffff" }}>{name}</span>
            <span style={{ fontSize: "15px", color: "#666666" }}>{realmLabel}</span>
          </div>

          {/* Tier + power */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "26px", fontWeight: 700, color: colors.color }}>{tier}</span>
            <span style={{ fontSize: "13px", color: "#444444" }}>power {Number(power).toLocaleString()}</span>
          </div>

          {/* Abilities */}
          {abilities.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontSize: "11px", color: "#444444", textTransform: "uppercase", letterSpacing: "0.1em" }}>Abilities</span>
              <div style={{ display: "flex", flexDirection: "row", gap: "8px" }}>
                {abilities.slice(0, 4).map((ab, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", background: "#1a1a1a", borderRadius: "8px", padding: "6px 10px" }}>
                    <span>{ab}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ display: "flex", width: "1px", background: "#222222", flexShrink: 0 }} />

        {/* Right column — stats */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: "16px", justifyContent: "center" }}>
          <span style={{ fontSize: "12px", color: "#444444", textTransform: "uppercase", letterSpacing: "0.1em" }}>Stat breakdown</span>

          {stats.map((s) => (
            <div key={s.label} style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "14px" }}>
              <span style={{ fontSize: "14px", color: "#666666", width: "110px" }}>{s.label}</span>
              <div style={{ display: "flex", flex: 1, height: "8px", background: "#1a1a1a", borderRadius: "4px" }}>
                <div style={{ display: "flex", width: `${s.val}%`, height: "8px", background: s.color, borderRadius: "4px" }} />
              </div>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "#ffffff", width: "28px", textAlign: "right" }}>{s.val}</span>
            </div>
          ))}

          {/* Footer */}
          <div style={{ display: "flex", marginTop: "24px", paddingTop: "20px", borderTop: "1px solid #1a1a1a" }}>
            <span style={{ fontSize: "12px", color: "#333333" }}>World Scale</span>
          </div>
        </div>

      </div>
    ),
    { width: 1200, height: 630 }
  );
}
