extends Node

var jwt: String = ""
var user_id: String = ""
var character_name: String = ""
var dominant_realm: String = ""
var realm_scores: Dictionary = {}
var total_power: int = 0
var tier: String = ""
var gold: int = 0
var realm_skill: String = ""

var expertise: float = 0.0
var prestige: float = 0.0
var impact: float = 0.0
var credentials: float = 0.0
var network: float = 0.0

var battle_hp: int = 0
var battle_attack: int = 0
var battle_defence: int = 0

var is_authenticated: bool = false

# Economy fields
var active_insurance: String = "none"       # "none" | "bronze" | "silver" | "gold"
var owned_cosmetics: Array[String] = []
var equipped_title: String = ""             # cosmetic ID or ""
var equipped_border: String = ""            # cosmetic ID or ""
var pending_broadcast: String = "basic"     # selected before boss raid entry


func load_from_dict(data: Dictionary) -> void:
	character_name = data.get("name", "")
	# DB column is "realms"; dominant_realm and tier are derived locally
	var raw_realms: Variant = data.get("realms", {})
	realm_scores = raw_realms if raw_realms is Dictionary else {}
	total_power = data.get("total_power", 0)
	gold = data.get("gold", 0)
	# Derive tier and dominant_realm from stored data
	tier = Scorer.get_tier(total_power)
	dominant_realm = _dominant_realm_from_scores(realm_scores)
	active_insurance = data.get("active_insurance", "none")
	var raw_cosmetics: Variant = data.get("owned_cosmetics", [])
	owned_cosmetics.clear()
	if raw_cosmetics is Array:
		for c: Variant in raw_cosmetics:
			owned_cosmetics.append(str(c))
	equipped_title = data.get("equipped_title", "")
	equipped_border = data.get("equipped_border", "")


static func _dominant_realm_from_scores(scores: Dictionary) -> String:
	var best_realm: String = ""
	var best_power: int = 0
	for realm: String in scores:
		var entry: Variant = scores[realm]
		var p: int = 0
		if entry is Dictionary:
			p = int(entry.get("power", 0))
		if p > best_power:
			best_power = p
			best_realm = realm
	return best_realm


func clear() -> void:
	jwt = ""
	user_id = ""
	character_name = ""
	dominant_realm = ""
	realm_scores = {}
	total_power = 0
	tier = ""
	gold = 0
	realm_skill = ""
	expertise = 0.0
	prestige = 0.0
	impact = 0.0
	credentials = 0.0
	network = 0.0
	battle_hp = 0
	battle_attack = 0
	battle_defence = 0
	is_authenticated = false
	active_insurance = "none"
	owned_cosmetics = []
	equipped_title = ""
	equipped_border = ""
	pending_broadcast = "basic"
