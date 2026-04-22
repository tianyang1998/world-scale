class_name PlayerData
extends Node

var jwt: String = ""
var user_id: String = ""
var character_name: String = ""
var realm: String = ""
var total_power: int = 0
var tier: String = ""
var gold: int = 0
var realm_skill: String = ""

# Five stats (0–100 each)
var expertise: float = 0.0
var prestige: float = 0.0
var impact: float = 0.0
var credentials: float = 0.0
var network: float = 0.0

# Battle-allocated stats (set on PrepScreen)
var battle_hp: int = 0
var battle_attack: int = 0
var battle_defence: int = 0

var is_authenticated: bool = false

func load_from_dict(data: Dictionary) -> void:
	character_name = data.get("name", "")
	realm = data.get("realm", "")
	total_power = data.get("total_power", 0)
	tier = data.get("tier", "Apprentice")
	gold = data.get("gold", 0)
	realm_skill = data.get("realm_skill", "")

func clear() -> void:
	jwt = ""
	user_id = ""
	character_name = ""
	realm = ""
	total_power = 0
	tier = ""
	gold = 0
	realm_skill = ""
	expertise = 0.0
	prestige = 0.0
	impact = 0.0
	credentials = 0.0
	network = 0.0
	is_authenticated = false
