class_name Scorer
extends RefCounted

# Tier boundaries — must match gdd/scoring-system.md §3.6
const TIERS: Array[Dictionary] = [
	{"name": "Apprentice",  "min": 0,     "max": 799},
	{"name": "Initiate",    "min": 800,   "max": 1599},
	{"name": "Acolyte",     "min": 1600,  "max": 2399},
	{"name": "Journeyman",  "min": 2400,  "max": 3199},
	{"name": "Adept",       "min": 3200,  "max": 3999},
	{"name": "Scholar",     "min": 4000,  "max": 4799},
	{"name": "Sage",        "min": 4800,  "max": 5599},
	{"name": "Arcanist",    "min": 5600,  "max": 6399},
	{"name": "Exemplar",    "min": 6400,  "max": 7199},
	{"name": "Vanguard",    "min": 7200,  "max": 7999},
	{"name": "Master",      "min": 8000,  "max": 8799},
	{"name": "Grandmaster", "min": 8800,  "max": 9599},
	{"name": "Champion",    "min": 9600,  "max": 10399},
	{"name": "Paragon",     "min": 10400, "max": 11199},
	{"name": "Legend",      "min": 11200, "max": 99999},
]

## percentile_score: maps value onto 0-100 using breakpoints.
## dist must have keys: p25, p50, p75, p90, p99 (all floats).
static func percentile_score(value: float, dist: Dictionary) -> float:
	var breakpoints: Array = [
		[0.0,             0.0],
		[dist["p25"],    25.0],
		[dist["p50"],    50.0],
		[dist["p75"],    75.0],
		[dist["p90"],    90.0],
		[dist["p99"],    99.0],
		[dist["p99"] * 3.0, 100.0],
	]
	for i in range(1, breakpoints.size()):
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

## log_years: expertise from years active (log scale, base 42).
static func log_years(years: float) -> float:
	return minf(log(years + 1.0) / log(42.0), 1.0) * 100.0

## compute_power: weighted sum scaled to 0-12000 range.
## Weights: expertise 20%, prestige 25%, impact 30%, credentials 15%, network 10%.
static func compute_power(
	expertise: float, prestige: float, impact: float,
	credentials: float, network: float
) -> int:
	var raw: float = (
		expertise   * 0.20 +
		prestige    * 0.25 +
		impact      * 0.30 +
		credentials * 0.15 +
		network     * 0.10
	)
	return roundi(raw * 120.0)

## get_tier: maps power value to tier name string.
## Returns "Apprentice" as fallback if no tier matches (should not occur with valid input).
static func get_tier(power: int) -> String:
	for t in TIERS:
		if power >= t["min"] and power <= t["max"]:
			return t["name"]
	return "Apprentice"
