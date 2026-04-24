class_name PrepScreen
extends CanvasLayer

signal confirmed

@onready var power_label: Label = $Panel/PowerLabel
@onready var hp_slider: HSlider = $Panel/HPRow/HPSlider
@onready var hp_value: Label = $Panel/HPRow/HPValue
@onready var attack_slider: HSlider = $Panel/AttackRow/AttackSlider
@onready var attack_value: Label = $Panel/AttackRow/AttackValue
@onready var defence_slider: HSlider = $Panel/DefenceRow/DefenceSlider
@onready var defence_value: Label = $Panel/DefenceRow/DefenceValue
@onready var remaining_label: Label = $Panel/RemainingLabel
@onready var error_label: Label = $Panel/ErrorLabel
@onready var confirm_btn: Button = $Panel/ConfirmBtn

var _power: int = 0
var _minimum: int = 0


func _ready() -> void:
	_power = PlayerData.total_power
	_minimum = int(floor(_power * 0.10))

	power_label.text = "Power: %d  (min per stat: %d)" % [_power, _minimum]

	for slider in [hp_slider, attack_slider, defence_slider]:
		slider.min_value = _minimum
		slider.max_value = _power - _minimum * 2
		slider.step = 1

	# Default: equal split, remainder goes to HP
	var base: int = _power / 3
	var leftover: int = _power - base * 3
	hp_slider.value = base + leftover
	attack_slider.value = base
	defence_slider.value = base

	hp_slider.value_changed.connect(_on_slider_changed.unbind(1))
	attack_slider.value_changed.connect(_on_slider_changed.unbind(1))
	defence_slider.value_changed.connect(_on_slider_changed.unbind(1))

	_refresh()


func _on_slider_changed() -> void:
	_refresh()


func _refresh() -> void:
	var hp: int = int(hp_slider.value)
	var atk: int = int(attack_slider.value)
	var def: int = int(defence_slider.value)
	var used: int = hp + atk + def
	var remaining: int = _power - used

	hp_value.text = str(hp)
	attack_value.text = str(atk)
	defence_value.text = str(def)
	remaining_label.text = "Remaining: %d" % remaining
	remaining_label.modulate = Color.RED if remaining != 0 else Color.WHITE

	var valid: bool = (remaining == 0 and hp >= _minimum
			and atk >= _minimum and def >= _minimum)
	confirm_btn.disabled = not valid
	error_label.text = "" if valid else (
		"Stats must sum to %d (each ≥ %d)" % [_power, _minimum]
	)


func _on_confirm_btn_pressed() -> void:
	PlayerData.battle_hp = int(hp_slider.value)
	PlayerData.battle_attack = int(attack_slider.value)
	PlayerData.battle_defence = int(defence_slider.value)
	confirmed.emit()
