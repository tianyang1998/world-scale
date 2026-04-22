---
status: reverse-documented
source: web/lib/scorer.ts, web/lib/types.ts
date: 2026-04-21
verified-by: tliu603
---

# Scoring System

> Reverse-engineered from existing implementation. Captures current behavior and
> clarified design intent.

## 1. Overview

The Scoring System converts a player's real-world professional credentials into a
fantasy character. Players select a realm (profession category), enter their metrics,
and receive a character with five stats, a power rating, a tier assignment, and one
unlocked realm skill. This is the entry point to all other game systems.

## 2. Player Fantasy

The player feels that their real-world achievements are recognized and translated
into power. A researcher with a high h-index becomes a formidable Scholar; a prolific
open-source developer becomes a fearsome Tech fighter. The system rewards genuine
accomplishment, not grinding.

## 3. Detailed Rules

### 3.1 Realm Selection

Players choose one of five realms:

| Realm | Profession | Icon |
|-------|-----------|------|
| Academia | Researchers, academics | 📖 |
| Tech | Software developers (GitHub) | ⚡ |
| Medicine | Doctors, clinicians | ⚕️ |
| Creative | Artists, performers, creators | 🎨 |
| Law | Lawyers, legal practitioners | ⚖️ |

### 3.2 Five Stats

Every character has five stats, each scored 0–100:

| Stat | Meaning |
|------|---------|
| Expertise | Years of experience in the field |
| Prestige | Reputation and institutional standing |
| Impact | Real-world influence and reach |
| Credentials | Formal qualifications and output volume |
| Network | Connections and collaborative reach |

### 3.3 Stat Calculation

**Expertise (all realms)** — log scale on years active:
```
expertise = min(log(years + 1) / log(42), 1) × 100
```
This rewards early career growth heavily, then tapers — the jump from 1→5 years
matters more than 30→35 years.

**All other stats** — percentile rank against a fixed cohort distribution:
```
percentileScore(value, distribution):
  breakpoints: [0→0, p25→25, p50→50, p75→75, p90→90, p99→99, p99×3→100]
  linear interpolation between breakpoints
```

### 3.4 Power Calculation

Power is a weighted sum of the five stats, scaled to the 0–12,000 range:
```
raw = expertise×0.20 + prestige×0.25 + impact×0.30 + credentials×0.15 + network×0.10
power = round(raw × 120)
```
Impact is weighted highest (0.30) — real-world reach is the primary power driver.

### 3.5 Realm-Specific Inputs & Stat Mapping

#### Academia
| Input | Maps To |
|-------|---------|
| Years active | Expertise (log scale) |
| Citations + institution tier | Prestige |
| H-index + recent citation ratio | Impact |
| Publication count | Credentials |
| i10-index | Network |

Institution tier bonus: Top-10 global +15 prestige, Top-100 +5 prestige.
Recent citation recency bonus: `min((recent_5yr / total) × 10, 10)` added to impact.

**Cohort distributions:**
- h_index: p25=4, p50=9, p75=18, p90=32, p99=60
- citations: p25=80, p50=400, p75=1500, p90=5000, p99=25,000
- years: p25=3, p50=8, p75=16, p90=25, p99=40
- publications: p25=5, p50=20, p75=60, p90=120, p99=400
- i10-index: p25=2, p50=8, p75=25, p90=60, p99=200

#### Tech (GitHub)
| Input | Maps To |
|-------|---------|
| Years active | Expertise (log scale) |
| Followers | Prestige |
| Stars | Impact |
| Repositories | Credentials |
| Commits | Network |

**Cohort distributions:**
- repos: p25=5, p50=15, p75=40, p90=100, p99=400
- stars: p25=5, p50=50, p75=300, p90=2000, p99=20,000
- followers: p25=5, p50=30, p75=150, p90=800, p99=10,000
- commits: p25=100, p50=500, p75=1500, p90=4000, p99=15,000

#### Medicine
| Input | Maps To |
|-------|---------|
| Years practicing | Expertise (log scale) |
| Citations + hospital tier + specialization tier | Prestige |
| Patients treated | Impact |
| Papers + board certifications | Credentials |
| Citations | Network |

Hospital tier bonus: Top research +12, Regional +5.
Specialization tier bonus: Highly specialized +15, Specialist +7.
Board certifications: +5 credentials per certification (capped at 100).

**Cohort distributions:**
- years: p25=3, p50=8, p75=18, p90=28, p99=40
- papers: p25=2, p50=10, p75=35, p90=80, p99=250
- citations: p25=20, p50=150, p75=600, p90=2000, p99=10,000
- patients: p25=200, p50=800, p75=2500, p90=6000, p99=20,000

#### Creative
| Input | Maps To |
|-------|---------|
| Years active | Expertise (log scale) |
| Awards + major works (60/40 blend) | Prestige |
| Audience size | Impact |
| Major works | Credentials |
| Audience + exhibitions (50/50 blend) | Network |

**Cohort distributions:**
- years: p25=2, p50=6, p75=14, p90=22, p99=35
- works: p25=3, p50=10, p75=30, p90=80, p99=300
- awards: p25=0, p50=1, p75=4, p90=10, p99=30
- audience: p25=500, p50=5000, p75=50,000, p90=500,000, p99=5,000,000

#### Law
| Input | Maps To |
|-------|---------|
| Years practicing | Expertise (log scale) |
| Notable cases + firm tier | Prestige |
| Cases won + win rate (60/40 blend) | Impact |
| Bar admissions + specialization tier | Credentials |
| Notable cases | Network |

