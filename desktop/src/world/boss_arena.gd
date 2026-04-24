class_name BossArena
extends CanvasLayer

signal battle_ended(won: bool, gold_delta: int, new_gold: int)

const PROJECTILE_SCENE: PackedScene = preload("res://scenes/shared/Projectile.tscn")

const BOSS_TOKEN_POS: Vector2 = Vector2(400.0, 120.0)
const PLAYER_TOKEN_POS: Vector2 = Vector2(400.0, 380.0)
const COOLDOWN_POLL_MS: float = 100.0

@onready var boss_name_label: Label = $ArenaPanel/BossNameLabel
@onready var boss_hp_bar: ProgressBar = $ArenaPanel/BossHPBar
@onready var boss_hp_label: Label = $ArenaPanel/BossHPLabel
@onready var boss_skill_label: Label = $ArenaPanel/BossSkillLabel
@onready var player_hp_bar: ProgressBar = $ArenaPanel/PlayerRows/PlayerRow0/HPBar
@onready var player_hp_label: Label = $ArenaPanel/PlayerRows/PlayerRow0/HPLabel
@onready var player_name_label: Label = $ArenaPanel/PlayerRows/PlayerRow0/NameLabel
@onready var strike_btn: Button = $ArenaPanel/ActionButtons/StrikeBtn
@onready var brace_btn: Button = $ArenaPanel/ActionButtons/BraceBtn
@onready var realm_btn: Button = $ArenaPanel/ActionButtons/RealmBtn
@onready var status_label: Label = $ArenaPanel/StatusLabel
@onready var projectile_layer: Node2D = $ArenaPanel/ProjectileLayer
@onready var waiting_label: Label = $ArenaPanel/WaitingLabel

# Boss data
var _boss: Dictionary = {}
var _boss_hp: int = 0
var _boss_proxy: BattleState = BattleState.new()

# Player state
var _local: BattleState = BattleState.new()
var _players: Array[BattleState] = []

# Timers (ms accumulated in _process)
var _atk_timer_ms: float = 0.0
var _skill_timer_ms: float = 0.0
var _cooldown_timer_ms: float = 0.0

var _battle_started: bool = false
var _battle_over: bool = false


func _ready() -> void:
	var tier: String = PlayerData.tier
	if not BossData.BOSSES.has(tier):
		push_error("BossArena: no boss data for tier '%s'" % tier)
		return

	_boss = BossData.BOSSES[tier]
	_boss_hp = _boss["hp"]

	_setup_boss_proxy()
	_setup_local_state()
	_setup_ui()
	_set_actions_enabled(false)
	waiting_label.visible = true

	strike_btn.pressed.connect(_on_strike)
	brace_btn.pressed.connect(_on_brace)
	realm_btn.pressed.connect(_on_realm_skill)

	AudioManager.play_bgm("pve")

	await get_tree().create_timer(1.0).timeout
	waiting_label.visible = false
	_battle_started = true
	_set_actions_enabled(true)


func _process(delta: float) -> void:
	if not _battle_started or _battle_over:
		return

	var delta_ms: float = delta * 1000.0
	_atk_timer_ms += delta_ms
	_skill_timer_ms += delta_ms
	_cooldown_timer_ms += delta_ms

	if _atk_timer_ms >= float(_boss["atk_ms"]):
		_atk_timer_ms = 0.0
		_boss_normal_attack()

	if _skill_timer_ms >= float(_boss["skill_ms"]):
		_skill_timer_ms = 0.0
		_boss_skill_attack()

	if _cooldown_timer_ms >= COOLDOWN_POLL_MS:
		_cooldown_timer_ms = 0.0
		_refresh_realm_btn()
		_update_status_label()
		_update_skill_timer_label()


# ─── Setup ────────────────────────────────────────────────────────────────────

func _setup_boss_proxy() -> void:
	_boss_proxy.user_id = "boss"
	_boss_proxy.player_name = _boss["name"]
	_boss_proxy.realm = _boss["realm"]
	_boss_proxy.max_hp = _boss["hp"]
	_boss_proxy.current_hp = _boss["hp"]
	_boss_proxy.attack = _boss["attack"]
	_boss_proxy.defence = _boss["defence"]


