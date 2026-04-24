class_name LocalPlayer
extends CharacterBody3D

signal portal_entered(direction: String)
signal boss_range_entered
signal store_range_entered

const SPEED: float = 24.0
const ROTATION_SPEED: float = 10.0
const MOUSE_SENSITIVITY: float = 0.004

@onready var camera_rig: Node3D = $CameraRig
@onready var name_tag: Label3D = $NameTag
@onready var interact_hint: Label3D = $InteractHint

func _ready() -> void:
	name_tag.text = PlayerData.character_name
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		camera_rig.rotate_y(-event.relative.x * MOUSE_SENSITIVITY)
	if event.is_action_pressed("ui_cancel"):
		if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		else:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _physics_process(delta: float) -> void:
	var input_dir := Vector2(
		Input.get_axis("move_left", "move_right"),
		Input.get_axis("move_forward", "move_back")
	)
	var cam_basis: Basis = camera_rig.global_transform.basis
	var forward: Vector3 = -cam_basis.z
	forward.y = 0.0
	forward = forward.normalized()
	var right: Vector3 = cam_basis.x
	right.y = 0.0
	right = right.normalized()
	var move_dir: Vector3 = (forward * -input_dir.y + right * input_dir.x).normalized()
	velocity.x = move_dir.x * SPEED if input_dir.length() > 0.01 else 0.0
	velocity.z = move_dir.z * SPEED if input_dir.length() > 0.01 else 0.0
	velocity.y -= 9.8 * delta
	move_and_slide()
	if move_dir.length() > 0.01:
		var target_angle: float = atan2(move_dir.x, move_dir.z)
		var current_angle: float = rotation.y
		rotation.y = lerp_angle(current_angle, target_angle, ROTATION_SPEED * delta)

func show_interact_hint(text: String) -> void:
	interact_hint.text = text
	interact_hint.visible = true

func hide_interact_hint() -> void:
	interact_hint.visible = false
