class_name PlayerData
extends Node

var jwt: String = ""
var user_id: String = ""
var character_name: String = ""
var dominant_realm: String = ""
## Per-realm power scores. Key = realm string, value = int power.
## e.g. {"academia": 3200, "tech": 1000}
var realm_scores: Dictionary = {}
var total_power: int = 0
var tier: String = ""
var gold: int = 0
var realm_skill: String = ""

## Aggregate stats derived from all realm submissions combined (0.0–1.0 scale).
var expertise: float = 0.0
var prestige: float = 0.0
var impact: float = 0.0
var credentials: float = 0.0
var network: float = 0.0

## Battle-allocated stats (set on PrepScreen).
var battle_hp: int = 0
var battle_attack: int = 0
var battle_defence: int = 0

var is_authenticated: bool = false

## Populate from a character dict returned by the auth or save API.
func load_from_dict(data: Dictionary) -> void:
	character_name = data.get("name", "")
	dominant_realm = data.get("dominant_realm", "")
	realm_scores = data.get("realm_scores", {})
	total_power = data.get("total_power", 0)
	tier = data.get("tier", "Apprentice")
	gold = data.get("gold", 0)
	realm_skill = data.get("realm_skill", "")

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