func _setup_local_state() -> void:
	_local.user_id = PlayerData.user_id
	_local.player_name = PlayerData.character_name
	_local.realm = PlayerData.dominant_realm
	_local.max_hp = PlayerData.battle_hp
	_local.attack = PlayerData.battle_attack
	_local.defence = PlayerData.battle_defence
	_local.current_hp = _local.max_hp
	_players = [_local]


func _setup_ui() -> void:
	boss_name_label.text = "%s  [%s]" % [_boss["name"], PlayerData.tier]
	boss_hp_bar.max_value = _boss["hp"]
	boss_hp_bar.value = _boss_hp
	boss_hp_label.text = "%d / %d" % [_boss_hp, _boss["hp"]]

	player_name_label.text = _local.player_name
	player_hp_bar.max_value = _local.max_hp
	player_hp_bar.value = _local.current_hp
	player_hp_label.text = "%d / %d" % [_local.current_hp, _local.max_hp]

	realm_btn.text = BattleManager.realm_skill_name(_local.realm)
	boss_skill_label.text = "Skill: ready"


# ─── Player actions ───────────────────────────────────────────────────────────

func _on_strike() -> void:
	if not _can_act():
		return
	var dmg: int = BattleManager.calc_damage(_local, _boss_proxy, 1.0)
	_boss_hp = max(0, _boss_hp - dmg)
	_boss_proxy.current_hp = _boss_hp
	_spawn_projectile("sword", PLAYER_TOKEN_POS, BOSS_TOKEN_POS, "boss", dmg)
	_refresh_boss_hp()
	_check_victory()


func _on_brace() -> void:
	if not _can_act():
		return
	_local.is_bracing = not _local.is_bracing
	brace_btn.text = "🛡 Bracing" if _local.is_bracing else "🛡 Brace"
	brace_btn.modulate = Color("#66aaff") if _local.is_bracing else Color.WHITE


func _on_realm_skill() -> void:
	if not _can_act():
		return
	if not BattleManager.realm_skill_ready(_local):
		return

	var result: Dictionary = BattleManager.apply_realm_skill(_local, _boss_proxy)
	var proj_kind: String = BattleManager.projectile_kind_for_action("realm", _local.realm)

	if result["damage"] > 0:
		_boss_hp = _boss_proxy.current_hp
		_spawn_projectile(proj_kind, PLAYER_TOKEN_POS, BOSS_TOKEN_POS, "boss", result["damage"])
		_refresh_boss_hp()
		_check_victory()
	elif result["heal"] > 0:
		_spawn_projectile("heal_pulse", PLAYER_TOKEN_POS, PLAYER_TOKEN_POS,
				_local.user_id, result["heal"])
		_refresh_player_hp()

	if result["debuff_type"] != "":
		status_label.text = "Boss debuffed: %s" % result["debuff_type"]

	_refresh_realm_btn()


# ─── Boss AI ─────────────────────────────────────────────────────────────────

func _boss_normal_attack() -> void:
	var target: BattleState = BattleManager.pick_normal_target(_players)
	if target == null:
		return
	var dmg: int = BattleManager.boss_normal_damage(_boss["attack"], target)
	target.current_hp = max(0, target.current_hp - dmg)
	var boss_proj: String = "tentacle"
	_spawn_projectile(boss_proj, BOSS_TOKEN_POS, PLAYER_TOKEN_POS, target.user_id, dmg)
	_refresh_player_hp()
	_check_defeat()


func _boss_skill_attack() -> void:
	var skill: Dictionary = BossData.SKILLS.get(_boss["realm"], {})
	if skill.is_empty():
		return

	var targets: Array[BattleState] = BattleManager.pick_skill_targets(
			_players, bool(skill["targets_all"]), skill["effect"])
	if targets.is_empty():
		return

	var effect: String = skill["effect"]
	var boss_proj: String = BattleManager.boss_projectile_kind(_boss["realm"])

	status_label.text = "Boss: %s!" % skill["name"]

	match effect:
		"aoe_damage", "single_damage":
			for target: BattleState in targets:
				var dmg: int = BattleManager.boss_skill_damage(
						_boss["attack"], float(skill["mult"]), target)
				target.current_hp = max(0, target.current_hp - dmg)
				_spawn_projectile(boss_proj, BOSS_TOKEN_POS, PLAYER_TOKEN_POS,
						target.user_id, dmg)
			_refresh_player_hp()
			_check_defeat()

		"defence_debuff":
			for target: BattleState in targets:
				var new_mult: float = 1.0 - float(skill["debuff_frac"])
				BattleManager.apply_debuff(target, "defence", new_mult, skill["duration_ms"])

		"attack_debuff":
			for target: BattleState in targets:
				var new_mult: float = 1.0 - float(skill["debuff_frac"])
				BattleManager.apply_debuff(target, "attack", new_mult, skill["duration_ms"])

		"dot":
			for target: BattleState in targets:
				_apply_dot(target)


