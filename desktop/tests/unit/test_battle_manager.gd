extends GdUnitTestSuite

## Unit tests for BattleManager and BattleState.
## All tests use deterministic inputs — no RNG.


func _make_state(hp: int, atk: int, def: int, realm: String = "tech") -> BattleState:
	var s := BattleState.new()
	s.max_hp = hp
	s.current_hp = hp
	s.attack = atk
	s.defence = def
	s.realm = realm
	return s


# ─── Damage formula ───────────────────────────────────────────────────────────

func test_damage_formula_basic() -> void:
	# attack=1000, defence=0, mult=1.0 → raw = 1000 × (100/100) = 1000
	var atk := _make_state(1000, 1000, 0)
	var def := _make_state(1000, 0, 0)
	var dmg: int = BattleManager.calc_damage(atk, def, 1.0)
	assert_int(dmg).is_equal(1000)


func test_damage_formula_with_defence() -> void:
	# attack=1000, defence=100 → raw = 1000 × (100/200) = 500
	var atk := _make_state(1000, 1000, 0)
	var def := _make_state(1000, 0, 100)
	var dmg: int = BattleManager.calc_damage(atk, def, 1.0)
	assert_int(dmg).is_equal(500)


func test_brace_reduces_damage_30_percent() -> void:
	# Without brace: attack=1000, defence=0 → 1000
	# With brace: 1000 × 0.70 = 700
	var atk := _make_state(1000, 1000, 0)
	var def_no_brace := _make_state(1000, 0, 0)
	var def_bracing := _make_state(1000, 0, 0)
	def_bracing.is_bracing = true

	var dmg_normal: int = BattleManager.calc_damage(atk, def_no_brace, 1.0)
	var dmg_braced: int = BattleManager.calc_damage(atk, def_bracing, 1.0)
	assert_int(dmg_normal).is_equal(1000)
	assert_int(dmg_braced).is_equal(700)


func test_minimum_damage_is_1() -> void:
	# Extremely high defence still produces at least 1 damage
	var atk := _make_state(1000, 1, 0)
	var def := _make_state(1000, 0, 999999)
	var dmg: int = BattleManager.calc_damage(atk, def, 1.0)
	assert_int(dmg).is_greater_equal(1)


func test_commit_storm_multiplier_1_8() -> void:
	# attack=1000, defence=0: strike → 1000, commit_storm → 1800
	var atk := _make_state(1000, 1000, 0, "tech")
	var def := _make_state(1000, 0, 0)
	var strike_dmg: int = BattleManager.calc_damage(atk, def, 1.0)
	var storm_dmg: int = BattleManager.calc_damage(atk, def, 1.8)
	assert_int(strike_dmg).is_equal(1000)
	assert_int(storm_dmg).is_equal(1800)


# ─── Debuffs ──────────────────────────────────────────────────────────────────

func test_defence_debuff_reduces_effective_defence() -> void:
	# defence=100, debuff×0.75 → effective = 75
	var state := _make_state(1000, 0, 100)
	BattleManager.apply_debuff(state, "defence", 0.75, 5000)
	assert_float(state.effective_defence()).is_equal_approx(75.0, 0.001)


func test_attack_debuff_reduces_effective_attack() -> void:
	var state := _make_state(1000, 1000, 0)
	BattleManager.apply_debuff(state, "attack", 0.80, 5000)
	assert_float(state.effective_attack()).is_equal_approx(800.0, 0.001)


func test_defence_debuff_increases_damage_taken() -> void:
	# Without debuff: attack=1000, def=100 → 1000×(100/200)=500
	# With def debuff ×0.75: effective def=75 → 1000×(100/175)≈571
	var atk := _make_state(1000, 1000, 0)
	var def_no_debuff := _make_state(1000, 0, 100)
	var def_debuffed := _make_state(1000, 0, 100)
	BattleManager.apply_debuff(def_debuffed, "defence", 0.75, 5000)

	var dmg_normal: int = BattleManager.calc_damage(atk, def_no_debuff, 1.0)
	var dmg_debuffed: int = BattleManager.calc_damage(atk, def_debuffed, 1.0)
	assert_int(dmg_debuffed).is_greater(dmg_normal)


