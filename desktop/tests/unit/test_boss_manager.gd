extends GdUnitTestSuite

## Unit tests for boss PvE formulas and targeting logic.
## All BattleManager static methods — no scene required.


func _make_player(hp: int, atk: int, def: int, bracing: bool = false) -> BattleState:
	var s := BattleState.new()
	s.max_hp = hp
	s.current_hp = hp
	s.attack = atk
	s.defence = def
	s.is_bracing = bracing
	return s


# ─── Boss normal attack damage ────────────────────────────────────────────────

func test_boss_normal_damage_basic() -> void:
	# attack 220 − defence 70 = 150
	var player := _make_player(1000, 100, 70)
	assert_int(BattleManager.boss_normal_damage(220, player)).is_equal(150)


func test_boss_normal_damage_min_1() -> void:
	# defence far exceeds attack → still 1
	var player := _make_player(1000, 100, 9999)
	assert_int(BattleManager.boss_normal_damage(10, player)).is_equal(1)


func test_boss_normal_damage_with_defence_debuff() -> void:
	# defence=200, debuff×0.75 → effective 150; boss attack 220 → 220−150=70
	var player := _make_player(1000, 100, 200)
	BattleManager.apply_debuff(player, "defence", 0.75, 5000)
	assert_int(BattleManager.boss_normal_damage(220, player)).is_equal(70)


# ─── Boss skill damage ────────────────────────────────────────────────────────

func test_boss_skill_damage_aoe_multiplier() -> void:
	# attack 220 × 1.4 = 308 − defence 70 = 238
	var player := _make_player(1000, 100, 70)
	assert_int(BattleManager.boss_skill_damage(220, 1.4, player)).is_equal(238)


func test_boss_skill_damage_absolute_verdict() -> void:
	# attack 220 × 2.2 = 484 − defence 70 = 414
	var player := _make_player(1000, 100, 70)
	assert_int(BattleManager.boss_skill_damage(220, 2.2, player)).is_equal(414)


func test_boss_skill_damage_min_1() -> void:
	var player := _make_player(1000, 100, 9999)
	assert_int(BattleManager.boss_skill_damage(10, 1.0, player)).is_equal(1)


# ─── DoT tick ────────────────────────────────────────────────────────────────

func test_boss_dot_tick_necrotic_touch() -> void:
	# 220 × 0.15 = 33
	assert_int(BattleManager.boss_dot_tick(220)).is_equal(33)


func test_boss_dot_tick_min_1() -> void:
	assert_int(BattleManager.boss_dot_tick(1)).is_equal(1)


# ─── Normal attack targeting (§3.3) ──────────────────────────────────────────

func test_pick_normal_target_prefers_low_hp() -> void:
	# Player A at 10% HP (below 30% threshold) should be chosen over full-HP player B
	var player_a := _make_player(1000, 100, 100)
	player_a.current_hp = 100  # 10% — below 30%
	var player_b := _make_player(1000, 100, 100)  # 100% HP
	var players: Array[BattleState] = [player_a, player_b]
	assert_object(BattleManager.pick_normal_target(players)).is_equal(player_a)


func test_pick_normal_target_low_hp_ignores_brace() -> void:
	# Low-HP player is bracing — still chosen (brace ignored for low-HP)
	var player_a := _make_player(1000, 100, 100)
	player_a.current_hp = 100
	player_a.is_bracing = true
	var player_b := _make_player(1000, 100, 100)
	var players: Array[BattleState] = [player_a, player_b]
	assert_object(BattleManager.pick_normal_target(players)).is_equal(player_a)


func test_pick_normal_target_prefers_non_bracing() -> void:
	# Both above 30% HP; player A bracing, player B not — choose B
	var player_a := _make_player(1000, 100, 100)  # full HP, bracing
	player_a.is_bracing = true
	var player_b := _make_player(1000, 100, 100)  # full HP, not bracing
	var players: Array[BattleState] = [player_a, player_b]
	assert_object(BattleManager.pick_normal_target(players)).is_equal(player_b)


func test_pick_normal_target_all_bracing_returns_someone() -> void:
	var player_a := _make_player(1000, 100, 100)
	player_a.is_bracing = true
	var player_b := _make_player(1000, 100, 100)
	player_b.is_bracing = true
	var players: Array[BattleState] = [player_a, player_b]
	assert_object(BattleManager.pick_normal_target(players)).is_not_null()