func _apply_dot(target: BattleState) -> void:
	var per_tick: int = BattleManager.boss_dot_tick(_boss["attack"])
	for _i: int in range(5):
		await get_tree().create_timer(1.0).timeout
		if target.is_dead() or _battle_over:
			return
		target.current_hp = max(0, target.current_hp - per_tick)
		_refresh_player_hp()
		_check_defeat()


# ─── Projectiles ──────────────────────────────────────────────────────────────

func _spawn_projectile(kind: String, from: Vector2, to: Vector2,
		t_id: String, _dmg: int) -> void:
	var proj: Projectile = PROJECTILE_SCENE.instantiate()
	projectile_layer.add_child(proj)
	proj.init(kind, from, to, t_id, _dmg)


# ─── HP refresh ───────────────────────────────────────────────────────────────

func _refresh_boss_hp() -> void:
	boss_hp_bar.value = _boss_hp
	boss_hp_label.text = "%d / %d" % [_boss_hp, _boss["hp"]]


func _refresh_player_hp() -> void:
	player_hp_bar.value = _local.current_hp
	player_hp_label.text = "%d / %d" % [_local.current_hp, _local.max_hp]


# ─── Win/lose checks ──────────────────────────────────────────────────────────

func _check_victory() -> void:
	if _battle_over or _boss_hp > 0:
		return
	_end_battle(true)


func _check_defeat() -> void:
	if _battle_over:
		return
	var all_dead: bool = true
	for p: BattleState in _players:
		if not p.is_dead():
			all_dead = false
			break
	if all_dead:
		_end_battle(false)


func _end_battle(won: bool) -> void:
	_battle_over = true
	_set_actions_enabled(false)
	var gold_reward: int = 0
	if won:
		gold_reward = int(_boss["gold"])
		PlayerData.gold += gold_reward
		AudioManager.play_bgm("win")
	else:
		AudioManager.play_bgm("lose")
	battle_ended.emit(won, gold_reward, PlayerData.gold)


# ─── UI helpers ───────────────────────────────────────────────────────────────

func _can_act() -> bool:
	return _battle_started and not _battle_over and not _local.is_stunned()


func _set_actions_enabled(enabled: bool) -> void:
	strike_btn.disabled = not enabled
	brace_btn.disabled = not enabled
	realm_btn.disabled = not enabled


func _refresh_realm_btn() -> void:
	var ready: bool = BattleManager.realm_skill_ready(_local)
	realm_btn.disabled = not ready
	if not ready:
		var cd_ms: int = BattleManager.REALM_COOLDOWNS_MS.get(_local.realm, 4000)
		var elapsed: int = Time.get_ticks_msec() - _local.realm_skill_last_used_ms
		var remain_s: float = (cd_ms - elapsed) / 1000.0
		realm_btn.text = "%s (%.1fs)" % [BattleManager.realm_skill_name(_local.realm), maxf(remain_s, 0.0)]
	else:
		realm_btn.text = BattleManager.realm_skill_name(_local.realm)


func _update_status_label() -> void:
	if _local.is_stunned():
		status_label.text = "You are stunned!"
		status_label.modulate = Color.ORANGE
	elif status_label.modulate == Color.ORANGE:
		status_label.modulate = Color.WHITE


func _update_skill_timer_label() -> void:
	var remain_ms: float = float(_boss["skill_ms"]) - _skill_timer_ms
	if remain_ms <= 0.0:
		boss_skill_label.text = "Skill: READY"
		boss_skill_label.modulate = Color.RED
	else:
		boss_skill_label.text = "Skill in: %.1fs" % (remain_ms / 1000.0)
		boss_skill_label.modulate = Color.WHITE
