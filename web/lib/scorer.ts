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

// ── Cohort reference distributions (Medicine) ────────────────────────────────
const MEDICINE_COHORT = {
  years:       { p25: 3,  p50: 8,   p75: 18,  p90: 28,  p99: 40  },
  papers:      { p25: 2,  p50: 10,  p75: 35,  p90: 80,  p99: 250 },
  citations:   { p25: 20, p50: 150, p75: 600, p90: 2000, p99: 10000 },
  patients:    { p25: 200, p50: 800, p75: 2500, p90: 6000, p99: 20000 },
};

// ── Cohort reference distributions (Creative) ────────────────────────────────
const CREATIVE_COHORT = {
  years:       { p25: 2,  p50: 6,   p75: 14,  p90: 22,  p99: 35   },
  works:       { p25: 3,  p50: 10,  p75: 30,  p90: 80,  p99: 300  },
  awards:      { p25: 0,  p50: 1,   p75: 4,   p90: 10,  p99: 30   },
  audience:    { p25: 500, p50: 5000, p75: 50000, p90: 500000, p99: 5000000 },
};

// ── Cohort reference distributions (Law) ─────────────────────────────────────
const LAW_COHORT = {
  years:       { p25: 2,  p50: 7,   p75: 16,  p90: 25,  p99: 40  },
  cases:       { p25: 10, p50: 50,  p75: 150, p90: 400, p99: 1500 },
  wins:        { p25: 5,  p50: 30,  p75: 100, p90: 280, p99: 1000 },
  admissions:  { p25: 1,  p50: 2,   p75: 4,   p90: 7,   p99: 15  },
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

// ── Medicine abilities ────────────────────────────────────────────────────────
const MEDICINE_ABILITIES = [
  { name: "Field Medic",       icon: "🩹", desc: "Restore a fallen ally to half health instantly.",         condition: (ex: number) => ex >= 30 },
  { name: "Diagnosis",         icon: "🔬", desc: "Reveal hidden weaknesses in any opponent.",               condition: (_ex: number, cr: number) => cr >= 45 },
  { name: "Clinical Mastery",  icon: "⚕️", desc: "All healing effects doubled under your supervision.",     condition: (ex: number, _cr: number, im: number) => ex >= 60 && im >= 50 },
  { name: "Research Cure",     icon: "💊", desc: "Neutralise any poison or curse affecting your team.",     condition: (_ex: number, cr: number, im: number, pr: number) => cr >= 70 && im >= 60 && pr >= 55 },
  { name: "Chief of Staff",    icon: "🏥", desc: "Command allies with +20% efficiency in all operations.",  condition: (_ex: number, _cr: number, _im: number, pr: number, pw: number) => pr >= 80 && pw >= 7000 },
  { name: "Miracle Hands",     icon: "✨", desc: "Perform the impossible — one impossible save per battle.", condition: (_ex: number, _cr: number, im: number, pr: number, pw: number) => im >= 90 && pr >= 85 && pw >= 10000 },
];

// ── Creative abilities ────────────────────────────────────────────────────────
const CREATIVE_ABILITIES = [
  { name: "Muse",              icon: "🎨", desc: "Inspire an ally — they gain +15% to next action.",        condition: (ex: number) => ex >= 25 },
  { name: "Viral Work",        icon: "📣", desc: "Your creation spreads instantly across the realm.",       condition: (_ex: number, ne: number) => ne >= 45 },
  { name: "Cult Following",    icon: "🌟", desc: "Summon a crowd of devoted supporters to your side.",      condition: (_ex: number, ne: number, im: number) => ne >= 65 && im >= 50 },
  { name: "Award Aura",        icon: "🏆", desc: "Radiate prestige — enemies hesitate to challenge you.",   condition: (_ex: number, _ne: number, _im: number, pr: number) => pr >= 70 },
  { name: "Magnum Opus",       icon: "💫", desc: "Once per battle, unleash a work that stuns all enemies.", condition: (_ex: number, _ne: number, im: number, pr: number, pw: number) => im >= 80 && pr >= 75 && pw >= 8000 },
  { name: "Timeless Legend",   icon: "♾️", desc: "Your influence persists beyond the battle — forever.",   condition: (_ex: number, _ne: number, im: number, pr: number, pw: number) => im >= 95 && pr >= 90 && pw >= 11000 },
];

// ── Law abilities ─────────────────────────────────────────────────────────────
const LAW_ABILITIES = [
  { name: "Objection",         icon: "⚖️", desc: "Instantly nullify an opponent's last action.",            condition: (ex: number) => ex >= 30 },
  { name: "Iron Brief",        icon: "📜", desc: "Your arguments are airtight — reduce opponent damage.",   condition: (_ex: number, cr: number) => cr >= 50 },
  { name: "Cross Examination", icon: "🔎", desc: "Force an opponent to reveal their true strategy.",        condition: (ex: number, _cr: number, im: number) => ex >= 55 && im >= 45 },
  { name: "Precedent",         icon: "📚", desc: "Set a rule that benefits your entire team this round.",   condition: (_ex: number, cr: number, im: number, pr: number) => cr >= 65 && im >= 60 && pr >= 55 },
  { name: "Partner Track",     icon: "🏛️", desc: "Allies gain +25% to all influence checks near you.",     condition: (_ex: number, _cr: number, _im: number, pr: number, pw: number) => pr >= 80 && pw >= 7000 },
  { name: "Supreme Verdict",   icon: "👑", desc: "End any dispute instantly — your word is final.",         condition: (_ex: number, _cr: number, im: number, pr: number, pw: number) => im >= 90 && pr >= 88 && pw >= 10500 },
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

export function scoreMedicine(data: {
  name: string;
  years_active: number;
  papers: number;
  citations: number;
  patients_treated: number;
  specialization_tier: number; // 1=highly specialized, 2=specialist, 3=general
  hospital_tier: number;       // 1=top research hospital, 2=regional, 3=community
  board_certifications: number;
}): CharacterScore {
  const expertise   = logYears(data.years_active);
  const specBonus   = data.specialization_tier === 1 ? 15 : data.specialization_tier === 2 ? 7 : 0;
  const hospBonus   = data.hospital_tier === 1 ? 12 : data.hospital_tier === 2 ? 5 : 0;
  const prestige    = Math.min(percentileScore(data.citations, MEDICINE_COHORT.citations) + hospBonus + specBonus, 100);
  const impact      = percentileScore(data.patients_treated, MEDICINE_COHORT.patients);
  const credentials = Math.min(percentileScore(data.papers, MEDICINE_COHORT.papers) + data.board_certifications * 5, 100);
  const network     = percentileScore(data.citations, MEDICINE_COHORT.citations);

  const raw = expertise * 0.20 + prestige * 0.25 + impact * 0.30 + credentials * 0.15 + network * 0.10;
  const power = Math.round(raw * 120);
  const tier = getTier(power);

  const abilities = MEDICINE_ABILITIES
    .filter(a => a.condition(expertise, credentials, impact, prestige, power))
    .map(({ name, icon, desc }) => ({ name, icon, desc }));

  return {
    name: data.name,
    realm: "medicine",
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
      years_active: data.years_active,
      pub_count:    data.papers,
      citations:    data.citations,
    },
  };
}

export function scoreCreative(data: {
  name: string;
  years_active: number;
  major_works: number;
  awards: number;
  audience_size: number;
  exhibitions_or_releases: number; // exhibitions for visual art, releases for music/film/books
}): CharacterScore {
  const expertise   = logYears(data.years_active);
  const prestige    = Math.min(percentileScore(data.awards, CREATIVE_COHORT.awards) * 0.6 + percentileScore(data.major_works, CREATIVE_COHORT.works) * 0.4, 100);
  const impact      = percentileScore(data.audience_size, CREATIVE_COHORT.audience);
  const credentials = percentileScore(data.major_works, CREATIVE_COHORT.works);
  const network     = Math.min(percentileScore(data.audience_size, CREATIVE_COHORT.audience) * 0.5 + percentileScore(data.exhibitions_or_releases, CREATIVE_COHORT.works) * 0.5, 100);

  const raw = expertise * 0.20 + prestige * 0.25 + impact * 0.30 + credentials * 0.15 + network * 0.10;
  const power = Math.round(raw * 120);
  const tier = getTier(power);

  const abilities = CREATIVE_ABILITIES
    .filter(a => a.condition(expertise, network, impact, prestige, power))
    .map(({ name, icon, desc }) => ({ name, icon, desc }));

  return {
    name: data.name,
    realm: "creative",
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
      years_active: data.years_active,
      pub_count:    data.major_works,
    },
  };
}