Firm tier bonus: Top global +15, Regional +6.
Specialization tier bonus: Highly specialized +10 credentials.
Win rate contribution: `(wins / cases) × 100 × 0.40` blended into impact.

**Cohort distributions:**
- years: p25=2, p50=7, p75=16, p90=25, p99=40
- cases: p25=10, p50=50, p75=150, p90=400, p99=1,500
- wins: p25=5, p50=30, p75=100, p90=280, p99=1,000
- admissions: p25=1, p50=2, p75=4, p90=7, p99=15

### 3.6 Tier Assignment

Power maps to one of 15 tiers:

| Tier | Power Range | Color Group |
|------|------------|-------------|
| Apprentice | 0–799 | Gray |
| Initiate | 800–1,599 | Gray |
| Acolyte | 1,600–2,399 | Green |
| Journeyman | 2,400–3,199 | Green |
| Adept | 3,200–3,999 | Green |
| Scholar | 4,000–4,799 | Blue |
| Sage | 4,800–5,599 | Blue |
| Arcanist | 5,600–6,399 | Blue |
| Exemplar | 6,400–7,199 | Purple |
| Vanguard | 7,200–7,999 | Purple |
| Master | 8,000–8,799 | Gold |
| Grandmaster | 8,800–9,599 | Gold |
| Champion | 9,600–10,399 | Orange |
| Paragon | 10,400–11,199 | Orange |
| Legend | 11,200+ | Red |

### 3.7 Realm Skill Unlock

Each realm unlocks exactly one active battle skill. Skill unlock is automatic upon
scoring — no threshold required beyond choosing a realm:

| Realm | Skill | Effect | Cooldown |
|-------|-------|--------|----------|
| Academia | Deep Research | Reduce opponent defence by 25% for 2s | 4s |
| Tech | Commit Storm | Deal 1.8× attack damage | 4s |
| Medicine | Clinical Mastery | Heal 20% of caster's max HP — self in PvP, selected ally (or self) in PvE | 4s |
| Creative | Viral Work | Deal 1.2× damage + 30% stun chance for 1s | 3s |
| Law | Precedent | Reduce opponent attack by 20% for 3s | 4s |

## 4. Formulas

```
// Expertise (all realms)
expertise = min(log(years + 1) / log(42), 1) × 100

// Percentile rank (all other stats)
percentileScore(value, dist):
  breakpoints = [(0,0), (p25,25), (p50,50), (p75,75), (p90,90), (p99,99), (p99×3,100)]
  interpolate linearly between surrounding breakpoints

// Power
raw = expertise×0.20 + prestige×0.25 + impact×0.30 + credentials×0.15 + network×0.10
power = round(raw × 120)

// Power range: 0 (0 years, all metrics at 0) to ~12,000 (p99×3 on all metrics)
// Typical range: 1,000–8,000 for active professionals
```

## 5. Edge Cases

- **Zero years active**: expertise = 0, character still scores on other stats
- **Metrics above p99**: capped at 100 via the `p99×3 → 100` breakpoint (extraordinary outliers don't break the scale)
- **Medicine board certifications**: capped so credentials cannot exceed 100 regardless of cert count
- **Law win rate with 0 cases**: win rate contribution = 0, no division by zero
- **All zeros**: power = 0, tier = Apprentice — valid starting state

## 6. Dependencies

- **Battle System** — uses attack, defence (derived from stats), HP (derived from power), and realm skill
- **Tier System** — power determines which tier map, boss, and matchmaking bracket the player enters
- **Economy** — realm power bonus on PvP win: `floor(realmPower × 0.10)` gold

## 7. Tuning Knobs

| Parameter | Current Value | Effect of Increasing |
|-----------|--------------|---------------------|
| Stat weights (expertise/prestige/impact/credentials/network) | 0.20/0.25/0.30/0.15/0.10 | Shifts which input metrics drive power most |
| Power scalar | ×120 | Raises all power values, expands tier ranges |
| Tier boundaries | 0–799, 800–1599… | Adjusts how many players land in each tier |
| Cohort distributions (p25–p99) | Per realm | Makes tier easier/harder to reach for that profession |
| Log base for years (42) | 42 | Lower = years matter more at high end |

## 8. Character Name Rules

Applied at character creation. Validated client-side (inline feedback) and
server-side (authoritative gate before upsert).

| Rule | Constraint |
|------|-----------|
| Length | 2–30 characters |
| Allowed characters | Letters, numbers, spaces, `-`, `'`, `.` |
| Profanity | Blocked via ~50-word whole-word blocklist (case-insensitive) |
| Uniqueness | Case-insensitive check against `characters.name` in database |

Examples of valid names: `Dr. Jane Smith`, `O'Brien`, `Jean-Luc`.

Server validation order: format → profanity → uniqueness → upsert.
Client shows inline error on keystroke for format; profanity/duplicate
errors surface in the save error box only on submission.

## 9. Acceptance Criteria

- [ ] A player with median metrics (all at p50) scores approximately power 4,800–5,200
- [ ] A player with all metrics at p99 scores approximately power 11,500–12,000
- [ ] A player with 0 years and all other metrics at p50 scores lower than a player with 10 years
- [ ] All five realm calculations produce results in the 0–100 range for all stats
- [ ] Tier assignment is deterministic — same inputs always produce same tier
- [ ] Realm skill is correctly assigned based on realm selection alone
