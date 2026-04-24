class_name PvPArena
extends CanvasLayer

signal battle_ended(won: bool, gold_delta: int, new_gold: int)

const PROJECTILE_SCENE: PackedScene = preload("res://scenes/shared/Projectile.tscn")

# Arena 2D positions for the two fighters (800×500 arena)
const LOCAL_TOKEN_POS: Vector2 = Vector2(150.0, 250.0)
const OPPONENT_TOKEN_POS: Vector2 = Vector2(650.0, 250.0)

# Cooldown display update interval
const COOLDOWN_POLL_MS: float = 100.0

@onready var waiting_label: Label = $ArenaPanel/WaitingLabel
@onready var local_hp_bar: ProgressBar = $ArenaPanel/LocalHPBar
@onready var local_hp_label: Label = $ArenaPanel/LocalHPLabel
@onready var opponent_hp_bar: ProgressBar = $ArenaPanel/OpponentHPBar
@onready var opponent_hp_label: Label = $ArenaPanel/OpponentHPLabel
@onready var strike_btn: Button = $ArenaPanel/ActionButtons/StrikeBtn
@onready var brace_btn: Button = $ArenaPanel/ActionButtons/BraceBtn
@onready var realm_btn: Button = $ArenaPanel/ActionButtons/RealmBtn
@onready var status_label: Label = $ArenaPanel/StatusLabel
@onready var projectile_layer: Node2D = $ArenaPanel/ProjectileLayer
@onready var local_token: Control = $ArenaPanel/LocalToken
@onready var opponent_token: Control = $ArenaPanel/OpponentToken

var _local: BattleState = BattleState.new()
var _opponent: BattleState = BattleState.new()
var _battle_started: bool = false
var _battle_over: bool = false
var _cooldown_timer: float = 0.0


func _ready() -> void:
	_setup_local_state()
	_setup_ui()
	_set_actions_enabled(false)
	waiting_label.visible = true
	AudioManager.play_bgm("pvp")

	# Wire button signals
	strike_btn.pressed.connect(_on_strike)
	brace_btn.pressed.connect(_on_brace)
	realm_btn.pressed.connect(_on_realm_skill)

	# Wire NetworkManager for battle channel events
	# Phase 4 uses local-only simulation; real channel wired when Supabase creds are set.
	# For now, simulate opponent joining immediately after 1s so combat is testable.
	await get_tree().create_timer(1.0).timeout
	_on_opponent_joined()


func _process(delta: float) -> void:
	if not _battle_started or _battle_over:
		return
	_cooldown_timer += delta * 1000.0
	if _cooldown_timer >= COOLDOWN_POLL_MS:
		_cooldown_timer = 0.0
		_refresh_realm_btn()
	_update_status_label()


# ─── Setup ────────────────────────────────────────────────────────────────────

func _setup_local_state() -> void:
	_local.user_id = PlayerData.user_id
	_local.player_name = PlayerData.character_name
	_local.realm = PlayerData.dominant_realm
	_local.max_hp = PlayerData.battle_hp
	_local.attack = PlayerData.battle_attack
	_local.defence = PlayerData.battle_defence
	_local.current_hp = _local.max_hp

	# Placeholder opponent — replaced by Presence data in live play
	_opponent.user_id = GameManager.current_opponent_id
	_opponent.player_name = "Opponent"
	_opponent.realm = "tech"
	_opponent.max_hp = PlayerData.total_power / 3
	_opponent.attack = PlayerData.total_power / 3
	_opponent.defence = PlayerData.total_power / 3
	_opponent.current_hp = _opponent.max_hp


func _setup_ui() -> void:
	local_hp_bar.max_value = _local.max_hp
	local_hp_bar.value = _local.current_hp
	local_hp_label.text = "%d / %d" % [_local.current_hp, _local.max_hp]

	opponent_hp_bar.max_value = _opponent.max_hp
	opponent_hp_bar.value = _opponent.current_hp
	opponent_hp_label.text = "%d / %d" % [_opponent.current_hp, _opponent.max_hp]

	realm_btn.text = BattleManager.realm_skill_name(_local.realm)


