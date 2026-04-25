class_name LocalPlayer
extends CharacterBody3D

## Emitted when the player walks into a portal Area3D. Direction is "left" or "right".
signal portal_entered(direction: String)
## Emitted when the player enters the boss lair proximity zone.
signal boss_range_entered
## Emitted when the player enters the store proximity zone.
signal store_range_entered

const SPEED: float = 24.0
const MOUSE_SENSITIVITY: float = 0.003
const PITCH_MIN: float = -70.0
const PITCH_MAX: float = 10.0

@onready var camera_pivot: Node3D = $CameraPivot
@onready var name_tag: Label3D = $NameTag
@onready var interact_hint: Label3D = $InteractHint

var _pitch: float = -20.0  # starting angle — slightly above horizon

func _ready() -> void:
	name_tag.text = PlayerData.character_name
	camera_pivot.rotation_degrees.x = _pitch
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		# Yaw: rotate the whole player body left/right
		rotate_y(-event.relative.x * MOUSE_SENSITIVITY)
		# Pitch: tilt the camera pivot up/down only
		_pitch = clampf(_pitch - rad_to_deg(event.relative.y * MOUSE_SENSITIVITY),
				PITCH_MIN, PITCH_MAX)
		camera_pivot.rotation_degrees.x = _pitch
	if event.is_action_pressed("ui_cancel"):
		if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		else:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _physics_process(delta: float) -> void:
	# WASD moves relative to where the player is facing (yaw only)
	var input_dir := Vector2(
		Input.get_axis("move_left", "move_right"),
		Input.get_axis("move_forward", "move_back")
	)
	var forward := -global_transform.basis.z
	var right := global_transform.basis.x
	var move_dir := (forward * -input_dir.y + right * input_dir.x)
	move_dir.y = 0.0
	if move_dir.length_squared() > 0.01:
		move_dir = move_dir.normalized()
	velocity.x = move_dir.x * SPEED
	velocity.z = move_dir.z * SPEED
	if is_on_floor():
		velocity.y = 0.0
	else:
		velocity.y -= 9.8 * delta
	move_and_slide()

## Shows a context-sensitive interaction prompt above the player.
## Called by WorldScene when the player enters a trigger zone.
func show_interact_hint(text: String) -> void:
	interact_hint.text = text
	interact_hint.visible = true

## Hides the interaction prompt. Called when the player leaves a trigger zone.
func hide_interact_hint() -> void:
	interact_hint.visible = false
