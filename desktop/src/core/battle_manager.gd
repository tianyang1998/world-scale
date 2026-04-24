class_name BattleManager
extends RefCounted

# Stateless battle logic. All methods are static — no instantiation needed.

const REALM_COOLDOWNS_MS: Dictionary = {
	"academia": 4000,
	"tech":     4000,
	"medicine": 4000,
	"creative": 3000,
	"law":      4000,
}


static func calc_damage(attacker: BattleState, defender: BattleState,
		skill_mult: float) -> int:
	var eff_def: float = defender.effective_defence()
	var raw: float = attacker.effective_attack() * skill_mult \
			* (100.0 / (100.0 + eff_def))
	var reduction: float = 0.70 if defender.is_bracing else 1.0
	return max(1, int(round(raw * reduction)))


static func calc_gold_transfer(loser_gold: int) -> int:
	if loser_gold < 50:
		return loser_gold
	return max(50, min(500, int(floor(loser_gold * 0.10))))


static func apply_debuff(target: BattleState, debuff_type: String,
		multiplier: float, duration_ms: int) -> void:
	var entry: Dictionary = {
		"multiplier":    multiplier,
		"expires_at_ms": Time.get_ticks_msec() + duration_ms,
	}
	match debuff_type:
		"defence":
			target.defence_debuff = entry
		"attack":
			target.attack_debuff = entry


static func apply_stun(target: BattleState, duration_ms: int) -> void:
	target.stun_expires_at_ms = Time.get_ticks_msec() + duration_ms


# Returns a result dict describing what happened, for broadcast/display.
# { damage: int, heal: int, stun: bool, debuff_type: String }
static func apply_realm_skill(actor: BattleState,
		target: BattleState) -> Dictionary:
	var result: Dictionary = {"damage": 0, "heal": 0, "stun": false, "debuff_type": ""}
	match actor.realm:
		"academia":
			apply_debuff(target, "defence", 0.75, 2000)
			result["debuff_type"] = "defence"
		"tech":
			result["damage"] = calc_damage(actor, target, 1.8)
			target.current_hp = max(0, target.current_hp - result["damage"])
		"medicine":
			var heal: int = int(round(actor.max_hp * 0.20))
			actor.current_hp = min(actor.max_hp, actor.current_hp + heal)
			result["heal"] = heal
		"creative":
			result["damage"] = calc_damage(actor, target, 1.2)
			target.current_hp = max(0, target.current_hp - result["damage"])
			if randf() < 0.30:
				apply_stun(target, 1000)
				result["stun"] = true
		"law":
			apply_debuff(target, "attack", 0.80, 3000)
			result["debuff_type"] = "attack"
	actor.realm_skill_last_used_ms = Time.get_ticks_msec()
	return result


static func realm_skill_ready(state: BattleState) -> bool:
	var cd_ms: int = REALM_COOLDOWNS_MS.get(state.realm, 4000)
	return Time.get_ticks_msec() - state.realm_skill_last_used_ms >= cd_ms


static func realm_skill_name(realm: String) -> String:
	match realm:
		"academia": return "Deep Research"
		"tech":     return "Commit Storm"
		"medicine": return "Clinical Mastery"
		"creative": return "Viral Work"
		"law":      return "Precedent"
	return "Realm Skill"


# Returns the projectile kind for a player action.
static func projectile_kind_for_action(action: String, realm: String) -> String:
	if action == "strike":
		return "sword"
	match realm:
		"academia": return "orb"
		"tech":     return "lightning"
		"medicine": return "heal_pulse"
		"creative": return "paint"
		"law":      return "verdict"
	return "orb"
