class_name EconomyManager
extends RefCounted

# Stateless economy logic. All methods are static — no instantiation needed.
# Operates on PlayerData global. Server-side atomicity deferred to Phase 7 networking.

# ─── Catalogs ─────────────────────────────────────────────────────────────────

const INSURANCE: Dictionary = {
	"none":   {"name": "None",   "premium": 0,   "refund_pct": 0.0},
	"bronze": {"name": "Bronze", "premium": 30,  "refund_pct": 0.25},
	"silver": {"name": "Silver", "premium": 60,  "refund_pct": 0.50},
	"gold":   {"name": "Gold",   "premium": 100, "refund_pct": 0.75},
}

const BROADCAST: Dictionary = {
	"basic":    {"name": "Basic",    "cost": 0},
	"extended": {"name": "Extended", "cost": 100},
	"global":   {"name": "Global",   "cost": 300},
}

const TITLES: Dictionary = {
	"title_boss_slayer":    {"name": "Boss Slayer",    "cost": 150},
	"title_the_unyielding": {"name": "The Unyielding", "cost": 200},
	"title_realm_champion": {"name": "Realm Champion", "cost": 350},
	"title_gold_hoarder":   {"name": "Gold Hoarder",   "cost": 500},
}

const BORDERS: Dictionary = {
	"border_academia": {"name": "Scholar's Frame", "cost": 300},
	"border_tech":     {"name": "Circuit Frame",   "cost": 300},
	"border_medicine": {"name": "Healer's Frame",  "cost": 300},
	"border_creative": {"name": "Artist's Frame",  "cost": 300},
	"border_law":      {"name": "Justice Frame",   "cost": 300},
	"border_gilded":   {"name": "Gilded Frame",    "cost": 800},
}


# ─── Insurance ────────────────────────────────────────────────────────────────

# Deduct premium and set active_insurance. Returns "" on success or an error string.
static func buy_insurance(tier_id: String) -> String:
	if not INSURANCE.has(tier_id):
		return "Unknown insurance tier: %s" % tier_id
	if tier_id == "none":
		PlayerData.active_insurance = "none"
		return ""
	if PlayerData.active_insurance != "none":
		return "Already have active insurance — cannot stack policies"
	var premium: int = int(INSURANCE[tier_id]["premium"])
	if PlayerData.gold < premium:
		return "Insufficient gold (need %d, have %d)" % [premium, PlayerData.gold]
	PlayerData.gold -= premium
	PlayerData.active_insurance = tier_id
	return ""


# Calculate refund on a gold loss amount. Pure — does not modify state.
static func calc_refund(gold_lost: int, insurance_id: String) -> int:
	var pct: float = float(INSURANCE.get(insurance_id, INSURANCE["none"])["refund_pct"])
	return int(floor(gold_lost * pct))


# Consume the active insurance policy (call after any match result).
static func consume_insurance() -> void:
	PlayerData.active_insurance = "none"


# ─── Broadcast ────────────────────────────────────────────────────────────────

# Deduct broadcast cost and store selection. Returns "" on success or error string.
static func buy_broadcast(tier_id: String) -> String:
	if not BROADCAST.has(tier_id):
		return "Unknown broadcast tier: %s" % tier_id
	var cost: int = int(BROADCAST[tier_id]["cost"])
	if PlayerData.gold < cost:
		return "Insufficient gold (need %d, have %d)" % [cost, PlayerData.gold]
	PlayerData.gold -= cost
	PlayerData.pending_broadcast = tier_id
	return ""


# ─── Cosmetics ────────────────────────────────────────────────────────────────

# Returns the combined catalog (titles + borders) as { id → {name, cost, category} }
static func all_cosmetics() -> Dictionary:
	var out: Dictionary = {}
	for id: String in TITLES:
		out[id] = {"name": TITLES[id]["name"], "cost": TITLES[id]["cost"], "category": "title"}
	for id: String in BORDERS:
		out[id] = {"name": BORDERS[id]["name"], "cost": BORDERS[id]["cost"], "category": "border"}
	return out


# Purchase a cosmetic. If already owned, just equips (no charge).
# Returns "" on success or error string.
static func buy_cosmetic(cosmetic_id: String, auto_equip: bool) -> String:
	var catalog: Dictionary = all_cosmetics()
	if not catalog.has(cosmetic_id):
		return "Unknown cosmetic: %s" % cosmetic_id

	if not PlayerData.owned_cosmetics.has(cosmetic_id):
		var cost: int = int(catalog[cosmetic_id]["cost"])
		if PlayerData.gold < cost:
			return "Insufficient gold (need %d, have %d)" % [cost, PlayerData.gold]
		PlayerData.gold -= cost
		PlayerData.owned_cosmetics.append(cosmetic_id)

	if auto_equip:
		return equip_cosmetic(cosmetic_id)
	return ""


# Equip an owned cosmetic (no cost). Returns "" on success or error string.
static func equip_cosmetic(cosmetic_id: String) -> String:
	if not PlayerData.owned_cosmetics.has(cosmetic_id):
		return "Cosmetic not owned: %s" % cosmetic_id
	if TITLES.has(cosmetic_id):
		PlayerData.equipped_title = cosmetic_id
	elif BORDERS.has(cosmetic_id):
		PlayerData.equipped_border = cosmetic_id
	else:
		return "Unknown cosmetic: %s" % cosmetic_id
	return ""


# Unequip a cosmetic slot ("title" or "border").
static func unequip_slot(slot: String) -> void:
	match slot:
		"title":  PlayerData.equipped_title = ""
		"border": PlayerData.equipped_border = ""


# Return display name for the equipped title (empty string if none).
static func equipped_title_display() -> String:
	if PlayerData.equipped_title.is_empty():
		return ""
	return TITLES.get(PlayerData.equipped_title, {}).get("name", "")
