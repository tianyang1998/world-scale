extends Node3D

const LOCAL_PLAYER_SCENE: PackedScene = preload("res://scenes/world/LocalPlayer.tscn")

@onready var world_map: WorldMap3D = $WorldMap3D
@onready var player_spawn: Marker3D = $PlayerSpawn

var _local_player: LocalPlayer = null

func _ready() -> void:
	_spawn_player()
	world_map.trigger_entered.connect(_on_trigger_entered)

func _spawn_player() -> void:
	_local_player = LOCAL_PLAYER_SCENE.instantiate()
	add_child(_local_player)
	var jitter := Vector3(randf_range(-15.0, 15.0), 0.0, randf_range(-15.0, 15.0))
	_local_player.global_position = player_spawn.global_position + jitter

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
	print("Portal entered: direction=", direction)

func _on_boss_lair() -> void:
	print("Boss lair proximity entered")

func _on_store() -> void:
	if _local_player != null:
		_local_player.show_interact_hint("Press E to open store")
