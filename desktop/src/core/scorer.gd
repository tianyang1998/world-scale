class_name Scorer
extends RefCounted

const TIERS: Array[Dictionary] = [
    {"name": "Apprentice", "min": 0, "max": 799},
    {"name": "Initiate", "min": 800, "max": 1599},
    {"name": "Acolyte", "min": 1600, "max": 2399},
    {"name": "Journeyman", "min": 2400, "max": 3199},
    {"name": "Adept", "min": 3200, "max": 3999},
    {"name": "Scholar", "min": 4000, "max": 4799},
    {"name": "Sage", "min": 4800, "max": 5599},
    {"name": "Arcanist", "min": 5600, "max": 6399},
    {"name": "Exemplar", "min": 6400, "max": 7199},
    {"name": "Vanguard", "min": 7200, "max": 7999},
    {"name": "Master", "min": 8000, "max": 8799},
    {"name": "Grandmaster", "min": 8800, "max": 9599},
    {"name": "Champion", "min": 9600, "max": 10399},
    {"name": "Paragon", "min": 10400, "max": 11199},
    {"name": "Legend", "min": 11200, "max": 99999},
]

## Maps [param value] to a 0.0–100.0 percentile within [param dist].
## Returns 0.0 if value is at or below [code]dist["min"][/code], 100.0 if at or above [code]dist["max"][/code].
static func percentile_score(value: float, dist: Dictionary) -> float:
    if dist.is_empty() or value <= dist["min"]:
        return 0.0
    if value >= dist["max"]:
        return 100.0
    return (value - dist["min"]) / (dist["max"] - dist["min"]) * 100.0

## Returns log base 10 of (years + 1.0). Maps 0 years → 0.0, 9 years → 1.0.
static func log_years(years: float) -> float:
    return log(years + 1.0) / log(10.0)

## Computes total power score from five stat values (each 0.0–1.0 scale).
## Weights: expertise×2000, prestige×1500, impact×1500, credentials×2500, network×2500.
static func compute_power(expertise: float, prestige: float, impact: float, credentials: float, network: float) -> int:
    return int(expertise * 2000.0 + prestige * 1500.0 + impact * 1500.0 + credentials * 2500.0 + network * 2500.0)

## Returns the tier name for the given power score by searching [constant TIERS].
static func get_tier(power: int) -> String:
    for tier in TIERS:
        if power >= tier["min"] and power <= tier["max"]:
            return tier["name"]
    return "Legend"
