class_name BattleState
extends RefCounted

var user_id: String = ""
var player_name: String = ""
var realm: String = ""

var max_hp: int = 0
var attack: int = 0
var defence: int = 0
var current_hp: int = 0

# { multiplier: float, expires_at_ms: int } — empty dict = no debuff
var defence_debuff: Dictionary = {}
var attack_debuff: Dictionary = {}

var stun_expires_at_ms: int = 0
var is_bracing: bool = false
var realm_skill_last_used_ms: int = 0


func is_stunned() -> bool:
	return Time.get_ticks_msec() < stun_expires_at_ms


func effective_defence() -> float:
	if defence_debuff.is_empty():
		return float(defence)
	var mult: float = defence_debuff.get("multiplier", 1.0)
	var exp_ms: int = defence_debuff.get("expires_at_ms", 0)
	if Time.get_ticks_msec() >= exp_ms:
		return float(defence)
	return defence * mult


func effective_attack() -> float:
	if attack_debuff.is_empty():
		return float(attack)
	var mult: float = attack_debuff.get("multiplier", 1.0)
	var exp_ms: int = attack_debuff.get("expires_at_ms", 0)
	if Time.get_ticks_msec() >= exp_ms:
		return float(attack)
	return attack * mult


func is_dead() -> bool:
	return current_hp <= 0
