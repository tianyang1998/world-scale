"use client";

import { CharacterScore, TIER_GROUPS } from "@/lib/types";

interface Props {
  score: CharacterScore;
  shareUrl?: string;
}

const STAT_COLORS: Record<string, string> = {
  expertise:   "#378ADD",
  prestige:    "#7F77DD",
  impact:      "#D85A30",
  credentials: "#639922",
  network:     "#BA7517",
};

const STAT_LABELS: Record<string, { label: string; icon: string }> = {
  expertise:   { label: "Expertise",   icon: "⚡" },
  prestige:    { label: "Prestige",    icon: "🌟" },
  impact:      { label: "Impact",      icon: "🔥" },
  credentials: { label: "Credentials", icon: "📜" },
  network:     { label: "Network",     icon: "🕸" },
};

const REALM_META: Record<string, { label: string; icon: string }> = {
  academia: { label: "Academia Realm", icon: "📚" },
  tech:     { label: "Tech Realm",     icon: "⚡" },
  medicine: { label: "Medicine Realm", icon: "⚕️" },
  creative: { label: "Creative Realm", icon: "🎨" },
  law:      { label: "Law Realm",      icon: "⚖️" },
};

export default function CharacterCard({ score, shareUrl }: Props) {
  const colors = TIER_GROUPS[score.tier] || TIER_GROUPS["Apprentice"];
  const initials = score.name
    .split(" ")
    .filter((w) => w.length > 1)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  const realm = REALM_META[score.realm] ?? { label: `${score.realm} Realm`, icon: "🌐" };

  function copyShare() {
    if (shareUrl) navigator.clipboard.writeText(shareUrl);
  }

  return (
    <div style={{
      background: "#fff",
      border: "0.5px solid #e5e5e5",
      borderRadius: "16px",
      padding: "28px",
      maxWidth: "480px",
      width: "100%",
      fontFamily: "system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
        <div style={{
          width: "60px", height: "60px", borderRadius: "50%",
          background: colors.bg, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: "20px", fontWeight: 600,
          color: colors.text, flexShrink: 0,
        }}>
          {initials || "?"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "18px", fontWeight: 600, color: "#111", marginBottom: "2px" }}>
            {score.name || "Unnamed"}
          </div>
          <div style={{ fontSize: "13px", color: "#888" }}>
            {realm.icon} {realm.label}
          </div>
        </div>
      </div>

      {/* Tier + power */}
      <div style={{
        background: colors.bg,
        borderRadius: "10px",
        padding: "14px 18px",
        marginBottom: "20px",
        display: "flex",
        alignItems: "baseline",
        gap: "10px",
      }}>
        <span style={{ fontSize: "22px", fontWeight: 700, color: colors.text }}>
          {score.tier}
        </span>
        <span style={{ fontSize: "13px", color: colors.color }}>
          · power {score.power.toLocaleString()}
        </span>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
        {Object.entries(score.stats).map(([key, val]) => {
          const meta = STAT_LABELS[key];
          const color = STAT_COLORS[key];
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "12px", color: "#888", width: "90px" }}>
                {meta.icon} {meta.label}
              </span>
              <div style={{
                flex: 1, height: "6px", background: "#f0f0f0",
                borderRadius: "3px", overflow: "hidden",
              }}>
                <div style={{
                  width: `${val}%`, height: "100%",
                  background: color, borderRadius: "3px",
                  transition: "width 0.6s ease",
                }} />
              </div>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#333", width: "28px", textAlign: "right" }}>
                {val}
              </span>
            </div>
          );
        })}
      </div>

      {/* Abilities */}
      {score.abilities.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
            Abilities unlocked
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {score.abilities.map((ab) => (
              <div key={ab.name} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>{ab.icon}</span>
                <div>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#111" }}>{ab.name}</span>
                  <span style={{ fontSize: "12px", color: "#888", marginLeft: "6px" }}>{ab.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Share button */}
      {shareUrl && (
        <button
          onClick={copyShare}
          style={{
            width: "100%", padding: "10px", borderRadius: "8px",
            border: "0.5px solid #e5e5e5", background: "none",
            fontSize: "13px", color: "#555", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          }}
          onMouseOver={e => (e.currentTarget.style.background = "#f9f9f9")}
          onMouseOut={e  => (e.currentTarget.style.background = "none")}
        >
          🔗 Copy shareable link
        </button>
      )}
    </div>
  );
}
