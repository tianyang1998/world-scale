extends Node3D

const LOCAL_PLAYER_SCENE: PackedScene = preload("res://scenes/world/LocalPlayer.tscn")
const REMOTE_PLAYER_SCENE: PackedScene = preload("res://scenes/world/RemotePlayer.tscn")
const PREP_SCREEN_SCENE: PackedScene = preload("res://scenes/ui/PrepScreen.tscn")
const PVP_ARENA_SCENE: PackedScene = preload("res://scenes/world/PvPArena.tscn")
const BOSS_ARENA_SCENE: PackedScene = preload("res://scenes/world/BossArena.tscn")
const RESULT_SCREEN_SCENE: PackedScene = preload("res://scenes/ui/ResultScreen.tscn")
const STORE_SCREEN_SCENE: PackedScene = preload("res://scenes/ui/StoreScreen.tscn")

const TIERS: Array[String] = [
	"Apprentice", "Initiate", "Acolyte", "Journeyman", "Adept",
	"Scholar", "Sage", "Arcanist", "Exemplar", "Vanguard",
	"Master", "Grandmaster", "Champion", "Paragon", "Legend"
]

@onready var world_map: WorldMap3D = $WorldMap3D
@onready var player_spawn: Marker3D = $PlayerSpawn
@onready var hud: WorldHUD = $HUD

var _local_player: LocalPlayer = null
var _remote_players: Dictionary = {}  # user_id → RemotePlayer

var _prep_screen: PrepScreen = null
var _pvp_arena: PvPArena = null
var _result_screen: ResultScreen = null
var _store_screen: StoreScreen = null


func _ready() -> void:
	_spawn_player()
	world_map.trigger_entered.connect(_on_trigger_entered)
	_connect_network()
	NetworkManager.connect_to_map(PlayerData.tier)
	AudioManager.play_bgm("map")


func _process(_delta: float) -> void:
	if _local_player == null or GameManager.current_state != GameManager.State.WORLD:
		return
	NetworkManager.send_move(_local_player.global_position.x,
			_local_player.global_position.z)


# ─── Player spawn ─────────────────────────────────────────────────────────────

func _spawn_player() -> void:
	_local_player = LOCAL_PLAYER_SCENE.instantiate()
	add_child(_local_player)
	var jitter := Vector3(randf_range(-15.0, 15.0), 0.0, randf_range(-15.0, 15.0))
	_local_player.global_position = player_spawn.global_position + jitter


# ─── World triggers ───────────────────────────────────────────────────────────

func _on_trigger_entered(trigger_name: String) -> void:
	match trigger_name:
		"portal_left":
			_on_portal(-1)
		"portal_right":
			_on_portal(1)
		"boss_lair":
			_on_boss_lair()
		"store":
			_on_store()


func _on_portal(direction: int) -> void:
	var idx: int = TIERS.find(PlayerData.tier)
	if idx == -1:
		return
	var new_idx: int = clamp(idx + direction, 0, TIERS.size() - 1)
	if new_idx == idx:
		return

	for uid: String in _remote_players:
		_remote_players[uid].queue_free()
	_remote_players.clear()

	PlayerData.tier = TIERS[new_idx]
	world_map.apply_tier_theme(PlayerData.tier)
	hud.update_tier(PlayerData.tier)
	_update_online_count()

	var spawn_x: float = 230.0 if direction == -1 else 10.0
	if _local_player != null:
		_local_player.global_position = Vector3(spawn_x, 0.0, 80.0)

	NetworkManager.switch_tier(PlayerData.tier)


func _on_boss_lair() -> void:
	_open_boss_arena()


func _on_store() -> void:
	if _store_screen != null:
		return
	_store_screen = STORE_SCREEN_SCENE.instantiate()
	add_child(_store_screen)
	if _local_player != null:
		_local_player.hide_interact_hint()
	_store_screen.close_requested.connect(_on_store_closed)


func _on_store_closed() -> void:
	_store_screen.queue_free()
	_store_screen = null
	hud.refresh_gold()


