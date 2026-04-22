class_name GameManager
extends Node

enum State { TITLE, WORLD, PVP_PREP, PVP_ARENA, PVE_PREP, PVE_ARENA, RESULT }

var current_state: State = State.TITLE

const TITLE_SCENE = "res://scenes/ui/TitleScreen.tscn"
const WORLD_SCENE = "res://scenes/world/WorldScene.tscn"

func go_to_world() -> void:
	current_state = State.WORLD
	get_tree().change_scene_to_file(WORLD_SCENE)

func go_to_title() -> void:
	current_state = State.TITLE
	PlayerData.clear()
	get_tree().change_scene_to_file(TITLE_SCENE)