func test_pick_normal_target_skips_dead() -> void:
	var dead := _make_player(1000, 100, 100)
	dead.current_hp = 0
	var alive := _make_player(1000, 100, 100)
	var players: Array[BattleState] = [dead, alive]
	assert_object(BattleManager.pick_normal_target(players)).is_equal(alive)


func test_pick_normal_target_all_dead_returns_null() -> void:
	var dead := _make_player(1000, 100, 100)
	dead.current_hp = 0
	var players: Array[BattleState] = [dead]
	assert_object(BattleManager.pick_normal_target(players)).is_null()


# ─── Skill target selection (§3.4) ───────────────────────────────────────────

func test_pick_skill_targets_aoe_returns_all_alive() -> void:
	var p1 := _make_player(1000, 100, 100)
	var p2 := _make_player(1000, 100, 100)
	var dead := _make_player(1000, 100, 100)
	dead.current_hp = 0
	var players: Array[BattleState] = [p1, p2, dead]
	var targets: Array[BattleState] = BattleManager.pick_skill_targets(players, true, "aoe_damage")
	assert_int(targets.size()).is_equal(2)


func test_pick_skill_targets_dot_picks_highest_attack() -> void:
	var low_atk := _make_player(1000, 100, 100)
	var high_atk := _make_player(1000, 900, 100)
	var players: Array[BattleState] = [low_atk, high_atk]
	var targets: Array[BattleState] = BattleManager.pick_skill_targets(players, false, "dot")
	assert_int(targets.size()).is_equal(1)
	assert_object(targets[0]).is_equal(high_atk)


func test_pick_skill_targets_single_picks_lowest_hp() -> void:
	var high_hp := _make_player(1000, 100, 100)
	var low_hp := _make_player(1000, 100, 100)
	low_hp.current_hp = 200
	var players: Array[BattleState] = [high_hp, low_hp]
	var targets: Array[BattleState] = BattleManager.pick_skill_targets(players, false, "single_damage")
	assert_int(targets.size()).is_equal(1)
	assert_object(targets[0]).is_equal(low_hp)


func test_pick_skill_targets_empty_when_all_dead() -> void:
	var dead := _make_player(1000, 100, 100)
	dead.current_hp = 0
	var players: Array[BattleState] = [dead]
	var targets: Array[BattleState] = BattleManager.pick_skill_targets(players, true, "aoe_damage")
	assert_int(targets.size()).is_equal(0)


# ─── Boss data completeness ───────────────────────────────────────────────────

func test_all_15_bosses_have_valid_data() -> void:
	var tiers: Array[String] = [
		"Apprentice", "Initiate", "Acolyte", "Journeyman", "Adept",
		"Scholar", "Sage", "Arcanist", "Exemplar", "Vanguard",
		"Master", "Grandmaster", "Champion", "Paragon", "Legend"
	]
	assert_int(BossData.BOSSES.size()).is_equal(15)
	for tier: String in tiers:
		assert_bool(BossData.BOSSES.has(tier)).is_true()
		var boss: Dictionary = BossData.BOSSES[tier]
		assert_int(boss["hp"]).is_greater(0)
		assert_int(boss["attack"]).is_greater(0)
		assert_int(boss["defence"]).is_greater_equal(0)
		assert_int(boss["atk_ms"]).is_greater(0)
		assert_int(boss["skill_ms"]).is_greater(0)
		assert_int(boss["gold"]).is_greater(0)
		assert_bool(BossData.SKILLS.has(boss["realm"])).is_true()


func test_boss_projectile_kind_routing() -> void:
	assert_str(BattleManager.boss_projectile_kind("academia")).is_equal("beam_pulse")
	assert_str(BattleManager.boss_projectile_kind("tech")).is_equal("missile")
	assert_str(BattleManager.boss_projectile_kind("medicine")).is_equal("dark_orb")
	assert_str(BattleManager.boss_projectile_kind("creative")).is_equal("spiral")
	assert_str(BattleManager.boss_projectile_kind("law")).is_equal("gavel")
	assert_str(BattleManager.boss_projectile_kind("unknown")).is_equal("tentacle")
