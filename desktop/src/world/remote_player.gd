class_name RemotePlayer
extends Node3D

const LERP_SPEED: float = 8.0

var _target_pos: Vector3 = Vector3.ZERO

@onready var name_tag: Label3D = $NameTag


func init(player_name: String, x: float, y: float) -> void:
	name_tag.text = player_name
	global_position = Vector3(x, 0.0, y)
	_target_pos = global_position


func update_target(x: float, y: float) -> void:
	_target_pos = Vector3(x, 0.0, y)


func _process(delta: float) -> void:
	global_position = global_position.lerp(_target_pos, LERP_SPEED * delta)
