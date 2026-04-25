class_name Scorer
extends RefCounted

# Ported from web/lib/scorer.ts — all formulas are identical.
# percentileScore uses piecewise linear interpolation across p25/p50/p75/p90/p99 breakpoints.

const TIERS: Array[Dictionary] = [
	{"name": "Apprentice",   "min": 0,     "max": 799},
	{"name": "Initiate",     "min": 800,   "max": 1599},
	{"name": "Acolyte",      "min": 1600,  "max": 2399},
	{"name": "Journeyman",   "min": 2400,  "max": 3199},
	{"name": "Adept",        "min": 3200,  "max": 3999},
	{"name": "Scholar",      "min": 4000,  "max": 4799},
	{"name": "Sage",         "min": 4800,  "max": 5599},
	{"name": "Arcanist",     "min": 5600,  "max": 6399},
	{"name": "Exemplar",     "min": 6400,  "max": 7199},
	{"name": "Vanguard",     "min": 7200,  "max": 7999},
	{"name": "Master",       "min": 8000,  "max": 8799},
	{"name": "Grandmaster",  "min": 8800,  "max": 9599},
	{"name": "Champion",     "min": 9600,  "max": 10399},
	{"name": "Paragon",      "min": 10400, "max": 11199},
	{"name": "Legend",       "min": 11200, "max": 99999},
]

# ─── Cohort distributions ─────────────────────────────────────────────────────

const ACADEMIA_COHORT: Dictionary = {
	"h_index":   {"p25": 4,   "p50": 9,    "p75": 18,    "p90": 32,    "p99": 60},
	"citations": {"p25": 80,  "p50": 400,  "p75": 1500,  "p90": 5000,  "p99": 25000},
	"years":     {"p25": 3,   "p50": 8,    "p75": 16,    "p90": 25,    "p99": 40},
	"pubs":      {"p25": 5,   "p50": 20,   "p75": 60,    "p90": 120,   "p99": 400},
	"i10":       {"p25": 2,   "p50": 8,    "p75": 25,    "p90": 60,    "p99": 200},
}

const TECH_COHORT: Dictionary = {
	"repos":     {"p25": 5,   "p50": 15,   "p75": 40,    "p90": 100,   "p99": 400},
	"stars":     {"p25": 5,   "p50": 50,   "p75": 300,   "p90": 2000,  "p99": 20000},
	"followers": {"p25": 5,   "p50": 30,   "p75": 150,   "p90": 800,   "p99": 10000},
	"commits":   {"p25": 100, "p50": 500,  "p75": 1500,  "p90": 4000,  "p99": 15000},
}

const MEDICINE_COHORT: Dictionary = {
	"years":    {"p25": 3,   "p50": 8,    "p75": 18,   "p90": 28,   "p99": 40},
	"papers":   {"p25": 2,   "p50": 10,   "p75": 35,   "p90": 80,   "p99": 250},
	"citations":{"p25": 20,  "p50": 150,  "p75": 600,  "p90": 2000, "p99": 10000},
	"patients": {"p25": 200, "p50": 800,  "p75": 2500, "p90": 6000, "p99": 20000},
}

const CREATIVE_COHORT: Dictionary = {
	"years":    {"p25": 2,   "p50": 6,    "p75": 14,    "p90": 22,     "p99": 35},
	"works":    {"p25": 3,   "p50": 10,   "p75": 30,    "p90": 80,     "p99": 300},
	"awards":   {"p25": 0,   "p50": 1,    "p75": 4,     "p90": 10,     "p99": 30},
	"audience": {"p25": 500, "p50": 5000, "p75": 50000, "p90": 500000, "p99": 5000000},
}

const LAW_COHORT: Dictionary = {
	"years":      {"p25": 2,  "p50": 7,   "p75": 16,  "p90": 25,  "p99": 40},
	"cases":      {"p25": 10, "p50": 50,  "p75": 150, "p90": 400, "p99": 1500},
	"wins":       {"p25": 5,  "p50": 30,  "p75": 100, "p90": 280, "p99": 1000},
	"admissions": {"p25": 1,  "p50": 2,   "p75": 4,   "p90": 7,   "p99": 15},
}