# ─── Networking ───────────────────────────────────────────────────────────────

func _connect_network() -> void:
	NetworkManager.player_joined.connect(_on_player_joined)
	NetworkManager.player_left.connect(_on_player_left)
	NetworkManager.player_moved.connect(_on_player_moved)
	NetworkManager.challenge_received.connect(_on_challenge_received)
	NetworkManager.pve_invite_received.connect(_on_pve_invite_received)


func _on_player_joined(user_id: String, p_name: String, x: float, y: float) -> void:
	if user_id == PlayerData.user_id or _remote_players.has(user_id):
		return
	var rp: RemotePlayer = REMOTE_PLAYER_SCENE.instantiate()
	add_child(rp)
	rp.init(p_name, x, y)
	_remote_players[user_id] = rp
	_update_online_count()


func _on_player_left(user_id: String) -> void:
	if not _remote_players.has(user_id):
		return
	_remote_players[user_id].queue_free()
	_remote_players.erase(user_id)
	_update_online_count()


func _on_player_moved(user_id: String, x: float, y: float) -> void:
	if _remote_players.has(user_id):
		_remote_players[user_id].update_target(x, y)


func _on_challenge_received(from_id: String, from_name: String, battle_id: String) -> void:
	var dialog := AcceptDialog.new()
	dialog.title = "Challenge!"
	dialog.dialog_text = "%s challenges you to a duel!" % from_name
	add_child(dialog)
	dialog.confirmed.connect(func() -> void:
		dialog.queue_free()
		_open_prep_screen(from_id, battle_id)
	)
	dialog.canceled.connect(func() -> void: dialog.queue_free())
	dialog.popup_centered()


func _on_pve_invite_received(from_id: String, from_name: String,
		boss_name: String, _battle_id: String) -> void:
	print("PvE invite from %s — boss: %s — Phase 5 will show modal" % [from_name, boss_name])
	_ = from_id


# ─── PvP flow ─────────────────────────────────────────────────────────────────

func _open_prep_screen(opponent_id: String, battle_id: String) -> void:
	GameManager.start_pvp_prep(opponent_id, battle_id)
	_prep_screen = PREP_SCREEN_SCENE.instantiate()
	_prep_screen.mode = "pvp"
	add_child(_prep_screen)
	_prep_screen.confirmed.connect(_on_prep_confirmed)


func _on_prep_confirmed() -> void:
	_prep_screen.queue_free()
	_prep_screen = null
	world_map.visible = false
	if _local_player != null:
		_local_player.visible = false
	_pvp_arena = PVP_ARENA_SCENE.instantiate()
	add_child(_pvp_arena)
	GameManager.enter_pvp_arena()
	_pvp_arena.battle_ended.connect(_on_battle_ended)


func _on_battle_ended(won: bool, gold_delta: int, new_gold: int, refund: int = 0) -> void:
	GameManager.show_result()
	_result_screen = RESULT_SCREEN_SCENE.instantiate()
	add_child(_result_screen)
	_result_screen.show_result(won, gold_delta, new_gold, refund)
	_result_screen.continue_pressed.connect(_on_result_continue)


func _open_boss_arena() -> void:
	world_map.visible = false
	if _local_player != null:
		_local_player.visible = false
	_pvp_arena = BOSS_ARENA_SCENE.instantiate()
	add_child(_pvp_arena)
	GameManager.enter_pve_arena()
	_pvp_arena.battle_ended.connect(_on_battle_ended)


func _on_result_continue() -> void:
	_result_screen.queue_free()
	_result_screen = null
	_pvp_arena.queue_free()
	_pvp_arena = null
	world_map.visible = true
	if _local_player != null:
		_local_player.visible = true
	hud.refresh_gold()
	GameManager.return_to_world()
	AudioManager.play_bgm("map")


# ─── HUD helpers ──────────────────────────────────────────────────────────────

func _update_online_count() -> void:
	hud.update_online_count(_remote_players.size() + 1)
