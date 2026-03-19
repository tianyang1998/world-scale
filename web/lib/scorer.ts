import { CharacterScore, TIERS } from "./types";

// ── Cohort reference distributions (Academia) ────────────────────────────────
const ACADEMIA_COHORT = {
  h_index:   { p25: 4,  p50: 9,   p75: 18,  p90: 32,  p99: 60    },
  citations: { p25: 80, p50: 400, p75: 1500, p90: 5000, p99: 25000 },
  years:     { p25: 3,  p50: 8,   p75: 16,  p90: 25,  p99: 40    },
  pubs:      { p25: 5,  p50: 20,  p75: 60,  p90: 120, p99: 400   },
  i10:       { p25: 2,  p50: 8,   p75: 25,  p90: 60,  p99: 200   },
};

// ── Cohort reference distributions (GitHub / Tech) ───────────────────────────
const TECH_COHORT = {
  repos:     { p25: 5,   p50: 15,   p75: 40,   p90: 100,  p99: 400  },
  stars:     { p25: 5,   p50: 50,   p75: 300,  p90: 2000, p99: 20000 },
  followers: { p25: 5,   p50: 30,   p75: 150,  p90: 800,  p99: 10000 },
  commits:   { p25: 100, p50: 500,  p75: 1500, p90: 4000, p99: 15000 },
};

type Dist = { p25: number; p50: number; p75: number; p90: number; p99: number };

function percentileScore(value: number, dist: Dist): number {
  const breakpoints: [number, number][] = [
    [0,             0],
    [dist.p25,     25],
    [dist.p50,     50],
    [dist.p75,     75],
    [dist.p90,     90],
    [dist.p99,     99],
    [dist.p99 * 3, 100],
  ];
  for (let i = 1; i < breakpoints.length; i++) {
    const [loVal, loPct] = breakpoints[i - 1];
    const [hiVal, hiPct] = breakpoints[i];
    if (value <= hiVal) {
      if (hiVal === loVal) return loPct;
      const t = (value - loVal) / (hiVal - loVal);
      return loPct + t * (hiPct - loPct);
    }
  }
  return 100;
}

function logYears(years: number): number {
  return Math.min(Math.log(years + 1) / Math.log(42), 1) * 100;
}

function getTier(power: number): string {
  for (const t of TIERS) {
    if (power >= t.min && power <= t.max) return t.name;
  }
  return "Apprentice";
}

// ── Academia abilities ────────────────────────────────────────────────────────
const ACADEMIA_ABILITIES = [
  { name: "Deep Research",   icon: "📖", desc: "Decode any hidden text in half the time.",          condition: (im: number) => im >= 40 },
  { name: "Knowledge Burst", icon: "💥", desc: "Overwhelm opponents with a wave of information.",   condition: (_im: number, cr: number) => cr >= 50 },
  { name: "Peer Review",     icon: "🔍", desc: "Expose any weakness in an opponent's argument.",    condition: (_im: number, _cr: number, ne: number, pr: number) => ne >= 40 && pr >= 50 },
  { name: "Tenure Shield",   icon: "🛡️", desc: "Immune to realm eviction. Permanent standing.",    condition: (_im: number, _cr: number, _ne: number, pr: number, ex: number) => pr >= 75 && ex >= 60 },
  { name: "Citation Wave",   icon: "🌊", desc: "Nearby allies gain +10% to all knowledge checks.", condition: (im: number, _cr: number, _ne: number, _pr: number, _ex: number, pw: number) => im >= 85 && pw >= 8000 },
  { name: "Grand Lecture",   icon: "🎓", desc: "Rally up to 20 allies and grant power boosts.",    condition: (_im: number, _cr: number, ne: number, pr: number, _ex: number, _pw: number) => pr >= 90 && ne >= 70 },
];