export function scoreLaw(data: {
  name: string;
  years_active: number;
  notable_cases: number;
  cases_won: number;
  bar_admissions: number;
  firm_tier: number; // 1=top global firm, 2=regional firm, 3=solo/small
  specialization_tier: number; // 1=highly specialized, 2=general practice
}): CharacterScore {
  const expertise   = logYears(data.years_active);
  const firmBonus   = data.firm_tier === 1 ? 15 : data.firm_tier === 2 ? 6 : 0;
  const prestige    = Math.min(percentileScore(data.notable_cases, LAW_COHORT.cases) + firmBonus, 100);
  const winRate     = data.notable_cases > 0 ? (data.cases_won / data.notable_cases) * 100 : 0;
  const impact      = Math.min(percentileScore(data.cases_won, LAW_COHORT.wins) * 0.6 + winRate * 0.4, 100);
  const credentials = Math.min(percentileScore(data.bar_admissions, LAW_COHORT.admissions) + (data.specialization_tier === 1 ? 10 : 0), 100);
  const network     = percentileScore(data.notable_cases, LAW_COHORT.cases);

  const raw = expertise * 0.20 + prestige * 0.25 + impact * 0.30 + credentials * 0.15 + network * 0.10;
  const power = Math.round(raw * 120);
  const tier = getTier(power);

  const abilities = LAW_ABILITIES
    .filter(a => a.condition(expertise, credentials, impact, prestige, power))
    .map(({ name, icon, desc }) => ({ name, icon, desc }));

  return {
    name: data.name,
    realm: "law",
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
      years_active: data.years_active,
    },
  };
}
