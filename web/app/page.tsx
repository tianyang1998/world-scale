"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import CharacterCard from "@/components/CharacterCard";
import { CharacterScore } from "@/lib/types";
import { createClient } from "@/lib/supabase-client";

type Realm = "academia" | "tech";
type InputMode = "scholar" | "github" | "manual";

export default function Home() {
  const router = useRouter();
  const [realm, setRealm]       = useState<Realm>("academia");
  const [mode, setMode]         = useState<InputMode>("manual");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [score, setScore]       = useState<CharacterScore | null>(null);

  // auth state
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState<string | null>(null);

  // character name — shared across all realms
  const [charName, setCharName] = useState("");

  // academia fields (no name)
  const [hIndex,    setHIndex]    = useState("");
  const [citations, setCitations] = useState("");
  const [years,     setYears]     = useState("");
  const [pubs,      setPubs]      = useState("");
  const [i10,       setI10]       = useState("");
  const [recentCit, setRecentCit] = useState("");
  const [instTier,  setInstTier]  = useState("3");

  // tech fields (no name)
  const [ghUser,    setGhUser]    = useState("");
  const [repos,     setRepos]     = useState("");
  const [stars,     setStars]     = useState("");
  const [followers, setFollowers] = useState("");
  const [commits,   setCommits]   = useState("");
  const [tYears,    setTYears]    = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null);
    });
  }, []);

  async function handleSubmit() {
    setError("");
    setLoading(true);
    setScore(null);
    setSaveMsg(null);

    let body: Record<string, string | number> = { realm, name: charName };

    if (realm === "academia") {
      body = { realm, name: charName, h_index: hIndex, total_citations: citations,
               years_active: years, pub_count: pubs, i10_index: i10,
               recent_citations: recentCit, institution_tier: instTier };
    } else if (mode === "github") {
      body = { realm, name: charName, github_username: ghUser };
    } else {
      body = { realm, name: charName, repos, stars, followers, commits, years_active: tYears };
    }

    try {
      const res  = await fetch("/api/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong"); }
      else { setScore(data); }
    } catch {
      setError("Network error — is the dev server running?");
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!score) return;
    if (!userEmail) { router.push("/auth"); return; }

    setSaving(true);
    setSaveMsg(null);

    try {
      const res = await fetch("/api/character/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: charName,
          realm: score.realm,
          power: score.power,
          stats: score.stats,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveMsg("Failed to save. Please try again.");
      } else {
        setSaveMsg(`Saved! Total power: ${data.total_power.toLocaleString()}`);
      }
    } catch {
      setSaveMsg("Network error — could not save.");
    }
    setSaving(false);
  }

  const shareUrl = score
    ? `${window.location.origin}/api/og?name=${encodeURIComponent(score.name)}&tier=${score.tier}&power=${score.power}&realm=${score.realm}&exp=${score.stats.expertise}&prestige=${score.stats.prestige}&impact=${score.stats.impact}&creds=${score.stats.credentials}&network=${score.stats.network}&abilities=${score.abilities.map(a => a.icon).join(",")}`
    : undefined;

  const inputStyle = {
    width: "100%", padding: "8px 10px", fontSize: "14px",
    border: "0.5px solid #ddd", borderRadius: "8px",
    background: "#fafafa", color: "#111", marginTop: "4px",
    outline: "none",
  };
  const labelStyle = { fontSize: "12px", color: "#666", display: "block" as const };
  const fieldStyle = { display: "flex", flexDirection: "column" as const, gap: "2px" };

  return (
    <main style={{ minHeight: "100vh", background: "#f7f7f5", fontFamily: "system-ui, sans-serif", padding: "48px 24px" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>

        {/* Title + auth nav */}
        <div style={{ marginBottom: "40px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#111", margin: 0 }}>World Scale</h1>
            <p style={{ fontSize: "15px", color: "#888", margin: "6px 0 0" }}>
              Your real-world credentials, turned into a fantasy character.
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", paddingTop: "4px" }}>
            <button
              onClick={() => router.push('/leaderboard')}
              style={{
                padding: '7px 16px', borderRadius: '8px', fontSize: '13px',
                border: '0.5px solid #ddd', background: '#fff',
                color: '#111', cursor: 'pointer', fontWeight: 500,
              }}>
              Leaderboard
            </button>
            {userEmail ? (
              <>
                <span style={{ fontSize: "13px", color: "#888" }}>{userEmail}</span>
                <button
                  onClick={() => router.push("/profile")}
                  style={{
                    padding: "7px 16px", borderRadius: "8px", fontSize: "13px",
                    border: "0.5px solid #ddd", background: "#fff",
                    color: "#111", cursor: "pointer", fontWeight: 500,
                  }}>
                  My Character
                </button>
              </>
            ) : (
              <button
                onClick={() => router.push("/auth")}
                style={{
                  padding: "7px 16px", borderRadius: "8px", fontSize: "13px",
                  border: "none", background: "#111",
                  color: "#fff", cursor: "pointer", fontWeight: 500,
                }}>
                Sign In
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: score ? "1fr 1fr" : "1fr", gap: "32px", alignItems: "start" }}>

          {/* Form */}
          <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: "16px", padding: "28px" }}>

            {/* Character name — shared across all realms */}
            <div style={{ ...fieldStyle, marginBottom: "24px", paddingBottom: "24px", borderBottom: "0.5px solid #f0f0f0" }}>
              <label style={{ ...labelStyle, fontSize: "13px", fontWeight: 600, color: "#444" }}>Your name</label>
              <input
                style={inputStyle}
                value={charName}
                onChange={e => setCharName(e.target.value)}
                placeholder="Dr. Jane Smith"
              />
              <span style={{ fontSize: "11px", color: "#bbb", marginTop: "4px" }}>
                Your character's display name across all realms
              </span>
            </div>

            {/* Realm selector */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
              {(["academia", "tech"] as Realm[]).map(r => (
                <button key={r} onClick={() => { setRealm(r); setScore(null); setError(""); setSaveMsg(null); }}
                  style={{
                    padding: "8px 20px", borderRadius: "8px", fontSize: "13px", cursor: "pointer",
                    border: realm === r ? "none" : "0.5px solid #ddd",
                    background: realm === r ? "#111" : "none",
                    color: realm === r ? "#fff" : "#666",
                    fontWeight: realm === r ? 600 : 400,
                  }}>
                  {r === "academia" ? "📚 Academia" : "⚡ Tech"}
                </button>
              ))}
            </div>

            {/* Academia form */}
            {realm === "academia" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>H-index</label>
                    <input style={inputStyle} type="number" value={hIndex} onChange={e => setHIndex(e.target.value)} placeholder="12" />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Total citations</label>
                    <input style={inputStyle} type="number" value={citations} onChange={e => setCitations(e.target.value)} placeholder="1500" />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Years active</label>
                    <input style={inputStyle} type="number" value={years} onChange={e => setYears(e.target.value)} placeholder="8" />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Publications</label>
                    <input style={inputStyle} type="number" value={pubs} onChange={e => setPubs(e.target.value)} placeholder="35" />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>i10-index</label>
                    <input style={inputStyle} type="number" value={i10} onChange={e => setI10(e.target.value)} placeholder="10" />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Citations (last 5 yrs)</label>
                    <input style={inputStyle} type="number" value={recentCit} onChange={e => setRecentCit(e.target.value)} placeholder="500" />
                  </div>
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Institution tier</label>
                  <select style={inputStyle} value={instTier} onChange={e => setInstTier(e.target.value)}>
                    <option value="1">Top-10 global (MIT, Stanford, Oxford…)</option>
                    <option value="2">Top-100 global</option>
                    <option value="3">Other</option>
                  </select>
                </div>
              </div>
            )}

            {/* Tech form */}
            {realm === "tech" && (
              <>
                <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
                  {(["github", "manual"] as InputMode[]).map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      style={{
                        padding: "6px 14px", borderRadius: "6px", fontSize: "12px", cursor: "pointer",
                        border: mode === m ? "none" : "0.5px solid #ddd",
                        background: mode === m ? "#111" : "none",
                        color: mode === m ? "#fff" : "#666",
                      }}>
                      {m === "github" ? "🐙 GitHub username" : "✏️ Manual"}
                    </button>
                  ))}
                </div>

                {mode === "github" ? (
                  <div style={fieldStyle}>
                    <label style={labelStyle}>GitHub username</label>
                    <input style={inputStyle} value={ghUser} onChange={e => setGhUser(e.target.value)} placeholder="torvalds" />
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div style={fieldStyle}>
                        <label style={labelStyle}>Public repos</label>
                        <input style={inputStyle} type="number" value={repos} onChange={e => setRepos(e.target.value)} placeholder="40" />
                      </div>
                      <div style={fieldStyle}>
                        <label style={labelStyle}>Total stars</label>
                        <input style={inputStyle} type="number" value={stars} onChange={e => setStars(e.target.value)} placeholder="2000" />
                      </div>
                      <div style={fieldStyle}>
                        <label style={labelStyle}>Followers</label>
                        <input style={inputStyle} type="number" value={followers} onChange={e => setFollowers(e.target.value)} placeholder="500" />
                      </div>
                      <div style={fieldStyle}>
                        <label style={labelStyle}>Est. total commits</label>
                        <input style={inputStyle} type="number" value={commits} onChange={e => setCommits(e.target.value)} placeholder="1000" />
                      </div>
                      <div style={fieldStyle}>
                        <label style={labelStyle}>Years active</label>
                        <input style={inputStyle} type="number" value={tYears} onChange={e => setTYears(e.target.value)} placeholder="6" />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {error && (
              <div style={{ marginTop: "16px", padding: "10px 14px", background: "#FCEBEB", borderRadius: "8px", fontSize: "13px", color: "#A32D2D" }}>
                {error}
              </div>
            )}

            <button onClick={handleSubmit} disabled={loading}
              style={{
                marginTop: "20px", width: "100%", padding: "12px",
                borderRadius: "8px", border: "none", background: loading ? "#ccc" : "#111",
                color: "#fff", fontSize: "14px", fontWeight: 600, cursor: loading ? "default" : "pointer",
              }}>
              {loading ? "Calculating…" : "Generate character →"}
            </button>
          </div>

          {/* Card + save button */}
          {score && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <CharacterCard score={score} shareUrl={shareUrl} />

              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  width: "100%", padding: "12px",
                  borderRadius: "8px", border: "none",
                  background: saving ? "#ccc" : "#4f46e5",
                  color: "#fff", fontSize: "14px", fontWeight: 600,
                  cursor: saving ? "default" : "pointer",
                }}>
                {saving ? "Saving…" : userEmail ? "Save character" : "Sign in to save"}
              </button>

              {saveMsg && (
                <div style={{
                  padding: "10px 14px", borderRadius: "8px", fontSize: "13px", textAlign: "center",
                  background: saveMsg.startsWith("Saved") ? "#EAF3DE" : "#FCEBEB",
                  color: saveMsg.startsWith("Saved") ? "#27500A" : "#A32D2D",
                }}>
                  {saveMsg}
                  {saveMsg.startsWith("Saved") && (
                    <button
                      onClick={() => router.push("/profile")}
                      style={{
                        marginLeft: "12px", background: "none", border: "none",
                        color: "#3B6D11", fontSize: "13px", cursor: "pointer",
                        textDecoration: "underline", padding: 0,
                      }}>
                      View profile →
                    </button>
                  )}
                </div>
              )}

              <p style={{ fontSize: "12px", color: "#aaa", textAlign: "center", margin: 0 }}>
                Click &ldquo;Copy shareable link&rdquo; to get an OG image URL for Twitter / LinkedIn
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