# ─── Actions ─────────────────────────────────────────────────────────────────

func _on_strike() -> void:
	if not _can_act():
		return
	var dmg: int = BattleManager.calc_damage(_local, _opponent, 1.0)
	_opponent.current_hp = max(0, _opponent.current_hp - dmg)
	_spawn_projectile("sword", LOCAL_TOKEN_POS, OPPONENT_TOKEN_POS,
			_opponent.user_id, dmg)
	_refresh_opponent_hp()
	_check_battle_over()


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
	var result: Dictionary = BattleManager.apply_realm_skill(_local, _opponent)
	var proj_kind: String = BattleManager.projectile_kind_for_action("realm", _local.realm)

	if result["damage"] > 0:
		_spawn_projectile(proj_kind, LOCAL_TOKEN_POS, OPPONENT_TOKEN_POS,
				_opponent.user_id, result["damage"])
	elif result["heal"] > 0:
		_spawn_projectile("heal_pulse", LOCAL_TOKEN_POS, LOCAL_TOKEN_POS,
				_local.user_id, result["heal"])
		_refresh_local_hp()
	if result["stun"]:
		status_label.text = "Opponent stunned!"
	elif result["debuff_type"] != "":
		status_label.text = "Debuff applied: " + result["debuff_type"]

	_refresh_opponent_hp()
	_refresh_realm_btn()
	_check_battle_over()


# ─── Projectiles ──────────────────────────────────────────────────────────────

func _spawn_projectile(kind: String, from: Vector2, to: Vector2,
		t_id: String, dmg: int) -> void:
	var proj: Projectile = PROJECTILE_SCENE.instantiate()
	projectile_layer.add_child(proj)
	proj.init(kind, from, to, t_id, dmg)
	# hit_landed signal not needed here — damage already applied above.
	# In networked play the hit would be applied on receipt of hp_sync.


# ─── HP refresh ───────────────────────────────────────────────────────────────

func _refresh_local_hp() -> void:
	local_hp_bar.value = _local.current_hp
	local_hp_label.text = "%d / %d" % [_local.current_hp, _local.max_hp]


func _refresh_opponent_hp() -> void:
	opponent_hp_bar.value = _opponent.current_hp
	opponent_hp_label.text = "%d / %d" % [_opponent.current_hp, _opponent.max_hp]


# ─── State helpers ────────────────────────────────────────────────────────────

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
		realm_btn.text = "%s (%.1fs)" % [BattleManager.realm_skill_name(_local.realm), remain_s]
	else:
		realm_btn.text = BattleManager.realm_skill_name(_local.realm)


func _update_status_label() -> void:
	if _local.is_stunned():
		status_label.text = "You are stunned!"
		status_label.modulate = Color.ORANGE
	elif status_label.modulate == Color.ORANGE:
		status_label.modulate = Color.WHITE


func _on_opponent_joined() -> void:
	waiting_label.visible = false
	_battle_started = true
	_set_actions_enabled(true)


func _check_battle_over() -> void:
	if _battle_over:
		return
	if _opponent.current_hp <= 0:
		_end_battle(true)
	elif _local.current_hp <= 0:
		_end_battle(false)


func _end_battle(won: bool) -> void:
	_battle_over = true
	_set_actions_enabled(false)
	var gold_delta: int
	if won:
		gold_delta = BattleManager.calc_gold_transfer(_opponent.max_hp)
		PlayerData.gold += gold_delta
		AudioManager.play_bgm("win")
	else:
		gold_delta = -BattleManager.calc_gold_transfer(PlayerData.gold)
		PlayerData.gold = max(0, PlayerData.gold + gold_delta)
		AudioManager.play_bgm("lose")
	battle_ended.emit(won, gold_delta, PlayerData.gold)
