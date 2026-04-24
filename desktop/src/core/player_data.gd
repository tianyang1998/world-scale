class_name PlayerData
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
	dominant_realm = data.get("dominant_realm", "")
	realm_scores = data.get("realm_scores", {})
	total_power = data.get("total_power", 0)
	tier = data.get("tier", "Apprentice")
	gold = data.get("gold", 0)
	realm_skill = data.get("realm_skill", "")
	active_insurance = data.get("active_insurance", "none")
	var raw_cosmetics = data.get("owned_cosmetics", [])
	owned_cosmetics.clear()
	for c in raw_cosmetics:
		owned_cosmetics.append(str(c))
	equipped_title = data.get("equipped_title", "")
	equipped_border = data.get("equipped_border", "")


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