func test_expired_debuff_has_no_effect() -> void:
	var state := _make_state(1000, 1000, 100)
	# Set expiry in the past
	state.defence_debuff = {"multiplier": 0.75, "expires_at_ms": 0}
	assert_float(state.effective_defence()).is_equal_approx(100.0, 0.001)


func test_debuff_reset_on_reapply() -> void:
	# Applying the same debuff again resets the timer (does not stack multiplier)
	var state := _make_state(1000, 0, 100)
	BattleManager.apply_debuff(state, "defence", 0.75, 5000)
	var first_expires: int = state.defence_debuff["expires_at_ms"]
	BattleManager.apply_debuff(state, "defence", 0.75, 5000)
	var second_expires: int = state.defence_debuff["expires_at_ms"]
	# Second apply has a later or equal expiry (timer reset)
	assert_int(second_expires).is_greater_equal(first_expires)
	# Multiplier not compounded — still 0.75
	assert_float(state.defence_debuff["multiplier"]).is_equal_approx(0.75, 0.001)


# ─── Gold transfer ────────────────────────────────────────────────────────────

func test_gold_transfer_ten_percent() -> void:
	assert_int(BattleManager.calc_gold_transfer(1000)).is_equal(100)
	assert_int(BattleManager.calc_gold_transfer(5000)).is_equal(500)


func test_gold_transfer_minimum_50() -> void:
	assert_int(BattleManager.calc_gold_transfer(100)).is_equal(50)
	assert_int(BattleManager.calc_gold_transfer(50)).is_equal(50)


func test_gold_transfer_cap_500() -> void:
	assert_int(BattleManager.calc_gold_transfer(10000)).is_equal(500)
	assert_int(BattleManager.calc_gold_transfer(100000)).is_equal(500)


func test_gold_transfer_below_50_loses_all() -> void:
	assert_int(BattleManager.calc_gold_transfer(30)).is_equal(30)
	assert_int(BattleManager.calc_gold_transfer(1)).is_equal(1)
	assert_int(BattleManager.calc_gold_transfer(0)).is_equal(0)


# ─── Medicine heal ────────────────────────────────────────────────────────────

func test_medicine_heal_twenty_percent_of_max_hp() -> void:
	var actor := _make_state(1000, 100, 100, "medicine")
	actor.current_hp = 500
	var target := _make_state(1000, 100, 100)
	BattleManager.apply_realm_skill(actor, target)
	# 20% of 1000 = 200 → 500 + 200 = 700
	assert_int(actor.current_hp).is_equal(700)


func test_medicine_heal_capped_at_max_hp() -> void:
	var actor := _make_state(1000, 100, 100, "medicine")
	actor.current_hp = 950  # only 50 below max
	var target := _make_state(1000, 100, 100)
	BattleManager.apply_realm_skill(actor, target)
	# Would heal 200 but cap at 1000
	assert_int(actor.current_hp).is_equal(1000)


# ─── Realm skill name ─────────────────────────────────────────────────────────

func test_realm_skill_names() -> void:
	assert_str(BattleManager.realm_skill_name("academia")).is_equal("Deep Research")
	assert_str(BattleManager.realm_skill_name("tech")).is_equal("Commit Storm")
	assert_str(BattleManager.realm_skill_name("medicine")).is_equal("Clinical Mastery")
	assert_str(BattleManager.realm_skill_name("creative")).is_equal("Viral Work")
	assert_str(BattleManager.realm_skill_name("law")).is_equal("Precedent")


# ─── Projectile kind routing ──────────────────────────────────────────────────

func test_projectile_kind_strike_is_always_sword() -> void:
	for realm in ["academia", "tech", "medicine", "creative", "law"]:
		assert_str(BattleManager.projectile_kind_for_action("strike", realm)).is_equal("sword")


func test_projectile_kind_realm_routing() -> void:
	assert_str(BattleManager.projectile_kind_for_action("realm", "academia")).is_equal("orb")
	assert_str(BattleManager.projectile_kind_for_action("realm", "tech")).is_equal("lightning")
	assert_str(BattleManager.projectile_kind_for_action("realm", "medicine")).is_equal("heal_pulse")
	assert_str(BattleManager.projectile_kind_for_action("realm", "creative")).is_equal("paint")
	assert_str(BattleManager.projectile_kind_for_action("realm", "law")).is_equal("verdict")
