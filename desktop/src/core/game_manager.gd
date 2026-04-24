class_name GameManager
extends Node

enum State { TITLE, WORLD, PVP_PREP, PVP_ARENA, PVE_PREP, PVE_ARENA, RESULT }

var current_state: State = State.TITLE
var current_battle_id: String = ""
var current_opponent_id: String = ""

const TITLE_SCENE: String = "res://scenes/ui/TitleScreen.tscn"
const WORLD_SCENE: String = "res://scenes/world/WorldScene.tscn"


func go_to_world() -> void:
	current_state = State.WORLD
	get_tree().change_scene_to_file(WORLD_SCENE)


func go_to_title() -> void:
	current_state = State.TITLE
	current_battle_id = ""
	current_opponent_id = ""
	PlayerData.clear()
	get_tree().change_scene_to_file(TITLE_SCENE)


func start_pvp_prep(opponent_id: String, battle_id: String) -> void:
	current_state = State.PVP_PREP
	current_opponent_id = opponent_id
	current_battle_id = battle_id


func enter_pvp_arena() -> void:
	current_state = State.PVP_ARENA


func enter_pve_arena() -> void:
	current_state = State.PVE_ARENA


func show_result() -> void:
	current_state = State.RESULT


func return_to_world() -> void:
	current_state = State.WORLD
	current_battle_id = ""
	current_opponent_id = ""