// ── Tech abilities ────────────────────────────────────────────────────────────
const TECH_ABILITIES = [
  { name: "Open Source Aura",  icon: "⭐", desc: "Your public work draws allies to your cause.",      condition: (stars: number) => stars >= 40 },
  { name: "Patent Wall",       icon: "⚙️", desc: "Defensive barrier built from your IP portfolio.",  condition: (_s: number, followers: number) => followers >= 50 },
  { name: "Commit Storm",      icon: "⚡", desc: "Overwhelm opponents with relentless output.",       condition: (_s: number, _f: number, commits: number) => commits >= 60 },
  { name: "Fork Army",         icon: "🔱", desc: "Summon copies of yourself to fight alongside you.", condition: (stars: number, _f: number, _c: number, pw: number) => stars >= 75 && pw >= 6000 },
  { name: "Viral Deploy",      icon: "🚀", desc: "Instantly spread your work to every corner.",       condition: (_s: number, followers: number, _c: number, pw: number) => followers >= 85 && pw >= 8000 },
  { name: "10x Legend",        icon: "💎", desc: "All allies gain double output while near you.",     condition: (stars: number, _f: number, _c: number, pw: number) => stars >= 95 && pw >= 10000 },
];

// ── Main scorers ──────────────────────────────────────────────────────────────

export function scoreAcademia(data: {
  name: string;
  h_index: number;
  total_citations: number;
  years_active: number;
  pub_count: number;
  i10_index: number;
  recent_citations: number;
  institution_tier: number;
}): CharacterScore {
  const expertise   = logYears(data.years_active);
  const citePct     = percentileScore(data.total_citations, ACADEMIA_COHORT.citations);
  const instBonus   = data.institution_tier === 1 ? 15 : data.institution_tier === 2 ? 5 : 0;
  const prestige    = Math.min(citePct + instBonus, 100);
  const hPct        = percentileScore(data.h_index, ACADEMIA_COHORT.h_index);
  const recency     = data.total_citations > 0 ? Math.min((data.recent_citations / data.total_citations) * 10, 10) : 0;
  const impact      = Math.min(hPct + recency, 100);
  const credentials = percentileScore(data.pub_count, ACADEMIA_COHORT.pubs);
  const network     = percentileScore(data.i10_index, ACADEMIA_COHORT.i10);

  const raw = expertise * 0.20 + prestige * 0.25 + impact * 0.30 + credentials * 0.15 + network * 0.10;
  const power = Math.round(raw * 120);
  const tier = getTier(power);

  const abilities = ACADEMIA_ABILITIES
    .filter(a => a.condition(impact, credentials, network, prestige, expertise, power))
    .map(({ name, icon, desc }) => ({ name, icon, desc }));

  return {
    name: data.name,
    realm: "academia",
    tier,
    power,
    stats: {
      expertise: Math.round(expertise),
      prestige:  Math.round(prestige),
      impact:    Math.round(impact),
      credentials: Math.round(credentials),
      network:   Math.round(network),
    },
    abilities,
    source: {
      h_index:      data.h_index,
      citations:    data.total_citations,
      years_active: data.years_active,
      pub_count:    data.pub_count,
      i10_index:    data.i10_index,
    },
  };
}

export function scoreTech(data: {
  name: string;
  repos: number;
  stars: number;
  followers: number;
  commits: number;
  years_active: number;
}): CharacterScore {
  const expertise   = logYears(data.years_active);
  const prestige    = percentileScore(data.followers, TECH_COHORT.followers);
  const impact      = percentileScore(data.stars, TECH_COHORT.stars);
  const credentials = percentileScore(data.repos, TECH_COHORT.repos);
  const network     = percentileScore(data.commits, TECH_COHORT.commits);

  const raw = expertise * 0.20 + prestige * 0.25 + impact * 0.30 + credentials * 0.15 + network * 0.10;
  const power = Math.round(raw * 120);
  const tier = getTier(power);

  const starsPct     = percentileScore(data.stars, TECH_COHORT.stars);
  const followersPct = percentileScore(data.followers, TECH_COHORT.followers);
  const commitsPct   = percentileScore(data.commits, TECH_COHORT.commits);

  const abilities = TECH_ABILITIES
    .filter(a => a.condition(starsPct, followersPct, commitsPct, power))
    .map(({ name, icon, desc }) => ({ name, icon, desc }));

  return {
    name: data.name,
    realm: "tech",
    tier,
    power,
    stats: {
      expertise:   Math.round(expertise),
      prestige:    Math.round(prestige),
      impact:      Math.round(impact),
      credentials: Math.round(credentials),
      network:     Math.round(network),
    },
    abilities,
    source: {
      repos:     data.repos,
      stars:     data.stars,
      followers: data.followers,
      commits:   data.commits,
    },
  };
}