# ─── Core math ────────────────────────────────────────────────────────────────

# Piecewise linear interpolation across p25/p50/p75/p90/p99 breakpoints.
# Matches the web scorer's percentileScore function exactly.
static func percentile_score(value: float, dist: Dictionary) -> float:
	var breakpoints: Array = [
		[0.0,                    0.0],
		[float(dist["p25"]),    25.0],
		[float(dist["p50"]),    50.0],
		[float(dist["p75"]),    75.0],
		[float(dist["p90"]),    90.0],
		[float(dist["p99"]),    99.0],
		[float(dist["p99"]) * 3.0, 100.0],
	]
	for i: int in range(1, breakpoints.size()):
		var lo_val: float = breakpoints[i - 1][0]
		var lo_pct: float = breakpoints[i - 1][1]
		var hi_val: float = breakpoints[i][0]
		var hi_pct: float = breakpoints[i][1]
		if value <= hi_val:
			if hi_val == lo_val:
				return lo_pct
			var t: float = (value - lo_val) / (hi_val - lo_val)
			return lo_pct + t * (hi_pct - lo_pct)
	return 100.0


# log(years+1) / log(42), clamped to [0,1], ×100
static func log_years(years: float) -> float:
	return minf(log(years + 1.0) / log(42.0), 1.0) * 100.0


static func get_tier(power: int) -> String:
	for tier: Dictionary in TIERS:
		if power >= tier["min"] and power <= tier["max"]:
			return tier["name"]
	return "Apprentice"


# Gold bonus for saving a realm: 10% of realm power
static func calc_realm_gold_bonus(realm_power: int) -> int:
	return int(realm_power * 0.1)


# ─── Realm scorers ────────────────────────────────────────────────────────────
# Each returns: { power, tier, dominant_stat, expertise, prestige, impact, credentials, network }

static func score_academia(
		h_index: float, total_citations: float, years_active: float,
		pub_count: float, i10_index: float,
		recent_citations: float = 0.0, institution_tier: int = 3) -> Dictionary:
	var expertise: float   = log_years(years_active)
	var cite_pct: float    = percentile_score(total_citations, ACADEMIA_COHORT["citations"])
	var inst_bonus: float  = 15.0 if institution_tier == 1 else (5.0 if institution_tier == 2 else 0.0)
	var prestige: float    = minf(cite_pct + inst_bonus, 100.0)
	var h_pct: float       = percentile_score(h_index, ACADEMIA_COHORT["h_index"])
	var recency: float     = minf((recent_citations / total_citations) * 10.0, 10.0) if total_citations > 0.0 else 0.0
	var impact: float      = minf(h_pct + recency, 100.0)
	var credentials: float = percentile_score(pub_count, ACADEMIA_COHORT["pubs"])
	var network: float     = percentile_score(i10_index, ACADEMIA_COHORT["i10"])
	var raw: float         = expertise * 0.20 + prestige * 0.25 + impact * 0.30 + credentials * 0.15 + network * 0.10
	var power: int         = int(round(raw * 120.0))
	return _result(power, expertise, prestige, impact, credentials, network)


static func score_tech(
		repos: float, stars: float, followers: float,
		commits: float, years_active: float) -> Dictionary:
	var expertise: float   = log_years(years_active)
	var prestige: float    = percentile_score(followers, TECH_COHORT["followers"])
	var impact: float      = percentile_score(stars,     TECH_COHORT["stars"])
	var credentials: float = percentile_score(repos,     TECH_COHORT["repos"])
	var network: float     = percentile_score(commits,   TECH_COHORT["commits"])
	var raw: float         = expertise * 0.20 + prestige * 0.25 + impact * 0.30 + credentials * 0.15 + network * 0.10
	var power: int         = int(round(raw * 120.0))
	return _result(power, expertise, prestige, impact, credentials, network)


