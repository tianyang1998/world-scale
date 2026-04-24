extends Node3D

const LOCAL_PLAYER_SCENE: PackedScene = preload("res://scenes/world/LocalPlayer.tscn")
const REMOTE_PLAYER_SCENE: PackedScene = preload("res://scenes/world/RemotePlayer.tscn")

# Ordered list matches the 15-tier progression from scoring-system.md.
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


func _ready() -> void:
	_spawn_player()
	world_map.trigger_entered.connect(_on_trigger_entered)
	_connect_network()
	NetworkManager.connect_to_map(PlayerData.tier)
	AudioManager.play_bgm("map")


func _process(_delta: float) -> void:
	if _local_player == null:
		return
	var pos: Vector3 = _local_player.global_position
	# Z maps to web-style Y (depth axis).
	NetworkManager.send_move(pos.x, pos.z)


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
		return  # already at tier boundary

	# Clear all remote players — they belong to the old tier channel.
	for uid: String in _remote_players:
		_remote_players[uid].queue_free()
	_remote_players.clear()

	PlayerData.tier = TIERS[new_idx]
	world_map.apply_tier_theme(PlayerData.tier)
	hud.update_tier(PlayerData.tier)
	_update_online_count()

	# Re-enter from the opposite portal edge.
	var spawn_x: float = 230.0 if direction == -1 else 10.0
	if _local_player != null:
		_local_player.global_position = Vector3(spawn_x, 0.0, 80.0)

	NetworkManager.switch_tier(PlayerData.tier)


func _on_boss_lair() -> void:
	print("Boss lair proximity entered — Phase 5 will wire PvE lobby")


func _on_store() -> void:
	if _local_player != null:
		_local_player.show_interact_hint("Press E to open store")


# ─── Networking ───────────────────────────────────────────────────────────────

func _connect_network() -> void:
	NetworkManager.player_joined.connect(_on_player_joined)
	NetworkManager.player_left.connect(_on_player_left)
	NetworkManager.player_moved.connect(_on_player_moved)
	NetworkManager.challenge_received.connect(_on_challenge_received)
	NetworkManager.pve_invite_received.connect(_on_pve_invite_received)


func _on_player_joined(user_id: String, p_name: String, x: float, y: float) -> void:
	if user_id == PlayerData.user_id:
		return  # don't spawn own ghost
	if _remote_players.has(user_id):
		return  # already tracked
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


func _on_challenge_received(from_id: String, from_name: String, _battle_id: String) -> void:
	print("Challenge received from %s (%s) — Phase 4 will show modal" % [from_name, from_id])


func _on_pve_invite_received(from_id: String, from_name: String, boss_name: String, _battle_id: String) -> void:
	print("PvE invite from %s — boss: %s — Phase 5 will show modal" % [from_name, boss_name])
	_ = from_id  # used in Phase 5


func _update_online_count() -> void:
	hud.update_online_count(_remote_players.size() + 1)