static func score_medicine(
		years_active: float, papers: float, citations: float,
		patients_treated: float,
		specialization_tier: int = 3, hospital_tier: int = 3,
		board_certifications: float = 0.0) -> Dictionary:
	var expertise: float   = log_years(years_active)
	var spec_bonus: float  = 15.0 if specialization_tier == 1 else (7.0 if specialization_tier == 2 else 0.0)
	var hosp_bonus: float  = 12.0 if hospital_tier == 1 else (5.0 if hospital_tier == 2 else 0.0)
	var prestige: float    = minf(percentile_score(citations, MEDICINE_COHORT["citations"]) + hosp_bonus + spec_bonus, 100.0)
	var impact: float      = percentile_score(patients_treated, MEDICINE_COHORT["patients"])
	var credentials: float = minf(percentile_score(papers, MEDICINE_COHORT["papers"]) + board_certifications * 5.0, 100.0)
	var network: float     = percentile_score(citations, MEDICINE_COHORT["citations"])
	var raw: float         = expertise * 0.20 + prestige * 0.25 + impact * 0.30 + credentials * 0.15 + network * 0.10
	var power: int         = int(round(raw * 120.0))
	return _result(power, expertise, prestige, impact, credentials, network)


static func score_creative(
		years_active: float, major_works: float, awards: float,
		audience_size: float, exhibitions_or_releases: float) -> Dictionary:
	var expertise: float   = log_years(years_active)
	var prestige: float    = minf(percentile_score(awards, CREATIVE_COHORT["awards"]) * 0.6 + percentile_score(major_works, CREATIVE_COHORT["works"]) * 0.4, 100.0)
	var impact: float      = percentile_score(audience_size, CREATIVE_COHORT["audience"])
	var credentials: float = percentile_score(major_works, CREATIVE_COHORT["works"])
	var network: float     = minf(percentile_score(audience_size, CREATIVE_COHORT["audience"]) * 0.5 + percentile_score(exhibitions_or_releases, CREATIVE_COHORT["works"]) * 0.5, 100.0)
	var raw: float         = expertise * 0.20 + prestige * 0.25 + impact * 0.30 + credentials * 0.15 + network * 0.10
	var power: int         = int(round(raw * 120.0))
	return _result(power, expertise, prestige, impact, credentials, network)


static func score_law(
		years_active: float, notable_cases: float, cases_won: float,
		bar_admissions: float,
		firm_tier: int = 3, specialization_tier: int = 2) -> Dictionary:
	var expertise: float   = log_years(years_active)
	var firm_bonus: float  = 15.0 if firm_tier == 1 else (6.0 if firm_tier == 2 else 0.0)
	var prestige: float    = minf(percentile_score(notable_cases, LAW_COHORT["cases"]) + firm_bonus, 100.0)
	var win_rate: float    = (cases_won / notable_cases) * 100.0 if notable_cases > 0.0 else 0.0
	var impact: float      = minf(percentile_score(cases_won, LAW_COHORT["wins"]) * 0.6 + win_rate * 0.4, 100.0)
	var spec_bonus: float  = 10.0 if specialization_tier == 1 else 0.0
	var credentials: float = minf(percentile_score(bar_admissions, LAW_COHORT["admissions"]) + spec_bonus, 100.0)
	var network: float     = percentile_score(notable_cases, LAW_COHORT["cases"])
	var raw: float         = expertise * 0.20 + prestige * 0.25 + impact * 0.30 + credentials * 0.15 + network * 0.10
	var power: int         = int(round(raw * 120.0))
	return _result(power, expertise, prestige, impact, credentials, network)


static func _result(power: int, expertise: float, prestige: float,
		impact: float, credentials: float, network: float) -> Dictionary:
	return {
		"power":       power,
		"tier":        get_tier(power),
		"expertise":   expertise,
		"prestige":    prestige,
		"impact":      impact,
		"credentials": credentials,
		"network":     network,
	}
